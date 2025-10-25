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
            targetLanguage: 'Japanese', // Default language
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
            targetLanguage: 'Japanese',
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
            targetLanguage: 'Japanese',
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
            targetLanguage: 'Japanese',
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
    it('should use default target language', async () => {
      // Arrange
      const command = 'translate-page';

      // Act
      await handler.handle(command, mockTab);

      // Assert
      const call = mockMessageBus.sendToTab.mock.calls[0];
      expect(call[1].payload.targetLanguage).toBe('Japanese');
    });

    it('should support custom target language in constructor', async () => {
      // Arrange
      const customHandler = new CommandHandler(mockMessageBus, 'Spanish');
      const command = 'translate-page';

      // Act
      await customHandler.handle(command, mockTab);

      // Assert
      const call = mockMessageBus.sendToTab.mock.calls[0];
      expect(call[1].payload.targetLanguage).toBe('Spanish');
    });
  });
});
