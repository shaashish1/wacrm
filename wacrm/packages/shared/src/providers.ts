export type ProviderType = 'wwebjs' | 'cloud_api';

export interface ProviderCapabilities {
  templates: boolean;
  reactions: boolean;
  readReceipts: boolean;
  profilePicAccess: boolean;
  registrationCheck: boolean;
  interactive: boolean;
}

export type SessionStatus =
  | 'connected'
  | 'disconnected'
  | 'qr_pending'
  | 'banned'
  | 'rate_limited'
  | 'not_configured';

export type SessionEvent =
  | { type: 'auth_failure'; message?: string }
  | { type: 'disconnected'; reason?: string }
  | { type: 'ready' }
  | { type: 'qr_refresh'; qrData: string };

export interface SessionConfig {
  phoneNumber?: string;
  antibanPreset?: 'conservative' | 'moderate' | 'aggressive' | 'high-volume';
  // Specific config keys can be passed here
  [key: string]: any;
}

export interface SessionInitResult {
  status: SessionStatus;
  qrStreamUrl?: string; // WebSocket URL for QR streaming (wwebjs)
  webhookUrl?: string; // For Cloud API verification
}

export interface MessageResult {
  messageId: string;
}

export interface MediaPayload {
  link?: string;
  bytes?: Uint8Array;
  mimeType?: string;
  filename?: string;
}

export interface TemplateComponent {
  type: string;
  parameters: any[];
}

export interface SendOptions {
  contextMessageId?: string; // For replies
  templateRow?: any;
  messageParams?: any;
  params?: string[];
}

export interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: string;
  mediaUrl?: string;
  pushName?: string;
  timestamp: number;
}

export interface StatusUpdate {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipientId: string;
  timestamp: number;
  error?: any;
}

export interface IMessagingProvider {
  // Provider Metadata
  getProviderType(): ProviderType;
  getCapabilities(): ProviderCapabilities;

  // Session Lifecycle
  initializeSession(accountId: string, config: SessionConfig): Promise<SessionInitResult>;
  getSessionStatus(accountId: string): Promise<SessionStatus>;
  destroySession(accountId: string): Promise<void>;
  onSessionEvent(callback: (accountId: string, event: SessionEvent) => void): void;

  // Messaging
  sendText(accountId: string, to: string, body: string, options?: SendOptions): Promise<MessageResult>;
  sendMedia(
    accountId: string,
    to: string,
    kind: 'image' | 'video' | 'document' | 'audio',
    media: MediaPayload,
    caption?: string,
    options?: SendOptions
  ): Promise<MessageResult>;
  sendTemplate(
    accountId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
    options?: SendOptions
  ): Promise<MessageResult>;
  sendReaction(accountId: string, to: string, messageId: string, emoji: string): Promise<MessageResult>;
  sendInteractive(accountId: string, to: string, payload: any, options?: SendOptions): Promise<MessageResult>;
  markAsRead(accountId: string, messageId: string): Promise<void>;
  
  onInboundMessage(callback: (accountId: string, message: InboundMessage) => void): void;
  onMessageStatus(callback: (accountId: string, status: StatusUpdate) => void): void;

  // Media
  uploadMedia(accountId: string, file: Uint8Array, mimeType: string, filename?: string): Promise<string>;
  getMediaUrl(accountId: string, mediaId: string): Promise<string>;
  downloadMedia(accountId: string, mediaIdOrUrl: string): Promise<{ buffer: Uint8Array; mimeType: string }>;

  // Templates
  getTemplates(accountId: string): Promise<any[]>;
  createTemplate(accountId: string, template: any): Promise<any>;
  deleteTemplate(accountId: string, templateName: string, metaTemplateId?: string): Promise<void>;
  syncTemplates(accountId: string): Promise<any[]>;

  // Contacts
  isRegistered(accountId: string, phone: string): Promise<boolean>;
  getProfilePic(accountId: string, phone: string): Promise<string | null>;
}
