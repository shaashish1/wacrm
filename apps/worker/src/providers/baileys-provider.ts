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
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';

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
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 2000;

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

  async initializeSession(accountId: string, config: SessionConfig): Promise<SessionInitResult> {
    if (this.sockets.has(accountId)) {
      return { status: 'connected' };
    }

    const sessionDir = path.join(process.cwd(), 'sessions', accountId);
    await fs.mkdir(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const usePairingCode = !!config.phoneNumber;

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('WaCRM'),
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

    this.sockets.set(accountId, sock);
    this.sessionStatuses.set(accountId, 'qr_pending');

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

    sock.ev.process(async (events) => {
      if (events['connection.update']) {
        const update = events['connection.update'];
        const { connection, lastDisconnect, qr } = update;

        if (qr && !usePairingCode) {
          this.sessionStatuses.set(accountId, 'qr_pending');
          await this.supabase
            .from('sessions')
            .upsert({
              account_id: accountId,
              provider_type: 'wwebjs',
              client_id: accountId,
              status: 'qr_pending',
              qr_code: qr,
              pairing_code: null,
            }, { onConflict: 'account_id' });

          this.emitSessionEvent(accountId, { type: 'qr_refresh', qrData: qr });
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
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
            await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
          }
        } else if (connection === 'open') {
          this.sessionStatuses.set(accountId, 'connected');
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

          this.emitSessionEvent(accountId, { type: 'ready' });
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
            if (lidRaw && phoneJid) {
              const lid = lidRaw.split('@')[0].split(':')[0];
              const phone = phoneJid.split('@')[0].split(':')[0];
              this.lidToPhone.set(lid, phone);
            }
          }
        }
      }

      if (events['messages.upsert']) {
        const upsert = events['messages.upsert'];
        if (upsert.type === 'notify') {
          const readyAt = this.sessionReadyAt.get(accountId) || 0;
          for (const msg of upsert.messages) {
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
    const sock = this.sockets.get(accountId);
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.warn(`[Baileys] logout failed for ${accountId}:`, err);
      } finally {
        this.sockets.delete(accountId);
        this.sessionStatuses.delete(accountId);
        this.eventCallbacks.delete(accountId);
      }
      await this.supabase
        .from('sessions')
        .update({ status: 'disconnected', qr_code: null })
        .eq('account_id', accountId);
    }
  }

  async closeAll(): Promise<void> {
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

    for (const group of entries) {
      const resolvePhone = (jid: string): string | null => {
        const raw = jid.split('@')[0].split(':')[0];
        if (jid.endsWith('@s.whatsapp.net')) return raw;
        if (jid.endsWith('@lid')) return this.lidToPhone.get(raw) || null;
        return null;
      };

      await this.supabase.from('wa_groups').upsert({
        account_id: accountId,
        jid: group.id,
        subject: group.subject || null,
        description: group.desc || null,
        owner_jid: group.owner || null,
        size: group.participants?.length || group.size || 0,
        creation_ts: group.creation || null,
        is_community: !!group.isCommunity,
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

      if (group.participants?.length) {
        const rows = group.participants.map(p => ({
          group_id: groupRow.id,
          account_id: accountId,
          jid: p.id,
          phone: resolvePhone(p.id),
          display_name: p.notify || p.name || null,
          is_admin: p.admin === 'admin' || p.admin === 'superadmin',
          is_super_admin: p.admin === 'superadmin',
        }));

        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
          await this.supabase
            .from('wa_group_participants')
            .insert(rows.slice(i, i + CHUNK));
        }

        participantCount += rows.length;
      }
    }

    console.log(`[Baileys] Synced ${entries.length} groups, ${participantCount} participants for ${accountId} (LID map size: ${this.lidToPhone.size})`);
    return { groupCount: entries.length, participantCount };
  }
}
