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
  CACHE_CONFIG,
  FEATURE_FLAGS,
  RETRY_CONFIG,
} from "../shared/constants/config";
import LRUCache from "../shared/utils/lruCache";
import { retry } from "../shared/utils/retry";

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
  // Why: optional for backward compat — existing entries without createdAt remain valid
  createdAt?: number;
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
    logger.log(
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

    // Why: getBulkCachedTranslations instead of N getCachedTranslation calls — single IPC round trip
    const cachedResults = await this.getBulkCachedTranslations(texts, targetLanguage);
    for (let i = 0; i < texts.length; i++) {
      if (cachedResults[i] !== null) {
        results[i] = cachedResults[i]!;
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

    logger.log(
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

    // Store results and update cache in bulk
    // Why: setBulkCachedTranslations — memory update sync, storage write fire-and-forget
    const cachePairsSemiParallel = uncachedIndices.map((originalIndex, i) => ({
      text: texts[originalIndex],
      targetLanguage,
      translation: translatedTexts[i],
    }));
    for (let i = 0; i < uncachedIndices.length; i++) {
      results[uncachedIndices[i]] = translatedTexts[i];
    }
    this.setBulkCachedTranslations(cachePairsSemiParallel);

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
    logger.log(
      `[Background:TranslationEngine] ${timestamp} - translateBatch() called:`,
      {
        textsCount: texts.length,
        targetLanguage,
        firstText: texts[0]?.substring(0, 50),
      },
    );

    if (!this.initialized) {
      logger.error(
        `[Background:TranslationEngine] ${timestamp} - Engine not initialized`,
      );
      throw new Error(
        "TranslationEngine not initialized. Call initialize() first.",
      );
    }

    // Handle empty input
    if (texts.length === 0) {
      logger.log(
        `[Background:TranslationEngine] ${timestamp} - Empty input, returning empty array`,
      );
      return [];
    }

    const results: string[] = new Array(texts.length);
    const uncachedIndices: number[] = [];

    const requestBudget = this.createRequestBudgetContext(texts.length);
    let batchCount = 0;

    // Check all cache layers
    logger.log(
      `[Background:TranslationEngine] ${timestamp} - Checking cache for ${texts.length} texts...`,
    );
    // Why: getBulkCachedTranslations instead of N getCachedTranslation calls — single IPC round trip
    const cachedResultsBatch = await this.getBulkCachedTranslations(texts, targetLanguage);
    for (let i = 0; i < texts.length; i++) {
      if (cachedResultsBatch[i] !== null) {
        results[i] = cachedResultsBatch[i]!;
        this.cacheHits++;
      } else {
        uncachedIndices.push(i);
        this.cacheMisses++;
      }
    }

    logger.log(
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

      logger.log(
        `[Background:TranslationEngine] ${timestamp} - Translating ${uncachedIndices.length} uncached texts in ${batches.length} batches`,
      );

      // Process batches in parallel
      const batchResults = await Promise.all(
        batches.map((batch, index) => {
          logger.log(
            `[Background:TranslationEngine] ${timestamp} - Processing batch ${index + 1}/${batches.length}:`,
            {
              batchSize: batch.length,
            },
          );
          return this.translateWithRetry(batch, targetLanguage, requestBudget);
        }),
      );

      logger.log(
        `[Background:TranslationEngine] ${timestamp} - All batches processed`,
      );

      // Flatten batch results
      const translations = batchResults.flatMap(
        (result) => result.translations,
      );

      logger.log(
        `[Background:TranslationEngine] ${timestamp} - Flattened translations:`,
        {
          count: translations.length,
        },
      );

      // Store results and update cache in bulk
      // Why: setBulkCachedTranslations — memory update sync, storage write fire-and-forget
      const cachePairsBatch = uncachedIndices.map((originalIndex, i) => ({
        text: texts[originalIndex],
        targetLanguage,
        translation: translations[i],
      }));
      for (let i = 0; i < uncachedIndices.length; i++) {
        results[uncachedIndices[i]] = translations[i];
      }
      this.setBulkCachedTranslations(cachePairsBatch);

      logger.log(
        `[Background:TranslationEngine] ${timestamp} - Cache updated with new translations`,
      );
    }

    logger.log(
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

    // Check browser.storage.local (replaces both session and local storage tiers)
    const persistentHit = await this.getFromStorage(cacheKey);
    if (persistentHit) {
      this.promoteToMemoryCache(cacheKey, persistentHit);
      return persistentHit;
    }

    return null;
  }

  /**
   * Get multiple cached translations in bulk
   *
   * Pass 1: Check memory cache synchronously (no I/O)
   * Pass 2: Fetch remaining from storage in a single bulk get() call
   *
   * @param texts - Array of texts to look up
   * @param targetLanguage - Target language
   * @returns Array of cached translations or null for misses
   */
  // Why: get(keyArray) instead of N individual get() — single IPC round trip
  private async getBulkCachedTranslations(
    texts: string[],
    targetLanguage: string,
  ): Promise<(string | null)[]> {
    const cacheKeys = texts.map((t) => this.getCacheKey(t, targetLanguage));

    // Pass 1: memory cache (同期、I/Oなし)
    const results: (string | null)[] = cacheKeys.map(
      (key) => this.memoryCache.get(key) ?? null,
    );

    // Pass 2: storage bulk fetch for memory-miss keys
    const missIndices = results
      .map((r, i) => (r === null ? i : -1))
      .filter((i) => i >= 0);

    if (missIndices.length > 0) {
      const missKeys = missIndices.map((i) => cacheKeys[i]);
      try {
        const storageResult = await browser.storage.local.get(missKeys);
        for (const idx of missIndices) {
          const data = storageResult[cacheKeys[idx]];
          if (data) {
            const entry: CacheEntry = JSON.parse(data as string);
            // TTL check: expired entries treated as misses
            // Why: createdAt なしエントリは有効 (後方互換) — 既存キャッシュを一斉無効化しない
            if (
              entry.createdAt &&
              Date.now() - entry.createdAt > CACHE_CONFIG.TTL
            ) {
              browser.storage.local.remove(cacheKeys[idx]).catch(() => {});
              continue;
            }
            results[idx] = entry.translation;
            this.promoteToMemoryCache(cacheKeys[idx], entry.translation);
          }
        }
      } catch (error) {
        logger.warn("Bulk storage read failed:", error);
      }
    }

    return results;
  }

  /**
   * Get translation from memory cache
   */
  private getFromMemoryCache(cacheKey: string): string | null {
    return this.memoryCache.get(cacheKey) || null;
  }

  /**
   * Get translation from browser.storage.local
   * Why: sessionStorage/localStorage直接アクセスではなくbrowser.storage.local —
   *      Chrome MV3 Service WorkerではDOM Storage APIが利用不可のため
   */
  private async getFromStorage(cacheKey: string): Promise<string | null> {
    try {
      const result = await browser.storage.local.get(cacheKey);
      const data = result[cacheKey];
      if (data) {
        const entry: CacheEntry = JSON.parse(data as string);
        // TTL check: expired entries treated as misses
        // Why: createdAt なしエントリは有効 (後方互換) — 既存キャッシュを一斉無効化しない
        if (entry.createdAt && Date.now() - entry.createdAt > CACHE_CONFIG.TTL) {
          browser.storage.local.remove(cacheKey).catch(() => {});
          return null;
        }
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
    const entry: CacheEntry = { text, translation, createdAt: Date.now() };

    // Save to memory cache (always succeeds)
    this.memoryCache.set(cacheKey, translation);

    // Save to browser.storage.local (replaces both session and local storage tiers)
    await this.saveToStorage(cacheKey, entry);
  }

  /**
   * Save entry to browser.storage.local with error handling
   * Why: sessionStorage/localStorage直接アクセスではなくbrowser.storage.local —
   *      Chrome MV3 Service WorkerではDOM Storage APIが利用不可のため
   */
  private async saveToStorage(cacheKey: string, entry: CacheEntry): Promise<void> {
    try {
      await browser.storage.local.set({ [cacheKey]: JSON.stringify(entry) });
    } catch (error) {
      logger.warn(`Storage write error for key ${cacheKey}:`, error);
    }
  }

  /**
   * Set multiple cached translations in bulk
   *
   * Updates memory cache synchronously and writes to storage as fire-and-forget (void + catch).
   * Ensures Phase 2 starts immediately without waiting for storage I/O.
   *
   * @param pairs - Array of text/language/translation tuples to cache
   */
  private setBulkCachedTranslations(
    pairs: Array<{
      text: string;
      targetLanguage: string;
      translation: string;
    }>,
  ): void {
    const bulkData: Record<string, string> = {};
    for (const { text, targetLanguage, translation } of pairs) {
      const cacheKey = this.getCacheKey(text, targetLanguage);
      // 同期的にメモリキャッシュを更新（即時）
      this.memoryCache.set(cacheKey, translation);
      bulkData[cacheKey] = JSON.stringify({
        text,
        translation,
        createdAt: Date.now(),
      });
    }
    // Why: 1回のset()でまとめて書き込み、awaitしない — IPC往復をN回→1回に削減
    // Why: fire-and-forget — cache write must not block Phase 2 start
    browser.storage.local.set(bulkData).catch((error: unknown) => {
      logger.warn("Bulk storage write failed:", error);
    });
  }

  /**
   * Generate cache key
   *
   * @param text - Original text
   * @param targetLanguage - Target language
   * @returns Cache key string
   */
  private getCacheKey(text: string, targetLanguage: string): string {
    // Why: encodeURIComponent instead of raw text — prevent key collision when text contains ':'
    return `translation:${encodeURIComponent(text)}:${targetLanguage}`;
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
    depth: number = 0,
  ): Promise<string[]> {
    // Why: depth>=1でtranslateIndividually()にフォールバック —
    //      二分割を繰り返してもcount mismatchが続く場合、O(n)個別翻訳の方が確実性が高いため
    if (depth >= 1) {
      return this.translateIndividually(texts, targetLanguage, requestBudget, options);
    }

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
            depth + 1,
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
    // Why: カスタムforループではなくretry()ユーティリティ —
    //      バックオフロジックの重複実装を排除し、最大API呼び出し回数を maxRetries+1 に一元管理
    return retry(
      async () => {
        this.consumeApiCallBudget(requestBudget);
        const translated = await operation();

        if (translated.length !== expectedCount) {
          throw new ParseCountMismatchError(expectedCount, translated.length);
        }

        return translated;
      },
      {
        maxRetries: RETRY_CONFIG.MAX_RETRIES,
        delay: RETRY_CONFIG.INITIAL_DELAY,
        backoff: RETRY_CONFIG.BACKOFF as "exponential" | "linear",
        // Why: ParseCountMismatchError はリトライ対象外 —
        //      LLMの応答形式の問題はリトライでは改善せず、上位の fallback 処理（translateByBinarySplit 等）に委ねる
        shouldRetry: (error) => !(error instanceof ParseCountMismatchError),
        onError: (error, attempt) => {
          requestBudget.retryAttempts += 1;
          logger.warn(
            `${context} retry attempt ${attempt + 1}:`,
            error.message,
          );
        },
      },
    );
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
        await this.clearStorageCache();
        break;

      case "local":
        await this.clearStorageCache();
        break;

      case "all":
        await this.clearCache("memory");
        await this.clearStorageCache();
        logger.log("All caches cleared");
        break;
    }
  }

  /**
   * Clear translation entries from browser.storage.local
   * Why: sessionStorage/localStorage直接アクセスではなくbrowser.storage.local —
   *      Chrome MV3 Service WorkerではDOM Storage APIが利用不可のため
   */
  private async clearStorageCache(): Promise<void> {
    try {
      const allItems = await browser.storage.local.get(null);
      const translationKeys = Object.keys(allItems).filter((key) =>
        key.startsWith("translation:"),
      );
      if (translationKeys.length > 0) {
        await browser.storage.local.remove(translationKeys);
      }
      logger.log("browser.storage.local cache cleared");
    } catch (error) {
      logger.error("browser.storage.local clear error:", error);
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics including hit rate
   */
  async getCacheStats(): Promise<CacheStats> {
    const storageSize = await this.getStorageCacheSize();
    return {
      memory: this.memoryCache.size(),
      session: storageSize,
      local: storageSize,
      hitRate: this.calculateHitRate(),
    };
  }

  /**
   * Get cache size from browser.storage.local
   * Why: sessionStorage/localStorage直接アクセスではなくbrowser.storage.local —
   *      Chrome MV3 Service WorkerではDOM Storage APIが利用不可のため
   */
  private async getStorageCacheSize(): Promise<number> {
    try {
      const allItems = await browser.storage.local.get(null);
      return Object.keys(allItems).filter((key) =>
        key.startsWith("translation:"),
      ).length;
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
