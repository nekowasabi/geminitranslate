import { describe, it, expect, beforeEach } from '@jest/globals';
import StorageManager from '@shared/storage/StorageManager';
import { DEFAULT_STORAGE, StorageData } from '@shared/types';

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    jest.clearAllMocks();
    storageManager = new StorageManager();
  });

  describe('get', () => {
    it('should get data with default values merged', async () => {
      const mockData = { targetLanguage: 'ja' };
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await storageManager.get(['targetLanguage', 'fontSize']);

      expect(result.targetLanguage).toBe('ja');
      expect(result.fontSize).toBe(DEFAULT_STORAGE.fontSize); // デフォルト値
    });

    it('should get all data when no keys specified', async () => {
      const mockData = { openRouterApiKey: 'test-key', targetLanguage: 'en' };
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await storageManager.get();

      expect(result.openRouterApiKey).toBe('test-key');
      expect(result.targetLanguage).toBe('en');
    });

    it('should migrate lineHeight from 4 to 1.5 when value is greater than 2.0', async () => {
      const mockData = { lineHeight: 4 };
      let savedData: any = null;

      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      (global.chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        savedData = data;
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      const result = await storageManager.get();

      expect(result.lineHeight).toBe(1.5);
      expect(savedData).toEqual({ lineHeight: 1.5 });
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('should not migrate lineHeight when value is within valid range (1.0-2.0)', async () => {
      const mockData = { lineHeight: 1.8 };

      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await storageManager.get();

      expect(result.lineHeight).toBe(1.8);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle lineHeight migration when lineHeight is exactly 2.0', async () => {
      const mockData = { lineHeight: 2.0 };

      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await storageManager.get();

      expect(result.lineHeight).toBe(2.0);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should save data to storage', async () => {
      const testData = { openRouterApiKey: 'new-key', targetLanguage: 'fr' };
      (global.chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await storageManager.set(testData);

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const calledWith = (chrome.storage.local.set as jest.Mock).mock.calls[0][0];
      expect(calledWith).toMatchObject(testData);
    });

    it('should save partial data', async () => {
      const partialData = { fontSize: 18 };
      (global.chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await storageManager.set(partialData);

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove data from storage', async () => {
      const keysToRemove: (keyof StorageData)[] = ['openRouterApiKey'];
      (global.chrome.storage.local.remove as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await storageManager.remove(keysToRemove);

      expect(chrome.storage.local.remove).toHaveBeenCalled();
      const calledWith = (chrome.storage.local.remove as jest.Mock).mock.calls[0][0];
      expect(calledWith).toEqual(keysToRemove);
    });
  });

  describe('clear', () => {
    it('should clear all storage', async () => {
      (global.chrome.storage.local.clear as jest.Mock) = jest.fn((callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await storageManager.clear();

      expect(chrome.storage.local.clear).toHaveBeenCalled();
    });
  });

  describe('getApiKey', () => {
    it('should get API key', async () => {
      const mockData = { openRouterApiKey: 'test-api-key' };
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const apiKey = await storageManager.getApiKey();

      expect(apiKey).toBe('test-api-key');
    });

    it('should return null when API key not set', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback({});
        }
        return Promise.resolve({});
      });

      const apiKey = await storageManager.getApiKey();

      expect(apiKey).toBeNull();
    });
  });

  describe('setApiKey', () => {
    it('should set API key', async () => {
      const newKey = 'new-api-key';
      (global.chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      });

      await storageManager.setApiKey(newKey);

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const calledWith = (chrome.storage.local.set as jest.Mock).mock.calls[0][0];
      expect(calledWith.openRouterApiKey).toBe(newKey);
    });
  });
});
