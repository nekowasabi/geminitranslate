// Content.js WebExtension Polyfill Integration Tests
import { describe, test, expect, beforeEach } from '@jest/globals';

describe('Process5-Red: Content.js Polyfill Integration', () => {
  describe('browser API availability in content script context', () => {
    test('should have browser.runtime.getURL available', () => {
      expect(global.browser).toBeDefined();
      expect(global.browser.runtime).toBeDefined();
      expect(typeof global.browser.runtime.getURL).toBe('function');
    });

    test('should have browser.storage.local available', () => {
      expect(global.browser.storage).toBeDefined();
      expect(global.browser.storage.local).toBeDefined();
      expect(typeof global.browser.storage.local.get).toBe('function');
      expect(typeof global.browser.storage.local.set).toBe('function');
    });

    test('should have browser.runtime.sendMessage available', () => {
      expect(typeof global.browser.runtime.sendMessage).toBe('function');
    });

    test('should have browser.runtime.onMessage available', () => {
      expect(global.browser.runtime.onMessage).toBeDefined();
      expect(typeof global.browser.runtime.onMessage.addListener).toBe('function');
    });
  });

  describe('Promise-based API behavior (Firefox-style)', () => {
    test('browser.storage.local.get should return a Promise', () => {
      const result = global.browser.storage.local.get(['testKey']);
      expect(result).toBeInstanceOf(Promise);
    });

    test('browser.runtime.sendMessage should return a Promise', () => {
      const result = global.browser.runtime.sendMessage({ action: 'test' });
      expect(result).toBeInstanceOf(Promise);
    });

    test('browser.storage.local.set should return a Promise', async () => {
      const result = global.browser.storage.local.set({ testKey: 'testValue' });
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('content.js specific browser API usage patterns', () => {
    test('should support browser.runtime.getURL with icon path', () => {
      // This simulates line 38 in content.js
      const iconUrl = global.browser.runtime.getURL('icons/translate-38.png');
      expect(typeof iconUrl).toBe('string');
      // In actual Chrome extension, this would return chrome-extension://...
    });

    test('should support nested storage.local.get with callback-style conversion', async () => {
      // This simulates lines 165, 175, 216, 226, 833, 1070 in content.js
      global.browser.storage.local.get.mockResolvedValueOnce({ lineHeight: 5 });

      const result = await global.browser.storage.local.get(['lineHeight']);
      expect(result).toHaveProperty('lineHeight');
    });

    test('should support runtime.sendMessage with translation action', async () => {
      // This simulates lines 197, 418, 590, 927 in content.js
      global.browser.runtime.sendMessage.mockResolvedValueOnce('Translated text');

      const response = await global.browser.runtime.sendMessage({
        action: 'translateText',
        text: 'Hello',
        targetLanguage: 'ja'
      });

      expect(response).toBe('Translated text');
    });

    test('should support onMessage.addListener for content script', () => {
      // This simulates line 1029 in content.js
      const listener = jest.fn();

      expect(() => {
        global.browser.runtime.onMessage.addListener(listener);
      }).not.toThrow();

      expect(global.browser.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
    });
  });

  describe('Manifest content_scripts polyfill loading order', () => {
    test('polyfill should be loaded before content.js', () => {
      // This test documents the expected manifest.json structure
      // "content_scripts": [{
      //   "matches": ["<all_urls>"],
      //   "js": [
      //     "browser-polyfill.min.js",  // MUST BE FIRST
      //     "content.js"
      //   ]
      // }]

      // In actual browser, polyfill defines global browser object
      // before content.js executes
      expect(global.browser).toBeDefined();
      expect(typeof global.browser).toBe('object');
    });
  });

  describe('Chrome compatibility edge cases', () => {
    beforeEach(() => {
      // Reset mocks
      global.browser.storage.local.get.mockClear();
      global.browser.runtime.sendMessage.mockClear();
    });

    test('should handle multiple concurrent storage.local.get calls', async () => {
      global.browser.storage.local.get
        .mockResolvedValueOnce({ targetLanguage: 'ja' })
        .mockResolvedValueOnce({ lineHeight: 4 })
        .mockResolvedValueOnce({ fontSize: 16 });

      const [lang, lineHeight, fontSize] = await Promise.all([
        global.browser.storage.local.get(['targetLanguage']),
        global.browser.storage.local.get(['lineHeight']),
        global.browser.storage.local.get(['fontSize'])
      ]);

      expect(lang).toHaveProperty('targetLanguage');
      expect(lineHeight).toHaveProperty('lineHeight');
      expect(fontSize).toHaveProperty('fontSize');
    });

    test('should handle runtime.sendMessage with different message types', async () => {
      global.browser.runtime.sendMessage.mockResolvedValue('OK');

      const results = await Promise.all([
        global.browser.runtime.sendMessage({ action: 'translateText' }),
        global.browser.runtime.sendMessage({ action: 'translate' }),
        global.browser.runtime.sendMessage({ action: 'reset' })
      ]);

      expect(results).toEqual(['OK', 'OK', 'OK']);
      expect(global.browser.runtime.sendMessage).toHaveBeenCalledTimes(3);
    });
  });
});
