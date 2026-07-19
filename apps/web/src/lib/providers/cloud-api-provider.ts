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
  sendTextMessage,
  sendMediaMessage,
  sendTemplateMessage,
  sendReactionMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  uploadResumableMedia,
} from '../whatsapp/meta-api';

import { supabaseAdmin } from '../flows/admin-client';
import { decrypt, isLegacyFormat } from '../whatsapp/encryption';

export class CloudAPIProvider implements IMessagingProvider {
  getProviderType(): ProviderType {
    return 'cloud_api';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      templates: true,
      reactions: true,
      readReceipts: true,
      profilePicAccess: false,
      registrationCheck: false,
      interactive: true,
    };
  }

  private async getConfig(accountId: string) {
    const { data: config, error } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (error || !config) {
      throw new Error('WhatsApp not configured for this account.');
    }

    const accessToken = decrypt(config.access_token);
    return {
      phoneNumberId: config.phone_number_id,
      accessToken,
      wabaId: config.waba_id,
    };
  }

  async initializeSession(accountId: string, config: SessionConfig): Promise<SessionInitResult> {
    return { status: 'connected' };
  }

  async getSessionStatus(accountId: string): Promise<SessionStatus> {
    return 'connected'; // Cloud API doesn't have a "session" in the same way WWebJS does
  }

  async destroySession(accountId: string): Promise<void> {
    // No-op for Cloud API
  }

  onSessionEvent(callback: (accountId: string, event: SessionEvent) => void): void {
    // No-op for Cloud API
  }

  async sendText(accountId: string, to: string, body: string, options?: SendOptions): Promise<MessageResult> {
    const config = await this.getConfig(accountId);
    const res = await sendTextMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to,
      text: body,
      contextMessageId: options?.contextMessageId,
    });
    return { messageId: res.messageId };
  }

  async sendMedia(
    accountId: string,
    to: string,
    kind: 'image' | 'video' | 'document' | 'audio',
    media: MediaPayload,
    caption?: string,
    options?: SendOptions
  ): Promise<MessageResult> {
    const config = await this.getConfig(accountId);
    if (!media.link) {
      throw new Error('Cloud API requires media.link (public URL) for sending media.');
    }
    const res = await sendMediaMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to,
      kind,
      link: media.link,
      caption,
      filename: media.filename,
      contextMessageId: options?.contextMessageId,
    });
    return { messageId: res.messageId };
  }

  async sendTemplate(
    accountId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
    options?: SendOptions
  ): Promise<MessageResult> {
    const config = await this.getConfig(accountId);
    
    // We delegate to the existing helper which handles legacy body-only arrays,
    // structured parameters, and full template components properly.
    const res = await sendTemplateMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to,
      templateName,
      language: languageCode,
      template: options?.templateRow,
      messageParams: options?.messageParams,
      params: options?.params,
      contextMessageId: options?.contextMessageId,
    });
    
    return { messageId: res.messageId };
  }

  async sendInteractive(accountId: string, to: string, payload: any, options?: SendOptions): Promise<MessageResult> {
    const config = await this.getConfig(accountId);
    if (payload.kind === 'buttons') {
      const res = await sendInteractiveButtons({
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        to,
        bodyText: payload.body,
        headerText: payload.header || undefined,
        footerText: payload.footer || undefined,
        buttons: payload.buttons,
        contextMessageId: options?.contextMessageId,
      });
      return { messageId: res.messageId };
    } else {
      const res = await sendInteractiveList({
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        to,
        bodyText: payload.body,
        buttonLabel: payload.button_label,
        headerText: payload.header || undefined,
        footerText: payload.footer || undefined,
        sections: payload.sections,
        contextMessageId: options?.contextMessageId,
      });
      return { messageId: res.messageId };
    }
  }

  async sendReaction(accountId: string, to: string, messageId: string, emoji: string): Promise<MessageResult> {
    const config = await this.getConfig(accountId);
    const res = await sendReactionMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to,
      targetMessageId: messageId,
      emoji,
    });
    return { messageId: res.messageId };
  }

  async markAsRead(accountId: string, messageId: string): Promise<void> {
    const config = await this.getConfig(accountId);
    const url = `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || `Meta API error: ${response.status}`);
    }
  }

  onInboundMessage(callback: (accountId: string, message: InboundMessage) => void): void {
    // Handled via webhooks in Cloud API
  }

  onMessageStatus(callback: (accountId: string, status: StatusUpdate) => void): void {
    // Handled via webhooks in Cloud API
  }

  async uploadMedia(accountId: string, file: Uint8Array, mimeType: string, filename?: string): Promise<string> {
    const config = await this.getConfig(accountId);
    // Cloud API uses resumable uploads keyed on APP ID, not phone number.
    // For now, this is implemented in meta-api's uploadResumableMedia.
    // Wacrm currently doesn't store appId in whatsapp_config, it uses env META_APP_ID.
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error('META_APP_ID is not configured');

    const res = await uploadResumableMedia({
      appId,
      accessToken: config.accessToken,
      fileName: filename || 'upload',
      mimeType,
      bytes: file,
    });
    return res.handle;
  }

  async getMediaUrl(accountId: string, mediaId: string): Promise<string> {
    const config = await this.getConfig(accountId);
    const url = `https://graph.facebook.com/v21.0/${mediaId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!response.ok) throw new Error(`Failed to get media URL: ${response.status}`);
    const data = await response.json();
    return data.url;
  }

  async downloadMedia(accountId: string, mediaIdOrUrl: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
    const config = await this.getConfig(accountId);
    let url = mediaIdOrUrl;
    if (!url.startsWith('http')) {
      url = await this.getMediaUrl(accountId, mediaIdOrUrl);
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!response.ok) throw new Error(`Failed to download media: ${response.status}`);
    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    return { buffer: new Uint8Array(buffer), mimeType };
  }

  async getTemplates(accountId: string): Promise<any[]> {
    const config = await this.getConfig(accountId);
    const url = `https://graph.facebook.com/v21.0/${config.wabaId}/message_templates`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch templates: ${response.status}`);
    const data = await response.json();
    return data.data || [];
  }

  async createTemplate(accountId: string, template: any): Promise<any> {
    throw new Error('Not implemented here; handled by existing meta-api flow');
  }

  async deleteTemplate(accountId: string, templateName: string, metaTemplateId?: string): Promise<void> {
    throw new Error('Not implemented here; handled by existing meta-api flow');
  }

  async syncTemplates(accountId: string): Promise<any[]> {
    throw new Error('Not implemented here; handled by existing meta-api flow');
  }

  async isRegistered(accountId: string, phone: string): Promise<boolean> {
    return true; // Always true for Cloud API
  }

  async getProfilePic(accountId: string, phone: string): Promise<string | null> {
    return null; // Not supported by Cloud API
  }
}
