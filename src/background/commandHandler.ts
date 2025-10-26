/**
 * CommandHandler
 *
 * Handles browser keyboard shortcuts (commands) and routes them to
 * content scripts via MessageBus.
 *
 * Features:
 * - Command-based routing with type-safe message handling
 * - Automatic active tab detection
 * - Integration with MessageBus for cross-context communication
 * - Comprehensive error handling
 *
 * Supported Commands:
 * - translate-page (Alt+W): Translate entire page
 * - translate-selection (Alt+Y): Translate selected text
 * - translate-clipboard (Alt+C): Translate clipboard content
 *
 * @example
 * ```typescript
 * const handler = new CommandHandler(messageBus, 'Japanese');
 *
 * // Handle command from keyboard shortcut
 * handler.handle('translate-page', tab);
 * ```
 */

import BrowserAdapter from '../shared/adapters/BrowserAdapter';
import { MessageBus } from '../shared/messages/MessageBus';
import { MessageType, PageTranslationMessage } from '../shared/messages/types';
import { logger } from '../shared/utils/logger';
import StorageManager from '../shared/storage/StorageManager';

/**
 * Command handler function type
 */
type CommandHandlerFunction = (tabId: number) => Promise<{success: boolean; error?: string}>;

/**
 * CommandHandler processes browser commands and sends messages to tabs
 */
export class CommandHandler {
  private messageBus: MessageBus;
  private targetLanguage: string;
  private commandHandlers: Map<string, CommandHandlerFunction>;

  /**
   * Create a new CommandHandler
   * @param messageBus - MessageBus instance for sending messages
   * @param targetLanguage - Default target language code (default: 'ja' for Japanese)
   */
  constructor(messageBus: MessageBus, targetLanguage: string = 'ja') {
    this.messageBus = messageBus;
    this.targetLanguage = targetLanguage;

    // Initialize command handlers map for efficient routing
    this.commandHandlers = new Map([
      ['translate-page', this.sendTranslatePageMessage.bind(this)],
      ['translate-selection', this.sendTranslateSelectionMessage.bind(this)],
      ['translate-clipboard', this.sendTranslateClipboardMessage.bind(this)],
    ]);
  }

  /**
   * Handle browser command
   * @param command - Command name (e.g., 'translate-page')
   * @param tab - Optional tab to send message to (will query for active tab if not provided)
   */
  async handle(command: string, tab?: chrome.tabs.Tab): Promise<void> {
    try {
      // Get active tab if not provided
      let targetTab = tab;
      if (!targetTab) {
        const tabs = await BrowserAdapter.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (tabs.length === 0) {
          logger.warn('CommandHandler: No active tab found');
          return;
        }

        targetTab = tabs[0];
      }

      // Validate tab has id
      if (!targetTab.id) {
        logger.warn('CommandHandler: Active tab has no id');
        return;
      }

      // Route to appropriate handler using command map
      const handler = this.commandHandlers.get(command);
      if (handler) {
        await handler(targetTab.id);
      } else {
        logger.warn('CommandHandler: Unknown command', command);
      }
    } catch (error) {
      logger.error('CommandHandler: Error handling command', error);
    }
  }

  /**
   * Handle message from popup and forward to content script
   * @param message - Message from popup
   * @param tabId - Target tab ID
   * @returns Response from content script
   */
  async handleMessage(message: any, tabId: number): Promise<{success: boolean; error?: string}> {
    const timestamp = new Date().toISOString();
    console.log(`[Background:CommandHandler] ${timestamp} - handleMessage() called:`, {
      messageType: message.type,
      tabId,
      payload: message.payload
    });

    try {
      let response: {success: boolean; error?: string};

      switch (message.type) {
        case MessageType.TRANSLATE_PAGE:
          console.log(`[Background:CommandHandler] ${timestamp} - Routing TRANSLATE_PAGE to tab ${tabId}`);
          response = await this.sendTranslatePageMessage(tabId);
          break;
        case MessageType.TRANSLATE_SELECTION:
          console.log(`[Background:CommandHandler] ${timestamp} - Routing TRANSLATE_SELECTION to tab ${tabId}`);
          response = await this.sendTranslateSelectionMessage(tabId);
          break;
        case MessageType.TRANSLATE_CLIPBOARD:
          console.log(`[Background:CommandHandler] ${timestamp} - Routing TRANSLATE_CLIPBOARD to tab ${tabId}`);
          response = await this.sendTranslateClipboardMessage(tabId);
          break;
        default:
          console.warn(`[Background:CommandHandler] ${timestamp} - Unknown message type:`, message.type);
          logger.warn('CommandHandler: Unknown message type', message.type);
          return { success: false, error: `Unknown message type: ${message.type}` };
      }

      console.log(`[Background:CommandHandler] ${timestamp} - Message sent successfully to tab ${tabId}`, response);
      return response;
    } catch (error) {
      console.error(`[Background:CommandHandler] ${timestamp} - Error handling message:`, {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      logger.error('CommandHandler: Error handling message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send TRANSLATE_PAGE message to tab
   * @returns Response from content script
   */
  private async sendTranslatePageMessage(tabId: number): Promise<{success: boolean; error?: string}> {
    const timestamp = new Date().toISOString();

    // Get latest language setting from Storage
    const storageManager = new StorageManager();
    const targetLanguage = await storageManager.getTargetLanguage();

    console.log(`[Background:CommandHandler] ${timestamp} - sendTranslatePageMessage() - Preparing message:`, {
      tabId,
      targetLanguage
    });

    try {
      const message: PageTranslationMessage = {
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage,
        },
      };

      console.log(`[Background:CommandHandler] ${timestamp} - Sending to tab via MessageBus:`, {
        tabId,
        message
      });

      const response = await this.messageBus.sendToTab<{success: boolean}>(tabId, message);

      console.log(`[Background:CommandHandler] ${timestamp} - Message sent successfully to tab ${tabId}`, response);

      return response || { success: true };
    } catch (error) {
      console.error(`[Background:CommandHandler] ${timestamp} - Failed to send message:`, {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        tabId
      });
      logger.error('CommandHandler: Failed to send message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send TRANSLATE_SELECTION message to tab
   * @returns Response from content script
   */
  private async sendTranslateSelectionMessage(tabId: number): Promise<{success: boolean; error?: string}> {
    try {
      // Get latest language setting from Storage
      const storageManager = new StorageManager();
      const targetLanguage = await storageManager.getTargetLanguage();

      const response = await this.messageBus.sendToTab<{success: boolean}>(tabId, {
        type: MessageType.TRANSLATE_SELECTION,
        payload: {
          targetLanguage,
        },
      });
      return response || { success: true };
    } catch (error) {
      logger.error('CommandHandler: Failed to send message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send TRANSLATE_CLIPBOARD message to tab
   * @returns Response from content script
   */
  private async sendTranslateClipboardMessage(tabId: number): Promise<{success: boolean; error?: string}> {
    try {
      // Get latest language setting from Storage
      const storageManager = new StorageManager();
      const targetLanguage = await storageManager.getTargetLanguage();

      const response = await this.messageBus.sendToTab<{success: boolean}>(tabId, {
        type: MessageType.TRANSLATE_CLIPBOARD,
        payload: {
          targetLanguage,
        },
      });
      return response || { success: true };
    } catch (error) {
      logger.error('CommandHandler: Failed to send message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
