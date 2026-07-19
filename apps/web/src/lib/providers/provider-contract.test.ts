import { describe, it, expect, vi } from 'vitest';
import { CloudAPIProvider } from './cloud-api-provider';
// To import WWebJSProvider, we would need to mock whatsapp-web.js as it uses Puppeteer which fails in unit tests
// For now, we mock the module to verify contract without launching browsers.
import { WWebJSProvider } from '../../../../worker/src/providers/wwebjs-provider';
import type { IMessagingProvider } from '@wacrm/shared';

vi.mock('whatsapp-web.js', () => ({
  Client: class {
    on() {}
    initialize() {}
    getState() { return 'CONNECTED'; }
    destroy() {}
    sendMessage() { return { id: { _serialized: 'mock-id' } }; }
    isRegisteredUser() { return true; }
    getProfilePicUrl() { return 'http://mock.url'; }
  },
  LocalAuth: class {},
  MessageMedia: {
    fromUrl: vi.fn(),
  },
}));

describe('Provider Contract Parity', () => {
  it('CloudAPIProvider implements IMessagingProvider', () => {
    const provider: IMessagingProvider = new CloudAPIProvider();
    expect(provider.getProviderType()).toBe('meta');
  });

  it('WWebJSProvider implements IMessagingProvider', () => {
    const provider: IMessagingProvider = new WWebJSProvider();
    expect(provider.getProviderType()).toBe('wwebjs');
  });

  describe('Method behavior equivalence', () => {
    const metaProvider = new CloudAPIProvider();
    const wwebjsProvider = new WWebJSProvider();
    const accountId = 'acc-123';
    const phone = '14155550123';

    it('Both handle sendTemplate', async () => {
      // Cloud API should try to send (will throw because fetch fails in test, or we mock it)
      // WWebJS should either shim it or throw "Not supported"
      // The contract specifies they should have the same interface.
      
      const metaPromise = metaProvider.sendTemplate(accountId, phone, 'hello', 'en_US');
      const wwebjsPromise = wwebjsProvider.sendTemplate(accountId, phone, 'hello', 'en_US');
      
      // We expect them both to be Promises
      expect(metaPromise).toBeInstanceOf(Promise);
      expect(wwebjsPromise).toBeInstanceOf(Promise);

      // Verify they don't diverge in method signature
      await expect(wwebjsPromise).rejects.toThrow(/not supported/i); // We expect this to fail currently per Phase 1 audit
    });

    it('Both return identical capability shape', () => {
      const metaCap = metaProvider.getCapabilities();
      const wwebjsCap = wwebjsProvider.getCapabilities();
      
      expect(metaCap).toHaveProperty('templates');
      expect(wwebjsCap).toHaveProperty('templates');
      
      expect(metaCap.templates).toBe(true);
      expect(wwebjsCap.templates).toBe(false); // Valid difference, but shape matches
    });
  });
});
