/**
 * Shared constants
 *
 * Central export point for all application constants
 *
 * @module constants
 */

// Language constants
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_MAP,
  getLanguageName,
  isLanguageSupported,
  getLanguageCodes,
  type Language,
} from './languages';

// Configuration constants
export {
  API_CONFIG,
  BATCH_CONFIG,
  CACHE_CONFIG,
  RETRY_CONFIG,
  UI_CONFIG,
  STORAGE_KEYS,
  EXCLUSION_SELECTORS,
  KEYBOARD_SHORTCUTS,
  FEATURE_FLAGS,
  RATE_LIMIT_CONFIG,
} from './config';
