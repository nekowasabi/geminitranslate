/**
 * TranslationEngine
 *
 * Handles translation with 3-tier caching system (Memory/Session/Local Storage)
 * and batch processing with OpenRouter API integration.
 *
 * Features:
 * - 3-tier cache hierarchy (Memory → Session → Local)
 * - Batch processing with configurable size
 * - Automatic retry with exponential backoff
 * - Cache hit rate tracking
 * - Graceful degradation on storage errors
 *
 * @example
 * ```typescript
 * const engine = new TranslationEngine();
 * await engine.initialize();
 *
 * const translations = await engine.translateBatch(
 *   ['Hello', 'World'],
 *   'Japanese'
 * );
 * // ['こんにちは', '世界']
 *
 * const stats = await engine.getCacheStats();
 * // { memory: 2, session: 2, local: 2, hitRate: 0 }
 * ```
 */

import { OpenRouterClient, ParseCountMismatchError } from "./apiClient";
import { logger } from "../shared/utils/logger";
import {
  BATCH_CONFIG,
  FEATURE_FLAGS,
  RETRY_CONFIG,
} from "../shared/constants/config";
import LRUCache from "../shared/utils/lruCache";

/**
 * Cache layer type
 */
export type CacheLayer = "memory" | "session" | "local" | "all";

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Number of entries in memory cache
   */
  memory: number;

  /**
   * Number of entries in session storage
   */
  session: number;

  /**
   * Number of entries in local storage
   */
  local: number;

  /**
   * Cache hit rate (0-100%)
   */
  hitRate: number;
}

/**
 * Cache entry structure for storage
 */
interface CacheEntry {
  text: string;
  translation: string;
}

/**
 * Batch processing completion callback type
 *
 * @param batchIndex - Batch number (0-indexed)
 * @param translations - Translation results for this batch
 * @param nodeIndices - Corresponding node indices in original texts array
 */
type BatchProgressCallback = (
  batchIndex: number,
  translations: string[],
  nodeIndices: number[],
) => void;

interface RequestBudgetContext {
  apiCalls: number;
  maxApiCalls: number;
  retryAttempts: number;
  fallbackSingleCount: number;
  fallbackSplitCount: number;
  startedAt: number;
}

interface TranslationAttemptResult {
  translations: string[];
  fallbackUsed: boolean;
}

/**
 * TranslationEngine with 3-tier cache system
 */
export class TranslationEngine {
  /**
   * OpenRouter API client
   */
  private apiClient: OpenRouterClient;

  /**
   * Memory cache (fastest, session-scoped)
   * LRU cache with max 1000 entries
   */
  private memoryCache: LRUCache<string> = new LRUCache<string>(1000);

  /**
   * Batch size for API requests
   */
  private readonly BATCH_SIZE = BATCH_CONFIG.BATCH_SIZE;
  private readonly INDIVIDUAL_FALLBACK_THRESHOLD = 6;

  /**
   * Cache hit/miss tracking
   */
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Initialization flag
   */
  private initialized = false;

  constructor() {
    this.apiClient = new OpenRouterClient();
  }

  /**
   * Initialize the translation engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.apiClient.initialize();
    this.initialized = true;
    logger.log("TranslationEngine initialized");
  }

  /**
   * Translate batch of texts with semi-parallel processing
   *
   * Processes first priorityCount batches sequentially, then remaining batches in parallel.
   * Useful for viewport-priority translation where immediate feedback is important.
   *
   * @param texts - Array of texts to translate
   * @param targetLanguage - Target language name
   * @param priorityCount - Number of batches to process sequentially (default: 1)
   * @param onBatchComplete - Callback invoked when each batch completes (optional)
   * @returns Array of translated texts in same order as input
   * @throws Error if engine not initialized or API request fails after retries
   *
   * @example
   * ```typescript
   * // First 1 batch sequential, rest parallel, with callback
   * const results = await engine.translateBatchSemiParallel(
   *   texts,
   *   'Japanese',
   *   1,
   *   (batchIndex, translations, nodeIndices) => {
   *     console.log(`Batch ${batchIndex} completed:`, translations);
   *   }
   * );
   * ```
   */
  async translateBatchSemiParallel(
    texts: string[],
    targetLanguage: string,
    priorityCount: number = BATCH_CONFIG.VIEWPORT_PRIORITY_BATCHES,
    onBatchComplete?: BatchProgressCallback,
  ): Promise<string[]> {
    const timestamp = new Date().toISOString();
    console.log(
      `[Background:TranslationEngine] ${timestamp} - translateBatchSemiParallel() called:`,
      {
        textsCount: texts.length,
        targetLanguage,
        priorityCount,
      },
    );

    if (!this.initialized) {
      throw new Error(
        "TranslationEngine not initialized. Call initialize() first.",
      );
    }

    if (texts.length === 0) {
      return [];
    }

    const results: string[] = new Array(texts.length);
    const uncachedIndices: number[] = [];

    const requestBudget = this.createRequestBudgetContext(texts.length);
    let batchCount = 0;

    // Check cache
    for (let i = 0; i < texts.length; i++) {
      const cached = await this.getCachedTranslation(texts[i], targetLanguage);
      if (cached) {
        results[i] = cached;
        this.cacheHits++;
      } else {
        uncachedIndices.push(i);
        this.cacheMisses++;
      }
    }

    if (uncachedIndices.length === 0) {
      // All cache hit - invoke callback immediately
      if (onBatchComplete && texts.length > 0) {
        try {
          const nodeIndices = Array.from({ length: texts.length }, (_, i) => i);
          onBatchComplete(0, results, nodeIndices);
        } catch (error) {
          logger.warn("Batch complete callback error (cache hit):", error);
        }
      }
      this.logRequestDiagnostics(
        "translateBatchSemiParallel",
        texts.length,
        0,
        0,
        requestBudget,
      );
      return results;
    }

    // Create batches
    const uncachedTexts = uncachedIndices.map((i) => texts[i]);
    const batches = this.chunkTextsByConstraints(uncachedTexts);
    batchCount = batches.length;

    const priorityBatches = batches.slice(0, priorityCount);
    const remainingBatches = batches.slice(priorityCount);

    console.log(
      `[Background:TranslationEngine] ${timestamp} - Semi-parallel: ${priorityBatches.length} sequential, ${remainingBatches.length} parallel`,
    );

    let translatedTexts: string[] = [];
    let processedCount = 0;

    // Process priority batches sequentially
    for (let i = 0; i < priorityBatches.length; i++) {
      const batch = priorityBatches[i];
      const batchNodeIndices = uncachedIndices.slice(
        processedCount,
        processedCount + batch.length,
      );
      const batchResult = await this.translateWithRetry(
        batch,
        targetLanguage,
        requestBudget,
        {
          onItemTranslated: onBatchComplete
            ? (translation: string, itemIndex: number) => {
                const nodeIndex = batchNodeIndices[itemIndex];
                if (typeof nodeIndex === "number") {
                  onBatchComplete(i, [translation], [nodeIndex]);
                }
              }
            : undefined,
        },
      );
      translatedTexts.push(...batchResult.translations);

      // Invoke callback for this batch
      if (onBatchComplete && !batchResult.fallbackUsed) {
        try {
          onBatchComplete(i, batchResult.translations, batchNodeIndices);
        } catch (error) {
          logger.warn(`Batch complete callback error (batch ${i}):`, error);
        }
      }

      processedCount += batch.length;
    }

    // Process remaining batches in parallel
    if (remainingBatches.length > 0) {
      let cursor = processedCount;
      const batchMeta = remainingBatches.map((batch, idx) => {
        const start = cursor;
        cursor += batch.length;
        return {
          batch,
          batchIndex: priorityBatches.length + idx,
          nodeIndices: uncachedIndices.slice(start, start + batch.length),
        };
      });

      const parallelPromises = batchMeta.map((meta) =>
        this.translateWithRetry(meta.batch, targetLanguage, requestBudget, {
          onItemTranslated: onBatchComplete
            ? (translation: string, itemIndex: number) => {
                const nodeIndex = meta.nodeIndices[itemIndex];
                if (typeof nodeIndex === "number") {
                  onBatchComplete(meta.batchIndex, [translation], [nodeIndex]);
                }
              }
            : undefined,
        }),
      );
      const parallelResults = await Promise.all(parallelPromises);

      parallelResults.forEach((batchResult, idx) => {
        translatedTexts.push(...batchResult.translations);

        // Invoke callback for this batch
        if (onBatchComplete && !batchResult.fallbackUsed) {
          try {
            const meta = batchMeta[idx];
            onBatchComplete(
              meta.batchIndex,
              batchResult.translations,
              meta.nodeIndices,
            );
          } catch (error) {
            logger.warn(
              `Batch complete callback error (batch ${batchMeta[idx].batchIndex}):`,
              error,
            );
          }
        }

        processedCount += batchResult.translations.length;
      });
    }

    // Store results and update cache
    for (let i = 0; i < uncachedIndices.length; i++) {
      const originalIndex = uncachedIndices[i];
      const translation = translatedTexts[i];
      results[originalIndex] = translation;
      await this.setCachedTranslation(
        texts[originalIndex],
        targetLanguage,
        translation,
      );
    }

    this.assertCompleteResults(
      results,
      texts.length,
      "translateBatchSemiParallel",
    );
    this.logRequestDiagnostics(
      "translateBatchSemiParallel",
      texts.length,
      uncachedIndices.length,
      batchCount,
      requestBudget,
    );
    return results;
  }

  /**
   * Translate batch of texts with 3-tier caching
   *
   * @param texts - Array of texts to translate
   * @param targetLanguage - Target language name (e.g., 'Japanese', 'French')
   * @param options - Optional processing options
   * @returns Array of translated texts in same order as input
   * @throws Error if engine not initialized or API request fails after retries
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    options?: {
      semiParallel?: boolean;
      priorityCount?: number;
    },
  ): Promise<string[]> {
    // Use semi-parallel processing if requested
    if (options?.semiParallel) {
      return this.translateBatchSemiParallel(
        texts,
        targetLanguage,
        options.priorityCount,
      );
    }

    // Original parallel processing logic
    const timestamp = new Date().toISOString();
    console.log(
      `[Background:TranslationEngine] ${timestamp} - translateBatch() called:`,
      {
        textsCount: texts.length,
        targetLanguage,
        firstText: texts[0]?.substring(0, 50),
      },
    );

    if (!this.initialized) {
      console.error(
        `[Background:TranslationEngine] ${timestamp} - Engine not initialized`,
      );
      throw new Error(
        "TranslationEngine not initialized. Call initialize() first.",
      );
    }

    // Handle empty input
    if (texts.length === 0) {
      console.log(
        `[Background:TranslationEngine] ${timestamp} - Empty input, returning empty array`,
      );
      return [];
    }

    const results: string[] = new Array(texts.length);
    const uncachedIndices: number[] = [];

    const requestBudget = this.createRequestBudgetContext(texts.length);
    let batchCount = 0;

    // Check all cache layers
    console.log(
      `[Background:TranslationEngine] ${timestamp} - Checking cache for ${texts.length} texts...`,
    );
    for (let i = 0; i < texts.length; i++) {
      const cached = await this.getCachedTranslation(texts[i], targetLanguage);
      if (cached) {
        results[i] = cached;
        this.cacheHits++;
      } else {
        uncachedIndices.push(i);
        this.cacheMisses++;
      }
    }

    console.log(
      `[Background:TranslationEngine] ${timestamp} - Cache check complete:`,
      {
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        uncachedCount: uncachedIndices.length,
      },
    );

    // Translate uncached texts in batches
    if (uncachedIndices.length > 0) {
      const uncachedTexts = uncachedIndices.map((i) => texts[i]);
      const batches = this.chunkTextsByConstraints(uncachedTexts);
      batchCount = batches.length;

      console.log(
        `[Background:TranslationEngine] ${timestamp} - Translating ${uncachedIndices.length} uncached texts in ${batches.length} batches`,
      );

      // Process batches in parallel
      const batchResults = await Promise.all(
        batches.map((batch, index) => {
          console.log(
            `[Background:TranslationEngine] ${timestamp} - Processing batch ${index + 1}/${batches.length}:`,
            {
              batchSize: batch.length,
            },
          );
          return this.translateWithRetry(batch, targetLanguage, requestBudget);
        }),
      );

      console.log(
        `[Background:TranslationEngine] ${timestamp} - All batches processed`,
      );

      // Flatten batch results
      const translations = batchResults.flatMap(
        (result) => result.translations,
      );

      console.log(
        `[Background:TranslationEngine] ${timestamp} - Flattened translations:`,
        {
          count: translations.length,
        },
      );

      // Store results and update cache
      for (let i = 0; i < uncachedIndices.length; i++) {
        const originalIndex = uncachedIndices[i];
        const translation = translations[i];
        results[originalIndex] = translation;

        // Save to all cache layers
        await this.setCachedTranslation(
          texts[originalIndex],
          targetLanguage,
          translation,
        );
      }

      console.log(
        `[Background:TranslationEngine] ${timestamp} - Cache updated with new translations`,
      );
    }

    console.log(
      `[Background:TranslationEngine] ${timestamp} - translateBatch() completed:`,
      {
        resultsCount: results.length,
        firstResult: results[0]?.substring(0, 50),
      },
    );

    this.assertCompleteResults(results, texts.length, "translateBatch");
    this.logRequestDiagnostics(
      "translateBatch",
      texts.length,
      uncachedIndices.length,
      batchCount,
      requestBudget,
    );
    return results;
  }

  /**
   * Get cached translation from 3-tier cache
   *
   * Checks in order: Memory → Session → Local
   * Promotes cache hits to higher tiers
   *
   * @param text - Original text
   * @param targetLanguage - Target language
   * @returns Cached translation or null
   */
  private async getCachedTranslation(
    text: string,
    targetLanguage: string,
  ): Promise<string | null> {
    const cacheKey = this.getCacheKey(text, targetLanguage);

    // Check memory cache
    const memoryHit = this.getFromMemoryCache(cacheKey);
    if (memoryHit) return memoryHit;

    // Check session storage
    const sessionHit = this.getFromStorage(sessionStorage, cacheKey);
    if (sessionHit) {
      this.promoteToMemoryCache(cacheKey, sessionHit);
      return sessionHit;
    }

    // Check local storage
    const localHit = this.getFromStorage(localStorage, cacheKey);
    if (localHit) {
      this.promoteToHigherTiers(cacheKey, localHit);
      return localHit;
    }

    return null;
  }

  /**
   * Get translation from memory cache
   */
  private getFromMemoryCache(cacheKey: string): string | null {
    return this.memoryCache.get(cacheKey) || null;
  }

  /**
   * Get translation from storage (session or local)
   */
  private getFromStorage(storage: Storage, cacheKey: string): string | null {
    try {
      const data = storage.getItem(cacheKey);
      if (data) {
        const entry: CacheEntry = JSON.parse(data);
        return entry.translation;
      }
    } catch (error) {
      logger.warn(`Storage read error for key ${cacheKey}:`, error);
    }
    return null;
  }

  /**
   * Promote cache hit to memory cache
   */
  private promoteToMemoryCache(cacheKey: string, translation: string): void {
    this.memoryCache.set(cacheKey, translation);
  }

  /**
   * Promote cache hit to memory and session cache
   */
  private promoteToHigherTiers(cacheKey: string, translation: string): void {
    this.memoryCache.set(cacheKey, translation);
    const entry: CacheEntry = {
      text: cacheKey.split(":")[1],
      translation,
    };
    this.saveToStorage(sessionStorage, cacheKey, entry);
  }

  /**
   * Set cached translation to all cache layers
   *
   * @param text - Original text
   * @param targetLanguage - Target language
   * @param translation - Translated text
   */
  private async setCachedTranslation(
    text: string,
    targetLanguage: string,
    translation: string,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(text, targetLanguage);
    const entry: CacheEntry = { text, translation };

    // Save to memory cache (always succeeds)
    this.memoryCache.set(cacheKey, translation);

    // Save to session and local storage (graceful degradation)
    this.saveToStorage(sessionStorage, cacheKey, entry);
    this.saveToStorage(localStorage, cacheKey, entry);
  }

  /**
   * Save entry to storage with error handling
   */
  private saveToStorage(
    storage: Storage,
    cacheKey: string,
    entry: CacheEntry,
  ): void {
    try {
      storage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      logger.warn(`Storage write error for key ${cacheKey}:`, error);
    }
  }

  /**
   * Generate cache key
   *
   * @param text - Original text
   * @param targetLanguage - Target language
   * @returns Cache key string
   */
  private getCacheKey(text: string, targetLanguage: string): string {
    return `translation:${text}:${targetLanguage}`;
  }

  /**
   * Translate texts with retry logic
   *
   * @param texts - Texts to translate
   * @param targetLanguage - Target language
   * @returns Translated texts
   */
  private async translateWithRetry(
    texts: string[],
    targetLanguage: string,
    requestBudget: RequestBudgetContext,
    options?: {
      onItemTranslated?: (translation: string, itemIndex: number) => void;
    },
  ): Promise<TranslationAttemptResult> {
    try {
      const translations = await this.executeTranslationWithRetry(
        () => this.apiClient.translate(texts, targetLanguage),
        texts.length,
        "Translation",
        requestBudget,
      );
      return {
        translations,
        fallbackUsed: false,
      };
    } catch (error) {
      if (error instanceof ParseCountMismatchError && texts.length > 1) {
        const shouldUseSplitFallback =
          texts.length > this.INDIVIDUAL_FALLBACK_THRESHOLD;
        if (shouldUseSplitFallback) {
          requestBudget.fallbackSplitCount += 1;
        } else {
          requestBudget.fallbackSingleCount += 1;
        }
        logger.warn(
          `Count mismatch persists (expected=${error.expectedCount}, actual=${error.actualCount}), ` +
            `falling back to ${shouldUseSplitFallback ? "binary-split" : "single-text"} translation for ${texts.length} texts`,
        );
        const translations = shouldUseSplitFallback
          ? await this.translateByBinarySplit(
              texts,
              targetLanguage,
              requestBudget,
              options,
              0,
            )
          : await this.translateIndividually(
              texts,
              targetLanguage,
              requestBudget,
              options,
            );
        return {
          translations,
          fallbackUsed: true,
        };
      }

      throw error;
    }
  }

  private async translateIndividually(
    texts: string[],
    targetLanguage: string,
    requestBudget: RequestBudgetContext,
    options?: {
      onItemTranslated?: (translation: string, itemIndex: number) => void;
    },
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const translated = await this.executeTranslationWithRetry(
        () => this.apiClient.translate([text], targetLanguage),
        1,
        "Single-text translation",
        requestBudget,
      );
      const translatedText = translated[0];

      results.push(translatedText);
      if (options?.onItemTranslated) {
        options.onItemTranslated(translatedText, i);
      }
    }

    return results;
  }

  private async translateByBinarySplit(
    texts: string[],
    targetLanguage: string,
    requestBudget: RequestBudgetContext,
    options:
      | {
          onItemTranslated?: (translation: string, itemIndex: number) => void;
        }
      | undefined,
    offset: number,
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    if (texts.length === 1) {
      const translated = await this.executeTranslationWithRetry(
        () => this.apiClient.translate(texts, targetLanguage),
        1,
        "Single-text translation",
        requestBudget,
      );
      const translatedText = translated[0];
      if (options?.onItemTranslated) {
        options.onItemTranslated(translatedText, offset);
      }
      return [translatedText];
    }

    const splitIndex = Math.ceil(texts.length / 2);
    const leftTexts = texts.slice(0, splitIndex);
    const rightTexts = texts.slice(splitIndex);

    const translateChunk = async (
      chunkTexts: string[],
      chunkOffset: number,
    ): Promise<string[]> => {
      try {
        const translated = await this.executeTranslationWithRetry(
          () => this.apiClient.translate(chunkTexts, targetLanguage),
          chunkTexts.length,
          `Fallback chunk translation (${chunkTexts.length} texts)`,
          requestBudget,
        );

        if (options?.onItemTranslated) {
          translated.forEach((translation, index) => {
            options.onItemTranslated?.(translation, chunkOffset + index);
          });
        }

        return translated;
      } catch (error) {
        if (error instanceof ParseCountMismatchError && chunkTexts.length > 1) {
          return this.translateByBinarySplit(
            chunkTexts,
            targetLanguage,
            requestBudget,
            options,
            chunkOffset,
          );
        }
        throw error;
      }
    };

    const [leftTranslations, rightTranslations] = await Promise.all([
      translateChunk(leftTexts, offset),
      translateChunk(rightTexts, offset + splitIndex),
    ]);

    return [...leftTranslations, ...rightTranslations];
  }

  private async executeTranslationWithRetry(
    operation: () => Promise<string[]>,
    expectedCount: number,
    context: string,
    requestBudget: RequestBudgetContext,
  ): Promise<string[]> {
    for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        this.consumeApiCallBudget(requestBudget);
        const translated = await operation();

        if (translated.length !== expectedCount) {
          throw new ParseCountMismatchError(expectedCount, translated.length);
        }

        return translated;
      } catch (error) {
        if (error instanceof ParseCountMismatchError) {
          throw error;
        }

        if (attempt >= RETRY_CONFIG.MAX_RETRIES) {
          throw error;
        }

        requestBudget.retryAttempts += 1;
        logger.warn(
          `${context} retry attempt ${attempt + 1}:`,
          (error as Error).message,
        );

        const waitTime =
          RETRY_CONFIG.BACKOFF === "exponential"
            ? RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, attempt)
            : RETRY_CONFIG.INITIAL_DELAY * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw new Error(`${context} failed unexpectedly`);
  }

  private assertCompleteResults(
    results: string[],
    expectedLength: number,
    context: string,
  ): void {
    if (results.length !== expectedLength) {
      throw new Error(
        `[${context}] Result length mismatch: expected ${expectedLength}, got ${results.length}`,
      );
    }

    const missingIndices: number[] = [];
    for (let i = 0; i < expectedLength; i++) {
      if (typeof results[i] !== "string") {
        missingIndices.push(i);
      }
    }

    if (missingIndices.length > 0) {
      throw new Error(
        `[${context}] Incomplete translation results at indices: ${missingIndices.join(", ")}`,
      );
    }
  }

  private createRequestBudgetContext(totalTexts: number): RequestBudgetContext {
    const baseCalls =
      Math.ceil(totalTexts / this.BATCH_SIZE) * (RETRY_CONFIG.MAX_RETRIES + 1);
    const fallbackAllowance = Math.min(200, Math.max(20, totalTexts));
    const maxApiCalls = Math.min(
      500,
      Math.max(60, baseCalls + fallbackAllowance),
    );

    return {
      apiCalls: 0,
      maxApiCalls,
      retryAttempts: 0,
      fallbackSingleCount: 0,
      fallbackSplitCount: 0,
      startedAt: Date.now(),
    };
  }

  private logRequestDiagnostics(
    contextName: "translateBatch" | "translateBatchSemiParallel",
    totalTexts: number,
    uncachedCount: number,
    batchCount: number,
    budget: RequestBudgetContext,
  ): void {
    const durationMs = Date.now() - budget.startedAt;
    const baselineCalls = Math.max(
      1,
      Math.ceil(Math.max(uncachedCount, 1) / this.BATCH_SIZE),
    );
    const isHighCostRisk =
      budget.apiCalls > baselineCalls * 6 ||
      budget.fallbackSingleCount > 0 ||
      budget.apiCalls > Math.floor(budget.maxApiCalls * 0.8);
    const isHighLatency = uncachedCount > 0 && durationMs > 8000;

    if (
      !isHighCostRisk &&
      !isHighLatency &&
      !FEATURE_FLAGS.ENABLE_DEBUG_LOGGING
    ) {
      return;
    }

    const diagnostics = {
      context: contextName,
      totalTexts,
      uncachedCount,
      batchCount,
      durationMs,
      apiCalls: budget.apiCalls,
      maxApiCalls: budget.maxApiCalls,
      retryAttempts: budget.retryAttempts,
      fallbackSingleCount: budget.fallbackSingleCount,
      fallbackSplitCount: budget.fallbackSplitCount,
    };

    if (isHighCostRisk || isHighLatency) {
      logger.warn(
        "[TranslationDiagnostics] Potential risk detected",
        diagnostics,
      );
      return;
    }

    logger.log("[TranslationDiagnostics] Summary", diagnostics);
  }

  private consumeApiCallBudget(context: RequestBudgetContext): void {
    if (context.apiCalls >= context.maxApiCalls) {
      throw new Error(
        `Safety stop: translation aborted after ${context.apiCalls} API calls to prevent excessive charges`,
      );
    }
    context.apiCalls += 1;
  }

  private chunkTextsByConstraints(texts: string[]): string[][] {
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const text of texts) {
      const textLength = text.length;
      const exceedsBatchSize = currentChunk.length >= this.BATCH_SIZE;
      const exceedsMaxLength =
        currentChunk.length > 0 &&
        currentLength + textLength > BATCH_CONFIG.MAX_BATCH_LENGTH;

      if (exceedsBatchSize || exceedsMaxLength) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentLength = 0;
      }

      currentChunk.push(text);
      currentLength += textLength;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Clear cache by layer
   *
   * @param layer - Cache layer to clear ('memory', 'session', 'local', 'all')
   */
  async clearCache(layer: CacheLayer = "all"): Promise<void> {
    switch (layer) {
      case "memory":
        this.memoryCache.clear();
        logger.log("Memory cache cleared");
        break;

      case "session":
        this.clearStorageCache(sessionStorage, "Session storage");
        break;

      case "local":
        this.clearStorageCache(localStorage, "Local storage");
        break;

      case "all":
        await this.clearCache("memory");
        await this.clearCache("session");
        await this.clearCache("local");
        logger.log("All caches cleared");
        break;
    }
  }

  /**
   * Clear translation entries from storage
   */
  private clearStorageCache(storage: Storage, storageName: string): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith("translation:")) {
          keys.push(key);
        }
      }
      keys.forEach((key) => storage.removeItem(key));
      logger.log(`${storageName} cache cleared`);
    } catch (error) {
      logger.error(`${storageName} clear error:`, error);
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics including hit rate
   */
  async getCacheStats(): Promise<CacheStats> {
    return {
      memory: this.memoryCache.size(),
      session: this.getStorageCacheSize(sessionStorage),
      local: this.getStorageCacheSize(localStorage),
      hitRate: this.calculateHitRate(),
    };
  }

  /**
   * Get cache size for storage layer
   */
  private getStorageCacheSize(storage: Storage): number {
    try {
      let count = 0;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith("translation:")) {
          count++;
        }
      }
      return count;
    } catch (error) {
      logger.warn("Storage access error:", error);
      return 0;
    }
  }

  /**
   * Calculate cache hit rate
   */
  private calculateHitRate(): number {
    const totalRequests = this.cacheHits + this.cacheMisses;
    return totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;
  }
}
