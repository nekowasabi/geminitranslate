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

import { TranslationEngine, CacheLayer } from "./translationEngine";
import { OpenRouterClient } from "./apiClient";
import { logger } from "../shared/utils/logger";
import {
  MessageType,
  BatchCompletedMessage,
  TranslationPhase,
} from "../shared/messages/types";

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
  sendResponse: (response: HandlerResponse) => void,
  sender?: chrome.runtime.MessageSender,
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
      ["requestTranslation", this.handleRequestTranslation.bind(this)],
      ["clearCache", this.handleClearCache.bind(this)],
      ["getCacheStats", this.handleGetCacheStats.bind(this)],
      ["testConnection", this.handleTestConnection.bind(this)],
      ["reloadConfig", this.handleReloadConfig.bind(this)],
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
    sendResponse: (response?: HandlerResponse) => void,
  ): Promise<boolean> {
    const timestamp = new Date().toISOString();
    console.log(`[Background:MessageHandler] ${timestamp} - handle() called:`, {
      messageType: message.type,
      action: message.action,
      payload: message.payload,
      sender: {
        tabId: sender.tab?.id,
        url: sender.url,
      },
    });

    try {
      // Validate message format with fallback support
      const action = message.action || this.inferActionFromType(message.type);

      console.log(
        `[Background:MessageHandler] ${timestamp} - Action resolved:`,
        {
          originalAction: message.action,
          inferredAction: this.inferActionFromType(message.type),
          finalAction: action,
        },
      );

      if (!action) {
        console.error(
          `[Background:MessageHandler] ${timestamp} - Invalid message format:`,
          {
            type: message.type,
            hasAction: !!message.action,
            message,
          },
        );
        logger.error("MessageHandler: Invalid message format", {
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
        console.log(
          `[Background:MessageHandler] ${timestamp} - Routing to handler:`,
          {
            action,
            payload,
          },
        );
        await handler(payload, sendResponse, sender);
      } else {
        console.error(
          `[Background:MessageHandler] ${timestamp} - Unknown action:`,
          action,
        );
        sendResponse({
          success: false,
          error: `Unknown action: ${action}`,
        });
      }
    } catch (error) {
      console.error(
        `[Background:MessageHandler] ${timestamp} - Unexpected error:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("MessageHandler: Unexpected error", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
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
      requestTranslation: "requestTranslation",
      testConnection: "testConnection",
      clearCache: "clearCache",
      getCacheStats: "getCacheStats",
    };
    return typeToActionMap[type];
  }

  /**
   * Handle requestTranslation action
   *
   * Supports viewport-priority translation with semi-parallel processing:
   * - `semiParallel`: Enable semi-parallel batch processing (first N batches sequential, rest parallel)
   * - `priorityCount`: Number of batches to process sequentially (default: 1)
   * - `phase`: Translation phase (1: Viewport, 2: Full-page)
   *
   * When semiParallel is enabled, sends BATCH_COMPLETED messages to Content Script
   * after each batch completes for progressive rendering.
   */
  private async handleRequestTranslation(
    payload: any,
    sendResponse: (response: HandlerResponse) => void,
    sender?: chrome.runtime.MessageSender,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(
      `[Background:MessageHandler] ${timestamp} - handleRequestTranslation() called:`,
      {
        payload,
        sender: {
          tabId: sender?.tab?.id,
          url: sender?.url,
        },
      },
    );

    try {
      const { texts, targetLanguage, semiParallel, priorityCount, phase } =
        payload;

      console.log(
        `[Background:MessageHandler] ${timestamp} - Validating payload:`,
        {
          hasTexts: !!texts,
          isArray: Array.isArray(texts),
          textsCount: Array.isArray(texts) ? texts.length : 0,
          targetLanguage,
          semiParallel,
          priorityCount,
        },
      );

      if (!texts || !Array.isArray(texts)) {
        console.error(
          `[Background:MessageHandler] ${timestamp} - Invalid payload: texts must be an array`,
        );
        sendResponse({
          success: false,
          error: "Invalid payload: texts must be an array",
        });
        return;
      }

      if (!targetLanguage) {
        console.error(
          `[Background:MessageHandler] ${timestamp} - Invalid payload: targetLanguage is required`,
        );
        sendResponse({
          success: false,
          error: "Invalid payload: targetLanguage is required",
        });
        return;
      }

      // Setup BATCH_COMPLETED callback for semi-parallel mode
      let onBatchComplete;
      if (semiParallel && sender?.tab?.id) {
        const tabId = sender.tab.id;
        const totalItems = texts.length;
        let completedItems = 0;
        const translationPhase: TranslationPhase = phase || 1;

        onBatchComplete = (
          batchIndex: number,
          translations: string[],
          nodeIndices: number[],
        ): void => {
          const translatedCount =
            Array.isArray(nodeIndices) && nodeIndices.length > 0
              ? nodeIndices.length
              : translations.length;
          completedItems = Math.min(
            totalItems,
            completedItems + translatedCount,
          );
          const percentage =
            totalItems > 0
              ? Math.round((completedItems / totalItems) * 100)
              : 100;

          console.log(
            `[Background:MessageHandler] ${timestamp} - Batch ${batchIndex} completed, sending BATCH_COMPLETED:`,
            {
              tabId,
              batchIndex,
              translationsCount: translations.length,
              nodeIndices,
              phase: translationPhase,
              progress: {
                current: completedItems,
                total: totalItems,
                percentage,
              },
            },
          );

          try {
            // Send BATCH_COMPLETED message to Content Script
            chrome.tabs.sendMessage(tabId, {
              type: MessageType.BATCH_COMPLETED,
              payload: {
                batchIndex,
                translations,
                nodeIndices,
                phase: translationPhase,
                progress: {
                  current: completedItems,
                  total: totalItems,
                  percentage,
                },
              },
            } as BatchCompletedMessage);
          } catch (error) {
            console.error(
              `[Background:MessageHandler] Failed to send BATCH_COMPLETED to tab ${tabId}:`,
              error,
            );
          }
        };
      }

      // Call TranslationEngine with optional semi-parallel processing
      console.log(
        `[Background:MessageHandler] ${timestamp} - Calling TranslationEngine.translateBatch():`,
        {
          textsCount: texts.length,
          targetLanguage,
          semiParallel: semiParallel || false,
          priorityCount: priorityCount ?? undefined,
          hasBatchCallback: !!onBatchComplete,
          firstText: texts[0]?.substring(0, 50),
        },
      );

      const translations = semiParallel
        ? await this.engine.translateBatchSemiParallel(
            texts,
            targetLanguage,
            priorityCount ?? 1,
            onBatchComplete,
          )
        : await this.engine.translateBatch(texts, targetLanguage);

      console.log(
        `[Background:MessageHandler] ${timestamp} - Translation successful:`,
        {
          translationsCount: translations.length,
          firstTranslation: translations[0]?.substring(0, 50),
        },
      );

      sendResponse({
        success: true,
        data: { translations },
      });
    } catch (error) {
      console.error(
        `[Background:MessageHandler] ${timestamp} - Translation error:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("MessageHandler: Translation error", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Translation failed",
      });
    }
  }

  /**
   * Handle clearCache action
   */
  private async handleClearCache(
    payload: any,
    sendResponse: (response: HandlerResponse) => void,
    sender?: chrome.runtime.MessageSender,
  ): Promise<void> {
    try {
      const layer: CacheLayer = payload.layer || "all";

      // Call TranslationEngine
      await this.engine.clearCache(layer);

      sendResponse({
        success: true,
        data: { message: "Cache cleared successfully" },
      });
    } catch (error) {
      logger.error("MessageHandler: Clear cache error", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Failed to clear cache",
      });
    }
  }

  /**
   * Handle getCacheStats action
   */
  private async handleGetCacheStats(
    payload: any,
    sendResponse: (response: HandlerResponse) => void,
    sender?: chrome.runtime.MessageSender,
  ): Promise<void> {
    try {
      // Call TranslationEngine
      const stats = await this.engine.getCacheStats();

      sendResponse({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("MessageHandler: Get cache stats error", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get cache stats",
      });
    }
  }

  /**
   * Handle testConnection action
   *
   * Supports two modes:
   * 1. With payload: Test temporary config without saving (for Options UI preview)
   * 2. Without payload: Test saved config from storage (backward compatibility)
   */
  private async handleTestConnection(
    payload: any,
    sendResponse: (response: HandlerResponse) => void,
    sender?: chrome.runtime.MessageSender,
  ): Promise<void> {
    try {
      let result;

      // Check if payload contains temporary config to test
      if (payload?.apiKey !== undefined) {
        // Mode 1: Test temporary config (Options UI - before saving)
        result = await this.client.testConnectionWithConfig({
          apiKey: payload.apiKey || "",
          model: payload.model || "",
          provider: payload.provider,
        });
      } else {
        // Mode 2: Test saved config (backward compatibility)
        result = await this.client.testConnection();
      }

      sendResponse({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("MessageHandler: Test connection error", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : "Connection test failed",
      });
    }
  }

  /**
   * Handle config reload request
   *
   * Options画面で設定を保存した後に呼ばれ、OpenRouterClientの設定を再初期化する。
   * これにより、拡張機能を再起動せずに新しい設定を反映できる。
   */
  private async handleReloadConfig(
    payload: any,
    sendResponse: (response: HandlerResponse) => void,
    sender?: chrome.runtime.MessageSender,
  ): Promise<void> {
    try {
      console.log("[MessageHandler] Reloading OpenRouterClient config...");
      await this.client.initialize();
      console.log("[MessageHandler] Config reloaded successfully");

      sendResponse({
        success: true,
        data: { message: "Configuration reloaded successfully" },
      });
    } catch (error) {
      console.error("[MessageHandler] Failed to reload config:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to reload config",
      });
    }
  }
}
