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
export function shouldTranslateText(text: string): FilterResult {
  const trimmed = text.trim();

  // Check for CJK content first - CJK text should always be translated
  const hasCJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(trimmed);

  // 1. Empty or too short (but allow single CJK characters)
  if (trimmed.length === 0) {
    return { shouldTranslate: false, reason: 'too_short' };
  }

  if (trimmed.length < MIN_TEXT_LENGTH && !hasCJK) {
    return { shouldTranslate: false, reason: 'too_short' };
  }

  // 2. Numbers only (with common separators: spaces, dots, dashes, plus, parentheses, commas, colons, slashes)
  if (/^[\d\s.\-+(),/:]+$/.test(trimmed)) {
    return { shouldTranslate: false, reason: 'numbers_only' };
  }

  // 3. URL or email address
  if (/^(https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.\w+)/i.test(trimmed)) {
    return { shouldTranslate: false, reason: 'url_or_email' };
  }

  // 4. Symbols and punctuation only (excluding CJK punctuation)
  // Uses Unicode categories: P (punctuation), S (symbols), Z (separators)
  if (/^[\s\p{P}\p{S}]+$/u.test(trimmed)) {
    return { shouldTranslate: false, reason: 'symbols_only' };
  }

  // 5. Single character (non-CJK) - already handled in step 1

  // 6. Code-like content (STRICT: only matches patterns with underscores, $ or mixed case like camelCase)
  // Does NOT match simple words like "Hello", "World"
  // Matches: variableName, function_name, CONSTANT_NAME, $variable, methodCall()
  const isCodeLike = (
    // Has underscore (likely variable/constant name)
    trimmed.includes('_') ||
    // Has $ (JavaScript variable)
    trimmed.includes('$') ||
    // camelCase or PascalCase (has lowercase followed by uppercase)
    /[a-z][A-Z]/.test(trimmed) ||
    // ALL_CAPS constant (at least 2 capital letters with no lowercase between)
    /^[A-Z][A-Z0-9_]+$/.test(trimmed) ||
    // Function call with parentheses
    /^[a-zA-Z_$][a-zA-Z0-9_$]*\(\)$/.test(trimmed)
  );

  if (isCodeLike) {
    return { shouldTranslate: false, reason: 'code_like' };
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
export function filterBatchTexts(texts: string[]): BatchFilterResult {
  const textsToTranslate: string[] = [];
  const skippedIndices = new Map<number, string>();
  const originalIndices: number[] = [];

  texts.forEach((text, index) => {
    const result = shouldTranslateText(text);
    if (result.shouldTranslate) {
      textsToTranslate.push(text);
      originalIndices.push(index);
    } else {
      // Skipped texts will be returned as-is
      skippedIndices.set(index, text);
    }
  });

  console.log(
    `[TextFilter] Filtered ${texts.length} texts: ${textsToTranslate.length} to translate, ${skippedIndices.size} skipped`
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
  totalLength: number
): string[] {
  const results: string[] = new Array(totalLength);

  // Fill in translations
  originalIndices.forEach((origIdx, transIdx) => {
    if (origIdx < totalLength && transIdx < translations.length) {
      results[origIdx] = translations[transIdx];
    } else {
      console.warn(`[TextFilter] reconstructResults: index out of bounds - origIdx=${origIdx}, transIdx=${transIdx}, totalLength=${totalLength}, translationsLength=${translations.length}`);
    }
  });

  // Fill in skipped texts (returned as-is)
  skippedIndices.forEach((text, idx) => {
    if (idx < totalLength) {
      results[idx] = text;
    } else {
      console.warn(`[TextFilter] reconstructResults: skipped index out of bounds - idx=${idx}, totalLength=${totalLength}`);
    }
  });

  // Check for undefined values and fill with empty string as fallback
  const undefinedCount = results.filter(r => r === undefined).length;
  if (undefinedCount > 0) {
    console.error(`[TextFilter] reconstructResults: ${undefinedCount} undefined values detected, filling with empty strings`);
    for (let i = 0; i < results.length; i++) {
      if (results[i] === undefined) {
        results[i] = '';
      }
    }
  }

  return results;
}
