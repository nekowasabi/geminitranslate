/**
 * MessageBus Unit Tests
 */

// Create mock functions BEFORE any imports
const mockRuntimeSendMessage = jest.fn();
const mockTabsSendMessage = jest.fn();
const mockOnMessageAddListener = jest.fn();
const mockOnMessageRemoveListener = jest.fn();

// Mock the BrowserAdapter module
jest.mock('@shared/adapters/BrowserAdapter', () => {
  return {
    __esModule: true,
    default: {
      runtime: {
        sendMessage: (...args: any[]) => mockRuntimeSendMessage(...args),
        onMessage: {
          addListener: (...args: any[]) => mockOnMessageAddListener(...args),
          removeListener: (...args: any[]) => mockOnMessageRemoveListener(...args),
        },
      },
      tabs: {
        sendMessage: (...args: any[]) => mockTabsSendMessage(...args),
      },
    },
  };
});

import { MessageBus } from '@shared/messages/MessageBus';
import { MessageType, Message, TranslationRequestMessage } from '@shared/messages/types';

describe('MessageBus', () => {
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = new MessageBus();
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should send a message and return a promise', async () => {
      const mockResponse = { success: true };
      mockRuntimeSendMessage.mockResolvedValue(mockResponse);

      const message: TranslationRequestMessage = {
        type: MessageType.REQUEST_TRANSLATION,
        payload: {
          texts: ['Hello'],
          targetLanguage: 'ja',
        },
      };

      const response = await messageBus.send(message);

      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.REQUEST_TRANSLATION,
          timestamp: expect.any(Number),
        })
      );
      expect(response).toEqual(mockResponse);
    });

    it('should add timestamp to message if not present', async () => {
      mockRuntimeSendMessage.mockResolvedValue({});

      const message: Message = {
        type: MessageType.RESET,
      };

      await messageBus.send(message);

      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle sendMessage errors gracefully', async () => {
      mockRuntimeSendMessage.mockResolvedValue(null);

      const message: Message = {
        type: MessageType.RESET,
      };

      await expect(messageBus.send(message)).resolves.toBeNull();
    });
  });

  describe('listen', () => {
    it('should register a message listener', () => {
      const listener = jest.fn();

      messageBus.listen(listener);

      expect(mockOnMessageAddListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should call listener with correct arguments', () => {
      const listener = jest.fn();
      messageBus.listen(listener);

      // Get the registered listener function
      const registeredListener = mockOnMessageAddListener.mock.calls[0][0];

      const testMessage: Message = {
        type: MessageType.RESET,
      };
      const sender = { id: 'test-sender' };
      const sendResponse = jest.fn();

      registeredListener(testMessage, sender, sendResponse);

      expect(listener).toHaveBeenCalledWith(testMessage, sender, sendResponse);
    });

    it('should filter messages by type when filter is provided', () => {
      const listener = jest.fn();
      messageBus.listen(listener, MessageType.TRANSLATE_PAGE);

      const registeredListener = mockOnMessageAddListener.mock.calls[0][0];

      // Send matching message
      const matchingMessage: Message = {
        type: MessageType.TRANSLATE_PAGE,
        payload: { targetLanguage: 'ja' },
      };
      registeredListener(matchingMessage, {}, jest.fn());

      expect(listener).toHaveBeenCalledTimes(1);

      // Send non-matching message
      const nonMatchingMessage: Message = {
        type: MessageType.RESET,
      };
      registeredListener(nonMatchingMessage, {}, jest.fn());

      // Still called only once
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('unlisten', () => {
    it('should remove a registered listener', () => {
      const listener = jest.fn();
      messageBus.listen(listener);

      messageBus.unlisten(listener);

      expect(mockOnMessageRemoveListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('sendToTab', () => {
    it('should send message to specific tab', async () => {
      const mockResponse = { received: true };
      mockTabsSendMessage.mockResolvedValue(mockResponse);

      const message: Message = {
        type: MessageType.TRANSLATE_PAGE,
        payload: { targetLanguage: 'en' },
      };

      const response = await messageBus.sendToTab(123, message);

      expect(mockTabsSendMessage).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          type: MessageType.TRANSLATE_PAGE,
        })
      );
      expect(response).toEqual(mockResponse);
    });
  });
});
