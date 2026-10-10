/**
 * Text Filter for Translation Skip Logic
 *
 * Filters out texts that don't require translation to reduce API calls:
 * - Numbers only (dates, phone numbers, etc.)
 * - URLs and email addresses
 * - Symbols and punctuation only
 * - Too short texts
 * - Single non-CJK characters
 *
 * @module utils/textFilter
 */

import { detectLanguage } from "./languageDetector";

/**
 * Result of text filter check
 */
export interface FilterResult {
  /**
   * Whether the text should be translated
   */
  shouldTranslate: boolean;

  /**
   * Reason for skipping (if shouldTranslate is false)
   */
  reason?: string;
}

/**
 * Result of batch text filtering
 */
export interface BatchFilterResult {
  /**
   * Texts that should be translated
   */
  textsToTranslate: string[];

  /**
   * Map of skipped indices to original texts
   * Skipped texts will be returned as-is in final results
   */
  skippedIndices: Map<number, string>;

  /**
   * Original indices of texts that should be translated
   */
  originalIndices: number[];
}

/**
 * Minimum text length to translate (excluding CJK characters)
 */
const MIN_TEXT_LENGTH = 2;

/**
 * Target languages written in a non-Latin script. Only for these can
 * detectLanguage() (Unicode-range based) tell "already in target" reliably;
 * for Latin-script targets it falls back to 'en', so we never skip there.
 */
const SCRIPT_DETECTABLE_TARGETS = new Set([
  "ja",
  "ko",
  "zh",
  "ar",
  "ru",
  "el",
  "th",
  "he",
]);

/** Minimum share of letters that must be in the target script to skip. */
const TARGET_SCRIPT_RATIO = 0.6;

/**
 * Whether text is already (predominantly) written in the target language.
 * Conservative: only non-Latin-script targets, and the text must be mostly
 * target-script letters, so mixed text like "Click ここ to start" is still sent.
 */
export function isAlreadyInTargetLanguage(
  text: string,
  targetLanguage?: string,
): boolean {
  if (!targetLanguage || !SCRIPT_DETECTABLE_TARGETS.has(targetLanguage)) {
    return false;
  }
  // Placeholder markup such as <1>…</1> / <2/> carries no language information.
  const body = text.replace(/<\/?\d+\/?>/g, "");
  const letters = body.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return false;
  if (detectLanguage(body) !== targetLanguage) return false;
  const nonLatin = letters.filter((ch) => !/\p{Script=Latin}/u.test(ch));
  return nonLatin.length / letters.length >= TARGET_SCRIPT_RATIO;
}

/**
 * Check if text should be translated
 *
 * @param text - Text to check
 * @returns FilterResult with shouldTranslate flag and reason
 *
 * @example
 * ```typescript
 * shouldTranslateText('Hello World') // { shouldTranslate: true }
 * shouldTranslateText('123-456-7890') // { shouldTranslate: false, reason: 'numbers_only' }
 * shouldTranslateText('https://example.com') // { shouldTranslate: false, reason: 'url_or_email' }
 * ```
 */
export function shouldTranslateText(
  text: string,
  targetLanguage?: string,
): FilterResult {
  const trimmed = text.trim();

  // Check for CJK content first - CJK text should always be translated
  const hasCJK =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
      trimmed,
    );

  // 1. Empty or too short (but allow single CJK characters)
  if (trimmed.length === 0) {
    return { shouldTranslate: false, reason: "too_short" };
  }

  if (trimmed.length < MIN_TEXT_LENGTH && !hasCJK) {
    return { shouldTranslate: false, reason: "too_short" };
  }

  // 2. Numbers only (with common separators: spaces, dots, dashes, plus, parentheses, commas, colons, slashes)
  if (/^[\d\s.\-+(),/:]+$/.test(trimmed)) {
    return { shouldTranslate: false, reason: "numbers_only" };
  }

  // 3. URL or email address
  if (/^(https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.\w+)/i.test(trimmed)) {
    return { shouldTranslate: false, reason: "url_or_email" };
  }

  // 4. Symbols and punctuation only (excluding CJK punctuation)
  // Uses Unicode categories: P (punctuation), S (symbols), Z (separators)
  if (/^[\s\p{P}\p{S}]+$/u.test(trimmed)) {
    return { shouldTranslate: false, reason: "symbols_only" };
  }

  // 5. Single character (non-CJK) - already handled in step 1

  // 6. Code-like content (STRICT: only matches patterns with underscores, $ or mixed case like camelCase)
  // Does NOT match simple words like "Hello", "World"
  // Matches: variableName, function_name, CONSTANT_NAME, $variable, methodCall()
  const isSingleToken = !/\s/.test(trimmed);
  const isCodeLike =
    isSingleToken &&
    // Has underscore and looks like identifier/constant token (not sentence)
    (/^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)+$/.test(trimmed) ||
      // Has $ followed by letter/underscore (JavaScript variable like $variable, $jQuery, ${expr})
      // Does NOT match currency amounts like $200, $80
      /\$[a-zA-Z_\{]/.test(trimmed) ||
      // camelCase or PascalCase token (not sentence)
      /[a-z][A-Z]/.test(trimmed) ||
      // ALL_CAPS constant (5+ characters, likely programming constant)
      // Does NOT match common abbreviations like TOS, FAQ, API, NASA, HTML
      /^[A-Z][A-Z0-9_]{4,}$/.test(trimmed) ||
      // Function call with parentheses
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\(\)$/.test(trimmed));

  if (isCodeLike) {
    return { shouldTranslate: false, reason: "code_like" };
  }

  // 7. Already in the target language (saves API calls and avoids rewrites)
  if (isAlreadyInTargetLanguage(trimmed, targetLanguage)) {
    return { shouldTranslate: false, reason: "already_target_language" };
  }

  return { shouldTranslate: true };
}

/**
 * Filter batch of texts for translation
 *
 * Separates texts into those that need translation and those that can be skipped.
 * Skipped texts will be returned as-is in the final results.
 *
 * @param texts - Array of texts to filter
 * @param targetLanguage - Target language code; texts already in it are skipped
 * @returns BatchFilterResult with separated texts and index mappings
 *
 * @example
 * ```typescript
 * const texts = ['Hello', '123', 'World', 'https://...'];
 * const { textsToTranslate, skippedIndices, originalIndices } = filterBatchTexts(texts);
 * // textsToTranslate: ['Hello', 'World']
 * // skippedIndices: Map { 1 => '123', 3 => 'https://...' }
 * // originalIndices: [0, 2]
 * ```
 */
export function filterBatchTexts(
  texts: string[],
  targetLanguage?: string,
): BatchFilterResult {
  const textsToTranslate: string[] = [];
  const skippedIndices = new Map<number, string>();
  const originalIndices: number[] = [];

  texts.forEach((text, index) => {
    const result = shouldTranslateText(text, targetLanguage);
    if (result.shouldTranslate) {
      textsToTranslate.push(text);
      originalIndices.push(index);
    } else {
      // Skipped texts will be returned as-is
      skippedIndices.set(index, text);
    }
  });

  console.log(
    `[TextFilter] Filtered ${texts.length} texts: ${textsToTranslate.length} to translate, ${skippedIndices.size} skipped`,
  );

  return { textsToTranslate, skippedIndices, originalIndices };
}

/**
 * Reconstruct full results array from translations and skipped texts
 *
 * @param translations - Translated texts (in order of originalIndices)
 * @param originalIndices - Original indices of translated texts
 * @param skippedIndices - Map of skipped indices to original texts
 * @param totalLength - Total length of original texts array
 * @returns Full results array with translations and skipped texts in original order
 */
export function reconstructResults(
  translations: string[],
  originalIndices: number[],
  skippedIndices: Map<number, string>,
  totalLength: number,
  originalTexts?: string[],
): string[] {
  const results: string[] = new Array(totalLength);

  // Fill in translations
  originalIndices.forEach((origIdx, transIdx) => {
    if (origIdx < totalLength && transIdx < translations.length) {
      results[origIdx] = translations[transIdx];
    } else {
      console.warn(
        `[TextFilter] reconstructResults: index out of bounds - origIdx=${origIdx}, transIdx=${transIdx}, totalLength=${totalLength}, translationsLength=${translations.length}`,
      );
    }
  });

  // Fill in skipped texts (returned as-is)
  skippedIndices.forEach((text, idx) => {
    if (idx < totalLength) {
      results[idx] = text;
    } else {
      console.warn(
        `[TextFilter] reconstructResults: skipped index out of bounds - idx=${idx}, totalLength=${totalLength}`,
      );
    }
  });

  // Why: Array.filter skips sparse holes, so walk by index.
  // Prefer original text over empty string so applyTranslations does not drop nodes.
  for (let i = 0; i < results.length; i++) {
    if (results[i] === undefined) {
      results[i] = originalTexts?.[i] ?? "";
    }
  }

  return results;
}
