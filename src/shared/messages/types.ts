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
 */
export interface TranslationRequestMessage extends BaseMessage {
  type: MessageType.REQUEST_TRANSLATION;
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
 */
export interface TranslationProgressMessage extends BaseMessage {
  type: MessageType.TRANSLATION_PROGRESS;
  payload: {
    current: number;
    total: number;
    percentage: number;
  };
}

/**
 * Translation Error Message
 */
export interface TranslationErrorMessage extends BaseMessage {
  type: MessageType.TRANSLATION_ERROR;
  payload: {
    error: string;
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
  | ResetMessage;

/**
 * Message Listener Callback Type
 */
export type MessageListener<T extends Message = Message> = (
  message: T,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void | Promise<void>;
