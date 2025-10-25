/**
 * Language detection utilities
 *
 * Features:
 * - Unicode range-based language detection
 * - Browser language preference detection
 * - ISO 639-1 language code support
 *
 * @example
 * ```typescript
 * import { detectLanguage, getBrowserLanguage } from './languageDetector';
 *
 * const textLang = detectLanguage('こんにちは'); // 'ja'
 * const browserLang = getBrowserLanguage(); // 'en' or user's browser language
 * ```
 */

/**
 * Language detection patterns based on Unicode ranges
 */
interface LanguagePattern {
  code: string;
  pattern: RegExp;
}

/**
 * Unicode range patterns for major languages
 */
const LANGUAGE_PATTERNS: LanguagePattern[] = [
  // Japanese (Hiragana, Katakana, Kanji)
  {
    code: 'ja',
    pattern: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/,
  },
  // Korean (Hangul)
  {
    code: 'ko',
    pattern: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
  },
  // Chinese (CJK Unified Ideographs - but exclude if Japanese kana present)
  {
    code: 'zh',
    pattern: /[\u4E00-\u9FFF]/,
  },
  // Arabic
  {
    code: 'ar',
    pattern: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,
  },
  // Cyrillic (Russian, Ukrainian, etc.)
  {
    code: 'ru',
    pattern: /[\u0400-\u04FF]/,
  },
  // Greek
  {
    code: 'el',
    pattern: /[\u0370-\u03FF]/,
  },
  // Thai
  {
    code: 'th',
    pattern: /[\u0E00-\u0E7F]/,
  },
  // Hebrew
  {
    code: 'he',
    pattern: /[\u0590-\u05FF]/,
  },
];

/**
 * Common words and patterns for basic Latin script language detection
 * Order matters: check English first as it's most common
 */
const LATIN_PATTERNS: { code: string; words: RegExp }[] = [
  // English (check first)
  { code: 'en', words: /\b(the|is|are|was|were|and|or|but|in|on|at|to|for|of|with|which|language|programming)\b/i },
  // German
  { code: 'de', words: /\b(der|die|das|und|ist|nicht|mit|von|für|hallo|welt)\b/i },
  // French
  { code: 'fr', words: /\b(le|la|les|du|et|est|un|une|pour|bonjour|monde)\b/i },
  // Spanish
  { code: 'es', words: /\b(el|la|los|las|que|por|para|hola|mundo)\b/i },
  // Portuguese
  { code: 'pt', words: /\b(os|as|em|para|com|por|olá|também)\b/i },
  // Italian
  { code: 'it', words: /\b(il|lo|gli|che|per|ciao|anche)\b/i },
];

/**
 * Detect language from text content using Unicode ranges and patterns
 *
 * @param text - Text to analyze
 * @returns ISO 639-1 language code (default: 'en')
 *
 * @example
 * ```typescript
 * detectLanguage('Hello world'); // 'en'
 * detectLanguage('こんにちは'); // 'ja'
 * detectLanguage('你好'); // 'zh'
 * detectLanguage('안녕하세요'); // 'ko'
 * ```
 */
export function detectLanguage(text: string): string {
  // Trim and check for empty input
  const trimmedText = text.trim();
  if (!trimmedText) {
    return 'en';
  }

  // Count characters matching each pattern
  const scores: Record<string, number> = {};

  // Check Unicode range patterns
  for (const { code, pattern } of LANGUAGE_PATTERNS) {
    const matches = trimmedText.match(new RegExp(pattern, 'g'));
    if (matches) {
      scores[code] = (scores[code] || 0) + matches.length;
    }
  }

  // Special handling for Japanese vs Chinese
  // If both are detected, check for Japanese-specific characters
  if (scores.ja && scores.zh) {
    // Japanese uses hiragana/katakana, Chinese doesn't
    const hasHiragana = /[\u3040-\u309F]/.test(trimmedText);
    const hasKatakana = /[\u30A0-\u30FF]/.test(trimmedText);

    if (hasHiragana || hasKatakana) {
      delete scores.zh; // It's Japanese, not Chinese
    } else {
      delete scores.ja; // It's Chinese, not Japanese
    }
  }

  // If we found non-Latin script, return the highest scoring language
  if (Object.keys(scores).length > 0) {
    return Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }

  // For Latin scripts, check common words
  for (const { code, words } of LATIN_PATTERNS) {
    if (words.test(trimmedText)) {
      return code;
    }
  }

  // Default to English for Latin script without specific patterns
  return 'en';
}

/**
 * Get browser language preference from navigator
 *
 * @returns ISO 639-1 language code (default: 'en')
 *
 * @example
 * ```typescript
 * const browserLang = getBrowserLanguage();
 * console.log(`Browser language: ${browserLang}`); // e.g., 'en', 'ja', 'fr'
 * ```
 */
export function getBrowserLanguage(): string {
  // Check navigator.language first
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language || navigator.languages?.[0];

    if (lang) {
      // Extract ISO 639-1 code (first 2 characters before hyphen)
      // e.g., 'en-US' -> 'en', 'ja-JP' -> 'ja'
      return lang.split('-')[0].toLowerCase();
    }
  }

  // Default to English
  return 'en';
}
