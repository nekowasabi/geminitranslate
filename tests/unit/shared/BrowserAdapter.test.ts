import { describe, it, expect, beforeEach } from '@jest/globals';
import BrowserAdapter from '@shared/adapters/BrowserAdapter';

describe('BrowserAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Browser Detection', () => {
    it('should detect Chrome environment', () => {
      expect(BrowserAdapter.isChrome).toBe(true);
    });

    it('should detect manifest version', () => {
      expect(BrowserAdapter.manifestVersion).toBe(3);
    });
  });

  describe('Storage API', () => {
    it('should get data from storage', async () => {
      const mockData = { apiKey: 'test-key', targetLanguage: 'ja' };
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await BrowserAdapter.storage.get(['apiKey', 'targetLanguage']);

      expect(result).toEqual(mockData);
    });

    it('should set data to storage', async () => {
      const testData = { apiKey: 'new-key' };
      (global.chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await BrowserAdapter.storage.set(testData);

      expect(chrome.storage.local.set).toHaveBeenCalled();
      expect((chrome.storage.local.set as jest.Mock).mock.calls[0][0]).toEqual(testData);
    });

    it('should remove data from storage', async () => {
      const keysToRemove = ['apiKey'];
      (global.chrome.storage.local.remove as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await BrowserAdapter.storage.remove(keysToRemove);

      expect(chrome.storage.local.remove).toHaveBeenCalled();
      expect((chrome.storage.local.remove as jest.Mock).mock.calls[0][0]).toEqual(keysToRemove);
    });
  });

  describe('Runtime API', () => {
    it('should send message', async () => {
      const testMessage = { action: 'test' };
      const mockResponse = { status: 'ok' };
      (global.chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        if (callback) {
          callback(mockResponse);
        }
        return Promise.resolve(mockResponse);
      });

      const result = await BrowserAdapter.runtime.sendMessage(testMessage);

      expect(result).toEqual(mockResponse);
    });

    it('should get manifest', () => {
      const manifest = BrowserAdapter.runtime.getManifest();

      expect(manifest).toBeDefined();
      expect(manifest.version).toBe('3.0.0');
    });
  });

  describe('Tabs API', () => {
    it('should query tabs', async () => {
      const mockTabs = [{ id: 1, url: 'https://example.com' }];
      (global.chrome.tabs.query as jest.Mock).mockImplementation((queryInfo, callback) => {
        if (callback) {
          callback(mockTabs);
        }
        return Promise.resolve(mockTabs);
      });

      const result = await BrowserAdapter.tabs.query({ active: true });

      expect(result).toEqual(mockTabs);
    });

    it('should send message to tab', async () => {
      const tabId = 1;
      const message = { action: 'test' };
      (global.chrome.tabs.sendMessage as jest.Mock).mockResolvedValue({ status: 'ok' });

      await BrowserAdapter.tabs.sendMessage(tabId, message);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(tabId, message);
    });
  });
});
