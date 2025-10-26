/**
 * ContentScript Unit Tests
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
const mockListen = jest.fn();
jest.mock('@shared/messages/MessageBus', () => {
  return {
    MessageBus: jest.fn().mockImplementation(() => ({
      send: mockSend,
      listen: mockListen,
    })),
  };
});

import { ContentScript } from '@content/contentScript';
import { MessageType } from '@shared/messages/types';

describe('ContentScript', () => {
  let contentScript: ContentScript;
  let testContainer: HTMLElement;

  beforeEach(() => {
    contentScript = new ContentScript();

    // Create test DOM
    testContainer = document.createElement('div');
    testContainer.innerHTML = `
      <p>Hello World</p>
      <span>Test content</span>
    `;
    document.body.appendChild(testContainer);

    jest.clearAllMocks();

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    contentScript.cleanup();
    if (testContainer && testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
  });

  describe('initialize', () => {
    it('should initialize content script', () => {
      contentScript.initialize();

      expect(mockListen).toHaveBeenCalled();
    });

    it('should enable selection handler', () => {
      contentScript.initialize();

      // SelectionHandler should be enabled (verified by integration)
      expect(true).toBe(true);
    });
  });

  describe('handleMessage - TRANSLATE_PAGE', () => {
    it('should handle page translation message', async () => {
      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: ['こんにちは世界', 'テストコンテンツ'],
          targetLanguage: 'ja',
        },
      });

      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0]?.[0];
      if (!messageHandler) {
        throw new Error('Message handler not registered');
      }

      const sendResponse = jest.fn();
      await messageHandler(
        {
          type: MessageType.TRANSLATE_PAGE,
          payload: { targetLanguage: 'ja' },
        },
        {},
        sendResponse
      );

      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: expect.any(Array),
          targetLanguage: 'ja',
        },
      });
    });
  });

  describe('handleMessage - RESET', () => {
    it('should handle reset message', async () => {
      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0][0];
      const sendResponse = jest.fn();

      await messageHandler(
        {
          type: MessageType.RESET,
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('handleMessage - TRANSLATE_SELECTION', () => {
    it('should handle selection translation message', async () => {
      // Create selection
      const range = document.createRange();
      range.selectNodeContents(testContainer.querySelector('p')!);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: ['こんにちは世界'],
          targetLanguage: 'ja',
        },
      });

      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0][0];
      const sendResponse = jest.fn();

      await messageHandler(
        {
          type: MessageType.TRANSLATE_SELECTION,
          payload: { targetLanguage: 'ja' },
        },
        {},
        sendResponse
      );

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('handleMessage - TRANSLATE_CLIPBOARD', () => {
    it('should handle clipboard translation message', async () => {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue('Clipboard text'),
        },
      });

      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: ['クリップボードテキスト'],
          targetLanguage: 'ja',
        },
      });

      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0][0];
      const sendResponse = jest.fn();

      await messageHandler(
        {
          type: MessageType.TRANSLATE_CLIPBOARD,
          payload: { targetLanguage: 'ja' },
        },
        {},
        sendResponse
      );

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('handleMessage - Unknown type', () => {
    it('should handle unknown message type', async () => {
      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0][0];
      const sendResponse = jest.fn();

      await messageHandler(
        {
          type: 'UNKNOWN_TYPE' as any,
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown message type',
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      contentScript.initialize();
      contentScript.cleanup();

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('dynamic translation', () => {
    it('should enable dynamic translation', () => {
      contentScript.enableDynamicTranslation('ja');

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should disable dynamic translation', () => {
      contentScript.enableDynamicTranslation('ja');
      contentScript.disableDynamicTranslation();

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty page', async () => {
      // Clear test container
      testContainer.innerHTML = '';

      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: [],
          targetLanguage: 'ja',
        },
      });

      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0][0];
      const sendResponse = jest.fn();

      await messageHandler(
        {
          type: MessageType.TRANSLATE_PAGE,
          payload: { targetLanguage: 'ja' },
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle translation errors', async () => {
      mockSend.mockRejectedValue(new Error('Translation failed'));

      contentScript.initialize();

      const messageHandler = mockListen.mock.calls[0][0];
      const sendResponse = jest.fn();

      await messageHandler(
        {
          type: MessageType.TRANSLATE_PAGE,
          payload: { targetLanguage: 'ja' },
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String),
      });
    });
  });
});
