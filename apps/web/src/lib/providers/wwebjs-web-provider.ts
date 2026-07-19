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

import { wwebjsMessageQueue } from '../queue/bullmq';
import { supabaseAdmin } from '../flows/admin-client';

export class WWebJSWebProvider implements IMessagingProvider {
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

  private async enqueue(accountId: string, action: string, payload: any): Promise<MessageResult> {
    const job = await wwebjsMessageQueue.add('wwebjs-job', {
      accountId,
      action,
      payload,
    });

    // We still return a tracking ID so the web app can look it up later if needed.
    // The worker will update the `messages` table row where message_id = job.id
    return { messageId: job.id! };
  }

  async initializeSession(accountId: string, config: SessionConfig): Promise<SessionInitResult> {
    // Web app doesn't initialize WWebJS directly; the worker does.
    return { status: 'qr_pending' };
  }

  async getSessionStatus(accountId: string): Promise<SessionStatus> {
    const { data } = await supabaseAdmin()
      .from('sessions')
      .select('status')
      .eq('account_id', accountId)
      .maybeSingle();
      
    return (data?.status as SessionStatus) || 'disconnected';
  }

  async destroySession(accountId: string): Promise<void> {
    await supabaseAdmin()
      .from('sessions')
      .update({ status: 'disconnected' })
      .eq('account_id', accountId);
  }

  onSessionEvent(callback: (accountId: string, event: SessionEvent) => void): void {}

  async sendText(accountId: string, to: string, body: string, options?: SendOptions): Promise<MessageResult> {
    return this.enqueue(accountId, 'sendText', { to, body, options });
  }

  async sendMedia(
    accountId: string,
    to: string,
    kind: 'image' | 'video' | 'document' | 'audio',
    media: MediaPayload,
    caption?: string,
    options?: SendOptions
  ): Promise<MessageResult> {
    return this.enqueue(accountId, 'sendMedia', { to, kind, media, caption, options });
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
    return this.enqueue(accountId, 'sendReaction', { to, messageId, emoji });
  }

  async markAsRead(accountId: string, messageId: string): Promise<void> {
    await this.enqueue(accountId, 'markAsRead', { messageId });
  }

  onInboundMessage(callback: (accountId: string, message: InboundMessage) => void): void {}

  onMessageStatus(callback: (accountId: string, status: StatusUpdate) => void): void {}

  async uploadMedia(accountId: string, file: Uint8Array, mimeType: string, filename?: string): Promise<string> {
    throw new Error('Not needed for WWebJS, handled via local paths or data URIs');
  }

  async getMediaUrl(accountId: string, mediaId: string): Promise<string> {
    throw new Error('Not implemented for WWebJS');
  }

  async downloadMedia(accountId: string, mediaIdOrUrl: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
    throw new Error('Not implemented for WWebJS in Web environment. Handled directly by worker.');
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
    // This requires synchronous RPC with the worker or checking a cached value.
    // For now, assume true and let the worker fail if not.
    return true;
  }

  async getProfilePic(accountId: string, phone: string): Promise<string | null> {
    return null;
  }
}
