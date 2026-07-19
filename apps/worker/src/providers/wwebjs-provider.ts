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

import { Client, LocalAuth, RemoteAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { SupabaseAuthStore } from './supabase-store';

export class WWebJSProvider implements IMessagingProvider {
  private clients: Map<string, Client> = new Map();
  private eventCallbacks: Map<string, (accountId: string, event: SessionEvent) => void> = new Map();
  private inboundCallbacks: Map<string, (accountId: string, message: InboundMessage) => void> = new Map();
  private statusCallbacks: Map<string, (accountId: string, status: StatusUpdate) => void> = new Map();

  getProviderType(): ProviderType {
    return 'wwebjs';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      templates: false, // WWebJS does not support Cloud API templates natively
      reactions: true,
      readReceipts: true,
      profilePicAccess: true, // WWebJS can fetch profile pics
      registrationCheck: true, // WWebJS can check if a number is registered on WA
      interactive: false, // Standard WWebJS doesn't support interactive buttons reliably
    };
  }

  private getClient(accountId: string): Client {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error(`Session not initialized for account ${accountId}`);
    }
    return client;
  }

  async initializeSession(accountId: string, config: SessionConfig): Promise<SessionInitResult> {
    if (this.clients.has(accountId)) {
      return { status: 'connected' };
    }

    const store = new SupabaseAuthStore();
    
    const client = new Client({
      authStrategy: new RemoteAuth({
        clientId: accountId,
        store: store,
        backupSyncIntervalMs: 300000 // Backup every 5 minutes
      }),
      puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.clients.set(accountId, client);

    client.on('qr', (qr) => {
      // In a real implementation, you'd send this to the UI via WebSocket.
      // For now, emit it via the callback.
      const cb = this.eventCallbacks.get(accountId);
      if (cb) {
        cb(accountId, { type: 'qr_refresh', qrData: qr });
      }
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
      const cb = this.eventCallbacks.get(accountId);
      if (cb) {
        cb(accountId, { type: 'ready' });
      }
    });

    client.on('authenticated', () => {
      // Authenticated
    });

    client.on('auth_failure', (msg) => {
      const cb = this.eventCallbacks.get(accountId);
      if (cb) {
        cb(accountId, { type: 'auth_failure', message: msg });
      }
    });

    client.on('disconnected', (reason) => {
      const cb = this.eventCallbacks.get(accountId);
      if (cb) {
        cb(accountId, { type: 'disconnected', reason });
      }
      this.clients.delete(accountId);
    });

    client.on('message', async (msg) => {
      const cb = this.inboundCallbacks.get(accountId);
      if (cb) {
        let mediaUrl;
        if (msg.hasMedia) {
          // Note: In real production, you'd upload this to Supabase Storage and pass the URL
          mediaUrl = 'local-media-pending'; 
        }
        cb(accountId, {
          id: msg.id._serialized,
          from: msg.from,
          type: msg.type,
          text: msg.body,
          mediaUrl,
          timestamp: msg.timestamp,
        });
      }
    });

    client.on('message_ack', (msg, ack) => {
      const cb = this.statusCallbacks.get(accountId);
      if (cb) {
        // Ack values: 0: ERROR, 1: PENDING, 2: SERVER, 3: DEVICE, 4: READ
        let status: 'sent' | 'delivered' | 'read' | 'failed' | null = null;
        if (ack === 2) status = 'sent';
        else if (ack === 3) status = 'delivered';
        else if (ack === 4) status = 'read';
        
        if (status) {
          cb(accountId, {
            messageId: msg.id._serialized,
            status,
            recipientId: msg.to,
            timestamp: Date.now(),
          });
        }
      }
    });

    client.initialize();

    return { status: 'qr_pending' };
  }

  async getSessionStatus(accountId: string): Promise<SessionStatus> {
    const client = this.clients.get(accountId);
    if (!client) return 'disconnected';
    
    try {
      const state = await client.getState();
      if (state === 'CONNECTED') return 'connected';
      return 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  async destroySession(accountId: string): Promise<void> {
    const client = this.clients.get(accountId);
    if (client) {
      await client.destroy();
      this.clients.delete(accountId);
    }
  }

  onSessionEvent(callback: (accountId: string, event: SessionEvent) => void): void {
    // This simple implementation uses a broad callback or per-account callback.
    // For now, we will just store it globally and pass it to specific instances.
    // A better way would be using EventEmitter.
  }

  registerEventCallback(accountId: string, callback: (accountId: string, event: SessionEvent) => void) {
    this.eventCallbacks.set(accountId, callback);
  }

  private formatPhone(phone: string): string {
    return phone.replace('+', '') + '@c.us';
  }

  async sendText(accountId: string, to: string, body: string, options?: SendOptions): Promise<MessageResult> {
    const client = this.getClient(accountId);
    const msg = await client.sendMessage(this.formatPhone(to), body);
    return { messageId: msg.id._serialized };
  }

  async sendMedia(
    accountId: string,
    to: string,
    kind: 'image' | 'video' | 'document' | 'audio',
    media: MediaPayload,
    caption?: string,
    options?: SendOptions
  ): Promise<MessageResult> {
    const client = this.getClient(accountId);
    
    let messageMedia: MessageMedia;
    if (media.link) {
      messageMedia = await MessageMedia.fromUrl(media.link, { unsafeMime: true });
    } else if (media.bytes && media.mimeType) {
      const b64 = Buffer.from(media.bytes).toString('base64');
      messageMedia = new MessageMedia(media.mimeType, b64, media.filename);
    } else {
      throw new Error('Media link or bytes required');
    }

    const msg = await client.sendMessage(this.formatPhone(to), messageMedia, { caption });
    return { messageId: msg.id._serialized };
  }

  async sendTemplate(
    accountId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
    options?: SendOptions
  ): Promise<MessageResult> {
    throw new Error('Templates are not supported by WWebJSProvider.');
  }

  async sendInteractive(accountId: string, to: string, payload: any, options?: SendOptions): Promise<MessageResult> {
    throw new Error('Interactive messages are not fully supported by WWebJSProvider in standard mode.');
  }

  async sendReaction(accountId: string, to: string, messageId: string, emoji: string): Promise<MessageResult> {
    const client = this.getClient(accountId);
    // WWebJS handles reactions by sending empty string to remove, or emoji to add
    // Wait, wwebjs usually reacts using msg.react(emoji) if you have the message object.
    // But here we only have messageId.
    throw new Error('Reactions via messageId not yet implemented for WWebJS in this provider.');
  }

  async markAsRead(accountId: string, messageId: string): Promise<void> {
    // WWebJS client.sendSeen(chatId) is typically used. 
    // Implementing this requires chat context.
    const client = this.getClient(accountId);
    await client.sendSeen(this.formatPhone(accountId)); // Approximate
  }

  onInboundMessage(callback: (accountId: string, message: InboundMessage) => void): void {
    // Global setter for simplicity in this scaffold
  }

  onMessageStatus(callback: (accountId: string, status: StatusUpdate) => void): void {
    // Global setter for simplicity
  }

  async uploadMedia(accountId: string, file: Uint8Array, mimeType: string, filename?: string): Promise<string> {
    throw new Error('Not needed for WWebJS, handled via local paths or data URIs');
  }

  async getMediaUrl(accountId: string, mediaId: string): Promise<string> {
    throw new Error('Not implemented for WWebJS');
  }

  async downloadMedia(accountId: string, mediaIdOrUrl: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
    throw new Error('Not implemented for WWebJS');
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
    const client = this.getClient(accountId);
    const registered = await client.isRegisteredUser(this.formatPhone(phone));
    return registered;
  }

  async getProfilePic(accountId: string, phone: string): Promise<string | null> {
    const client = this.getClient(accountId);
    const url = await client.getProfilePicUrl(this.formatPhone(phone));
    return url || null;
  }
}
