/**
 * CommandHandler Unit Tests
 *
 * Tests for the command handler that processes browser keyboard shortcuts
 * and sends messages to content scripts via MessageBus.
 */

import { CommandHandler } from '../../../src/background/commandHandler';
import { MessageBus } from '../../../src/shared/messages/MessageBus';
import BrowserAdapter from '../../../src/shared/adapters/BrowserAdapter';
import { MessageType } from '../../../src/shared/messages/types';

// Mock dependencies
jest.mock('../../../src/shared/messages/MessageBus');
jest.mock('../../../src/shared/adapters/BrowserAdapter');
jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../../src/shared/storage/StorageManager', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getTargetLanguage: jest.fn().mockResolvedValue('ja'),
  })),
}));

describe('CommandHandler', () => {
  let handler: CommandHandler;
  let mockMessageBus: jest.Mocked<MessageBus>;
  let mockTab: chrome.tabs.Tab;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock MessageBus instance
    mockMessageBus = new MessageBus() as jest.Mocked<MessageBus>;
    mockMessageBus.sendToTab = jest.fn().mockResolvedValue({});

    // Create mock active tab
    mockTab = {
      id: 123,
      index: 0,
      pinned: false,
      highlighted: false,
      active: true,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      windowId: 1,
      url: 'https://example.com',
      title: 'Example Page',
    };

    // Mock BrowserAdapter.tabs.query to return active tab
    BrowserAdapter.tabs = {
      query: jest.fn().mockResolvedValue([mockTab]),
      sendMessage: jest.fn(),
    } as any;

    // Create handler
    handler = new CommandHandler(mockMessageBus);
  });

  describe('handle() - Command Routing', () => {
    describe('translate-page command', () => {
      it('should send TRANSLATE_PAGE message to active tab', async () => {
        // Arrange
        const command = 'translate-page';

        // Act
        await handler.handle(command, mockTab);

        // Assert
        expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(123, {
          type: MessageType.TRANSLATE_PAGE,
          payload: {
            targetLanguage: 'ja', // From StorageManager mock
          },
        });
      });

      it('should query for active tab if tab not provided', async () => {
        // Arrange
        const command = 'translate-page';

        // Act
        await handler.handle(command);

        // Assert
        expect(BrowserAdapter.tabs.query).toHaveBeenCalledWith({
          active: true,
          currentWindow: true,
        });
        expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(123, {
          type: MessageType.TRANSLATE_PAGE,
          payload: {
            targetLanguage: 'ja',
          },
        });
      });
    });

    describe('translate-selection command', () => {
      it('should send TRANSLATE_SELECTION message to active tab', async () => {
        // Arrange
        const command = 'translate-selection';

        // Act
        await handler.handle(command, mockTab);

        // Assert
        expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(123, {
          type: MessageType.TRANSLATE_SELECTION,
          payload: {
            targetLanguage: 'ja',
          },
        });
      });
    });

    describe('translate-clipboard command', () => {
      it('should send TRANSLATE_CLIPBOARD message to active tab', async () => {
        // Arrange
        const command = 'translate-clipboard';

        // Act
        await handler.handle(command, mockTab);

        // Assert
        expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(123, {
          type: MessageType.TRANSLATE_CLIPBOARD,
          payload: {
            targetLanguage: 'ja',
          },
        });
      });
    });

    describe('Unknown command', () => {
      it('should log warning for unknown command', async () => {
        // Arrange
        const command = 'unknown-command';
        const { logger } = require('../../../src/shared/utils/logger');

        // Act
        await handler.handle(command, mockTab);

        // Assert
        expect(logger.warn).toHaveBeenCalledWith(
          'CommandHandler: Unknown command',
          command
        );
        expect(mockMessageBus.sendToTab).not.toHaveBeenCalled();
      });
    });
  });

  describe('Active Tab Handling', () => {
    it('should handle case when no active tab found', async () => {
      // Arrange
      const command = 'translate-page';
      BrowserAdapter.tabs.query = jest.fn().mockResolvedValue([]);
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await handler.handle(command);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith('CommandHandler: No active tab found');
      expect(mockMessageBus.sendToTab).not.toHaveBeenCalled();
    });

    it('should handle case when active tab has no id', async () => {
      // Arrange
      const command = 'translate-page';
      const tabWithoutId = { ...mockTab, id: undefined };
      BrowserAdapter.tabs.query = jest.fn().mockResolvedValue([tabWithoutId]);
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await handler.handle(command);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith('CommandHandler: Active tab has no id');
      expect(mockMessageBus.sendToTab).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should catch and log errors when sending message fails', async () => {
      // Arrange
      const command = 'translate-page';
      const mockError = new Error('Message send failed');
      mockMessageBus.sendToTab = jest.fn().mockRejectedValue(mockError);
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await handler.handle(command, mockTab);

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'CommandHandler: Failed to send message',
        mockError
      );
    });

    it('should catch and log errors when querying tabs fails', async () => {
      // Arrange
      const command = 'translate-page';
      const mockError = new Error('Query failed');
      BrowserAdapter.tabs.query = jest.fn().mockRejectedValue(mockError);
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await handler.handle(command);

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'CommandHandler: Error handling command',
        mockError
      );
    });
  });

  describe('Target Language', () => {
    it('should use target language from Storage', async () => {
      // Arrange
      const command = 'translate-page';

      // Act
      await handler.handle(command, mockTab);

      // Assert
      const call = mockMessageBus.sendToTab.mock.calls[0];
      // StorageManager mock returns 'ja' (Japanese)
      expect(call[1].payload.targetLanguage).toBe('ja');
    });

    it('should support custom target language in constructor (fallback)', async () => {
      // Arrange
      const customHandler = new CommandHandler(mockMessageBus, 'es');
      const command = 'translate-page';

      // Act
      await customHandler.handle(command, mockTab);

      // Assert
      const call = mockMessageBus.sendToTab.mock.calls[0];
      // StorageManager mock still returns 'ja' (not affected by constructor arg)
      expect(call[1].payload.targetLanguage).toBe('ja');
    });
  });

  describe('handleMessage() - Message Forwarding', () => {
    it('should forward TRANSLATE_PAGE message and return success response', async () => {
      // Arrange
      const message = {
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'en', // Input is ignored
        },
      };
      const tabId = 123;
      mockMessageBus.sendToTab = jest.fn().mockResolvedValue({ success: true });

      // Act
      const response = await handler.handleMessage(message, tabId);

      // Assert
      // Language is fetched from Storage (ja), not from message payload
      expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(tabId, {
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'ja',
        },
      });
      expect(response).toEqual({ success: true });
    });

    it('should forward TRANSLATE_SELECTION message and return success response', async () => {
      // Arrange
      const message = {
        type: MessageType.TRANSLATE_SELECTION,
        payload: {
          targetLanguage: 'en', // Input is ignored
        },
      };
      const tabId = 123;
      mockMessageBus.sendToTab = jest.fn().mockResolvedValue({ success: true });

      // Act
      const response = await handler.handleMessage(message, tabId);

      // Assert
      // Language is fetched from Storage (ja), not from message payload
      expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(tabId, {
        type: MessageType.TRANSLATE_SELECTION,
        payload: {
          targetLanguage: 'ja',
        },
      });
      expect(response).toEqual({ success: true });
    });

    it('should forward TRANSLATE_CLIPBOARD message and return success response', async () => {
      // Arrange
      const message = {
        type: MessageType.TRANSLATE_CLIPBOARD,
        payload: {
          targetLanguage: 'en', // Input is ignored
        },
      };
      const tabId = 123;
      mockMessageBus.sendToTab = jest.fn().mockResolvedValue({ success: true });

      // Act
      const response = await handler.handleMessage(message, tabId);

      // Assert
      // Language is fetched from Storage (ja), not from message payload
      expect(mockMessageBus.sendToTab).toHaveBeenCalledWith(tabId, {
        type: MessageType.TRANSLATE_CLIPBOARD,
        payload: {
          targetLanguage: 'ja',
        },
      });
      expect(response).toEqual({ success: true });
    });

    it('should return error response when sendToTab fails', async () => {
      // Arrange
      const message = {
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'Japanese',
        },
      };
      const tabId = 123;
      const mockError = new Error('Failed to send message');
      mockMessageBus.sendToTab = jest.fn().mockRejectedValue(mockError);

      // Act
      const response = await handler.handleMessage(message, tabId);

      // Assert
      expect(response).toEqual({
        success: false,
        error: 'Failed to send message',
      });
    });

    it('should return error response for unknown message type', async () => {
      // Arrange
      const message = {
        type: 'unknown-type' as any,
        payload: {},
      };
      const tabId = 123;

      // Act
      const response = await handler.handleMessage(message, tabId);

      // Assert
      expect(response).toEqual({
        success: false,
        error: 'Unknown message type: unknown-type',
      });
      expect(mockMessageBus.sendToTab).not.toHaveBeenCalled();
    });

    it('should return default success response when sendToTab returns undefined', async () => {
      // Arrange
      const message = {
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'Japanese',
        },
      };
      const tabId = 123;
      mockMessageBus.sendToTab = jest.fn().mockResolvedValue(undefined);

      // Act
      const response = await handler.handleMessage(message, tabId);

      // Assert
      expect(response).toEqual({ success: true });
    });
  });
});
