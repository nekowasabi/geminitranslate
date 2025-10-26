/**
 * Application configuration constants
 *
 * @module constants/config
 */

/**
 * API configuration
 */
export const API_CONFIG = {
  /**
   * OpenRouter API endpoint
   */
  ENDPOINT: 'https://openrouter.ai/api/v1/chat/completions',

  /**
   * API request timeout (milliseconds)
   */
  TIMEOUT: 30000,

  /**
   * HTTP Referer for OpenRouter API
   */
  REFERER: 'https://github.com/doganaylab/geminitranslate',
} as const;

/**
 * Translation batch processing configuration
 */
export const BATCH_CONFIG = {
  /**
   * Maximum number of concurrent translation requests
   */
  CONCURRENCY_LIMIT: 10,

  /**
   * Number of text elements per batch
   */
  BATCH_SIZE: 10,

  /**
   * Maximum text length per batch (characters)
   */
  MAX_BATCH_LENGTH: 5000,

  /**
   * Minimum text length to translate (characters)
   */
  MIN_TEXT_LENGTH: 1,
} as const;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  /**
   * Cache TTL in milliseconds (default: 1 hour)
   */
  TTL: 60 * 60 * 1000,

  /**
   * Maximum cache size (number of entries)
   */
  MAX_SIZE: 1000,

  /**
   * Enable cache persistence to storage
   */
  ENABLE_PERSISTENCE: false,
} as const;

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  /**
   * Maximum number of retry attempts
   */
  MAX_RETRIES: 3,

  /**
   * Initial delay for retry (milliseconds)
   */
  INITIAL_DELAY: 1000,

  /**
   * Maximum delay for retry (milliseconds)
   */
  MAX_DELAY: 10000,

  /**
   * Backoff strategy
   */
  BACKOFF: 'exponential' as const,
} as const;

/**
 * UI configuration
 */
export const UI_CONFIG = {
  /**
   * Default font size adjustment (percentage)
   */
  DEFAULT_FONT_SIZE: 100,

  /**
   * Minimum font size adjustment (percentage)
   */
  MIN_FONT_SIZE: 50,

  /**
   * Maximum font size adjustment (percentage)
   */
  MAX_FONT_SIZE: 200,

  /**
   * Animation duration (milliseconds)
   */
  ANIMATION_DURATION: 300,

  /**
   * Floating UI positioning offset (pixels)
   */
  FLOATING_UI_OFFSET: 10,
} as const;

/**
 * Storage keys used across the extension
 */
export const STORAGE_KEYS = {
  // API Configuration
  OPENROUTER_API_KEY: 'openRouterApiKey',
  OPENROUTER_MODEL: 'openRouterModel',
  OPENROUTER_PROVIDER: 'openRouterProvider',

  // User Preferences
  TARGET_LANGUAGE: 'targetLanguage',
  FONT_SIZE: 'fontSize',
  AUTO_TRANSLATE: 'autoTranslate',
  DARK_MODE: 'darkMode',

  // Cache
  TRANSLATION_CACHE: 'translationCache',
  LAST_CACHE_CLEANUP: 'lastCacheCleanup',
} as const;

/**
 * DOM selector patterns for translation exclusions
 */
export const EXCLUSION_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'code',
  'pre',
  '[contenteditable="true"]',
  '[data-no-translate]',
  '.no-translate',
] as const;

/**
 * Keyboard shortcuts
 * Note: These should match the commands defined in manifest.v2.json and manifest.v3.json
 */
export const KEYBOARD_SHORTCUTS = {
  /**
   * Translate current page
   */
  TRANSLATE_PAGE: 'Alt+W',

  /**
   * Translate selection (matches manifest.json: Alt+Y)
   */
  TRANSLATE_SELECTION: 'Alt+Y',

  /**
   * Toggle auto-translate
   */
  TOGGLE_AUTO_TRANSLATE: 'Alt+Shift+A',
} as const;

/**
 * Feature flags for experimental features
 */
export const FEATURE_FLAGS = {
  /**
   * Enable mutation observer for dynamic content
   */
  ENABLE_MUTATION_OBSERVER: true,

  /**
   * Enable clipboard translation
   */
  ENABLE_CLIPBOARD_TRANSLATION: true,

  /**
   * Enable selection translation
   */
  ENABLE_SELECTION_TRANSLATION: true,

  /**
   * Enable debug logging
   */
  ENABLE_DEBUG_LOGGING: process.env.NODE_ENV === 'development',
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  /**
   * Maximum requests per minute
   */
  MAX_REQUESTS_PER_MINUTE: 60,

  /**
   * Time window for rate limiting (milliseconds)
   */
  WINDOW_SIZE: 60000,
} as const;
