/**
 * TranslationCache Unit Tests
 *
 * Tests for the extracted cache layer with 3-tier caching system
 * (Memory / browser.storage.local).
 */

import { TranslationCache } from "../../../src/background/translationCache";

jest.mock("../../../src/shared/utils/logger", () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("TranslationCache", () => {
  let cache: TranslationCache;

  // Mock browser.storage.local data store
  const mockBrowserStorage: Map<string, string> = new Map();

  beforeEach(() => {
    jest.clearAllMocks();
    mockBrowserStorage.clear();

    (global as any).browser.storage.local.get = jest.fn((keys: string | string[] | null) => {
      if (keys === null) {
        const result: Record<string, string> = {};
        mockBrowserStorage.forEach((value, key) => { result[key] = value; });
        return Promise.resolve(result);
      }
      const keysArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, string> = {};
      keysArray.forEach((key: string) => {
        if (mockBrowserStorage.has(key)) {
          result[key] = mockBrowserStorage.get(key)!;
        }
      });
      return Promise.resolve(result);
    });
    (global as any).browser.storage.local.set = jest.fn((data: Record<string, string>) => {
      Object.entries(data).forEach(([key, value]) => {
        mockBrowserStorage.set(key, value);
      });
      return Promise.resolve();
    });
    (global as any).browser.storage.local.remove = jest.fn((keys: string | string[]) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key: string) => mockBrowserStorage.delete(key));
      return Promise.resolve();
    });

    cache = new TranslationCache();
  });

  describe("getCacheKey", () => {
    it("should generate a stable cache key", () => {
      const key = cache.getCacheKey("Hello", "Japanese");
      expect(key).toBe("translation:Hello:Japanese");
    });

    it("should encode text containing colons to prevent key collision", () => {
      const key = cache.getCacheKey("http://example.com:8080", "Japanese");
      expect(key).toContain("%3A"); // colon encoded
      expect(key).not.toMatch(/translation:http:\/\//);
    });

    it("should produce different keys for different languages", () => {
      const jpKey = cache.getCacheKey("Hello", "Japanese");
      const frKey = cache.getCacheKey("Hello", "French");
      expect(jpKey).not.toBe(frKey);
    });
  });

  describe("getCachedTranslation", () => {
    it("should return null on cache miss", async () => {
      const result = await cache.getCachedTranslation("Hello", "Japanese");
      expect(result).toBeNull();
    });

    it("should return translation from memory after setCachedTranslation", async () => {
      await cache.setCachedTranslation("Hello", "Japanese", "こんにちは");
      const result = await cache.getCachedTranslation("Hello", "Japanese");
      expect(result).toBe("こんにちは");
    });

    it("should return translation from storage and promote to memory cache", async () => {
      mockBrowserStorage.set(
        "translation:Hello:Japanese",
        JSON.stringify({ text: "Hello", translation: "こんにちは" }),
      );

      const result = await cache.getCachedTranslation("Hello", "Japanese");
      expect(result).toBe("こんにちは");

      // Verify memory cache was populated (no storage call on second access)
      (global as any).browser.storage.local.get = jest.fn().mockResolvedValue({});
      const result2 = await cache.getCachedTranslation("Hello", "Japanese");
      expect(result2).toBe("こんにちは");
    });

    it("should return null for expired TTL entries", async () => {
      const ONE_HOUR_PLUS = 60 * 60 * 1000 + 1;
      mockBrowserStorage.set(
        "translation:TTLTest:Japanese",
        JSON.stringify({
          text: "TTLTest",
          translation: "期限切れ",
          createdAt: Date.now() - ONE_HOUR_PLUS,
        }),
      );

      const result = await cache.getCachedTranslation("TTLTest", "Japanese");
      expect(result).toBeNull();
    });

    it("should treat entries without createdAt as valid (backward compatibility)", async () => {
      mockBrowserStorage.set(
        "translation:Legacy:Japanese",
        JSON.stringify({ text: "Legacy", translation: "レガシー" }),
      );

      const result = await cache.getCachedTranslation("Legacy", "Japanese");
      expect(result).toBe("レガシー");
    });
  });

  describe("getBulkCachedTranslations", () => {
    it("should return null for all texts on empty cache", async () => {
      const results = await cache.getBulkCachedTranslations(["A", "B"], "Japanese");
      expect(results).toEqual([null, null]);
    });

    it("should return cached values from memory", async () => {
      await cache.setCachedTranslation("A", "Japanese", "エー");
      await cache.setCachedTranslation("B", "Japanese", "ビー");

      const results = await cache.getBulkCachedTranslations(["A", "B"], "Japanese");
      expect(results).toEqual(["エー", "ビー"]);
    });

    it("should mix memory hits and storage hits correctly", async () => {
      await cache.setCachedTranslation("A", "Japanese", "エー");
      mockBrowserStorage.set(
        "translation:B:Japanese",
        JSON.stringify({ text: "B", translation: "ビー" }),
      );

      const results = await cache.getBulkCachedTranslations(["A", "B", "C"], "Japanese");
      expect(results).toEqual(["エー", "ビー", null]);
    });

    it("should call storage.get only once (bulk fetch) for all misses", async () => {
      const storageGetSpy = jest.fn().mockResolvedValue({});
      (global as any).browser.storage.local.get = storageGetSpy;

      await cache.getBulkCachedTranslations(["X", "Y", "Z"], "Japanese");

      // Should be called once with array of keys
      const arrayCalls = storageGetSpy.mock.calls.filter(
        (call) => Array.isArray(call[0]) && call[0].length > 0,
      );
      expect(arrayCalls).toHaveLength(1);
      expect(arrayCalls[0][0]).toHaveLength(3);
    });

    it("should not call storage.get when all texts are in memory cache", async () => {
      await cache.setCachedTranslation("A", "Japanese", "エー");
      await cache.setCachedTranslation("B", "Japanese", "ビー");

      const storageGetSpy = jest.fn().mockResolvedValue({});
      (global as any).browser.storage.local.get = storageGetSpy;

      await cache.getBulkCachedTranslations(["A", "B"], "Japanese");

      const arrayCalls = storageGetSpy.mock.calls.filter(
        (call) => Array.isArray(call[0]) && call[0].length > 0,
      );
      expect(arrayCalls).toHaveLength(0);
    });

    it("should gracefully degrade when storage.get throws", async () => {
      (global as any).browser.storage.local.get = jest.fn().mockRejectedValue(
        new Error("Storage error"),
      );

      const results = await cache.getBulkCachedTranslations(["X"], "Japanese");
      expect(results).toEqual([null]);
    });
  });

  describe("setBulkCachedTranslations", () => {
    it("should update memory cache synchronously", async () => {
      cache.setBulkCachedTranslations([
        { text: "Hello", targetLanguage: "Japanese", translation: "こんにちは" },
        { text: "Goodbye", targetLanguage: "Japanese", translation: "さようなら" },
      ]);

      // Memory should be updated immediately (no await needed)
      (global as any).browser.storage.local.get = jest.fn().mockResolvedValue({});
      const result1 = await cache.getCachedTranslation("Hello", "Japanese");
      const result2 = await cache.getCachedTranslation("Goodbye", "Japanese");
      expect(result1).toBe("こんにちは");
      expect(result2).toBe("さようなら");
    });

    it("should call storage.set exactly once (bulk write)", async () => {
      cache.setBulkCachedTranslations([
        { text: "A", targetLanguage: "Japanese", translation: "エー" },
        { text: "B", targetLanguage: "Japanese", translation: "ビー" },
        { text: "C", targetLanguage: "Japanese", translation: "シー" },
      ]);

      // Wait for fire-and-forget to complete
      await Promise.resolve();

      expect((global as any).browser.storage.local.set).toHaveBeenCalledTimes(1);
    });

    it("should not propagate storage write failure to caller", async () => {
      (global as any).browser.storage.local.set = jest.fn().mockRejectedValue(
        new Error("Quota exceeded"),
      );

      // Should not throw
      expect(() => {
        cache.setBulkCachedTranslations([
          { text: "Hello", targetLanguage: "Japanese", translation: "こんにちは" },
        ]);
      }).not.toThrow();
    });
  });

  describe("clearCache", () => {
    beforeEach(async () => {
      await cache.setCachedTranslation("Hello", "Japanese", "こんにちは");
      // Ensure storage is also populated via setBulkCachedTranslations
      await Promise.resolve();
    });

    it("should clear memory cache only when layer=memory", async () => {
      await cache.clearCache("memory");
      const stats = await cache.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBeGreaterThan(0);
    });

    it("should clear storage when layer=session", async () => {
      await cache.clearCache("session");
      const stats = await cache.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0); // memory not cleared
      expect(stats.session).toBe(0);
    });

    it("should clear storage when layer=local", async () => {
      await cache.clearCache("local");
      const stats = await cache.getCacheStats();
      expect(stats.local).toBe(0);
    });

    it("should clear all caches when layer=all (default)", async () => {
      await cache.clearCache();
      const stats = await cache.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });

    it("should clear all caches with explicit layer=all", async () => {
      await cache.clearCache("all");
      const stats = await cache.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return zero stats on empty cache", async () => {
      const stats = await cache.getCacheStats();
      expect(stats).toEqual({ memory: 0, session: 0, local: 0, hitRate: 0 });
    });

    it("should return accurate memory count after setCachedTranslation", async () => {
      await cache.setCachedTranslation("Hello", "Japanese", "こんにちは");
      await cache.setCachedTranslation("Goodbye", "Japanese", "さようなら");

      const stats = await cache.getCacheStats();
      expect(stats.memory).toBe(2);
      expect(stats.session).toBe(2);
      expect(stats.local).toBe(2);
    });

    it("should calculate hit rate correctly", async () => {
      // 0 hits, 0 misses → 0%
      let stats = await cache.getCacheStats();
      expect(stats.hitRate).toBe(0);

      // 1 miss
      cache.recordMiss();
      stats = await cache.getCacheStats();
      expect(stats.hitRate).toBe(0); // 0/(0+1) = 0%

      // 1 hit, 1 miss → 50%
      cache.recordHit();
      stats = await cache.getCacheStats();
      expect(stats.hitRate).toBe(50);

      // 2 hits, 1 miss → 66.67%
      cache.recordHit();
      stats = await cache.getCacheStats();
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });
  });

  describe("recordHit / recordMiss", () => {
    it("should track hits and misses independently", async () => {
      cache.recordHit();
      cache.recordHit();
      cache.recordMiss();

      const stats = await cache.getCacheStats();
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });
  });
});
