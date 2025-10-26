/**
 * MessageHandler
 *
 * Handles incoming messages and routes them to appropriate services
 * (TranslationEngine, OpenRouterClient).
 *
 * Features:
 * - Action-based routing with type-safe message handling
 * - Async response support with sendResponse callback
 * - Comprehensive error handling with user-friendly messages
 * - Integration with TranslationEngine and OpenRouterClient
 *
 * Supported Actions:
 * - requestTranslation: Translate batch of texts via TranslationEngine
 * - clearCache: Clear translation cache (memory/session/local/all)
 * - getCacheStats: Get cache statistics
 * - testConnection: Test OpenRouter API connection
 *
 * @example
 * ```typescript
 * const handler = new MessageHandler(engine, client);
 *
 * // Handle translation request
 * handler.handle(
 *   {
 *     type: MessageType.REQUEST_TRANSLATION,
 *     action: 'requestTranslation',
 *     payload: { texts: ['Hello'], targetLanguage: 'Japanese' }
 *   },
 *   sender,
 *   sendResponse
 * );
 * ```
 */

import { TranslationEngine, CacheLayer } from './translationEngine';
import { OpenRouterClient } from './apiClient';
import { logger } from '../shared/utils/logger';

/**
 * Message format expected by MessageHandler
 */
export interface HandlerMessage {
  type: string;
  action?: string;
  payload?: any;
}

/**
 * Success response format
 */
export interface SuccessResponse {
  success: true;
  data: any;
}

/**
 * Error response format
 */
export interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Handler response type
 */
export type HandlerResponse = SuccessResponse | ErrorResponse;

/**
 * Action handler function type
 */
type ActionHandler = (
  payload: any,
  sendResponse: (response: HandlerResponse) => void
) => Promise<void>;

/**
 * MessageHandler routes incoming messages to appropriate services
 */
export class MessageHandler {
  private engine: TranslationEngine;
  private client: OpenRouterClient;
  private actionHandlers: Map<string, ActionHandler>;

  /**
   * Create a new MessageHandler
   * @param engine - TranslationEngine instance
   * @param client - OpenRouterClient instance
   */
  constructor(engine: TranslationEngine, client: OpenRouterClient) {
    this.engine = engine;
    this.client = client;

    // Initialize action handlers map for efficient routing
    this.actionHandlers = new Map([
      ['requestTranslation', this.handleRequestTranslation.bind(this)],
      ['clearCache', this.handleClearCache.bind(this)],
      ['getCacheStats', this.handleGetCacheStats.bind(this)],
      ['testConnection', this.handleTestConnection.bind(this)],
    ]);
  }

  /**
   * Handle incoming message and route to appropriate action
   * @param message - The message to handle
   * @param sender - Message sender information
   * @param sendResponse - Callback to send response
   * @returns true to indicate async response
   */
  async handle(
    message: HandlerMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: HandlerResponse) => void
  ): Promise<boolean> {
    try {
      // Validate message format with fallback support
      const action = message.action || this.inferActionFromType(message.type);

      if (!action) {
        logger.error('MessageHandler: Invalid message format', {
          type: message.type,
          hasAction: !!message.action,
          message,
        });
        sendResponse({
          success: false,
          error: `Invalid message format: missing action property (type: ${message.type})`,
        });
        return true;
      }

      // Route to appropriate handler using action map
      const payload = message.payload || {};
      const handler = this.actionHandlers.get(action);

      if (handler) {
        await handler(payload, sendResponse);
      } else {
        sendResponse({
          success: false,
          error: `Unknown action: ${action}`,
        });
      }
    } catch (error) {
      logger.error('MessageHandler: Unexpected error', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }

    // Return true to indicate async response
    return true;
  }

  /**
   * Infer action from message type for backward compatibility
   * @param type - Message type
   * @returns Inferred action or undefined
   */
  private inferActionFromType(type: string): string | undefined {
    const typeToActionMap: Record<string, string> = {
      'requestTranslation': 'requestTranslation',
      'testConnection': 'testConnection',
      'clearCache': 'clearCache',
      'getCacheStats': 'getCacheStats',
    };
    return typeToActionMap[type];
  }

  /**
   * Handle requestTranslation action
   */
  private async handleRequestTranslation(
    payload: any,
    sendResponse: (response: HandlerResponse) => void
  ): Promise<void> {
    try {
      const { texts, targetLanguage } = payload;

      if (!texts || !Array.isArray(texts)) {
        sendResponse({
          success: false,
          error: 'Invalid payload: texts must be an array',
        });
        return;
      }

      if (!targetLanguage) {
        sendResponse({
          success: false,
          error: 'Invalid payload: targetLanguage is required',
        });
        return;
      }

      // Call TranslationEngine
      const translations = await this.engine.translateBatch(texts, targetLanguage);

      sendResponse({
        success: true,
        data: { translations },
      });
    } catch (error) {
      logger.error('MessageHandler: Translation error', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed',
      });
    }
  }

  /**
   * Handle clearCache action
   */
  private async handleClearCache(
    payload: any,
    sendResponse: (response: HandlerResponse) => void
  ): Promise<void> {
    try {
      const layer: CacheLayer = payload.layer || 'all';

      // Call TranslationEngine
      await this.engine.clearCache(layer);

      sendResponse({
        success: true,
        data: { message: 'Cache cleared successfully' },
      });
    } catch (error) {
      logger.error('MessageHandler: Clear cache error', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear cache',
      });
    }
  }

  /**
   * Handle getCacheStats action
   */
  private async handleGetCacheStats(
    payload: any,
    sendResponse: (response: HandlerResponse) => void
  ): Promise<void> {
    try {
      // Call TranslationEngine
      const stats = await this.engine.getCacheStats();

      sendResponse({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('MessageHandler: Get cache stats error', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cache stats',
      });
    }
  }

  /**
   * Handle testConnection action
   */
  private async handleTestConnection(
    payload: any,
    sendResponse: (response: HandlerResponse) => void
  ): Promise<void> {
    try {
      // Call OpenRouterClient
      const result = await this.client.testConnection();

      sendResponse({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('MessageHandler: Test connection error', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      });
    }
  }
}
