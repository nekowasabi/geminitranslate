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

import { OpenRouterClient } from './apiClient';
import { logger } from '../shared/utils/logger';
import { retry } from '../shared/utils/retry';
import { BATCH_CONFIG, RETRY_CONFIG } from '../shared/constants/config';
import LRUCache from '../shared/utils/lruCache';

/**
 * Cache layer type
 */
export type CacheLayer = 'memory' | 'session' | 'local' | 'all';

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
    logger.log('TranslationEngine initialized');
  }

  /**
   * Translate batch of texts with 3-tier caching
   *
   * @param texts - Array of texts to translate
   * @param targetLanguage - Target language name (e.g., 'Japanese', 'French')
   * @returns Array of translated texts in same order as input
   * @throws Error if engine not initialized or API request fails after retries
   */
  async translateBatch(texts: string[], targetLanguage: string): Promise<string[]> {
    const timestamp = new Date().toISOString();
    console.log(`[Background:TranslationEngine] ${timestamp} - translateBatch() called:`, {
      textsCount: texts.length,
      targetLanguage,
      firstText: texts[0]?.substring(0, 50)
    });

    if (!this.initialized) {
      console.error(`[Background:TranslationEngine] ${timestamp} - Engine not initialized`);
      throw new Error('TranslationEngine not initialized. Call initialize() first.');
    }

    // Handle empty input
    if (texts.length === 0) {
      console.log(`[Background:TranslationEngine] ${timestamp} - Empty input, returning empty array`);
      return [];
    }

    const results: string[] = new Array(texts.length);
    const uncachedIndices: number[] = [];

    // Check all cache layers
    console.log(`[Background:TranslationEngine] ${timestamp} - Checking cache for ${texts.length} texts...`);
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

    console.log(`[Background:TranslationEngine] ${timestamp} - Cache check complete:`, {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      uncachedCount: uncachedIndices.length
    });

    // Translate uncached texts in batches
    if (uncachedIndices.length > 0) {
      const uncachedTexts = uncachedIndices.map((i) => texts[i]);
      const batches = this.chunkArray(uncachedTexts, this.BATCH_SIZE);

      console.log(`[Background:TranslationEngine] ${timestamp} - Translating ${uncachedIndices.length} uncached texts in ${batches.length} batches`);

      // Process batches in parallel
      const batchResults = await Promise.all(
        batches.map((batch, index) => {
          console.log(`[Background:TranslationEngine] ${timestamp} - Processing batch ${index + 1}/${batches.length}:`, {
            batchSize: batch.length
          });
          return this.translateWithRetry(batch, targetLanguage);
        })
      );

      console.log(`[Background:TranslationEngine] ${timestamp} - All batches processed`);

      // Flatten batch results
      const translations = batchResults.flat();

      console.log(`[Background:TranslationEngine] ${timestamp} - Flattened translations:`, {
        count: translations.length
      });

      // Store results and update cache
      for (let i = 0; i < uncachedIndices.length; i++) {
        const originalIndex = uncachedIndices[i];
        const translation = translations[i];
        results[originalIndex] = translation;

        // Save to all cache layers
        await this.setCachedTranslation(texts[originalIndex], targetLanguage, translation);
      }

      console.log(`[Background:TranslationEngine] ${timestamp} - Cache updated with new translations`);
    }

    console.log(`[Background:TranslationEngine] ${timestamp} - translateBatch() completed:`, {
      resultsCount: results.length,
      firstResult: results[0]?.substring(0, 50)
    });

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
    targetLanguage: string
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
      text: cacheKey.split(':')[1],
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
    translation: string
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
  private saveToStorage(storage: Storage, cacheKey: string, entry: CacheEntry): void {
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
    targetLanguage: string
  ): Promise<string[]> {
    return retry(async () => this.apiClient.translate(texts, targetLanguage), {
      maxRetries: RETRY_CONFIG.MAX_RETRIES,
      delay: RETRY_CONFIG.INITIAL_DELAY,
      backoff: RETRY_CONFIG.BACKOFF,
      onError: (error, attempt) => {
        logger.warn(`Translation retry attempt ${attempt + 1}:`, error.message);
      },
    });
  }

  /**
   * Clear cache by layer
   *
   * @param layer - Cache layer to clear ('memory', 'session', 'local', 'all')
   */
  async clearCache(layer: CacheLayer = 'all'): Promise<void> {
    switch (layer) {
      case 'memory':
        this.memoryCache.clear();
        logger.log('Memory cache cleared');
        break;

      case 'session':
        this.clearStorageCache(sessionStorage, 'Session storage');
        break;

      case 'local':
        this.clearStorageCache(localStorage, 'Local storage');
        break;

      case 'all':
        await this.clearCache('memory');
        await this.clearCache('session');
        await this.clearCache('local');
        logger.log('All caches cleared');
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
        if (key?.startsWith('translation:')) {
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
        if (key?.startsWith('translation:')) {
          count++;
        }
      }
      return count;
    } catch (error) {
      logger.warn('Storage access error:', error);
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

  /**
   * Chunk array into smaller arrays
   *
   * @param array - Array to chunk
   * @param size - Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
