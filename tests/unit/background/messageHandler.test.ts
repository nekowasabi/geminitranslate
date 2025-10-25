/**
 * MessageHandler Unit Tests
 *
 * Tests for the message routing handler that processes incoming messages
 * and delegates to appropriate services (TranslationEngine, OpenRouterClient).
 */

import { MessageHandler } from '../../../src/background/messageHandler';
import { TranslationEngine } from '../../../src/background/translationEngine';
import { OpenRouterClient } from '../../../src/background/apiClient';
import { MessageType } from '../../../src/shared/messages/types';

// Mock dependencies
jest.mock('../../../src/background/translationEngine');
jest.mock('../../../src/background/apiClient');
jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockEngine: jest.Mocked<TranslationEngine>;
  let mockClient: jest.Mocked<OpenRouterClient>;
  let mockSendResponse: jest.Mock;
  let mockSender: chrome.runtime.MessageSender;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockEngine = new TranslationEngine() as jest.Mocked<TranslationEngine>;
    mockClient = new OpenRouterClient() as jest.Mocked<OpenRouterClient>;

    // Create handler
    handler = new MessageHandler(mockEngine, mockClient);

    // Mock sendResponse callback
    mockSendResponse = jest.fn();

    // Mock sender
    mockSender = {
      tab: { id: 1, index: 0, pinned: false, highlighted: false, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true, windowId: 1 },
      id: 'test-extension-id',
      url: 'https://example.com',
    };
  });

  describe('handle() - Message Routing', () => {
    describe('requestTranslation action', () => {
      it('should call TranslationEngine.translateBatch() and return success response', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'requestTranslation',
          payload: {
            texts: ['Hello', 'World'],
            targetLanguage: 'Japanese',
          },
        };

        const mockTranslations = ['こんにちは', '世界'];
        mockEngine.translateBatch = jest.fn().mockResolvedValue(mockTranslations);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true); // Async response
        expect(mockEngine.translateBatch).toHaveBeenCalledWith(
          ['Hello', 'World'],
          'Japanese'
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { translations: mockTranslations },
        });
      });

      it('should handle translation errors and return error response', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'requestTranslation',
          payload: {
            texts: ['Hello'],
            targetLanguage: 'Japanese',
          },
        };

        const mockError = new Error('API rate limit exceeded');
        mockEngine.translateBatch = jest.fn().mockRejectedValue(mockError);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'API rate limit exceeded',
        });
      });
    });

    describe('clearCache action', () => {
      it('should call TranslationEngine.clearCache() with specified layer', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'clearCache',
          payload: {
            layer: 'memory' as const,
          },
        };

        mockEngine.clearCache = jest.fn().mockResolvedValue(undefined);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockEngine.clearCache).toHaveBeenCalledWith('memory');
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { message: 'Cache cleared successfully' },
        });
      });

      it('should default to "all" layer if not specified', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'clearCache',
          payload: {},
        };

        mockEngine.clearCache = jest.fn().mockResolvedValue(undefined);

        // Act
        await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(mockEngine.clearCache).toHaveBeenCalledWith('all');
      });
    });

    describe('getCacheStats action', () => {
      it('should call TranslationEngine.getCacheStats() and return stats', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'getCacheStats',
          payload: {},
        };

        const mockStats = {
          memory: 10,
          session: 5,
          local: 20,
          hitRate: 0.75,
        };
        mockEngine.getCacheStats = jest.fn().mockResolvedValue(mockStats);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockEngine.getCacheStats).toHaveBeenCalled();
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockStats,
        });
      });
    });

    describe('testConnection action', () => {
      it('should call OpenRouterClient.testConnection() and return result', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'testConnection',
          payload: {},
        };

        const mockResult = {
          success: true,
          model: 'google/gemini-2.0-flash-exp:free',
          latency: 150,
        };
        mockClient.testConnection = jest.fn().mockResolvedValue(mockResult);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockClient.testConnection).toHaveBeenCalled();
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });

      it('should handle connection errors', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'testConnection',
          payload: {},
        };

        const mockError = new Error('Network timeout');
        mockClient.testConnection = jest.fn().mockRejectedValue(mockError);

        // Act
        await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Network timeout',
        });
      });
    });

    describe('Unknown action', () => {
      it('should return error for unknown action', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'unknownAction',
          payload: {},
        };

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Unknown action: unknownAction',
        });
      });
    });

    describe('Invalid message format', () => {
      it('should return error for message without action', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          payload: {},
        };

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message format: missing action',
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should catch and handle unexpected errors in action handlers', async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: ['Test'],
          targetLanguage: 'Japanese',
        },
      };

      // Mock translateBatch to throw a non-Error object
      mockEngine.translateBatch = jest.fn().mockImplementation(() => {
        throw 'String error';
      });

      // Act
      const result = await handler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(result).toBe(true);
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Translation failed',
      });
    });

    it('should catch and handle unexpected errors at top level', async () => {
      // Arrange - Create a message that will cause an error at the handler level
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: null as any, // This will cause an error at the switch level
        payload: {},
      };

      // Act
      const result = await handler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(result).toBe(true);
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message format: missing action',
      });
    });
  });
});
