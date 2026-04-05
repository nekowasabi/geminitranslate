/**
 * TranslationCache
 *
 * Why: TranslationCache extracted from TranslationEngine — SRP: cache management separated from translation orchestration
 *
 * Manages a 3-tier caching system (Memory/Session/Local Storage) for translation results.
 *
 * Features:
 * - 3-tier cache hierarchy (Memory → Session → Local)
 * - LRU memory cache with configurable max size
 * - TTL-based expiration for persistent storage entries
 * - Bulk read/write operations for minimal IPC round-trips
 * - Cache hit rate tracking
 * - Graceful degradation on storage errors
 */

import { logger } from "../shared/utils/logger";
import { CACHE_CONFIG } from "../shared/constants/config";
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
  // Why: optional for backward compat — existing entries without createdAt remain valid
  createdAt?: number;
}

/**
 * TranslationCache manages 3-tier caching for translation results.
 *
 * Tier 1: Memory cache (LRU, fastest, session-scoped)
 * Tier 2/3: browser.storage.local (persistent, replaces both session/local DOM Storage)
 *
 * Why: browser.storage.local instead of sessionStorage/localStorage —
 *      Chrome MV3 Service Workers do not have access to DOM Storage APIs
 */
export class TranslationCache {
  /**
   * Memory cache (fastest, session-scoped)
   * LRU cache with max 1000 entries
   */
  private memoryCache: LRUCache<string> = new LRUCache<string>(1000);

  /**
   * Cache hit/miss tracking
   */
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Generate cache key
   *
   * @param text - Original text
   * @param targetLanguage - Target language
   * @returns Cache key string
   */
  getCacheKey(text: string, targetLanguage: string): string {
    // Why: encodeURIComponent instead of raw text — prevent key collision when text contains ':'
    return `translation:${encodeURIComponent(text)}:${targetLanguage}`;
  }

  /**
   * Record a cache hit
   */
  recordHit(): void {
    this.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordMiss(): void {
    this.cacheMisses++;
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
  async getCachedTranslation(
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
  async getBulkCachedTranslations(
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
  async setCachedTranslation(
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
  setBulkCachedTranslations(
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
