/**
 * ClipboardHandler Unit Tests
 */

// Mock logger
jest.mock('@shared/utils', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock MessageBus
const mockSend = jest.fn();
jest.mock('@shared/messages/MessageBus', () => {
  return {
    MessageBus: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

import { ClipboardHandler } from '@content/clipboardHandler';
import { MessageType } from '@shared/messages/types';

describe('ClipboardHandler', () => {
  let clipboardHandler: ClipboardHandler;

  beforeEach(() => {
    clipboardHandler = new ClipboardHandler();
    jest.clearAllMocks();
  });

  describe('read', () => {
    it('should read text from clipboard', async () => {
      const mockClipboardText = 'Clipboard content';

      // Mock navigator.clipboard.readText
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue(mockClipboardText),
        },
      });

      const result = await clipboardHandler.read();

      expect(result).toBe(mockClipboardText);
      expect(navigator.clipboard.readText).toHaveBeenCalled();
    });

    it('should return null when clipboard is empty', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue(''),
        },
      });

      const result = await clipboardHandler.read();

      expect(result).toBeNull();
    });

    it('should return null when clipboard read fails', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const result = await clipboardHandler.read();

      expect(result).toBeNull();
    });

    it('should handle permission errors gracefully', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
        },
      });

      const result = await clipboardHandler.read();

      expect(result).toBeNull();
    });

    it('should trim whitespace from clipboard text', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue('  Trimmed text  '),
        },
      });

      const result = await clipboardHandler.read();

      expect(result).toBe('Trimmed text');
    });
  });

  describe('translateClipboard', () => {
    it('should translate clipboard content', async () => {
      const mockClipboardText = 'Hello World';
      const mockTranslation = 'こんにちは世界';

      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue(mockClipboardText),
        },
      });

      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: [mockTranslation],
          targetLanguage: 'ja',
        },
      });

      const result = await clipboardHandler.translateClipboard('ja');

      expect(navigator.clipboard.readText).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: [mockClipboardText],
          targetLanguage: 'ja',
        },
      });
      expect(result).toBe(mockTranslation);
    });

    it('should return null when clipboard is empty', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue(''),
        },
      });

      const result = await clipboardHandler.translateClipboard('ja');

      expect(result).toBeNull();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should return null when clipboard read fails', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const result = await clipboardHandler.translateClipboard('ja');

      expect(result).toBeNull();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle translation errors gracefully', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue('Test text'),
        },
      });

      mockSend.mockRejectedValue(new Error('Translation failed'));

      const result = await clipboardHandler.translateClipboard('ja');

      expect(result).toBeNull();
    });

    it('should handle empty translation response', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue('Test text'),
        },
      });

      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: [],
          targetLanguage: 'ja',
        },
      });

      const result = await clipboardHandler.translateClipboard('ja');

      expect(result).toBeNull();
    });

    it('should handle special characters in clipboard', async () => {
      const specialText = '特殊文字 & <HTML> "quotes"';

      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue(specialText),
        },
      });

      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: ['Special characters & <HTML> "quotes"'],
          targetLanguage: 'en',
        },
      });

      const result = await clipboardHandler.translateClipboard('en');

      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: [specialText],
          targetLanguage: 'en',
        },
      });
      expect(result).toBe('Special characters & <HTML> "quotes"');
    });
  });

  describe('edge cases', () => {
    it('should handle long clipboard content', async () => {
      const longText = 'A'.repeat(10000);

      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue(longText),
        },
      });

      const result = await clipboardHandler.read();

      expect(result).toBe(longText);
    });

    it('should handle undefined clipboard API', async () => {
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const result = await clipboardHandler.read();

      expect(result).toBeNull();

      // Restore
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    });

    it('should handle multiple clipboard reads', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest
            .fn()
            .mockResolvedValueOnce('First read')
            .mockResolvedValueOnce('Second read')
            .mockResolvedValueOnce('Third read'),
        },
      });

      const result1 = await clipboardHandler.read();
      const result2 = await clipboardHandler.read();
      const result3 = await clipboardHandler.read();

      expect(result1).toBe('First read');
      expect(result2).toBe('Second read');
      expect(result3).toBe('Third read');
    });
  });
});
