/**
 * Supported languages and language-related constants
 *
 * @module constants/languages
 */

/**
 * Language definition
 */
export interface Language {
  /** ISO 639-1 language code */
  code: string;
  /** Native language name */
  name: string;
  /** English language name */
  nameEn: string;
}

/**
 * Supported languages for translation
 *
 * Based on Google's Gemini API and OpenRouter supported languages
 */
export const SUPPORTED_LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', nameEn: 'English' },
  { code: 'ja', name: '日本語', nameEn: 'Japanese' },
  { code: 'zh', name: '中文', nameEn: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: '中文 (繁體)', nameEn: 'Chinese (Traditional)' },
  { code: 'ko', name: '한국어', nameEn: 'Korean' },
  { code: 'es', name: 'Español', nameEn: 'Spanish' },
  { code: 'fr', name: 'Français', nameEn: 'French' },
  { code: 'de', name: 'Deutsch', nameEn: 'German' },
  { code: 'it', name: 'Italiano', nameEn: 'Italian' },
  { code: 'pt', name: 'Português', nameEn: 'Portuguese' },
  { code: 'ru', name: 'Русский', nameEn: 'Russian' },
  { code: 'ar', name: 'العربية', nameEn: 'Arabic' },
  { code: 'hi', name: 'हिन्दी', nameEn: 'Hindi' },
  { code: 'th', name: 'ไทย', nameEn: 'Thai' },
  { code: 'vi', name: 'Tiếng Việt', nameEn: 'Vietnamese' },
  { code: 'id', name: 'Bahasa Indonesia', nameEn: 'Indonesian' },
  { code: 'tr', name: 'Türkçe', nameEn: 'Turkish' },
  { code: 'pl', name: 'Polski', nameEn: 'Polish' },
  { code: 'nl', name: 'Nederlands', nameEn: 'Dutch' },
  { code: 'sv', name: 'Svenska', nameEn: 'Swedish' },
] as const;

/**
 * Default target language
 */
export const DEFAULT_TARGET_LANGUAGE = 'en';

/**
 * Language code to Language object mapping
 */
export const LANGUAGE_MAP: ReadonlyMap<string, Language> = new Map(
  SUPPORTED_LANGUAGES.map((lang) => [lang.code, lang])
);

/**
 * Get language name by code
 *
 * @param code - ISO 639-1 language code
 * @param useNative - Return native name if true, English name if false
 * @returns Language name or code if not found
 *
 * @example
 * ```typescript
 * getLanguageName('ja', true); // '日本語'
 * getLanguageName('ja', false); // 'Japanese'
 * getLanguageName('unknown'); // 'unknown'
 * ```
 */
export function getLanguageName(code: string, useNative = true): string {
  const language = LANGUAGE_MAP.get(code);
  if (!language) {
    return code;
  }
  return useNative ? language.name : language.nameEn;
}

/**
 * Check if a language code is supported
 *
 * @param code - ISO 639-1 language code
 * @returns True if language is supported
 *
 * @example
 * ```typescript
 * isLanguageSupported('ja'); // true
 * isLanguageSupported('xyz'); // false
 * ```
 */
export function isLanguageSupported(code: string): boolean {
  return LANGUAGE_MAP.has(code);
}

/**
 * Get all supported language codes
 *
 * @returns Array of language codes
 *
 * @example
 * ```typescript
 * const codes = getLanguageCodes(); // ['en', 'ja', 'zh', ...]
 * ```
 */
export function getLanguageCodes(): readonly string[] {
  return SUPPORTED_LANGUAGES.map((lang) => lang.code);
}
