import {
  IMessagingProvider,
  ProviderType,
  ProviderCapabilities,
  SessionInitResult,
  SessionStatus,
  SessionEvent,
  MessageResult,
  MediaPayload,
  TemplateComponent,
  SendOptions,
  InboundMessage,
  StatusUpdate,
  SessionConfig,
} from '@wacrm/shared';

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidUser,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  Browsers,
} from '@whiskeysockets/baileys';
// baileys-antiban's wrapSocket is intentionally NOT imported here — its
// timer teardown ("🧹 Destroyed — all timers cleared") interferes with the
// QR-pairing reconnect loop. See initializeSession for details.
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { io } from '../socket';
import crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { extractProvidedEmail } from '../wa-email';

const logger = pino({ level: 'silent' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

function encryptToken(text: string): string {
  if (!ENCRYPTION_KEY) return text;
  const keyBuf = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`;
}

const MAX_MESSAGE_JID_CACHE = 10000;
// QR codes expire after ~20s on WhatsApp's side, so each expiry triggers a
// reconnect. 10 attempts gave only ~3 minutes of pairing window — too short
// for a user who opens the page after the worker already booted. 30 gives
// ~10 minutes, and the counter is reset on each explicit user "Generate QR".
const MAX_RECONNECT_ATTEMPTS = 30;
const BASE_RECONNECT_DELAY_MS = 2000;

// Auto group/participant sync: fired shortly after the socket opens (gives
// app-state sync a moment to settle) and then on a recurring interval so
// newly joined groups/members are picked up without a manual button click.
const GROUP_SYNC_DELAY_MS = 5_000;
const GROUP_SYNC_INTERVAL_MS = 30 * 60 * 1000;

export class BaileysProvider implements IMessagingProvider {
  private sockets: Map<string, ReturnType<typeof makeWASocket>> = new Map();
  private sessionStatuses: Map<string, SessionStatus> = new Map();
  private eventCallbacks: Map<string, (accountId: string, event: SessionEvent) => void> = new Map();
  private globalSessionCallback?: (accountId: string, event: SessionEvent) => void;
  private globalInboundCallback?: (accountId: string, message: InboundMessage) => void;
  private globalStatusCallback?: (accountId: string, status: StatusUpdate) => void;
  private reconnectAttempts: Map<string, number> = new Map();
  private messageJidMap: Map<string, string> = new Map();
  private messageJidKeys: string[] = [];
  private sessionReadyAt: Map<string, number> = new Map();
  private lidToPhone: Map<string, string> = new Map();
  // Participant display names captured from the `contacts.upsert` /
  // `contacts.update` Baileys events. Baileys doesn't always populate
  // `participant.notify` / `participant.name` on the group participants
  // payload (especially for LID-only members), so we fall back to these
  // maps when syncing groups. Keyed by phone (digits) and LID (digits)
  // respectively so we can resolve either path.
  private phoneToName: Map<string, string> = new Map();
  private lidToName: Map<string, string> = new Map();
  private lastQrCodes: Map<string, string> = new Map();
  // Per-account timers for the recurring group/participant auto-sync.
  private groupSyncTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private groupSyncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  getProviderType(): ProviderType {
    return 'wwebjs';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      templates: false,
      reactions: true,
      readReceipts: true,
      profilePicAccess: true,
      registrationCheck: true,
      interactive: false,
    };
  }

  private getSocket(accountId: string) {
    const socket = this.sockets.get(accountId);
    if (!socket) {
      throw new Error(`Session not initialized for account ${accountId}`);
    }
    return socket;
  }

  private cacheMessageJid(messageId: string, remoteJid: string) {
    if (this.messageJidKeys.length >= MAX_MESSAGE_JID_CACHE) {
      const oldest = this.messageJidKeys.shift();
      if (oldest) this.messageJidMap.delete(oldest);
    }
    this.messageJidMap.set(messageId, remoteJid);
    this.messageJidKeys.push(messageId);
  }

  private emitSessionEvent(accountId: string, event: SessionEvent) {
    const perAccount = this.eventCallbacks.get(accountId);
    if (perAccount) perAccount(accountId, event);
    if (this.globalSessionCallback) this.globalSessionCallback(accountId, event);
  }

  getLastQr(accountId: string): string | undefined {
    return this.lastQrCodes.get(accountId);
  }

  /**
   * Reset the reconnect counter for an account. Called when the user
   * explicitly requests a fresh QR (POST /api/whatsapp/config with
   * start_session). Without this, a session that previously exhausted
   * its reconnect attempts would die on the very first QR expiry of the
   * new session, because reconnectAttempts was never cleared.
   */
  resetReconnectAttempts(accountId: string) {
    this.reconnectAttempts.delete(accountId);
    this.lastQrCodes.delete(accountId);
  }

  private async persistQr(accountId: string, qr: string) {
    this.lastQrCodes.set(accountId, qr);
    const { error } = await this.supabase.from('sessions').upsert(
      {
        account_id: accountId,
        provider_type: 'wwebjs',
        client_id: accountId,
        status: 'qr_pending',
        qr_code: qr,
        pairing_code: null,
      },
      { onConflict: 'account_id' },
    );
    console.log('[Baileys] persist QR', {
      accountIdPrefix: accountId.slice(0, 8),
      ok: !error,
      err: error?.message ?? null,
      qrLen: qr.length,
    });
    if (error) {
      console.error('[Baileys] Failed to persist QR:', error);
    }
  }

  async initializeSession(accountId: string, config: SessionConfig): Promise<SessionInitResult> {
    if (this.sockets.has(accountId)) {
      const currentStatus = this.sessionStatuses.get(accountId) ?? 'disconnected';
      const qr = this.lastQrCodes.get(accountId);
      console.log('[Baileys] session already open; re-emitting last QR if present', {
        accountIdPrefix: accountId.slice(0, 8),
        currentStatus,
        hasQr: !!qr,
        qrLen: qr?.length ?? 0,
      });
      if (qr) {
        io.to(accountId).emit('qr_refresh', qr);
      }
      return { status: currentStatus === 'connected' ? 'connected' : 'qr_pending' };
    }

    const sessionDir = path.join(process.cwd(), 'sessions', accountId);
    await fs.mkdir(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const usePairingCode = !!config.phoneNumber;

    const rawSock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('AudienceGate'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      shouldSyncHistoryMessage: (msg: any) => {
        const type = msg?.syncType;
        // 0=INITIAL_BOOTSTRAP (contacts+chats), 4=PUSH_NAME (contact names)
        // Block 2=FULL and 3=RECENT to avoid old message floods
        return type === 0 || type === 4;
      },
      markOnlineOnConnect: false,
    });

    // Use the raw Baileys socket directly. The baileys-antiban `wrapSocket`
    // wrapper tears down its internal timers on disconnect ("🧹 Destroyed —
    // all timers cleared"), which interferes with the QR-pairing reconnect
    // loop and contributes to premature session death. Rate-limiting is only
    // relevant for outbound messages, not for pairing, so we bypass it here.
    const sock = rawSock;

    this.sockets.set(accountId, sock);
    this.sessionStatuses.set(accountId, 'qr_pending');
    void this.supabase.from('sessions').upsert(
      {
        account_id: accountId,
        provider_type: 'wwebjs',
        client_id: accountId,
        status: 'qr_pending',
      },
      { onConflict: 'account_id' },
    );

    if (usePairingCode && !state.creds.registered) {
      const phone = config.phoneNumber!.replace(/[^0-9]/g, '');
      try {
        const code = await sock.requestPairingCode(phone);
        const formatted = code.match(/.{1,4}/g)?.join('-') || code;
        console.log(`[Baileys] Pairing code for ${accountId}: ${formatted}`);
        await this.supabase
          .from('sessions')
          .upsert({
            account_id: accountId,
            provider_type: 'wwebjs',
            client_id: accountId,
            status: 'qr_pending',
            qr_code: null,
            pairing_code: formatted,
          }, { onConflict: 'account_id' });
      } catch (err) {
        console.error(`[Baileys] Failed to request pairing code for ${accountId}:`, err);
      }
    }

    sock.ev.process(async (events: any) => {
      if (events['connection.update']) {
        const update = events['connection.update'];
        const { connection, lastDisconnect, qr } = update;

        if (qr && !usePairingCode) {
          this.sessionStatuses.set(accountId, 'qr_pending');
          const roomSize = io.sockets.adapter.rooms.get(accountId)?.size ?? 0;
          console.log('[Baileys] QR generated', {
            accountIdPrefix: accountId.slice(0, 8),
            roomSize,
            qrLen: typeof qr === 'string' ? qr.length : 0,
          });
          try {
            await this.persistQr(accountId, qr);
          } catch (err) {
            this.lastQrCodes.set(accountId, qr);
            console.error('[Baileys] Failed to persist QR:', err);
          }
          io.to(accountId).emit('qr_refresh', qr);

          this.emitSessionEvent(accountId, { type: 'qr_refresh', qrData: qr });
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
          // Stop any pending/recurring group auto-sync for this account; it
          // will be rescheduled if/when the socket re-opens.
          this.clearAutoGroupSync(accountId);
          if (shouldReconnect) {
            this.sockets.delete(accountId);
            this.sessionStatuses.set(accountId, 'disconnected');
            const attempts = (this.reconnectAttempts.get(accountId) || 0) + 1;
            this.reconnectAttempts.set(accountId, attempts);

            if (attempts > MAX_RECONNECT_ATTEMPTS) {
              console.error(`[Baileys] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${accountId}`);
              await this.supabase
                .from('sessions')
                .update({ status: 'disconnected', qr_code: null })
                .eq('account_id', accountId);
              io.to(accountId).emit('disconnected', { reason: 'max_retries' });
              return;
            }

            const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts - 1), 60000);
            console.log(`[Baileys] Reconnecting ${accountId} in ${delay}ms (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})`);
            setTimeout(() => this.initializeSession(accountId, config), delay);
          } else {
            this.emitSessionEvent(accountId, { type: 'disconnected', reason: 'logged_out' });
            this.sockets.delete(accountId);
            this.sessionStatuses.set(accountId, 'disconnected');
            await this.supabase
              .from('sessions')
              .update({ status: 'disconnected', qr_code: null })
              .eq('account_id', accountId);
            io.to(accountId).emit('disconnected', { reason: 'logged_out' });
            await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
          }
        } else if (connection === 'open') {
          this.sessionStatuses.set(accountId, 'connected');
          this.lastQrCodes.delete(accountId);
          this.reconnectAttempts.set(accountId, 0);
          this.sessionReadyAt.set(accountId, Math.floor(Date.now() / 1000));

          const phoneJid = sock.user?.id || '';
          const phoneNumber = phoneJid.split(':')[0].split('@')[0];

          await this.supabase
            .from('sessions')
            .upsert({
              account_id: accountId,
              provider_type: 'wwebjs',
              client_id: accountId,
              status: 'READY',
              qr_code: null,
              pairing_code: null,
              last_connected_at: new Date().toISOString(),
              phone_number: phoneNumber,
              session_data: { pushname: sock.user?.name || 'Connected' },
            }, { onConflict: 'account_id' });

          // Set warming_started_at only if not already set
          await this.supabase
            .from('sessions')
            .update({ warming_started_at: new Date().toISOString() })
            .eq('account_id', accountId)
            .is('warming_started_at', null);

          // Auto-create whatsapp_config so the webhook route can process inbound messages
          await this.ensureWhatsAppConfig(accountId, phoneNumber);

          io.to(accountId).emit('ready', { phone: phoneNumber });
          this.emitSessionEvent(accountId, { type: 'ready' });

          // Auto-sync groups + participants now, and on a recurring interval.
          // Fire-and-forget; errors are caught inside autoSyncGroups.
          this.scheduleAutoGroupSync(accountId);
        }
      }

      if (events['creds.update']) {
        await saveCreds();
      }

      for (const evName of ['contacts.upsert', 'contacts.update'] as const) {
        if (events[evName]) {
          for (const contact of events[evName]) {
            const c = contact as any;
            const lidRaw = c.lid || (c.id?.endsWith?.('@lid') ? c.id : null);
            const phoneJid = c.jid || (isJidUser(c.id) ? c.id : null);

            // Compute lid / phone as strings (or null) up front so the
            // Map.set calls below get `string` keys/values, not the
            // `string | null` declared on the outer lets.
            const lid: string | null = lidRaw ? String(lidRaw).split('@')[0].split(':')[0] : null;
            const phone: string | null = phoneJid ? String(phoneJid).split('@')[0].split(':')[0] : null;

            if (lid && phone) {
              this.lidToPhone.set(lid, phone);
            }

            // Capture a display name from any source Baileys exposes
            // (name | notify | verifiedName). Stored by phone and/or LID
            // so group participant sync can recover names for LID-only
            // members whose `participant.notify` is missing.
            const name = c.name || c.notify || c.verifiedName || null;
            if (name) {
              if (phone) this.phoneToName.set(phone, name);
              if (lid) this.lidToName.set(lid, name);
            }
            this.scheduleAddressBookFlush(accountId);
          }
        }
      }

      if (events['chats.phoneNumberShare' as keyof typeof events]) {
        const share = events['chats.phoneNumberShare' as keyof typeof events] as any;
        if (share?.lid && share?.jid) {
          const lid = share.lid.split('@')[0].split(':')[0];
          const phone = share.jid.split('@')[0].split(':')[0];
          this.lidToPhone.set(lid, phone);
        }
      }

      if (events['messages.upsert']) {
        const upsert = events['messages.upsert'];
        if (upsert.type === 'notify') {
          const readyAt = this.sessionReadyAt.get(accountId) || 0;
          for (const msg of upsert.messages) {
            // Build LID-to-phone map from message key attributes
            const key = msg.key as any;
            if (key.senderLid && key.senderPn) {
              const lid = key.senderLid.split('@')[0].split(':')[0];
              const phone = key.senderPn.split('@')[0].split(':')[0];
              this.lidToPhone.set(lid, phone);
            }
            if (key.participantLid && key.participantPn) {
              const lid = key.participantLid.split('@')[0].split(':')[0];
              const phone = key.participantPn.split('@')[0].split(':')[0];
              this.lidToPhone.set(lid, phone);
            }

            if (!msg.message) continue;
            if (!msg.key.remoteJid || !isJidUser(msg.key.remoteJid)) continue;
            if (!this.globalInboundCallback) continue;
            if (msg.key.fromMe) continue;

            const msgTs = (msg.messageTimestamp as number) || 0;
            if (readyAt && msgTs < readyAt - 30) {
              console.log(`[Baileys] Skipping old message ${msg.key.id} (ts=${msgTs}, readyAt=${readyAt})`);
              continue;
            }

            const remoteJid = msg.key.remoteJid || '';
            if (msg.key.id) {
              this.cacheMessageJid(msg.key.id, remoteJid);
            }

            const inbound = await this.extractInboundMessage(accountId, msg);
            if (inbound) {
              this.globalInboundCallback(accountId, inbound);
            }
          }
        }
      }

      if (events['messages.update']) {
        for (const update of events['messages.update']) {
          if (this.globalStatusCallback && update.update.status) {
            let status: 'sent' | 'delivered' | 'read' | 'failed' | null = null;
            const bStatus = update.update.status;

            if (bStatus === 2) status = 'sent';
            else if (bStatus === 3) status = 'delivered';
            else if (bStatus === 4) status = 'read';

            if (status) {
              this.globalStatusCallback(accountId, {
                messageId: update.key.id || '',
                status,
                recipientId: update.key.remoteJid?.split('@')[0] || '',
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    });

    return { status: 'qr_pending' };
  }

  private async ensureWhatsAppConfig(accountId: string, phoneNumber: string) {
    const { data: account } = await this.supabase
      .from('accounts')
      .select('owner_user_id')
      .eq('id', accountId)
      .single();

    if (!account?.owner_user_id) {
      console.error(`[Baileys] No owner found for account ${accountId}, cannot create whatsapp_config`);
      return;
    }

    const placeholderToken = encryptToken('baileys-local');

    await this.supabase
      .from('whatsapp_config')
      .upsert({
        account_id: accountId,
        user_id: account.owner_user_id,
        phone_number_id: phoneNumber,
        access_token: placeholderToken,
        status: 'connected',
      }, { onConflict: 'account_id' });
  }

  private async extractInboundMessage(accountId: string, msg: any): Promise<InboundMessage | null> {
    const m = msg.message;
    if (!m) return null;

    const base = {
      id: msg.key.id || '',
      from: msg.key.remoteJid?.split('@')[0] || '',
      pushName: msg.pushName || undefined,
      timestamp: (msg.messageTimestamp as number) || Math.floor(Date.now() / 1000),
    };

    // Reactions are handled separately by messages.update
    if (m.reactionMessage) return null;

    // Text
    const text = m.conversation || m.extendedTextMessage?.text;
    if (text) {
      return { ...base, type: 'text', text };
    }

    // Image
    if (m.imageMessage) {
      const mediaUrl = await this.downloadAndUploadMedia(accountId, msg, 'image');
      return { ...base, type: 'image', text: m.imageMessage.caption || undefined, mediaUrl: mediaUrl || undefined };
    }

    // Video
    if (m.videoMessage) {
      const mediaUrl = await this.downloadAndUploadMedia(accountId, msg, 'video');
      return { ...base, type: 'video', text: m.videoMessage.caption || undefined, mediaUrl: mediaUrl || undefined };
    }

    // Audio
    if (m.audioMessage) {
      const mediaUrl = await this.downloadAndUploadMedia(accountId, msg, 'audio');
      return { ...base, type: 'audio', mediaUrl: mediaUrl || undefined };
    }

    // Document
    if (m.documentMessage) {
      const mediaUrl = await this.downloadAndUploadMedia(accountId, msg, 'document');
      return {
        ...base,
        type: 'document',
        text: m.documentMessage.caption || m.documentMessage.fileName || undefined,
        mediaUrl: mediaUrl || undefined,
      };
    }

    // Sticker
    if (m.stickerMessage) {
      const mediaUrl = await this.downloadAndUploadMedia(accountId, msg, 'sticker');
      return { ...base, type: 'sticker', mediaUrl: mediaUrl || undefined };
    }

    // Location
    if (m.locationMessage) {
      const loc = m.locationMessage;
      const locationText = [loc.name, loc.address, `${loc.degreesLatitude},${loc.degreesLongitude}`]
        .filter(Boolean)
        .join(' - ');
      return { ...base, type: 'location', text: locationText };
    }

    // Fallback
    return { ...base, type: 'text', text: '[Unsupported message type]' };
  }

  private async downloadAndUploadMedia(accountId: string, msg: any, type: string): Promise<string | null> {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger,
        reuploadRequest: this.getSocket(accountId).updateMediaMessage,
      });

      const ext = this.getMediaExtension(type, msg);
      const mimeType = this.getMediaMimeType(type, msg);
      const filename = `account-${accountId}/${Date.now()}-${msg.key.id || 'media'}.${ext}`;

      const { error } = await this.supabase.storage
        .from('chat-media')
        .upload(filename, buffer as Buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (error) {
        console.error('[Baileys] Media upload failed:', error.message);
        return null;
      }

      const { data: urlData } = this.supabase.storage
        .from('chat-media')
        .getPublicUrl(filename);

      return urlData?.publicUrl || null;
    } catch (err) {
      console.error('[Baileys] Media download/upload failed:', err);
      return null;
    }
  }

  private getMediaExtension(type: string, msg: any): string {
    const m = msg.message;
    const mime = this.getMediaMimeType(type, msg);
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a', 'application/pdf': 'pdf',
    };
    if (extMap[mime]) return extMap[mime];
    if (type === 'document' && m?.documentMessage?.fileName) {
      const parts = m.documentMessage.fileName.split('.');
      if (parts.length > 1) return parts.pop()!;
    }
    const typeDefaults: Record<string, string> = {
      image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin', sticker: 'webp',
    };
    return typeDefaults[type] || 'bin';
  }

  private getMediaMimeType(type: string, msg: any): string {
    const m = msg.message;
    if (type === 'image' && m?.imageMessage?.mimetype) return m.imageMessage.mimetype;
    if (type === 'video' && m?.videoMessage?.mimetype) return m.videoMessage.mimetype;
    if (type === 'audio' && m?.audioMessage?.mimetype) return m.audioMessage.mimetype;
    if (type === 'document' && m?.documentMessage?.mimetype) return m.documentMessage.mimetype;
    if (type === 'sticker' && m?.stickerMessage?.mimetype) return m.stickerMessage.mimetype;
    return 'application/octet-stream';
  }

  async getSessionStatus(accountId: string): Promise<SessionStatus> {
    return this.sessionStatuses.get(accountId) || 'disconnected';
  }

  async destroySession(accountId: string): Promise<void> {
    this.clearAutoGroupSync(accountId);
    const sock = this.sockets.get(accountId);
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.warn(`[Baileys] logout failed for ${accountId}:`, err);
      } finally {
        this.sockets.delete(accountId);
        this.sessionStatuses.delete(accountId);
        this.lastQrCodes.delete(accountId);
        this.eventCallbacks.delete(accountId);
      }
      await this.supabase
        .from('sessions')
        .update({ status: 'disconnected', qr_code: null })
        .eq('account_id', accountId);
    }
  }

  async closeAll(): Promise<void> {
    for (const accountId of this.groupSyncIntervals.keys()) {
      this.clearAutoGroupSync(accountId);
    }
    const promises = Array.from(this.sockets.entries()).map(async ([accountId, sock]) => {
      try {
        sock.end(undefined);
      } catch (err) {
        console.warn(`[Baileys] Error closing socket for ${accountId}:`, err);
      }
    });
    await Promise.allSettled(promises);
    this.sockets.clear();
    this.sessionStatuses.clear();
  }

  onSessionEvent(callback: (accountId: string, event: SessionEvent) => void): void {
    this.globalSessionCallback = callback;
  }

  registerEventCallback(accountId: string, callback: (accountId: string, event: SessionEvent) => void) {
    this.eventCallbacks.set(accountId, callback);
  }

  private formatPhone(phone: string): string {
    const p = phone.replace('+', '');
    return p.includes('@s.whatsapp.net') ? p : `${p}@s.whatsapp.net`;
  }

  async sendText(accountId: string, to: string, body: string, options?: SendOptions): Promise<MessageResult> {
    const sock = this.getSocket(accountId);
    const jid = this.formatPhone(to);

    const sentMsg = await sock.sendMessage(jid, { text: body });
    return { messageId: sentMsg?.key.id || '' };
  }

  async sendMedia(
    accountId: string,
    to: string,
    kind: 'image' | 'video' | 'document' | 'audio',
    media: MediaPayload,
    caption?: string,
    options?: SendOptions
  ): Promise<MessageResult> {
    const sock = this.getSocket(accountId);
    const jid = this.formatPhone(to);

    if (media.link) {
      const sentMsg = await sock.sendMessage(jid, {
        [kind]: { url: media.link },
        caption
      } as any);
      return { messageId: sentMsg?.key.id || '' };
    } else if (media.bytes && media.mimeType) {
      const sentMsg = await sock.sendMessage(jid, {
        [kind]: Buffer.from(media.bytes),
        mimetype: media.mimeType,
        caption
      } as any);
      return { messageId: sentMsg?.key.id || '' };
    }
    throw new Error('Media link or bytes required');
  }

  async sendTemplate(
    accountId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
    options?: SendOptions
  ): Promise<MessageResult> {
    throw new Error('Templates are not supported by the WhatsApp Web provider.');
  }

  async sendInteractive(accountId: string, to: string, payload: any, options?: SendOptions): Promise<MessageResult> {
    throw new Error('Interactive messages are not supported by the WhatsApp Web provider.');
  }

  async sendReaction(accountId: string, to: string, messageId: string, emoji: string): Promise<MessageResult> {
    const sock = this.getSocket(accountId);
    const jid = this.formatPhone(to);

    const sentMsg = await sock.sendMessage(jid, {
      react: {
        text: emoji,
        key: { remoteJid: jid, id: messageId }
      }
    });
    return { messageId: sentMsg?.key.id || '' };
  }

  async markAsRead(accountId: string, messageId: string): Promise<void> {
    const sock = this.getSocket(accountId);
    const remoteJid = this.messageJidMap.get(messageId);
    if (!remoteJid) {
      console.warn(`[Baileys] remoteJid not found for message ${messageId}, skipping markAsRead`);
      return;
    }
    await sock.readMessages([{ remoteJid, id: messageId }]);
  }

  onInboundMessage(callback: (accountId: string, message: InboundMessage) => void): void {
    this.globalInboundCallback = callback;
  }

  onMessageStatus(callback: (accountId: string, status: StatusUpdate) => void): void {
    this.globalStatusCallback = callback;
  }

  async uploadMedia(accountId: string, file: Uint8Array, mimeType: string, filename?: string): Promise<string> {
    throw new Error('Not needed for Baileys, handled via local paths or data URIs');
  }

  async getMediaUrl(accountId: string, mediaId: string): Promise<string> {
    throw new Error('Not implemented for Baileys');
  }

  async downloadMedia(accountId: string, mediaIdOrUrl: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
    throw new Error('Not implemented for Baileys');
  }

  async getTemplates(accountId: string): Promise<any[]> {
    return [];
  }

  async createTemplate(accountId: string, template: any): Promise<any> {
    throw new Error('Not supported');
  }

  async deleteTemplate(accountId: string, templateName: string, metaTemplateId?: string): Promise<void> {
    throw new Error('Not supported');
  }

  async syncTemplates(accountId: string): Promise<any[]> {
    return [];
  }

  async isRegistered(accountId: string, phone: string): Promise<boolean> {
    const sock = this.getSocket(accountId);
    const jid = this.formatPhone(phone);
    const results = await sock.onWhatsApp(jid);
    return !!results?.[0]?.exists;
  }

  async getProfilePic(accountId: string, phone: string): Promise<string | null> {
    const sock = this.getSocket(accountId);
    const jid = this.formatPhone(phone);
    try {
      const url = await sock.profilePictureUrl(jid, 'image');
      return url || null;
    } catch {
      return null;
    }
  }

  async syncGroups(accountId: string): Promise<{ groupCount: number; participantCount: number }> {
    const sock = this.getSocket(accountId);
    console.log(`[Baileys] Syncing groups for ${accountId}...`);

    const groups = await sock.groupFetchAllParticipating();
    const entries = Object.values(groups);

    let participantCount = 0;
    let phonesResolved = 0;
    let namesResolved = 0;
    let namesNull = 0;

    for (const group of entries) {
      const g = group as any;
      let groupPhonesResolved = 0;

      const participantRows: any[] = [];
      if (group.participants?.length) {
        for (const p of group.participants) {
          const part = p as any;
          let phone: string | null = null;
          let lid: string | null = null;

          if (part.jid && part.jid.endsWith('@s.whatsapp.net')) {
            phone = String(part.jid).split('@')[0].split(':')[0];
          } else if (part.id.endsWith('@s.whatsapp.net')) {
            phone = String(part.id).split('@')[0].split(':')[0];
          } else if (part.id.endsWith('@lid')) {
            lid = String(part.id).split('@')[0].split(':')[0];
            phone = lid ? (this.lidToPhone.get(lid) || null) : null;
          }

          if (phone) {
            phonesResolved++;
            groupPhonesResolved++;
          }

          // Resolve a display name from any available source, in order:
          //   1. participant.notify / participant.name (group payload)
          //   2. phoneToName (from contacts.upsert/update events)
          //   3. lidToName (for LID-only members)
          // If none is available, leave null — we do NOT fabricate names.
          let displayName: string | null = part.notify || part.name || null;
          if (!displayName && phone) {
            displayName = this.phoneToName.get(phone) || null;
          }
          if (!displayName && lid) {
            displayName = this.lidToName.get(lid) || null;
          }
          if (displayName) {
            namesResolved++;
          } else {
            namesNull++;
          }

          participantRows.push({
            jid: part.id,
            phone,
            display_name: displayName,
            email: extractProvidedEmail(part.email ?? part.eMail),
            is_admin: part.admin === 'admin' || part.admin === 'superadmin',
            is_super_admin: part.admin === 'superadmin',
          });
        }
      }

      await this.supabase.from('wa_groups').upsert({
        account_id: accountId,
        jid: group.id,
        subject: group.subject || null,
        description: group.desc || null,
        owner_jid: group.owner || null,
        size: group.participants?.length || group.size || 0,
        creation_ts: group.creation || null,
        is_community: !!group.isCommunity,
        restrict: !!g.restrict,
        announce: !!g.announce,
        member_add_mode: g.memberAddMode !== false,
        join_approval_mode: !!g.joinApprovalMode,
        is_community_announce: !!g.isCommunityAnnounce,
        linked_parent: g.linkedParent || null,
        ephemeral_duration: g.ephemeralDuration || 0,
        participants_with_phone: groupPhonesResolved,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'account_id,jid' });

      const { data: groupRow } = await this.supabase
        .from('wa_groups')
        .select('id')
        .eq('account_id', accountId)
        .eq('jid', group.id)
        .single();

      if (!groupRow) continue;

      await this.supabase
        .from('wa_group_participants')
        .delete()
        .eq('group_id', groupRow.id);

      if (participantRows.length) {
        const rows = participantRows.map(r => ({
          ...r,
          group_id: groupRow.id,
          account_id: accountId,
        }));

        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
          await this.supabase
            .from('wa_group_participants')
            .insert(rows.slice(i, i + CHUNK));
        }

        participantCount += rows.length;

        // Auto-build the contact database from group membership: upsert
        // every participant with a resolved phone into `contacts` and tag
        // them with the source group so they're filterable.
        try {
          await this.upsertParticipantsAsContacts(
            accountId,
            group.subject || group.id,
            groupRow.id,
            rows,
          );
        } catch (err) {
          console.error(`[Baileys] Contact upsert from group ${group.id} failed:`, err);
        }
      }
    }

    console.log(`[Baileys] Synced ${entries.length} groups, ${participantCount} participants for ${accountId} (phones resolved: ${phonesResolved}/${participantCount}, names resolved: ${namesResolved}/${participantCount}, names null: ${namesNull}, LID map: ${this.lidToPhone.size})`);
    return { groupCount: entries.length, participantCount };
  }

  /**
   * Schedule the recurring group/participant auto-sync for an account.
   * Called once when the Baileys socket reaches the `open` state. The
   * initial run is deferred by GROUP_SYNC_DELAY_MS so app-state sync
   * (contacts/chats) has a chance to populate the LID→phone map first,
   * which improves participant phone resolution.
   */
  private scheduleAutoGroupSync(accountId: string) {
    this.clearAutoGroupSync(accountId);
    const initial = setTimeout(() => {
      this.autoSyncGroups(accountId).catch((err) =>
        console.error(`[Baileys] Initial auto group sync failed for ${accountId}:`, err),
      );
      this.syncAddressBook(accountId).catch((err) =>
        console.error(`[Baileys] Initial address-book sync failed for ${accountId}:`, err),
      );
    }, GROUP_SYNC_DELAY_MS);
    this.groupSyncTimeouts.set(accountId, initial);

    const recurring = setInterval(() => {
      this.autoSyncGroups(accountId).catch((err) =>
        console.error(`[Baileys] Recurring auto group sync failed for ${accountId}:`, err),
      );
    }, GROUP_SYNC_INTERVAL_MS);
    // Don't keep the worker process alive solely for this timer.
    if (typeof (recurring as any).unref === 'function') (recurring as any).unref();
    this.groupSyncIntervals.set(accountId, recurring);
  }

  private clearAutoGroupSync(accountId: string) {
    const initial = this.groupSyncTimeouts.get(accountId);
    if (initial) {
      clearTimeout(initial);
      this.groupSyncTimeouts.delete(accountId);
    }
    const recurring = this.groupSyncIntervals.get(accountId);
    if (recurring) {
      clearInterval(recurring);
      this.groupSyncIntervals.delete(accountId);
    }
  }

  private async autoSyncGroups(accountId: string) {
    if (this.sessionStatuses.get(accountId) !== 'connected') return;
    await this.syncGroups(accountId);
  }

  /**
   * Upsert group participants into the `contacts` table (keyed by
   * account_id + phone_normalized via the unique index from migration
   * 022) and tag them with "WA Group: {groupName}" so the user can
   * filter imported contacts by their source group. Existing contacts
   * are left untouched so user edits to name/tags are never clobbered.
   *
   * Mirrors the dedupe pattern in
   * apps/web/src/app/api/whatsapp/groups/import-all/route.ts: the
   * (account_id, phone_normalized) unique index is a *partial* index
   * (WHERE phone_normalized <> ''), which PostgREST's `onConflict`
   * can't target (it can't express the index predicate), so we
   * resolve existing rows first and insert only the missing ones.
   */
  private async upsertParticipantsAsContacts(
    accountId: string,
    groupName: string,
    groupId: string,
    participantRows: any[],
  ): Promise<{ contactsUpserted: number; tagged: number }> {
    const withPhone = participantRows.filter((r) => !!r.phone);
    if (withPhone.length === 0) return { contactsUpserted: 0, tagged: 0 };

    const { data: account } = await this.supabase
      .from('accounts')
      .select('owner_user_id')
      .eq('id', accountId)
      .maybeSingle();
    const ownerId = account?.owner_user_id;
    if (!ownerId) {
      console.warn(`[Baileys] No owner for account ${accountId}; skipping contact upsert from group ${groupName}`);
      return { contactsUpserted: 0, tagged: 0 };
    }

    // 1) De-dup against existing contacts by normalized phone (digits
    //    only), matching the generated `phone_normalized` column.
    const normalize = (ph: string) => ph.replace(/\D/g, '');
    const uniqueByNorm = new Map<
      string,
      { phone: string; display_name: string | null; email: string | null }
    >();
    for (const p of withPhone) {
      const norm = normalize(p.phone);
      if (!norm) continue;
      if (!uniqueByNorm.has(norm)) {
        uniqueByNorm.set(norm, {
          phone: p.phone,
          display_name: p.display_name,
          email: extractProvidedEmail(p.email),
        });
      }
    }

    const existingByNorm = new Map<
      string,
      { id: string; email: string | null; source_group_id: string | null }
    >();
    const allPhones = [...uniqueByNorm.values()].map((p) => p.phone);
    for (let i = 0; i < allPhones.length; i += 1000) {
      const chunk = allPhones.slice(i, i + 1000);
      const { data: existing } = await this.supabase
        .from('contacts')
        .select('id, phone, email, source_group_id')
        .eq('account_id', accountId)
        .in('phone', chunk);
      (existing ?? []).forEach((c) =>
        existingByNorm.set(normalize(c.phone), {
          id: c.id,
          email: c.email,
          source_group_id: c.source_group_id,
        }),
      );
    }

    const toInsert = [...uniqueByNorm.entries()]
      .filter(([norm]) => !existingByNorm.has(norm))
      .map(([, p]) => ({
        phone: p.phone,
        name: p.display_name || null,
        email: p.email,
        source_group_id: groupId,
        account_id: accountId,
        user_id: ownerId,
      }));

    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await this.supabase
        .from('contacts')
        .insert(toInsert.slice(i, i + CHUNK));
    }

    // 2) Resolve contact ids (new + pre-existing) so we can tag them
    //    and write Group ID lineage. Fill email only when empty and
    //    Baileys actually provided one. Do not clobber name/tags.
    const contactIds = new Set<string>();
    const emailPatches: { id: string; email: string }[] = [];
    const lineageIds: string[] = [];
    for (let i = 0; i < allPhones.length; i += 1000) {
      const chunk = allPhones.slice(i, i + 1000);
      const { data } = await this.supabase
        .from('contacts')
        .select('id, phone, email, source_group_id')
        .eq('account_id', accountId)
        .in('phone', chunk);
      for (const c of data ?? []) {
        contactIds.add(c.id);
        const incoming = uniqueByNorm.get(normalize(c.phone));
        if (incoming?.email && !c.email) {
          emailPatches.push({ id: c.id, email: incoming.email });
        }
        if (groupId && !c.source_group_id) lineageIds.push(c.id);
      }
    }
    for (const patch of emailPatches) {
      await this.supabase.from('contacts').update({ email: patch.email }).eq('id', patch.id);
    }
    for (let i = 0; i < lineageIds.length; i += CHUNK) {
      await this.supabase
        .from('contacts')
        .update({ source_group_id: groupId })
        .in('id', lineageIds.slice(i, i + CHUNK));
    }

    if (groupId && contactIds.size > 0) {
      const membership = [...contactIds].map((contact_id) => ({
        contact_id,
        group_id: groupId,
        account_id: accountId,
      }));
      for (let i = 0; i < membership.length; i += CHUNK) {
        await this.supabase.from('contact_wa_groups').upsert(membership.slice(i, i + CHUNK), {
          onConflict: 'contact_id,group_id',
          ignoreDuplicates: true,
        });
      }
    }

    // 3) Ensure a per-group tag exists, then apply it to every contact.
    const tagName = `WA Group: ${groupName}`;
    let tagId: string | null = null;
    const { data: existingTag } = await this.supabase
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', tagName)
      .maybeSingle();
    if (existingTag) {
      tagId = existingTag.id;
    } else {
      const { data: newTag } = await this.supabase
        .from('tags')
        .insert({
          name: tagName,
          account_id: accountId,
          user_id: ownerId,
          color: '#22c55e',
        })
        .select('id')
        .maybeSingle();
      tagId = newTag?.id ?? null;
    }

    if (!tagId) {
      return { contactsUpserted: toInsert.length, tagged: 0 };
    }

    const tagRows = [...contactIds].map((id) => ({
      contact_id: id,
      tag_id: tagId,
    }));
    for (let i = 0; i < tagRows.length; i += CHUNK) {
      await this.supabase
        .from('contact_tags')
        .upsert(tagRows.slice(i, i + CHUNK), {
          onConflict: 'contact_id,tag_id',
          ignoreDuplicates: true,
        });
    }

    return { contactsUpserted: toInsert.length, tagged: tagRows.length };
  }

  private addressBookFlushTimers = new Map<string, NodeJS.Timeout>();

  private scheduleAddressBookFlush(accountId: string) {
    const existing = this.addressBookFlushTimers.get(accountId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.addressBookFlushTimers.delete(accountId);
      this.syncAddressBook(accountId).catch((err) =>
        console.error(`[Baileys] Address-book flush failed for ${accountId}:`, err),
      );
    }, 2500);
    this.addressBookFlushTimers.set(accountId, timer);
  }

  /**
   * Upsert Baileys address-book entries into `contacts` by
   * (account_id, phone_normalized). Empty names never overwrite an
   * existing contact name. Used on connect, contacts.upsert, and the
   * explicit POST /api/whatsapp/contacts/sync job.
   */
  async syncAddressBook(accountId: string): Promise<{ upserted: number; updated: number }> {
    const sock = this.sockets.get(accountId);
    const collected = new Map<string, string | null>();

    const storeContacts = (sock as any)?.store?.contacts as
      | Record<string, { id?: string; name?: string; notify?: string; verifiedName?: string }>
      | undefined;
    if (storeContacts) {
      for (const c of Object.values(storeContacts)) {
        const jid = c.id || '';
        if (!isJidUser(jid)) continue;
        const phone = String(jid).split('@')[0].split(':')[0];
        if (!phone || !/^\d{7,15}$/.test(phone)) continue;
        collected.set(phone, c.name || c.notify || c.verifiedName || null);
      }
    }

    for (const [phone, name] of this.phoneToName.entries()) {
      if (!phone || !/^\d{7,15}$/.test(phone)) continue;
      if (!collected.has(phone) || name) collected.set(phone, name);
    }

    for (const [lid, phone] of this.lidToPhone.entries()) {
      if (!phone || !/^\d{7,15}$/.test(phone)) continue;
      const name = this.lidToName.get(lid) || this.phoneToName.get(phone) || null;
      if (!collected.has(phone) || name) collected.set(phone, name);
    }

    if (collected.size === 0) {
      console.log(`[Baileys] Address book empty for ${accountId}`);
      return { upserted: 0, updated: 0 };
    }

    const { data: account } = await this.supabase
      .from('accounts')
      .select('owner_user_id')
      .eq('id', accountId)
      .maybeSingle();
    const ownerId = account?.owner_user_id;
    if (!ownerId) return { upserted: 0, updated: 0 };

    const phones = [...collected.keys()];
    const existingByNorm = new Map<string, { id: string; name: string | null }>();
    for (let i = 0; i < phones.length; i += 1000) {
      const chunk = phones.slice(i, i + 1000);
      const { data: existing } = await this.supabase
        .from('contacts')
        .select('id, phone, name, phone_normalized')
        .eq('account_id', accountId)
        .in('phone_normalized', chunk);
      for (const row of existing ?? []) {
        const norm = row.phone_normalized || String(row.phone).replace(/\D/g, '');
        existingByNorm.set(norm, { id: row.id, name: row.name });
      }
    }

    const toInsert: { phone: string; name: string | null; account_id: string; user_id: string }[] = [];
    const toName: { id: string; name: string }[] = [];
    for (const [phone, name] of collected.entries()) {
      const existing = existingByNorm.get(phone);
      if (!existing) {
        toInsert.push({
          phone,
          name: name || null,
          account_id: accountId,
          user_id: ownerId,
        });
        continue;
      }
      if (name && !existing.name?.trim()) {
        toName.push({ id: existing.id, name });
      }
    }

    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await this.supabase
        .from('contacts')
        .insert(toInsert.slice(i, i + CHUNK));
      if (error) {
        console.error('[Baileys] Address-book insert failed:', error.message);
      }
    }
    for (const row of toName) {
      await this.supabase.from('contacts').update({ name: row.name }).eq('id', row.id);
    }

    console.log(
      `[Baileys] Address-book sync for ${accountId}: inserted ${toInsert.length}, named ${toName.length} (from ${collected.size} WA contacts)`,
    );
    return { upserted: toInsert.length, updated: toName.length };
  }
}
