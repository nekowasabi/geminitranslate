/**
 * Chrome Service Worker Entry Point
 *
 * Initializes background service for Chrome extension using:
 * - MessageHandler for message routing
 * - CommandHandler for keyboard shortcuts
 * - KeepAlive mechanism to prevent service worker termination
 *
 * Chrome Service Worker特性:
 * - Event-driven architecture
 * - Automatic termination after ~30 seconds of inactivity
 * - KeepAlive mechanism required for long-running operations
 * - manifest.json v3 required
 *
 * @example
 * webpack.config.js:
 * ```javascript
 * entry: {
 *   background: './src/background/service.chrome.ts'
 * }
 * ```
 */

import { TranslationEngine } from './translationEngine';
import { OpenRouterClient } from './apiClient';
import { MessageHandler } from './messageHandler';
import { CommandHandler } from './commandHandler';
import { KeepAlive } from './keepAlive';
import { MessageBus } from '../shared/messages/MessageBus';
import { logger } from '../shared/utils/logger';

/**
 * BackgroundService manages Chrome service worker lifecycle
 */
class BackgroundService {
  private messageHandler: MessageHandler | null = null;
  private commandHandler: CommandHandler | null = null;
  private keepAlive: KeepAlive | null = null;
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
      logger.log('BackgroundService (Chrome): Starting...');

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

      // Start keep-alive mechanism
      this.keepAlive = new KeepAlive();
      await this.keepAlive.start();

      logger.log('BackgroundService (Chrome): Started successfully');
    } catch (error) {
      logger.error('BackgroundService (Chrome): Failed to start', error);
    }
  }

  /**
   * Setup chrome.runtime.onMessage listener
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (this.messageHandler) {
        this.messageHandler.handle(message, sender, sendResponse);
        return true; // Indicates async response
      }
      return false;
    });

    logger.log('BackgroundService (Chrome): Message listener registered');
  }

  /**
   * Setup chrome.commands.onCommand listener
   */
  private setupCommandListener(): void {
    chrome.commands.onCommand.addListener((command, tab) => {
      if (this.commandHandler && tab) {
        this.commandHandler.handle(command, tab);
      }
    });

    logger.log('BackgroundService (Chrome): Command listener registered');
  }
}

// Initialize and start the service
const service = new BackgroundService();
service.start();
