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
      it('should call OpenRouterClient.testConnection() when no payload provided', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'testConnection',
          payload: {},
        };

        const mockResult = {
          success: true,
          message: 'Connection successful!',
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

      it('should call OpenRouterClient.testConnectionWithConfig() when payload contains apiKey', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'testConnection',
          payload: {
            apiKey: 'test-api-key',
            model: 'google/gemini-2.0-flash-exp:free',
            provider: 'Google',
          },
        };

        const mockResult = {
          success: true,
          message: 'Connection successful!',
        };
        mockClient.testConnectionWithConfig = jest.fn().mockResolvedValue(mockResult);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockClient.testConnectionWithConfig).toHaveBeenCalledWith({
          apiKey: 'test-api-key',
          model: 'google/gemini-2.0-flash-exp:free',
          provider: 'Google',
        });
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });

      it('should return error when API key is empty in payload', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: 'testConnection',
          payload: {
            apiKey: '',
            model: 'google/gemini-2.0-flash-exp:free',
          },
        };

        const mockResult = {
          success: false,
          error: 'API key is required. Please configure your OpenRouter API key.',
        };
        mockClient.testConnectionWithConfig = jest.fn().mockResolvedValue(mockResult);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockClient.testConnectionWithConfig).toHaveBeenCalledWith({
          apiKey: '',
          model: 'google/gemini-2.0-flash-exp:free',
          provider: undefined,
        });
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

    describe('reloadConfig action', () => {
      it('should call OpenRouterClient.initialize() and return success', async () => {
        // Arrange
        const message = {
          type: MessageType.RELOAD_CONFIG,
          action: 'reloadConfig',
          payload: {},
        };
        mockClient.initialize = jest.fn().mockResolvedValue(undefined);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockClient.initialize).toHaveBeenCalledTimes(1);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { message: 'Configuration reloaded successfully' },
        });
      });

      it('should return error when initialize() fails', async () => {
        // Arrange
        const message = {
          type: MessageType.RELOAD_CONFIG,
          action: 'reloadConfig',
          payload: {},
        };
        const error = new Error('Storage read failed');
        mockClient.initialize = jest.fn().mockRejectedValue(error);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockClient.initialize).toHaveBeenCalledTimes(1);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Storage read failed',
        });
      });

      it('should handle unknown error in initialize()', async () => {
        // Arrange
        const message = {
          type: MessageType.RELOAD_CONFIG,
          action: 'reloadConfig',
          payload: {},
        };
        mockClient.initialize = jest.fn().mockRejectedValue('Unknown error');

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Failed to reload config',
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
      it('should return error for message without action and unknown type', async () => {
        // Arrange
        const message = {
          type: 'unknownMessageType',
          payload: {},
        };

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: expect.stringContaining('Invalid message format: missing action'),
        });
      });

      it('should infer action from type for backward compatibility', async () => {
        // Arrange
        const message = {
          type: 'requestTranslation',
          payload: {
            texts: ['Hello'],
            targetLanguage: 'Japanese',
          },
        };

        const mockTranslations = ['こんにちは'];
        mockEngine.translateBatch = jest.fn().mockResolvedValue(mockTranslations);

        // Act
        const result = await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(result).toBe(true);
        expect(mockEngine.translateBatch).toHaveBeenCalledWith(['Hello'], 'Japanese');
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { translations: mockTranslations },
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
        type: 'unknownType',
        action: null as any, // This will cause an error at the validation level
        payload: {},
      };

      // Act
      const result = await handler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(result).toBe(true);
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid message format: missing action'),
      });
    });
  });
});
