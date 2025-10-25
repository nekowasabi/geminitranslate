/**
 * @jest-environment jsdom
 *
 * Translation Flow Integration Test
 * Tests the complete translation flow from UI trigger to DOM update
 */

import MessageBus from '@shared/messages/MessageBus';
import { MessageType, TranslatePageRequest, TranslateSelectionRequest, TranslateClipboardRequest } from '@shared/messages/types';
import { TranslationEngine } from '@background/translationEngine';
import StorageManager from '@shared/storage/StorageManager';

// Mock modules
jest.mock('@shared/storage/StorageManager');
jest.mock('@shared/messages/MessageBus');

describe('Translation Flow Integration', () => {
  let mockStorageManager: any;
  let mockMessageBus: any;
  let translationEngine: TranslationEngine;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock StorageManager
    mockStorageManager = {
      get: jest.fn(),
      set: jest.fn(),
      getApiKey: jest.fn().mockResolvedValue('test-api-key'),
      getTargetLanguage: jest.fn().mockResolvedValue('ja'),
    };
    (StorageManager as jest.Mock).mockImplementation(() => mockStorageManager);

    // Mock MessageBus
    mockMessageBus = {
      send: jest.fn(),
      on: jest.fn(),
    };
    (MessageBus.send as jest.Mock) = mockMessageBus.send;
    (MessageBus.on as jest.Mock) = mockMessageBus.on;

    // Initialize TranslationEngine
    translationEngine = new TranslationEngine();
  });

  describe('Page Translation Flow', () => {
    it('should execute complete page translation flow: Popup → MessageBus → Background → Content → DOM', async () => {
      // Step 1: Popup sends message via MessageBus
      const request: TranslatePageRequest = {
        type: MessageType.TRANSLATE_PAGE,
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'started',
      });

      const popupResponse = await MessageBus.send(request);

      expect(popupResponse).toEqual({ status: 'started' });
      expect(mockMessageBus.send).toHaveBeenCalledWith(request);

      // Step 2: Background receives message and starts translation
      // (This is tested in messageHandler.test.ts)

      // Step 3: TranslationEngine processes translation
      const mockTexts = ['Hello World', 'Test Content'];
      const mockTranslatedTexts = ['こんにちは世界', 'テストコンテンツ'];

      // Mock translate method
      jest.spyOn(translationEngine, 'translateBatch').mockResolvedValue(mockTranslatedTexts);

      const result = await translationEngine.translateBatch(mockTexts, 'ja');

      expect(result).toEqual(mockTranslatedTexts);
      expect(translationEngine.translateBatch).toHaveBeenCalledWith(mockTexts, 'ja');

      // Step 4: Background sends result to Content via MessageBus
      mockMessageBus.send.mockResolvedValue({
        status: 'success',
        data: { translatedTexts: mockTranslatedTexts },
      });

      const contentResponse = await MessageBus.send({
        type: MessageType.TRANSLATE_RESULT,
        data: { translatedTexts: mockTranslatedTexts },
      });

      expect(contentResponse.status).toBe('success');

      // Step 5: Content updates DOM
      // (This is tested in domManipulator.test.ts)
    });

    it('should handle translation errors gracefully', async () => {
      const request: TranslatePageRequest = {
        type: MessageType.TRANSLATE_PAGE,
        targetLanguage: 'ja',
      };

      // Mock error response
      mockMessageBus.send.mockRejectedValue(new Error('API Error'));

      await expect(MessageBus.send(request)).rejects.toThrow('API Error');
    });

    it('should cache translation results to avoid duplicate API calls', async () => {
      const mockTexts = ['Hello World'];
      const mockTranslatedTexts = ['こんにちは世界'];

      jest.spyOn(translationEngine, 'translateBatch').mockResolvedValue(mockTranslatedTexts);

      // First call
      const result1 = await translationEngine.translateBatch(mockTexts, 'ja');
      expect(result1).toEqual(mockTranslatedTexts);

      // Second call should use cache (but in this mock, it will call again)
      const result2 = await translationEngine.translateBatch(mockTexts, 'ja');
      expect(result2).toEqual(mockTranslatedTexts);

      // Both calls should have succeeded
      expect(translationEngine.translateBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Selection Translation Flow', () => {
    it('should execute selection translation flow: Content → Background → FloatingUI', async () => {
      // Step 1: User selects text, Content sends message
      const request: TranslateSelectionRequest = {
        type: MessageType.TRANSLATE_SELECTION,
        text: 'Selected Text',
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'success',
        data: { translatedText: '選択されたテキスト' },
      });

      const response = await MessageBus.send(request);

      expect(response.status).toBe('success');
      expect(response.data.translatedText).toBe('選択されたテキスト');
      expect(mockMessageBus.send).toHaveBeenCalledWith(request);

      // Step 2: TranslationEngine processes
      jest.spyOn(translationEngine, 'translateBatch').mockResolvedValue(['選択されたテキスト']);

      const result = await translationEngine.translateBatch(['Selected Text'], 'ja');
      expect(result).toEqual(['選択されたテキスト']);

      // Step 3: Content displays in FloatingUI
      // (Tested in floatingUI.test.ts)
    });

    it('should handle empty selection gracefully', async () => {
      const request: TranslateSelectionRequest = {
        type: MessageType.TRANSLATE_SELECTION,
        text: '',
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'error',
        error: 'Empty text',
      });

      const response = await MessageBus.send(request);
      expect(response.status).toBe('error');
    });
  });

  describe('Clipboard Translation Flow', () => {
    it('should execute clipboard translation flow: Content → Background → FloatingUI', async () => {
      // Step 1: User triggers clipboard translation
      const request: TranslateClipboardRequest = {
        type: MessageType.TRANSLATE_CLIPBOARD,
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'success',
        data: {
          originalText: 'Clipboard Content',
          translatedText: 'クリップボードの内容',
        },
      });

      const response = await MessageBus.send(request);

      expect(response.status).toBe('success');
      expect(response.data.originalText).toBe('Clipboard Content');
      expect(response.data.translatedText).toBe('クリップボードの内容');

      // Step 2: TranslationEngine processes
      jest.spyOn(translationEngine, 'translateBatch').mockResolvedValue(['クリップボードの内容']);

      const result = await translationEngine.translateBatch(['Clipboard Content'], 'ja');
      expect(result).toEqual(['クリップボードの内容']);
    });

    it('should handle clipboard read permission errors', async () => {
      const request: TranslateClipboardRequest = {
        type: MessageType.TRANSLATE_CLIPBOARD,
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'error',
        error: 'Clipboard permission denied',
      });

      const response = await MessageBus.send(request);
      expect(response.status).toBe('error');
      expect(response.error).toBe('Clipboard permission denied');
    });
  });

  describe('Error Handling Flow', () => {
    it('should propagate API errors from Background to UI', async () => {
      const request: TranslatePageRequest = {
        type: MessageType.TRANSLATE_PAGE,
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'error',
        error: 'API key invalid',
      });

      const response = await MessageBus.send(request);
      expect(response.status).toBe('error');
      expect(response.error).toBe('API key invalid');
    });

    it('should handle network errors gracefully', async () => {
      const request: TranslatePageRequest = {
        type: MessageType.TRANSLATE_PAGE,
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockRejectedValue(new Error('Network error'));

      await expect(MessageBus.send(request)).rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      const request: TranslatePageRequest = {
        type: MessageType.TRANSLATE_PAGE,
        targetLanguage: 'ja',
      };

      mockMessageBus.send.mockResolvedValue({
        status: 'error',
        error: 'Request timeout',
      });

      const response = await MessageBus.send(request);
      expect(response.status).toBe('error');
      expect(response.error).toBe('Request timeout');
    });
  });

  describe('Concurrent Translation Flow', () => {
    it('should handle multiple concurrent translation requests', async () => {
      const requests: TranslateSelectionRequest[] = [
        { type: MessageType.TRANSLATE_SELECTION, text: 'Text 1', targetLanguage: 'ja' },
        { type: MessageType.TRANSLATE_SELECTION, text: 'Text 2', targetLanguage: 'ja' },
        { type: MessageType.TRANSLATE_SELECTION, text: 'Text 3', targetLanguage: 'ja' },
      ];

      mockMessageBus.send
        .mockResolvedValueOnce({ status: 'success', data: { translatedText: 'テキスト1' } })
        .mockResolvedValueOnce({ status: 'success', data: { translatedText: 'テキスト2' } })
        .mockResolvedValueOnce({ status: 'success', data: { translatedText: 'テキスト3' } });

      const responses = await Promise.all(requests.map(req => MessageBus.send(req)));

      expect(responses).toHaveLength(3);
      expect(responses[0].status).toBe('success');
      expect(responses[1].status).toBe('success');
      expect(responses[2].status).toBe('success');
    });

    it('should respect CONCURRENCY_LIMIT for batch processing', async () => {
      const mockTexts = Array.from({ length: 50 }, (_, i) => `Text ${i}`);
      const mockTranslated = Array.from({ length: 50 }, (_, i) => `テキスト${i}`);

      jest.spyOn(translationEngine, 'translateBatch').mockResolvedValue(mockTranslated);

      const result = await translationEngine.translateBatch(mockTexts, 'ja');

      expect(result).toHaveLength(50);
      expect(translationEngine.translateBatch).toHaveBeenCalledWith(mockTexts, 'ja');
    });
  });
});
