/**
 * Firefox Background Script Entry Point
 *
 * Initializes background script for Firefox extension using:
 * - MessageHandler for message routing
 * - CommandHandler for keyboard shortcuts
 *
 * Firefox Background Script特性:
 * - Persistent background page (非Service Worker)
 * - KeepAlive不要（常時起動）
 * - browser API使用（chrome APIとの互換性はBrowserAdapterで吸収）
 * - manifest.json v2使用
 *
 * @example
 * webpack.config.js:
 * ```javascript
 * entry: {
 *   background: './src/background/background.firefox.ts'
 * }
 * ```
 */

import { TranslationEngine } from './translationEngine';
import { OpenRouterClient } from './apiClient';
import { MessageHandler } from './messageHandler';
import { CommandHandler } from './commandHandler';
import { MessageBus } from '../shared/messages/MessageBus';
import { MessageType } from '../shared/messages/types';
import { logger } from '../shared/utils/logger';

/**
 * BackgroundService manages Firefox background script lifecycle
 */
class BackgroundService {
  private messageHandler: MessageHandler | null = null;
  private commandHandler: CommandHandler | null = null;
  private messageBus: MessageBus;
  private engine: TranslationEngine | null = null;
  private client: OpenRouterClient | null = null;

  constructor() {
    this.messageBus = new MessageBus();
  }

  /**
   * Initialize and start the background service
   */
  async start(): Promise<void> {
    try {
      logger.log('BackgroundService (Firefox): Starting...');

      // Initialize translation engine (it creates OpenRouterClient internally)
      this.engine = new TranslationEngine();
      await this.engine.initialize();

      // Get client from engine for MessageHandler
      this.client = (this.engine as any).apiClient;

      if (!this.client) {
        throw new Error('Failed to initialize OpenRouterClient');
      }

      // Initialize handlers
      this.messageHandler = new MessageHandler(this.engine, this.client);
      this.commandHandler = new CommandHandler(this.messageBus);

      // Setup listeners
      this.setupMessageListener();
      this.setupCommandListener();

      logger.log('BackgroundService (Firefox): Started successfully');
    } catch (error) {
      logger.error('BackgroundService (Firefox): Failed to start', error);
    }
  }

  /**
   * Setup browser.runtime.onMessage listener
   */
  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      const timestamp = new Date().toISOString();
      console.log(`[Background:Firefox] ${timestamp} - Received message:`, {
        type: message.type,
        typeOf: typeof message.type,
        typeValue: message.type,
        action: message.action,
        payload: message.payload,
        sender: {
          tabId: sender.tab?.id,
          url: sender.url,
          frameId: sender.frameId
        }
      });

      // CommandHandler: TRANSLATE_PAGE, TRANSLATE_SELECTION, TRANSLATE_CLIPBOARD
      if (
        message.type === MessageType.TRANSLATE_PAGE ||
        message.type === MessageType.TRANSLATE_SELECTION ||
        message.type === MessageType.TRANSLATE_CLIPBOARD
      ) {
        // Popupからのメッセージの場合、sender.tabがundefinedになる
        // アクティブタブを動的に取得
        let tabId = sender.tab?.id;

        if (!tabId) {
          try {
            const tabs = await browser.tabs.query({
              active: true,
              currentWindow: true
            });
            tabId = tabs[0]?.id;
            console.log(`[Background:Firefox] ${timestamp} - Resolved active tab ID:`, tabId);
          } catch (error) {
            console.error(`[Background:Firefox] ${timestamp} - Failed to get active tab:`, error);
          }
        }

        console.log(`[Background:Firefox] ${timestamp} - Routing to CommandHandler:`, {
          messageType: message.type,
          tabId
        });

        if (this.commandHandler && tabId) {
          // CommandHandler は content script への転送のみを担当
          try {
            const response = await this.commandHandler.handleMessage(message, tabId);
            console.log(`[Background:Firefox] ${timestamp} - CommandHandler response:`, response);
            sendResponse({ status: 'started', ...response });
          } catch (error) {
            console.error(`[Background:Firefox] ${timestamp} - CommandHandler error:`, error);
            sendResponse({
              status: 'error',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        } else {
          console.error(`[Background:Firefox] ${timestamp} - Cannot route to CommandHandler:`, {
            hasHandler: !!this.commandHandler,
            hasTabId: !!tabId
          });
          sendResponse({
            success: false,
            error: 'CommandHandler not available or tab ID missing'
          });
        }
        return true; // async response
      }

      // MessageHandler: requestTranslation, clearCache, getCacheStats, testConnection
      console.log(`[Background:Firefox] ${timestamp} - Routing to MessageHandler:`, {
        messageType: message.type,
        action: message.action
      });

      if (this.messageHandler) {
        this.messageHandler.handle(message, sender, sendResponse);
        return true; // async response
      }

      console.warn(`[Background:Firefox] ${timestamp} - No handler available for message:`, message);
      return false;
    });

    logger.log('BackgroundService (Firefox): Message listener registered');
  }

  /**
   * Setup browser.commands.onCommand listener
   */
  private setupCommandListener(): void {
    browser.commands.onCommand.addListener((command) => {
      if (this.commandHandler) {
        // Get active tab for command handler
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs[0]) {
            this.commandHandler!.handle(command, tabs[0]);
          }
        });
      }
    });

    logger.log('BackgroundService (Firefox): Command listener registered');
  }
}

// Initialize and start the service
const service = new BackgroundService();
service.start();
