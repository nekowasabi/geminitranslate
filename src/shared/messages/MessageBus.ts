/**
 * MessageBus - Type-safe message passing abstraction for Chrome/Firefox
 */

import BrowserAdapter from '../adapters/BrowserAdapter';
import { Message, MessageType, MessageListener } from './types';

/**
 * MessageBus provides type-safe messaging between extension components
 */
export class MessageBus {
  private listeners: Map<MessageListener, Function> = new Map();

  /**
   * Send a message to the background script or content script
   * @param message - The message to send
   * @returns Promise resolving to the response
   */
  async send<T = any>(message: Message): Promise<T> {
    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || Date.now(),
    };

    return BrowserAdapter.runtime.sendMessage<T>(messageWithTimestamp);
  }

  /**
   * Send a message to a specific tab
   * @param tabId - The tab ID to send the message to
   * @param message - The message to send
   * @returns Promise resolving to the response
   */
  async sendToTab<T = any>(tabId: number, message: Message): Promise<T> {
    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || Date.now(),
    };

    return BrowserAdapter.tabs.sendMessage<T>(tabId, messageWithTimestamp);
  }

  /**
   * Listen for messages
   * @param listener - The listener callback
   * @param filter - Optional message type filter
   */
  listen(listener: MessageListener, filter?: MessageType): void {
    const wrappedListener = (
      message: Message,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      // Apply filter if provided
      if (filter && message.type !== filter) {
        return false;
      }

      return listener(message, sender, sendResponse) || false;
    };

    // Store the wrapped listener for later removal
    this.listeners.set(listener, wrappedListener);

    BrowserAdapter.runtime.onMessage.addListener(wrappedListener as any);
  }

  /**
   * Remove a message listener
   * @param listener - The listener to remove
   */
  unlisten(listener: MessageListener): void {
    const wrappedListener = this.listeners.get(listener);
    if (wrappedListener) {
      BrowserAdapter.runtime.onMessage.removeListener(wrappedListener as any);
      this.listeners.delete(listener);
    }
  }
}

export default new MessageBus();
