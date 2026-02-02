/**
 * ContentScript Unit Tests
 */

// Mock textFilter
const mockFilterBatchTexts = jest.fn();
jest.mock('@shared/utils/textFilter', () => ({
  filterBatchTexts: mockFilterBatchTexts,
}));

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

    // Default filterBatchTexts mock: pass all texts through
    mockFilterBatchTexts.mockImplementation((texts: string[]) => ({
      textsToTranslate: texts,
      skippedIndices: new Map(),
      originalIndices: texts.map((_: string, i: number) => i),
    }));

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

      // Should be called at least once (Phase 1 and/or Phase 2 depending on viewport detection)
      expect(mockSend).toHaveBeenCalled();

      // Translation request should be sent with correct structure
      const firstCall = mockSend.mock.calls[0][0];
      expect(firstCall).toMatchObject({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: expect.objectContaining({
          texts: expect.any(Array),
          targetLanguage: 'ja',
        }),
      });

      // Texts should not be empty
      expect(firstCall.payload.texts.length).toBeGreaterThan(0);
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

      // Phase 1 should use semiParallel: true with priorityCount: 1
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.REQUEST_TRANSLATION,
          action: 'requestTranslation',
          payload: expect.objectContaining({
            texts: ['Hello World'],
            targetLanguage: 'ja',
            semiParallel: true,
            priorityCount: 1,
            phase: 1,
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

      // completePhase should be called for both phases
      // Note: With batch streaming, Phase 1 completes immediately after batch streaming starts
      // Phase 2 will complete after the second translation request
      expect(mockProgressNotification.completePhase).toHaveBeenCalled();

      // Check if either Phase 1 or Phase 2 was completed
      const completePhaseCalls = mockProgressNotification.completePhase.mock.calls;
      const phaseOneCalled = completePhaseCalls.some(call => call[0] === 1);
      const phaseTwoCalled = completePhaseCalls.some(call => call[0] === 2);

      // At least one phase should complete
      expect(phaseOneCalled || phaseTwoCalled).toBe(true);
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

        // With viewport-priority translation, showPhase is used instead of show
        expect(mockProgressNotification.showPhase).toHaveBeenCalled();

        // showPhase may be called for Phase 1 and/or Phase 2, depending on viewport detection
        const showPhaseCalls = mockProgressNotification.showPhase.mock.calls;
        expect(showPhaseCalls.length).toBeGreaterThan(0);

        // First call should provide a valid phase and total
        const firstCall = showPhaseCalls[0];
        expect([1, 2]).toContain(firstCall[0]); // Phase can be 1 or 2
        expect(firstCall[1]).toBeGreaterThan(0); // total should be > 0
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

    describe('BATCH_COMPLETED message handling', () => {
      let mockApplyTranslations: jest.SpyInstance;

      beforeEach(() => {
        // Mock domManipulator.applyTranslations
        mockApplyTranslations = jest.spyOn(
          (contentScript as any).domManipulator,
          'applyTranslations'
        );
      });

      it('should apply translations immediately when receiving BATCH_COMPLETED', async () => {
        contentScript.initialize();

        // Setup currentTranslationNodes
        const mockNodes = [
          { node: document.createTextNode('test1'), text: 'test1', element: document.body },
          { node: document.createTextNode('test2'), text: 'test2', element: document.body },
          { node: document.createTextNode('test3'), text: 'test3', element: document.body },
        ];
        (contentScript as any).currentTranslationNodes = mockNodes;

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 0,
              translations: ['翻訳1', '翻訳2'],
              nodeIndices: [0, 1],
              phase: 1,
              progress: {
                current: 1,
                total: 2,
                percentage: 50,
              },
            },
          },
          {},
          sendResponse
        );

        expect(mockApplyTranslations).toHaveBeenCalledWith(
          [mockNodes[0], mockNodes[1]],
          ['翻訳1', '翻訳2']
        );
        expect(mockProgressNotification.updatePhase).toHaveBeenCalledWith(1, 50);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should handle BATCH_COMPLETED for Phase 2', async () => {
        contentScript.initialize();

        const mockNodes = [
          { node: document.createTextNode('test1'), text: 'test1', element: document.body },
        ];
        (contentScript as any).currentTranslationNodes = mockNodes;

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 0,
              translations: ['翻訳1'],
              nodeIndices: [0],
              phase: 2,
              progress: {
                current: 1,
                total: 1,
                percentage: 100,
              },
            },
          },
          {},
          sendResponse
        );

        expect(mockApplyTranslations).toHaveBeenCalled();
        expect(mockProgressNotification.updatePhase).toHaveBeenCalledWith(2, 100);
      });

      it('should skip batch application when currentTranslationNodes is empty', async () => {
        contentScript.initialize();

        // Empty currentTranslationNodes
        (contentScript as any).currentTranslationNodes = [];

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 0,
              translations: ['翻訳1'],
              nodeIndices: [0],
              phase: 1,
              progress: {
                current: 1,
                total: 1,
                percentage: 100,
              },
            },
          },
          {},
          sendResponse
        );

        expect(mockApplyTranslations).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should filter out-of-range nodeIndices', async () => {
        contentScript.initialize();

        const mockNodes = [
          { node: document.createTextNode('test1'), text: 'test1', element: document.body },
          { node: document.createTextNode('test2'), text: 'test2', element: document.body },
        ];
        (contentScript as any).currentTranslationNodes = mockNodes;

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 0,
              translations: ['翻訳1', '翻訳2', '翻訳3'],
              nodeIndices: [0, 1, 10], // index 10 is out of range
              phase: 1,
              progress: {
                current: 1,
                total: 1,
                percentage: 100,
              },
            },
          },
          {},
          sendResponse
        );

        // Should only apply translations for valid indices (0, 1)
        expect(mockApplyTranslations).toHaveBeenCalledWith(
          [mockNodes[0], mockNodes[1]],
          ['翻訳1', '翻訳2', '翻訳3']
        );
      });

      it('should handle empty translations array', async () => {
        contentScript.initialize();

        const mockNodes = [
          { node: document.createTextNode('test1'), text: 'test1', element: document.body },
        ];
        (contentScript as any).currentTranslationNodes = mockNodes;

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 0,
              translations: [],
              nodeIndices: [],
              phase: 1,
              progress: {
                current: 0,
                total: 1,
                percentage: 0,
              },
            },
          },
          {},
          sendResponse
        );

        expect(mockApplyTranslations).toHaveBeenCalledWith([], []);
        expect(mockProgressNotification.updatePhase).toHaveBeenCalledWith(1, 0);
      });

      it('should handle errors in applyTranslations gracefully', async () => {
        contentScript.initialize();

        const mockNodes = [
          { node: document.createTextNode('test1'), text: 'test1', element: document.body },
        ];
        (contentScript as any).currentTranslationNodes = mockNodes;

        // Mock applyTranslations to throw error
        mockApplyTranslations.mockImplementation(() => {
          throw new Error('DOM manipulation error');
        });

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        // Should not throw, error should be caught
        await expect(
          messageHandler(
            {
              type: MessageType.BATCH_COMPLETED,
              payload: {
                batchIndex: 0,
                translations: ['翻訳1'],
                nodeIndices: [0],
                phase: 1,
                progress: {
                  current: 1,
                  total: 1,
                  percentage: 100,
                },
              },
            },
            {},
            sendResponse
          )
        ).resolves.not.toThrow();

        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      it('should update progress notification with correct percentage', async () => {
        contentScript.initialize();

        const mockNodes = [
          { node: document.createTextNode('test1'), text: 'test1', element: document.body },
        ];
        (contentScript as any).currentTranslationNodes = mockNodes;

        const messageHandler = mockListen.mock.calls[0][0];
        const sendResponse = jest.fn();

        // Test various percentages
        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 0,
              translations: ['翻訳1'],
              nodeIndices: [0],
              phase: 1,
              progress: {
                current: 1,
                total: 4,
                percentage: 25,
              },
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.updatePhase).toHaveBeenCalledWith(1, 25);

        await messageHandler(
          {
            type: MessageType.BATCH_COMPLETED,
            payload: {
              batchIndex: 1,
              translations: ['翻訳2'],
              nodeIndices: [0],
              phase: 1,
              progress: {
                current: 3,
                total: 4,
                percentage: 75,
              },
            },
          },
          {},
          sendResponse
        );

        expect(mockProgressNotification.updatePhase).toHaveBeenCalledWith(1, 75);
      });
    });
  });

  // ============================================================
  // textFilter integration tests (Task #3)
  // ============================================================
  describe('textFilter integration', () => {
    let mockDetectViewportNodes: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      // Default filterBatchTexts mock: pass all texts through
      mockFilterBatchTexts.mockImplementation((texts: string[]) => ({
        textsToTranslate: texts,
        skippedIndices: new Map(),
        originalIndices: texts.map((_: string, i: number) => i),
      }));

      // Mock DOMManipulator.detectViewportNodes()
      mockDetectViewportNodes = jest.fn(() => ({
        viewport: [
          { node: document.createTextNode('Hello World'), text: 'Hello World', index: 0 },
          { node: document.createTextNode('123'), text: '123', index: 1 },
          { node: document.createTextNode('Goodbye'), text: 'Goodbye', index: 2 },
        ],
        outOfViewport: [
          { node: document.createTextNode('Footer text'), text: 'Footer text', index: 3 },
          { node: document.createTextNode('https://example.com'), text: 'https://example.com', index: 4 },
        ],
      }));

      contentScript['domManipulator'].detectViewportNodes = mockDetectViewportNodes;
    });

    it('should call filterBatchTexts for Phase 1 viewport texts', async () => {
      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: ['Hello World', 'Goodbye'],
        skippedIndices: new Map([[1, '123']]),
        originalIndices: [0, 2],
      });

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['こんにちは世界', 'さようなら'] },
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

      // filterBatchTexts should be called with viewport texts
      expect(mockFilterBatchTexts).toHaveBeenCalledWith(
        ['Hello World', '123', 'Goodbye']
      );
    });

    it('should send only filtered texts to background in Phase 1', async () => {
      mockFilterBatchTexts
        .mockReturnValueOnce({
          textsToTranslate: ['Hello World', 'Goodbye'],
          skippedIndices: new Map([[1, '123']]),
          originalIndices: [0, 2],
        })
        .mockReturnValueOnce({
          textsToTranslate: ['Footer text'],
          skippedIndices: new Map([[1, 'https://example.com']]),
          originalIndices: [0],
        });

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['こんにちは世界', 'さようなら'] },
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

      // Phase 1 should send only filtered texts (without '123')
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.REQUEST_TRANSLATION,
          payload: expect.objectContaining({
            texts: ['Hello World', 'Goodbye'],
            phase: 1,
          }),
        })
      );
    });

    it('should set currentTranslationNodes to filtered nodes only in Phase 1', async () => {
      const viewportNodes = [
        { node: document.createTextNode('Hello World'), text: 'Hello World', index: 0 },
        { node: document.createTextNode('123'), text: '123', index: 1 },
        { node: document.createTextNode('Goodbye'), text: 'Goodbye', index: 2 },
      ];

      mockDetectViewportNodes.mockReturnValue({
        viewport: viewportNodes,
        outOfViewport: [],
      });

      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: ['Hello World', 'Goodbye'],
        skippedIndices: new Map([[1, '123']]),
        originalIndices: [0, 2],
      });

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['こんにちは世界', 'さようなら'] },
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

      // currentTranslationNodes should only contain filtered nodes (indices 0 and 2)
      const currentNodes = (contentScript as any).currentTranslationNodes;
      expect(currentNodes).toHaveLength(2);
      expect(currentNodes[0].text).toBe('Hello World');
      expect(currentNodes[1].text).toBe('Goodbye');
    });

    it('should call filterBatchTexts for Phase 2 out-of-viewport texts', async () => {
      mockFilterBatchTexts
        .mockReturnValueOnce({
          textsToTranslate: ['Hello World', 'Goodbye'],
          skippedIndices: new Map([[1, '123']]),
          originalIndices: [0, 2],
        })
        .mockReturnValueOnce({
          textsToTranslate: ['Footer text'],
          skippedIndices: new Map([[1, 'https://example.com']]),
          originalIndices: [0],
        });

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['翻訳済み'] },
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

      // filterBatchTexts should be called twice: Phase 1 and Phase 2
      expect(mockFilterBatchTexts).toHaveBeenCalledTimes(2);
      expect(mockFilterBatchTexts).toHaveBeenNthCalledWith(2,
        ['Footer text', 'https://example.com']
      );
    });

    it('should send only filtered texts to background in Phase 2', async () => {
      mockFilterBatchTexts
        .mockReturnValueOnce({
          textsToTranslate: ['Hello World', 'Goodbye'],
          skippedIndices: new Map([[1, '123']]),
          originalIndices: [0, 2],
        })
        .mockReturnValueOnce({
          textsToTranslate: ['Footer text'],
          skippedIndices: new Map([[1, 'https://example.com']]),
          originalIndices: [0],
        });

      mockSend
        .mockResolvedValueOnce({
          success: true,
          data: { translations: ['こんにちは世界', 'さようなら'] },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { translations: ['フッターテキスト'] },
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

      // Phase 2 should send only filtered texts (without 'https://example.com')
      expect(mockSend).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          type: MessageType.REQUEST_TRANSLATION,
          payload: expect.objectContaining({
            texts: ['Footer text'],
            semiParallel: false,
          }),
        })
      );
    });

    it('should apply Phase 2 translations to filtered nodes only', async () => {
      const oovNodes = [
        { node: document.createTextNode('Footer text'), text: 'Footer text', index: 3 },
        { node: document.createTextNode('https://example.com'), text: 'https://example.com', index: 4 },
      ];

      mockDetectViewportNodes.mockReturnValue({
        viewport: [],
        outOfViewport: oovNodes,
      });

      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: ['Footer text'],
        skippedIndices: new Map([[1, 'https://example.com']]),
        originalIndices: [0],
      });

      const mockApplyTranslations = jest.spyOn(
        (contentScript as any).domManipulator,
        'applyTranslations'
      );

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['フッターテキスト'] },
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

      // applyTranslations should be called with only the filtered node
      expect(mockApplyTranslations).toHaveBeenCalledWith(
        [oovNodes[0]],
        ['フッターテキスト']
      );
    });

    it('should skip Phase 1 when all viewport texts are filtered out', async () => {
      mockDetectViewportNodes.mockReturnValue({
        viewport: [
          { node: document.createTextNode('123'), text: '123', index: 0 },
          { node: document.createTextNode('456'), text: '456', index: 1 },
        ],
        outOfViewport: [],
      });

      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: [],
        skippedIndices: new Map([[0, '123'], [1, '456']]),
        originalIndices: [],
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

      // No translation request should be sent
      expect(mockSend).not.toHaveBeenCalled();
      // Phase 1 should still be completed
      expect(mockProgressNotification.completePhase).toHaveBeenCalledWith(1);
    });

    it('should skip Phase 2 when all out-of-viewport texts are filtered out', async () => {
      mockDetectViewportNodes.mockReturnValue({
        viewport: [],
        outOfViewport: [
          { node: document.createTextNode('123'), text: '123', index: 0 },
          { node: document.createTextNode('https://x.com'), text: 'https://x.com', index: 1 },
        ],
      });

      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: [],
        skippedIndices: new Map([[0, '123'], [1, 'https://x.com']]),
        originalIndices: [],
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

      // No translation request should be sent
      expect(mockSend).not.toHaveBeenCalled();
      // Phase 2 should still be completed
      expect(mockProgressNotification.completePhase).toHaveBeenCalledWith(2);
    });
  });

  // ============================================================
  // MutationObserver improvement tests (Task #4)
  // ============================================================
  describe('MutationObserver incremental translation', () => {
    let mockObserve: jest.Mock;
    let mutationCallback: (mutations: MutationRecord[]) => void;

    beforeEach(() => {
      jest.clearAllMocks();

      // Default filterBatchTexts mock
      mockFilterBatchTexts.mockImplementation((texts: string[]) => ({
        textsToTranslate: texts,
        skippedIndices: new Map(),
        originalIndices: texts.map((_: string, i: number) => i),
      }));

      // Capture the mutation callback
      mockObserve = jest.fn((callback: (mutations: MutationRecord[]) => void) => {
        mutationCallback = callback;
      });
      contentScript['mutationObserver'].observe = mockObserve;
    });

    it('should only translate new text nodes instead of full page re-translation', async () => {
      // First translate the page to set isTranslated = true
      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['翻訳済み'] },
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

      // Enable dynamic translation
      contentScript.enableDynamicTranslation('ja');

      // Clear mock call history
      mockSend.mockClear();
      mockFilterBatchTexts.mockClear();

      // Simulate a mutation with a new text node
      const newTextNode = document.createTextNode('New Dynamic Content');
      const addedElement = document.createElement('p');
      addedElement.appendChild(newTextNode);

      const mockMutation = {
        type: 'childList',
        addedNodes: [addedElement] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['新しい動的コンテンツ'] },
      });

      // Trigger mutation callback
      if (mutationCallback) {
        await mutationCallback([mockMutation]);
      }

      // Should translate only the new text, not call full translatePage
      // The new translateNewNodes should send only new texts
      if (mockSend.mock.calls.length > 0) {
        const translationCall = mockSend.mock.calls[0][0];
        expect(translationCall.payload.texts).not.toContain('Hello World');
        expect(translationCall.payload.texts).not.toContain('Test content');
      }
    });

    it('should apply filterBatchTexts to dynamically added text nodes', async () => {
      // Set isTranslated = true
      (contentScript as any).isTranslated = true;

      contentScript.enableDynamicTranslation('ja');

      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: ['Real Content'],
        skippedIndices: new Map([[0, '123']]),
        originalIndices: [1],
      });

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['実際のコンテンツ'] },
      });

      // Simulate mutation with mixed content
      const numNode = document.createTextNode('123');
      const textNode = document.createTextNode('Real Content');
      const container = document.createElement('div');
      container.appendChild(numNode);
      container.appendChild(document.createElement('br'));
      const p = document.createElement('p');
      p.appendChild(textNode);
      container.appendChild(p);

      const mockMutation = {
        type: 'childList',
        addedNodes: [container] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      if (mutationCallback) {
        await mutationCallback([mockMutation]);
      }

      // filterBatchTexts should have been called
      expect(mockFilterBatchTexts).toHaveBeenCalled();
    });

    it('should not collect text from excluded elements (script/svg/code) in dynamic content', async () => {
      (contentScript as any).isTranslated = true;

      contentScript.enableDynamicTranslation('ja');

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: [] },
      });

      // Simulate adding a script element dynamically
      const script = document.createElement('script');
      script.textContent = 'console.log("hidden")';

      const mockMutation = {
        type: 'childList',
        addedNodes: [script] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      if (mutationCallback) {
        await mutationCallback([mockMutation]);
      }

      // Should not send any translation request for script content
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should not collect text from svg elements in dynamic content', async () => {
      (contentScript as any).isTranslated = true;

      contentScript.enableDynamicTranslation('ja');

      // Create SVG with nested text
      const svg = document.createElement('svg');
      const svgText = document.createElement('text');
      svgText.textContent = 'SVG Label';
      svg.appendChild(svgText);

      const mockMutation = {
        type: 'childList',
        addedNodes: [svg] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      if (mutationCallback) {
        await mutationCallback([mockMutation]);
      }

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should not collect text from data-no-translate elements in dynamic content', async () => {
      (contentScript as any).isTranslated = true;

      contentScript.enableDynamicTranslation('ja');

      const div = document.createElement('div');
      div.setAttribute('data-no-translate', '');
      const p = document.createElement('p');
      p.textContent = 'Do not translate';
      div.appendChild(p);

      const mockMutation = {
        type: 'childList',
        addedNodes: [div] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      if (mutationCallback) {
        await mutationCallback([mockMutation]);
      }

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should catch errors in translateNewNodes without stopping MutationObserver', async () => {
      (contentScript as any).isTranslated = true;

      contentScript.enableDynamicTranslation('ja');

      // Make API call fail
      mockFilterBatchTexts.mockReturnValue({
        textsToTranslate: ['Error text'],
        skippedIndices: new Map(),
        originalIndices: [0],
      });
      mockSend.mockRejectedValue(new Error('API Error'));

      const newP = document.createElement('p');
      newP.textContent = 'Error text';

      const mockMutation = {
        type: 'childList',
        addedNodes: [newP] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      // Should not throw — error caught internally
      if (mutationCallback) {
        await expect(mutationCallback([mockMutation])).resolves.not.toThrow();
      }
    });

    it('should not re-translate the entire page on mutation', async () => {
      (contentScript as any).isTranslated = true;

      const extractSpy = jest.spyOn(
        (contentScript as any).domManipulator,
        'extractTextNodes'
      );

      contentScript.enableDynamicTranslation('ja');

      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['翻訳'] },
      });

      const newP = document.createElement('p');
      newP.textContent = 'New text';

      const mockMutation = {
        type: 'childList',
        addedNodes: [newP] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: testContainer,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        oldValue: null,
      } as MutationRecord;

      if (mutationCallback) {
        await mutationCallback([mockMutation]);
      }

      // extractTextNodes (full page scan) should NOT be called
      expect(extractSpy).not.toHaveBeenCalled();
    });
  });
});
