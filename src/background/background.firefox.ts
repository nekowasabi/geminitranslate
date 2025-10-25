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
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (this.messageHandler) {
        this.messageHandler.handle(message, sender, sendResponse);
        return true; // Indicates async response
      }
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
