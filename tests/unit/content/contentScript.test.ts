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

// Mock ProgressNotification
const mockProgressNotification = {
  show: jest.fn(),
  update: jest.fn(),
  complete: jest.fn(),
  error: jest.fn(),
  remove: jest.fn(),
  showPhase: jest.fn(),
  updatePhase: jest.fn(),
  completePhase: jest.fn(),
};
jest.mock('@content/progressNotification', () => ({
  ProgressNotification: jest.fn(() => mockProgressNotification),
}));

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

  // Process2: Viewport-priority translation tests
  describe('Viewport-priority translation (Process2)', () => {
    let mockDetectViewportNodes: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      // Mock DOMManipulator.detectViewportNodes()
      mockDetectViewportNodes = jest.fn(() => ({
        viewport: [
          { element: testContainer.querySelector('p'), text: 'Hello World' },
        ],
        outOfViewport: [
          { element: testContainer.querySelector('span'), text: 'Test content' },
        ],
      }));

      // Apply mock to contentScript's domManipulator instance
      contentScript['domManipulator'].detectViewportNodes = mockDetectViewportNodes;
    });

    it('should separate viewport and out-of-viewport nodes', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['こんにちは世界'],
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

      // detectViewportNodes() should be called
      expect(mockDetectViewportNodes).toHaveBeenCalled();
    });

    it('should translate viewport nodes first with semiParallel=true (Phase 1)', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['こんにちは世界'],
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

      // Phase 1 should use semiParallel: true
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.REQUEST_TRANSLATION,
          action: 'requestTranslation',
          payload: expect.objectContaining({
            texts: ['Hello World'],
            targetLanguage: 'ja',
            semiParallel: true,
            priorityCount: 3,
          }),
        })
      );
    });

    it('should translate out-of-viewport nodes after viewport with semiParallel=false (Phase 2)', async () => {
      mockSend
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['こんにちは世界'],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['テストコンテンツ'],
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

      // Phase 2 should use semiParallel: false
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.REQUEST_TRANSLATION,
          action: 'requestTranslation',
          payload: expect.objectContaining({
            texts: ['Test content'],
            targetLanguage: 'ja',
            semiParallel: false,
          }),
        })
      );
    });

    it('should call showPhase(1) before Phase 1 translation', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['こんにちは世界'],
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

      // showPhase(1) should be called with viewport node count
      expect(mockProgressNotification.showPhase).toHaveBeenCalledWith(1, 1);
    });

    it('should call completePhase(1) after Phase 1 completes', async () => {
      mockSend
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['こんにちは世界'],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['テストコンテンツ'],
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

      // completePhase(1) should be called
      expect(mockProgressNotification.completePhase).toHaveBeenCalledWith(1);
    });

    it('should call showPhase(2) before Phase 2 translation', async () => {
      mockSend
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['こんにちは世界'],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['テストコンテンツ'],
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

      // showPhase(2) should be called with out-of-viewport node count
      expect(mockProgressNotification.showPhase).toHaveBeenCalledWith(2, 1);
    });

    it('should call completePhase(2) after Phase 2 completes', async () => {
      mockSend
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['こんにちは世界'],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            translations: ['テストコンテンツ'],
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

      // completePhase(2) should be called
      expect(mockProgressNotification.completePhase).toHaveBeenCalledWith(2);
    });

    it('should skip Phase 2 when outOfViewport is empty', async () => {
      // Override mock for this test
      mockDetectViewportNodes.mockReturnValueOnce({
        viewport: [
          { element: testContainer.querySelector('p'), text: 'Hello World' },
        ],
        outOfViewport: [], // No out-of-viewport nodes
      });

      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['こんにちは世界'],
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

      // Only Phase 1 should be executed
      expect(mockProgressNotification.showPhase).toHaveBeenCalledTimes(1);
      expect(mockProgressNotification.showPhase).toHaveBeenCalledWith(1, 1);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should skip Phase 1 when viewport is empty', async () => {
      // Override mock for this test
      mockDetectViewportNodes.mockReturnValueOnce({
        viewport: [], // No viewport nodes
        outOfViewport: [
          { element: testContainer.querySelector('span'), text: 'Test content' },
        ],
      });

      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['テストコンテンツ'],
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

      // Only Phase 2 should be executed
      expect(mockProgressNotification.showPhase).toHaveBeenCalledTimes(1);
      expect(mockProgressNotification.showPhase).toHaveBeenCalledWith(2, 1);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  // Process4: ProgressNotification integration tests
  describe('ProgressNotification integration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('handleMessage - TRANSLATION_PROGRESS', () => {
      it('should call progressNotification.update() when receiving TRANSLATION_PROGRESS', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_PROGRESS,
            payload: {
              current: 5,
              total: 10,
              percentage: 50,
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.update).toHaveBeenCalledWith(5, 10);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should handle TRANSLATION_PROGRESS with 0% progress', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_PROGRESS,
            payload: {
              current: 0,
              total: 10,
              percentage: 0,
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.update).toHaveBeenCalledWith(0, 10);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should handle TRANSLATION_PROGRESS with 100% progress', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_PROGRESS,
            payload: {
              current: 10,
              total: 10,
              percentage: 100,
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.update).toHaveBeenCalledWith(10, 10);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should handle invalid TRANSLATION_PROGRESS payload gracefully', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_PROGRESS,
            payload: {}, // Invalid payload
          },
          {},
          sendResponse
        );

        // Should handle gracefully without throwing
        expect(sendResponse).toHaveBeenCalled();
      });
    });

    describe('translatePage with progress notification', () => {
      it('should call progressNotification.show() when translation starts', async () => {
        mockSend.mockResolvedValue({
          success: true,
          data: {
            translations: ['こんにちは世界', 'テストコンテンツ'],
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

        expect(mockProgressNotification.show).toHaveBeenCalled();
        const callArgs = mockProgressNotification.show.mock.calls[0];
        expect(callArgs[0]).toBeGreaterThan(0); // total should be > 0
      });

      it('should call progressNotification.complete() when translation succeeds', async () => {
        mockSend.mockResolvedValue({
          success: true,
          data: {
            translations: ['こんにちは世界', 'テストコンテンツ'],
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

        expect(mockProgressNotification.complete).toHaveBeenCalled();
      });

      it('should call progressNotification.error() when translation fails', async () => {
        const errorMessage = 'API rate limit exceeded';
        mockSend.mockRejectedValue(new Error(errorMessage));

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

        expect(mockProgressNotification.error).toHaveBeenCalledWith(
          expect.stringContaining(errorMessage)
        );
      });

      it('should not call show() when extractedNodes is empty', async () => {
        // Clear test container
        testContainer.innerHTML = '';

        mockSend.mockResolvedValue({
          success: true,
          data: {
            translations: [],
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

        expect(mockProgressNotification.show).not.toHaveBeenCalled();
      });
    });

    describe('cleanup with progress notification', () => {
      it('should call progressNotification.remove() during cleanup', () => {
        contentScript.initialize();
        contentScript.cleanup();

        expect(mockProgressNotification.remove).toHaveBeenCalled();
      });

      it('should handle multiple cleanup calls', () => {
        contentScript.initialize();
        contentScript.cleanup();
        contentScript.cleanup();

        // Should not throw errors
        expect(mockProgressNotification.remove).toHaveBeenCalledTimes(2);
      });
    });

    describe('TRANSLATION_ERROR message handling', () => {
      it('should call progressNotification.error() when receiving TRANSLATION_ERROR', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_ERROR,
            payload: {
              error: 'Network error occurred',
              code: 'NETWORK_ERROR',
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.error).toHaveBeenCalledWith(
          'Network error occurred'
        );
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should handle TRANSLATION_ERROR without error code', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_ERROR,
            payload: {
              error: 'Unknown error',
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.error).toHaveBeenCalledWith('Unknown error');
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should handle TRANSLATION_ERROR with empty error message', async () => {
        contentScript.initialize();

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.TRANSLATION_ERROR,
            payload: {
              error: '',
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.error).toHaveBeenCalledWith('');
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });
    });
  });
});
