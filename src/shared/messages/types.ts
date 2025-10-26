/**
 * Message Type Definitions for Extension Messaging
 */

export enum MessageType {
  // Translation Actions
  TRANSLATE_PAGE = 'translate',
  TRANSLATE_SELECTION = 'translateSelection',
  TRANSLATE_CLIPBOARD = 'translateClipboard',
  REQUEST_TRANSLATION = 'requestTranslation',
  RESET = 'reset',

  // Status Updates
  TRANSLATION_STARTED = 'translationStarted',
  TRANSLATION_PROGRESS = 'translationProgress',
  TRANSLATION_COMPLETED = 'translationCompleted',
  TRANSLATION_ERROR = 'translationError',

  // Settings
  SETTINGS_CHANGED = 'settingsChanged',
  API_KEY_UPDATED = 'apiKeyUpdated',
  RELOAD_CONFIG = 'reloadConfig',

  // Connection Test
  TEST_CONNECTION = 'testConnection',
}

/**
 * Base Message Interface
 */
export interface BaseMessage {
  type: MessageType;
  timestamp?: number;
}

/**
 * Translation Request Message
 *
 * Content ScriptからBackground Scriptへ翻訳リクエストを送信する際に使用。
 * MessageHandlerは`action`プロパティを使用してハンドラーをルーティングする。
 *
 * @example
 * ```typescript
 * const message: TranslationRequestMessage = {
 *   type: MessageType.REQUEST_TRANSLATION,
 *   action: 'requestTranslation',
 *   payload: {
 *     texts: ['Hello', 'World'],
 *     targetLanguage: 'Japanese',
 *   },
 * };
 * ```
 */
export interface TranslationRequestMessage extends BaseMessage {
  type: MessageType.REQUEST_TRANSLATION;
  action: 'requestTranslation';
  payload: {
    texts: string[];
    targetLanguage: string;
  };
}

/**
 * Translation Response Message
 */
export interface TranslationResponseMessage extends BaseMessage {
  type: MessageType.TRANSLATION_COMPLETED;
  payload: {
    translations: string[];
  };
}

/**
 * Page Translation Message
 */
export interface PageTranslationMessage extends BaseMessage {
  type: MessageType.TRANSLATE_PAGE;
  payload: {
    targetLanguage: string;
  };
}

/**
 * Selection Translation Message
 */
export interface SelectionTranslationMessage extends BaseMessage {
  type: MessageType.TRANSLATE_SELECTION;
  payload: {
    targetLanguage: string;
  };
}

/**
 * Clipboard Translation Message
 */
export interface ClipboardTranslationMessage extends BaseMessage {
  type: MessageType.TRANSLATE_CLIPBOARD;
  payload: {
    targetLanguage: string;
  };
}

/**
 * Translation Progress Message
 *
 * Sent from Background Script to Content Script during batch translation
 * to update the progress notification UI in real-time.
 *
 * **Direction**: Background → Content
 * **Trigger**: After each translation batch completes
 * **Handler**: ContentScript.handleMessage() → ProgressNotification.update()
 *
 * @example
 * ```typescript
 * // Background Script sends progress update
 * browser.tabs.sendMessage(tabId, {
 *   type: MessageType.TRANSLATION_PROGRESS,
 *   payload: {
 *     current: 5,      // Completed batches
 *     total: 10,       // Total batches
 *     percentage: 50,  // 50% complete
 *   },
 * });
 * ```
 */
export interface TranslationProgressMessage extends BaseMessage {
  type: MessageType.TRANSLATION_PROGRESS;
  payload: {
    /**
     * Number of completed translation batches
     */
    current: number;

    /**
     * Total number of translation batches
     */
    total: number;

    /**
     * Completion percentage (0-100)
     */
    percentage: number;
  };
}

/**
 * Translation Error Message
 *
 * Sent from Background Script to Content Script when a translation error occurs.
 * Displays error notification to user without auto-hiding.
 *
 * **Direction**: Background → Content
 * **Trigger**: Translation API failure, network error, or other exceptions
 * **Handler**: ContentScript.handleMessage() → ProgressNotification.error()
 *
 * @example
 * ```typescript
 * // Background Script sends error notification
 * browser.tabs.sendMessage(tabId, {
 *   type: MessageType.TRANSLATION_ERROR,
 *   payload: {
 *     error: 'API rate limit exceeded',
 *     code: 'RATE_LIMIT',  // Optional error code for categorization
 *   },
 * });
 * ```
 *
 * **Common Error Codes**:
 * - `RATE_LIMIT`: API rate limit exceeded
 * - `NETWORK_ERROR`: Network connection failed
 * - `AUTH_ERROR`: API key invalid or missing
 * - `TIMEOUT`: Request timeout
 */
export interface TranslationErrorMessage extends BaseMessage {
  type: MessageType.TRANSLATION_ERROR;
  payload: {
    /**
     * Human-readable error message
     */
    error: string;

    /**
     * Optional error code for programmatic error handling
     */
    code?: string;
  };
}

/**
 * Reset Message
 */
export interface ResetMessage extends BaseMessage {
  type: MessageType.RESET;
}

/**
 * Test Connection Message
 *
 * Options UIからBackground Scriptへ接続テストリクエストを送信する際に使用。
 * payloadに設定を含めることで、保存前の設定をテストできる。
 *
 * @example
 * ```typescript
 * // 現在のUI設定でテスト（保存前）
 * const message: TestConnectionMessage = {
 *   type: MessageType.TEST_CONNECTION,
 *   action: 'testConnection',
 *   payload: {
 *     apiKey: 'sk-or-...',
 *     model: 'google/gemini-2.0-flash-exp:free',
 *     provider: 'Google',
 *   },
 * };
 *
 * // 保存済み設定でテスト（従来通り）
 * const message: TestConnectionMessage = {
 *   type: MessageType.TEST_CONNECTION,
 *   action: 'testConnection',
 * };
 * ```
 */
export interface TestConnectionMessage extends BaseMessage {
  type: MessageType.TEST_CONNECTION;
  action: 'testConnection';
  payload?: {
    /**
     * OpenRouter API key (optional - if not provided, uses saved config)
     */
    apiKey?: string;
    /**
     * Model identifier (optional - if not provided, uses saved config)
     */
    model?: string;
    /**
     * Provider preference (optional - if not provided, uses saved config)
     */
    provider?: string;
  };
}

/**
 * Reload Config Message
 *
 * Options画面で設定を保存した後、Background Scriptに通知してOpenRouterClientの
 * 設定を再初期化する際に使用。
 *
 * @example
 * ```typescript
 * // Settings保存後に送信
 * const message: ReloadConfigMessage = {
 *   type: MessageType.RELOAD_CONFIG,
 *   action: 'reloadConfig',
 *   payload: {},
 * };
 * ```
 */
export interface ReloadConfigMessage extends BaseMessage {
  type: MessageType.RELOAD_CONFIG;
  action: 'reloadConfig';
  payload?: Record<string, never>;
}

/**
 * Union Type for All Messages
 */
export type Message =
  | TranslationRequestMessage
  | TranslationResponseMessage
  | PageTranslationMessage
  | SelectionTranslationMessage
  | ClipboardTranslationMessage
  | TranslationProgressMessage
  | TranslationErrorMessage
  | ResetMessage
  | TestConnectionMessage
  | ReloadConfigMessage;

/**
 * Message Listener Callback Type
 */
export type MessageListener<T extends Message = Message> = (
  message: T,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void | Promise<void>;
