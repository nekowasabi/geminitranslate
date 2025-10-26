/**
 * Background Layer Integration Tests
 *
 * Tests the integration of all background layer components:
 * - MessageHandler → TranslationEngine flow
 * - CommandHandler → MessageBus → Content Script flow
 * - Error handling across components
 * - Cache integration
 */

import { MessageHandler } from '../../../src/background/messageHandler';
import { CommandHandler } from '../../../src/background/commandHandler';
import { TranslationEngine } from '../../../src/background/translationEngine';
import { OpenRouterClient } from '../../../src/background/apiClient';
import { MessageBus } from '../../../src/shared/messages/MessageBus';
import BrowserAdapter from '../../../src/shared/adapters/BrowserAdapter';
import { MessageType } from '../../../src/shared/messages/types';

// Mock dependencies
jest.mock('../../../src/background/apiClient');
jest.mock('../../../src/shared/adapters/BrowserAdapter');
jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock StorageManager
jest.mock('../../../src/shared/storage/StorageManager', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      getTargetLanguage: jest.fn().mockResolvedValue('Japanese'),
      getApiKey: jest.fn().mockResolvedValue('test-api-key'),
      getModel: jest.fn().mockResolvedValue('test-model'),
      getProvider: jest.fn().mockResolvedValue('Google'),
    })),
  };
});

describe('Background Layer Integration', () => {
  let messageHandler: MessageHandler;
  let commandHandler: CommandHandler;
  let engine: TranslationEngine;
  let client: jest.Mocked<OpenRouterClient>;
  let messageBus: MessageBus;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup storage mocks
    global.sessionStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(),
      length: 0,
    } as any;

    // Create real instances
    client = new OpenRouterClient() as jest.Mocked<OpenRouterClient>;
    engine = new TranslationEngine();
    messageBus = new MessageBus();

    await engine.initialize();

    messageHandler = new MessageHandler(engine, client);
    commandHandler = new CommandHandler(messageBus, 'Japanese');

    // Mock BrowserAdapter
    BrowserAdapter.tabs = {
      query: jest.fn().mockResolvedValue([{ id: 1 }]),
      sendMessage: jest.fn().mockResolvedValue({}),
    } as any;
  });

  describe('MessageHandler → TranslationEngine Flow', () => {
    it('should route requestTranslation to TranslationEngine', async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: ['Hello'],
          targetLanguage: 'Japanese',
        },
      };

      const mockSendResponse = jest.fn();
      const mockSender = { id: 'test' } as any;
      const translateBatchSpy = jest.spyOn(engine, 'translateBatch').mockResolvedValue(['こんにちは']);

      // Act
      await messageHandler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(translateBatchSpy).toHaveBeenCalledWith(['Hello'], 'Japanese');
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: { translations: ['こんにちは'] },
      });
    });

    it('should integrate MessageHandler with real TranslationEngine flow', async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: ['Test'],
          targetLanguage: 'Japanese',
        },
      };

      // Mock API client which is used by engine internally
      const mockClient = (engine as any).apiClient as jest.Mocked<OpenRouterClient>;
      mockClient.translate = jest.fn().mockResolvedValue(['テスト']);

      const mockSendResponse = jest.fn();
      const mockSender = { id: 'test' } as any;

      // Act
      await messageHandler.handle(message, mockSender, mockSendResponse);

      // Assert - Should receive successful response
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: { translations: ['テスト'] },
      });
    });
  });

  describe('CommandHandler → MessageBus Flow', () => {
    it('should send TRANSLATE_PAGE message to active tab', async () => {
      // Arrange
      const mockTab = { id: 123 } as chrome.tabs.Tab;
      messageBus.sendToTab = jest.fn().mockResolvedValue({});

      // Act
      await commandHandler.handle('translate-page', mockTab);

      // Assert
      expect(messageBus.sendToTab).toHaveBeenCalledWith(123, {
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'Japanese',
        },
      });
    });

    it('should query for active tab if not provided', async () => {
      // Arrange
      const mockTab = { id: 456 };
      BrowserAdapter.tabs.query = jest.fn().mockResolvedValue([mockTab]);
      messageBus.sendToTab = jest.fn().mockResolvedValue({});

      // Act
      await commandHandler.handle('translate-selection');

      // Assert
      expect(BrowserAdapter.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
      expect(messageBus.sendToTab).toHaveBeenCalledWith(456, {
        type: MessageType.TRANSLATE_SELECTION,
        payload: {
          targetLanguage: 'Japanese',
        },
      });
    });
  });

  describe('Cache Integration', () => {
    it('should retrieve cache stats correctly', async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'getCacheStats',
        payload: {},
      };

      const mockSendResponse = jest.fn();
      const mockSender = { id: 'test' } as any;

      // Act
      await messageHandler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          memory: expect.any(Number),
          session: expect.any(Number),
          local: expect.any(Number),
          hitRate: expect.any(Number),
        }),
      });
    });

    it('should clear cache successfully', async () => {
      // Arrange
      // First, add some cached translations
      const translateMessage = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: ['Test'],
          targetLanguage: 'Japanese',
        },
      };

      client.translate = jest.fn().mockResolvedValue(['テスト']);

      const mockSendResponse = jest.fn();
      const mockSender = { id: 'test' } as any;

      await messageHandler.handle(translateMessage, mockSender, mockSendResponse);

      // Act - Clear cache
      const clearMessage = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'clearCache',
        payload: {
          layer: 'all',
        },
      };

      mockSendResponse.mockClear();
      await messageHandler.handle(clearMessage, mockSender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Cache cleared successfully' },
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid message format in MessageHandler', async () => {
      // Arrange
      const invalidMessage = {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        // Missing texts in payload
        payload: {},
      };

      const mockSendResponse = jest.fn();
      const mockSender = { id: 'test' } as any;

      // Act
      await messageHandler.handle(invalidMessage, mockSender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid payload: texts must be an array',
      });
    });

    it('should handle unknown command in CommandHandler', async () => {
      // Arrange
      const mockTab = { id: 123 } as chrome.tabs.Tab;
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await commandHandler.handle('unknown-command', mockTab);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        'CommandHandler: Unknown command',
        'unknown-command'
      );
    });
  });

  describe('Connection Test Integration', () => {
    it('should test API connection successfully', async () => {
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

      client.testConnection = jest.fn().mockResolvedValue(mockResult);

      const mockSendResponse = jest.fn();
      const mockSender = { id: 'test' } as any;

      // Act
      await messageHandler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(client.testConnection).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
      });
    });
  });
});
