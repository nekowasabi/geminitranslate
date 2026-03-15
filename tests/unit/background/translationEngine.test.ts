/**
 * TranslationEngine Unit Tests
 *
 * Tests for the translation engine with 3-tier cache system (Memory/Session/Local)
 * and batch processing with OpenRouter API integration.
 */

import { TranslationEngine } from "../../../src/background/translationEngine";
import { OpenRouterClient } from "../../../src/background/apiClient";
import StorageManager from "../../../src/shared/storage/StorageManager";
import { BATCH_CONFIG } from "../../../src/shared/constants/config";

// Mock dependencies
jest.mock("../../../src/background/apiClient");
jest.mock("../../../src/shared/storage/StorageManager");
jest.mock("../../../src/shared/utils/logger", () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("TranslationEngine", () => {
  let engine: TranslationEngine;
  let mockApiClient: jest.Mocked<OpenRouterClient>;
  let mockStorage: jest.Mocked<StorageManager>;

  // Mock browser.storage.local data store (replaces sessionStorage/localStorage)
  const mockBrowserStorage: Map<string, string> = new Map();

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    mockBrowserStorage.clear();

    // Mock sessionStorage (kept for backward compat check in migration tests)
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        get length() { return 0; },
        key: jest.fn(() => null),
      },
      writable: true,
      configurable: true,
    });

    // Mock localStorage (kept for backward compat check in migration tests)
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        get length() { return 0; },
        key: jest.fn(() => null),
      },
      writable: true,
      configurable: true,
    });

    // Mock browser.storage.local with data-holding implementation
    // Why: Tests need actual data persistence behavior to verify cache hit/miss logic
    (global as any).browser.storage.local.get = jest.fn((keys: string | string[] | null) => {
      if (keys === null) {
        // Return all items
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

    // Mock OpenRouterClient
    mockApiClient = {
      initialize: jest.fn().mockResolvedValue(undefined),
      translate: jest.fn().mockResolvedValue(["translated"]),
      testConnection: jest.fn(),
    } as any;
    (
      OpenRouterClient as jest.MockedClass<typeof OpenRouterClient>
    ).mockImplementation(() => mockApiClient);

    // Mock StorageManager
    mockStorage = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as any;
    (
      StorageManager as jest.MockedClass<typeof StorageManager>
    ).mockImplementation(() => mockStorage);

    engine = new TranslationEngine();
  });

  describe("initialization", () => {
    it("should initialize OpenRouterClient on instantiation", async () => {
      await engine.initialize();
      expect(mockApiClient.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe("translateBatch - Cache Hit Tests", () => {
    it("should return from memory cache without API call", async () => {
      // RED: Memory cache hit should skip API
      await engine.initialize();

      // First call to populate cache
      mockApiClient.translate.mockResolvedValueOnce([
        "こんにちは",
        "さようなら",
      ]);
      const firstResult = await engine.translateBatch(
        ["Hello", "Goodbye"],
        "Japanese",
      );
      expect(firstResult).toEqual(["こんにちは", "さようなら"]);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);

      // Second call should use cache
      mockApiClient.translate.mockClear();
      const secondResult = await engine.translateBatch(
        ["Hello", "Goodbye"],
        "Japanese",
      );
      expect(secondResult).toEqual(["こんにちは", "さようなら"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it("should promote browser.storage.local hit to memory cache", async () => {
      // browser.storage.local hit should populate memory cache
      await engine.initialize();

      // Pre-populate browser.storage.local
      mockBrowserStorage.set(
        "translation:Hello:Japanese",
        JSON.stringify({ text: "Hello", translation: "こんにちは" }),
      );

      const result = await engine.translateBatch(["Hello"], "Japanese");
      expect(result).toEqual(["こんにちは"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();

      // Verify memory cache was populated
      const cacheStats = await engine.getCacheStats();
      expect(cacheStats.memory).toBe(1);
    });

    it("should retrieve from browser.storage.local and report in cache stats", async () => {
      // browser.storage.local hit should be reflected in cache stats
      await engine.initialize();

      // Pre-populate browser.storage.local
      mockBrowserStorage.set(
        "translation:Hello:Japanese",
        JSON.stringify({ text: "Hello", translation: "こんにちは" }),
      );

      const result = await engine.translateBatch(["Hello"], "Japanese");
      expect(result).toEqual(["こんにちは"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();

      // Verify caches were populated (session and local both reflect browser.storage.local size)
      const cacheStats = await engine.getCacheStats();
      expect(cacheStats.memory).toBe(1);
      expect(cacheStats.session).toBe(1);
      expect(cacheStats.local).toBe(1);
    });
  });

  describe("translateBatch - Cache Miss Tests", () => {
    it("should call API on cache miss and save to all cache layers", async () => {
      // RED: Cache miss should trigger API call and save to all layers
      await engine.initialize();

      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      const result = await engine.translateBatch(["Hello"], "Japanese");

      expect(result).toEqual(["こんにちは"]);
      expect(mockApiClient.translate).toHaveBeenCalledWith(
        ["Hello"],
        "Japanese",
      );

      // Verify all cache layers are populated
      const cacheStats = await engine.getCacheStats();
      expect(cacheStats.memory).toBe(1);
      expect(cacheStats.session).toBe(1);
      expect(cacheStats.local).toBe(1);
    });

    it("should handle partial cache hits", async () => {
      // RED: Mix of cached and uncached texts
      await engine.initialize();

      // Pre-populate cache with one text
      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      await engine.translateBatch(["Hello"], "Japanese");
      mockApiClient.translate.mockClear();

      // Translate batch with cached and uncached text
      mockApiClient.translate.mockResolvedValueOnce(["世界"]);
      const result = await engine.translateBatch(
        ["Hello", "World"],
        "Japanese",
      );

      expect(result).toEqual(["こんにちは", "世界"]);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);
      expect(mockApiClient.translate).toHaveBeenCalledWith(
        ["World"],
        "Japanese",
      );
    });
  });

  describe("translateBatch - Batch Processing Tests", () => {
    it("should split large batches into chunks of BATCH_SIZE", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const totalTexts = batchSize + 5;
      const texts = Array.from({ length: totalTexts }, (_, i) => `Text ${i}`);
      const translations = texts.map((_, i) => `Translation ${i}`);

      // Mock API to return translations in batches
      mockApiClient.translate
        .mockResolvedValueOnce(translations.slice(0, batchSize))
        .mockResolvedValueOnce(translations.slice(batchSize, totalTexts));

      const result = await engine.translateBatch(texts, "Japanese");

      expect(result).toEqual(translations);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(2);
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        1,
        texts.slice(0, batchSize),
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        2,
        texts.slice(batchSize, totalTexts),
        "Japanese",
      );
    });

    it("should process batches in parallel", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize * 2 },
        (_, i) => `Text ${i}`,
      );
      const translations = texts.map((_, i) => `Translation ${i}`);

      let callOrder: number[] = [];
      mockApiClient.translate.mockImplementation(async (batch: string[]) => {
        const startIndex = texts.indexOf(batch[0]);
        callOrder.push(startIndex);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return translations.slice(startIndex, startIndex + batch.length);
      });

      await engine.translateBatch(texts, "Japanese");

      // Both batches should be called (parallel execution)
      expect(mockApiClient.translate).toHaveBeenCalledTimes(2);
    });

    it("should split batches by MAX_BATCH_LENGTH even when batch count is small", async () => {
      await engine.initialize();

      const longLength = Math.floor(BATCH_CONFIG.MAX_BATCH_LENGTH / 2) + 20;
      const text1 = "A".repeat(longLength);
      const text2 = "B".repeat(longLength);

      mockApiClient.translate
        .mockResolvedValueOnce(["Translation A"])
        .mockResolvedValueOnce(["Translation B"]);

      const result = await engine.translateBatch([text1, text2], "Japanese");

      expect(result).toEqual(["Translation A", "Translation B"]);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(2);
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        1,
        [text1],
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        2,
        [text2],
        "Japanese",
      );
    });
  });

  describe("translateBatch - Retry Integration Tests", () => {
    it("should retry on API failure", async () => {
      // RED: Verify retry logic integration
      await engine.initialize();

      let callCount = 0;
      mockApiClient.translate.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Network error");
        }
        return ["こんにちは"];
      });

      const result = await engine.translateBatch(["Hello"], "Japanese");

      expect(result).toEqual(["こんにちは"]);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(3);
    });

    it("should throw error after max retries exhausted", async () => {
      // RED: Should throw after 3 retries (initial + 3 retries = 4 calls)
      await engine.initialize();

      mockApiClient.translate.mockRejectedValue(new Error("Persistent error"));

      await expect(
        engine.translateBatch(["Hello"], "Japanese"),
      ).rejects.toThrow("Persistent error");

      // Should have tried 4 times (initial + 3 retries)
      expect(mockApiClient.translate).toHaveBeenCalledTimes(4);
    }, 10000); // 10 second timeout

    it("should fallback to single-text translation on persistent count mismatch", async () => {
      await engine.initialize();

      const texts = ["Hello", "World", "Again"];

      mockApiClient.translate
        .mockResolvedValueOnce(["broken"]) // count mismatch for batch of 3
        .mockResolvedValueOnce(["こんにちは"])
        .mockResolvedValueOnce(["世界"])
        .mockResolvedValueOnce(["もう一度"]);

      const result = await engine.translateBatch(texts, "Japanese");

      expect(result).toEqual(["こんにちは", "世界", "もう一度"]);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(4);
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        1,
        texts,
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        2,
        ["Hello"],
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        3,
        ["World"],
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        4,
        ["Again"],
        "Japanese",
      );
    });

    it("should use binary-split fallback for large mismatch batches to reduce API calls", async () => {
      await engine.initialize();

      const texts = Array.from({ length: 10 }, (_, i) => `Text ${i}`);
      const leftHalf = texts.slice(0, 5);
      const rightHalf = texts.slice(5);
      const expected = Array.from({ length: 10 }, (_, i) => `翻訳${i}`);

      mockApiClient.translate
        .mockResolvedValueOnce(["broken"]) // count mismatch for batch of 10
        .mockResolvedValueOnce(expected.slice(0, 5)) // left half succeeds
        .mockResolvedValueOnce(expected.slice(5)); // right half succeeds

      const result = await engine.translateBatch(texts, "Japanese");

      expect(result).toEqual(expected);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(3);
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        1,
        texts,
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        2,
        leftHalf,
        "Japanese",
      );
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(
        3,
        rightHalf,
        "Japanese",
      );
    });
  });

  describe("clearCache", () => {
    beforeEach(async () => {
      await engine.initialize();
      // Populate caches
      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      await engine.translateBatch(["Hello"], "Japanese");
    });

    it("should clear memory cache only", async () => {
      // RED: clearCache('memory') should only clear memory
      await engine.clearCache("memory");

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBeGreaterThan(0);
      expect(stats.local).toBeGreaterThan(0);
    });

    it("should clear browser.storage.local when clearCache('session') is called", async () => {
      // After migration to browser.storage.local, 'session' and 'local' map to the same store
      // Why: browser.storage.local統合後、session/localは同一ストアを参照するため両方クリアされる
      await engine.clearCache("session");

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });

    it("should clear browser.storage.local when clearCache('local') is called", async () => {
      // After migration to browser.storage.local, 'session' and 'local' map to the same store
      // Why: browser.storage.local統合後、session/localは同一ストアを参照するため両方クリアされる
      await engine.clearCache("local");

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });

    it("should clear all caches when no parameter provided", async () => {
      // RED: clearCache() or clearCache('all') should clear all
      await engine.clearCache();

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });

    it('should clear all caches with "all" parameter', async () => {
      await engine.clearCache("all");

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return accurate cache statistics", async () => {
      // RED: Should return correct cache sizes and hit rate
      await engine.initialize();

      // Populate caches
      mockApiClient.translate.mockResolvedValueOnce([
        "こんにちは",
        "さようなら",
      ]);
      await engine.translateBatch(["Hello", "Goodbye"], "Japanese");

      const stats = await engine.getCacheStats();

      expect(stats).toHaveProperty("memory");
      expect(stats).toHaveProperty("session");
      expect(stats).toHaveProperty("local");
      expect(stats).toHaveProperty("hitRate");
      expect(stats.memory).toBe(2);
      expect(stats.session).toBe(2);
      expect(stats.local).toBe(2);
    });

    it("should calculate hit rate correctly", async () => {
      // RED: Hit rate should be (hits / total) * 100
      await engine.initialize();

      // First call - cache miss (hit rate: 0%)
      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      await engine.translateBatch(["Hello"], "Japanese");
      let stats = await engine.getCacheStats();
      expect(stats.hitRate).toBe(0);

      // Second call - cache hit (hit rate: 50%)
      await engine.translateBatch(["Hello"], "Japanese");
      stats = await engine.getCacheStats();
      expect(stats.hitRate).toBe(50);

      // Third call - cache hit (hit rate: 66.67%)
      await engine.translateBatch(["Hello"], "Japanese");
      stats = await engine.getCacheStats();
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });
  });

  describe("error handling", () => {
    it("should handle empty text array", async () => {
      // RED: Empty array should return empty array
      await engine.initialize();

      const result = await engine.translateBatch([], "Japanese");
      expect(result).toEqual([]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it("should handle storage errors gracefully", async () => {
      // RED: Storage errors should not crash the engine
      await engine.initialize();

      // Mock storage failure
      globalThis.localStorage.setItem = jest.fn(() => {
        throw new Error("Storage quota exceeded");
      });

      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);

      // Should still work with memory cache only
      const result = await engine.translateBatch(["Hello"], "Japanese");
      expect(result).toEqual(["こんにちは"]);
    });

    it("should throw error when API client not initialized", async () => {
      // RED: Should throw meaningful error
      const uninitializedEngine = new TranslationEngine();

      await expect(
        uninitializedEngine.translateBatch(["Hello"], "Japanese"),
      ).rejects.toThrow();
    });
  });

  describe("translateBatchSemiParallel - onBatchComplete callback", () => {
    it("should call onBatchComplete for each batch in sequential processing", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize + 5 },
        (_, i) => `Text ${i}`,
      );
      const onBatchComplete = jest.fn();

      // Mock API responses
      mockApiClient.translate
        .mockResolvedValueOnce(Array(batchSize).fill("translated"))
        .mockResolvedValueOnce(Array(5).fill("translated"));

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Should be called for first batch (sequential) + remaining batches (parallel)
      expect(onBatchComplete).toHaveBeenCalledTimes(2);

      // Verify first batch call (sequential)
      expect(onBatchComplete).toHaveBeenNthCalledWith(
        1,
        0, // batchIndex
        expect.arrayContaining(["translated"]),
        expect.arrayContaining(Array.from({ length: batchSize }, (_, i) => i)),
      );
    });

    it("should provide nodeIndices that map to original texts positions with partial cache hits", async () => {
      // RED: This test verifies nodeIndices correctly map to original texts array
      await engine.initialize();

      // Pre-populate cache with some texts
      mockApiClient.translate.mockResolvedValueOnce([
        "翻訳0",
        "翻訳2",
        "翻訳4",
      ]);
      await engine.translateBatch(["Text 0", "Text 2", "Text 4"], "Japanese");

      // Clear mock for new test
      jest.clearAllMocks();

      // Now translate a batch where some texts are cached
      const texts = ["Text 0", "Text 1", "Text 2", "Text 3", "Text 4"];
      // texts[0] = cached, texts[1] = uncached, texts[2] = cached, texts[3] = uncached, texts[4] = cached
      const onBatchComplete = jest.fn();

      mockApiClient.translate.mockResolvedValueOnce(["翻訳1", "翻訳3"]);

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Should be called once with only uncached texts
      expect(onBatchComplete).toHaveBeenCalledTimes(1);

      // CRITICAL: nodeIndices should be [1, 3] (positions in original texts array)
      // NOT [0, 1] (positions in uncached array)
      const call = onBatchComplete.mock.calls[0];
      expect(call[0]).toBe(0); // batchIndex
      expect(call[1]).toEqual(["翻訳1", "翻訳3"]); // translations
      expect(call[2]).toEqual([1, 3]); // nodeIndices - THIS IS THE CRITICAL CHECK
    });

    it("should handle 30% filter rate scenario with correct index mapping", async () => {
      // RED: Test with filtering scenario (simulated by cache)
      await engine.initialize();

      // Simulate a scenario where content was filtered before sending
      // Original: 10 nodes, after filtering: 7 nodes (30% filtered out)
      const filteredTexts = [
        "Text 0",
        "Text 2",
        "Text 4",
        "Text 6",
        "Text 7",
        "Text 8",
        "Text 9",
      ];
      // originalIndices = [0, 2, 4, 6, 7, 8, 9] in the original viewport array

      // Cache some of these
      mockApiClient.translate.mockResolvedValueOnce([
        "翻訳0",
        "翻訳4",
        "翻訳7",
      ]);
      await engine.translateBatch(["Text 0", "Text 4", "Text 7"], "Japanese");

      jest.clearAllMocks();

      // Now when we translate the filtered batch, some are cached
      // Text 0 = cached, Text 2 = uncached, Text 4 = cached, Text 6 = uncached, Text 7 = cached, Text 8 = uncached, Text 9 = uncached
      const onBatchComplete = jest.fn();

      mockApiClient.translate.mockResolvedValueOnce([
        "翻訳2",
        "翻訳6",
        "翻訳8",
        "翻訳9",
      ]);

      await engine.translateBatchSemiParallel(
        filteredTexts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // nodeIndices should map to positions in filteredTexts: [1, 3, 5, 6]
      // NOT [0, 1, 2, 3] (positions in uncached array)
      expect(onBatchComplete).toHaveBeenCalledWith(
        0,
        ["翻訳2", "翻訳6", "翻訳8", "翻訳9"],
        [1, 3, 5, 6],
      );
    });

    it("should call onBatchComplete with correct batch indices", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize + 10 },
        (_, i) => `Text ${i}`,
      );
      const onBatchComplete = jest.fn();

      mockApiClient.translate
        .mockResolvedValueOnce(Array(batchSize).fill("translated1"))
        .mockResolvedValueOnce(Array(10).fill("translated2"));

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      expect(onBatchComplete).toHaveBeenCalledTimes(2);

      // Batch 0 (sequential)
      expect(onBatchComplete).toHaveBeenNthCalledWith(
        1,
        0,
        expect.any(Array),
        expect.any(Array),
      );

      // Batch 1 (parallel)
      expect(onBatchComplete).toHaveBeenNthCalledWith(
        2,
        1,
        expect.any(Array),
        expect.any(Array),
      );
    });

    it("should call onBatchComplete immediately for cache hit", async () => {
      await engine.initialize();

      const texts = ["cached1", "cached2"];
      const onBatchComplete = jest.fn();

      // Pre-populate cache
      mockApiClient.translate.mockResolvedValueOnce(["翻訳1", "翻訳2"]);
      await engine.translateBatch(texts, "Japanese");

      // Reset mock
      jest.clearAllMocks();

      // Call with same texts (cache hit)
      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Should be called immediately with cached results
      expect(onBatchComplete).toHaveBeenCalledTimes(1);
      expect(onBatchComplete).toHaveBeenCalledWith(
        0,
        ["翻訳1", "翻訳2"],
        [0, 1],
      );
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it("should provide correct nodeIndices for each batch", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize + 5 },
        (_, i) => `Text ${i}`,
      );
      const onBatchComplete = jest.fn();

      mockApiClient.translate
        .mockResolvedValueOnce(Array(batchSize).fill("translated"))
        .mockResolvedValueOnce(Array(5).fill("translated"));

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // First batch: indices 0-(batchSize-1)
      expect(onBatchComplete).toHaveBeenNthCalledWith(
        1,
        0,
        expect.any(Array),
        Array.from({ length: batchSize }, (_, i) => i),
      );

      // Second batch: indices batchSize-(batchSize+4)
      expect(onBatchComplete).toHaveBeenNthCalledWith(
        2,
        1,
        expect.any(Array),
        Array.from({ length: 5 }, (_, i) => batchSize + i),
      );
    });

    it("should work without onBatchComplete callback (optional parameter)", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize + 5 },
        (_, i) => `Text ${i}`,
      );

      mockApiClient.translate
        .mockResolvedValueOnce(Array(batchSize).fill("translated"))
        .mockResolvedValueOnce(Array(5).fill("translated"));

      // Should not throw error when callback is undefined
      await expect(
        engine.translateBatchSemiParallel(texts, "Japanese", 1, undefined),
      ).resolves.not.toThrow();
    });

    it("should handle callback errors gracefully", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize + 5 },
        (_, i) => `Text ${i}`,
      );
      const onBatchComplete = jest.fn(() => {
        throw new Error("Callback error");
      });

      mockApiClient.translate
        .mockResolvedValueOnce(Array(batchSize).fill("translated"))
        .mockResolvedValueOnce(Array(5).fill("translated"));

      // Translation should still complete even if callback throws
      const result = await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      expect(result).toHaveLength(batchSize + 5);
      expect(onBatchComplete).toHaveBeenCalled();
    });

    it("should respect priorityCount parameter", async () => {
      await engine.initialize();

      const batchSize = BATCH_CONFIG.BATCH_SIZE;
      const texts = Array.from(
        { length: batchSize * 2 },
        (_, i) => `Text ${i}`,
      );
      const onBatchComplete = jest.fn();

      mockApiClient.translate
        .mockResolvedValueOnce(Array(batchSize).fill("translated"))
        .mockResolvedValueOnce(Array(batchSize).fill("translated"));

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Should be called 2 times (1 sequential + 1 parallel)
      expect(onBatchComplete).toHaveBeenCalledTimes(2);
    });

    it("DEBUG: should show actual nodeIndices behavior with partial cache", async () => {
      // This test helps understand what indices are actually being passed
      await engine.initialize();

      // Setup: Cache texts at positions 0, 2, 4
      mockApiClient.translate.mockResolvedValueOnce([
        "Cached0",
        "Cached2",
        "Cached4",
      ]);
      await engine.translateBatch(["Text0", "Text2", "Text4"], "Japanese");

      jest.clearAllMocks();

      // Test: Translate 5 texts where 0, 2, 4 are cached
      const texts = ["Text0", "Text1", "Text2", "Text3", "Text4"];
      const onBatchComplete = jest.fn();

      mockApiClient.translate.mockResolvedValueOnce(["New1", "New3"]);

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Log what we actually got
      console.log("=== DEBUG: Actual callback arguments ===");
      console.log("Call count:", onBatchComplete.mock.calls.length);
      if (onBatchComplete.mock.calls.length > 0) {
        const [batchIndex, translations, nodeIndices] =
          onBatchComplete.mock.calls[0];
        console.log("batchIndex:", batchIndex);
        console.log("translations:", translations);
        console.log("nodeIndices:", nodeIndices);
        console.log("Expected nodeIndices: [1, 3]");
        console.log(
          "Match:",
          JSON.stringify(nodeIndices) === JSON.stringify([1, 3]),
        );
      }

      // The test expectation
      expect(onBatchComplete).toHaveBeenCalled();
    });
  });

  describe("Cache hit nodeIndices handling (P0-1 fix)", () => {
    it("should send only cached indices in nodeIndices when partial cache hit occurs", async () => {
      // P0-1: BUG - When there's a partial cache hit, nodeIndices should only include
      // the positions of cached items in the original texts array, not all items
      await engine.initialize();

      // Setup: Pre-cache some texts
      mockApiClient.translate.mockResolvedValueOnce(["翻訳0", "翻訳2"]);
      await engine.translateBatch(["Text0", "Text2"], "Japanese");

      jest.clearAllMocks();

      // Test: Mix of cached and uncached
      // texts = ['Text0', 'Text1', 'Text2']
      // texts[0] = cached, texts[1] = uncached, texts[2] = cached
      const texts = ["Text0", "Text1", "Text2"];
      const onBatchComplete = jest.fn();

      mockApiClient.translate.mockResolvedValueOnce(["翻訳1"]);

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Should be called once with only the uncached batch
      expect(onBatchComplete).toHaveBeenCalledTimes(1);

      // The nodeIndices should be [1] (position of uncached text in original array)
      // NOT [0] or [0, 1]
      const [batchIndex, translations, nodeIndices] =
        onBatchComplete.mock.calls[0];
      expect(batchIndex).toBe(0);
      expect(translations).toEqual(["翻訳1"]);
      expect(nodeIndices).toEqual([1]); // CRITICAL: Only index 1, not [0, 1]
    });

    it("should send cached translation via onBatchComplete before API call completes", async () => {
      // P0-1: When all items are cached, should call onBatchComplete immediately
      // with correct nodeIndices mapping to original positions
      await engine.initialize();

      // Pre-cache all texts
      mockApiClient.translate.mockResolvedValueOnce([
        "翻訳1",
        "翻訳2",
        "翻訳3",
      ]);
      await engine.translateBatch(["Text1", "Text2", "Text3"], "Japanese");

      jest.clearAllMocks();

      const texts = ["Text1", "Text2", "Text3"];
      const onBatchComplete = jest.fn();

      // No API call should be made since all are cached
      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      // Should be called immediately with all cached results
      expect(onBatchComplete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.translate).not.toHaveBeenCalled();

      // The nodeIndices should be [0, 1, 2] mapping to all positions
      const [batchIndex, translations, nodeIndices] =
        onBatchComplete.mock.calls[0];
      expect(batchIndex).toBe(0);
      expect(translations).toEqual(["翻訳1", "翻訳2", "翻訳3"]);
      expect(nodeIndices).toEqual([0, 1, 2]); // All original indices
    });

    it("should handle complex partial cache scenario: start-middle-end positions", async () => {
      // P0-1: Test with cached items at various positions
      // texts = ['Cached', 'Uncached', 'Cached', 'Uncached', 'Uncached', 'Cached']
      await engine.initialize();

      // Pre-cache items at positions 0, 2, 5
      mockApiClient.translate.mockResolvedValueOnce([
        "翻訳0",
        "翻訳2",
        "翻訳5",
      ]);
      await engine.translateBatch(["Text0", "Text2", "Text5"], "Japanese");

      jest.clearAllMocks();

      const texts = ["Text0", "Text1", "Text2", "Text3", "Text4", "Text5"];
      const onBatchComplete = jest.fn();

      // Uncached items are at positions [1, 3, 4]
      mockApiClient.translate.mockResolvedValueOnce([
        "翻訳1",
        "翻訳3",
        "翻訳4",
      ]);

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      expect(onBatchComplete).toHaveBeenCalledTimes(1);

      const [batchIndex, translations, nodeIndices] =
        onBatchComplete.mock.calls[0];
      expect(batchIndex).toBe(0);
      expect(translations).toEqual(["翻訳1", "翻訳3", "翻訳4"]);
      // CRITICAL: nodeIndices must be [1, 3, 4], not [0, 1, 2]
      expect(nodeIndices).toEqual([1, 3, 4]);
    });

    it("should correctly handle single cached item in large batch", async () => {
      // P0-1: Edge case - only one item cached among many
      await engine.initialize();

      // Pre-cache item at position 5
      mockApiClient.translate.mockResolvedValueOnce(["翻訳5"]);
      await engine.translateBatch(["Text5"], "Japanese");

      jest.clearAllMocks();

      const texts = Array.from({ length: 10 }, (_, i) => `Text${i}`);
      const onBatchComplete = jest.fn();

      // All except position 5 need API call (9 items)
      const uncachedTranslations = Array.from(
        { length: 9 },
        (_, i) => `翻訳${i === 5 ? "skip" : i}`,
      );
      mockApiClient.translate.mockResolvedValueOnce(
        Array.from({ length: 9 }, (_, i) =>
          i < 5 ? `翻訳${i}` : `翻訳${i + 1}`,
        ),
      );

      await engine.translateBatchSemiParallel(
        texts,
        "Japanese",
        1,
        onBatchComplete,
      );

      const [batchIndex, translations, nodeIndices] =
        onBatchComplete.mock.calls[0];

      // nodeIndices should NOT include 5 (that's cached)
      // Should have all indices except 5
      const expectedIndices = Array.from({ length: 10 }, (_, i) => i).filter(
        (i) => i !== 5,
      );
      expect(nodeIndices).toEqual(expectedIndices);
      expect(nodeIndices).not.toContain(5);
    });
  });

  // RED: retry consolidation tests (BUG-003)
  describe("retry consolidation (BUG-003)", () => {
    it("should use retry utility instead of custom for-loop in executeTranslationWithRetry", async () => {
      // BUG-003: engine 層に独自 for ループが残っていると、apiClient 層と二重リトライになる
      // retry.ts 統合後は engine 層から独自ループが除去される
      // このテストは engine 層が retry() を通じて正確に MAX_RETRIES+1 回だけ呼ぶことを検証
      await engine.initialize();

      mockApiClient.translate.mockRejectedValue(new Error("Persistent error"));

      await expect(
        engine.translateBatch(["Hello"], "Japanese"),
      ).rejects.toThrow("Persistent error");

      // MAX_RETRIES=3 → initial(1) + retries(3) = 4回
      // 二重リトライになっていた場合はこれより多くなる
      expect(mockApiClient.translate).toHaveBeenCalledTimes(4);
    }, 30000);

    it("should NOT retry ParseCountMismatchError at engine layer (single text)", async () => {
      // ParseCountMismatchError はリトライしない — engine 層の executeTranslationWithRetry が
      // shouldRetry: false で即座に throw する
      // 単一テキストの場合はフォールバックも発生しないので、呼び出し回数は1回のみ
      // (複数テキストの場合は translateWithRetry が binary-split/individual へフォールバックする)
      await engine.initialize();

      const { ParseCountMismatchError } = await import("../../../src/background/apiClient");

      // apiClient が ParseCountMismatchError を投げる場合（単一テキスト）
      mockApiClient.translate.mockRejectedValue(
        new ParseCountMismatchError(1, 0),
      );

      await expect(
        engine.translateBatch(["Hello"], "Japanese"),
      ).rejects.toBeInstanceOf(ParseCountMismatchError);

      // ParseCountMismatchError はリトライしないので1回のみ（通常エラーなら MAX_RETRIES+1=4回）
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);
    });
  });

  // RED: binary-split depth limit tests (BUG-003 extension)
  describe("BUG-003: binary-split depth limit", () => {
    it("should fall back to translateIndividually at depth=1 instead of recursing", async () => {
      // INDIVIDUAL_FALLBACK_THRESHOLD = 6 なので 7テキスト以上でbinary-splitフローに入る
      // 8テキスト: depth=0で左[4]と右[4]に分割
      //   左[4]: ParseMismatch → depth=1でtranslateIndividually → 4回個別翻訳
      //   右[4]: ParseMismatch → depth=1でtranslateIndividually → 4回個別翻訳
      // 合計: 初回batch(1) + 左chunk(1) + 右chunk(1) + 個別8テキスト(8) = 11回
      await engine.initialize();

      const { ParseCountMismatchError } = await import("../../../src/background/apiClient");

      // Why: 8テキスト使用 — INDIVIDUAL_FALLBACK_THRESHOLD=6 を超えてbinary-splitフローに入るため
      const texts = ["A", "B", "C", "D", "E", "F", "G", "H"];

      // Why: 左右チャンクはPromise.allで並列実行されるため、個別翻訳の呼び出し順は
      //      A,E,B,F,C,G,D,H のようにインターリーブする。
      //      mockResolvedValue（固定値）を使い、呼び出し回数のみ検証する。
      mockApiClient.translate
        .mockRejectedValueOnce(new ParseCountMismatchError(8, 1)) // 初回batch(8): mismatch → binary-split選択
        .mockRejectedValueOnce(new ParseCountMismatchError(4, 1)) // 左chunk [A-D](4): mismatch → depth=1でfallback
        .mockRejectedValueOnce(new ParseCountMismatchError(4, 1)) // 右chunk [E-H](4): mismatch → depth=1でfallback
        .mockResolvedValue(["翻訳テキスト"]); // 個別翻訳はすべて成功（並列順不定）

      const result = await engine.translateBatch(texts, "Japanese");

      // 8テキスト分の翻訳結果が返ること（並列実行のため順序は問わない）
      expect(result).toHaveLength(8);
      expect(result).toEqual(expect.arrayContaining(Array(8).fill("翻訳テキスト")));
      // depth=1でtranslateIndividuallyにフォールバックするため、再帰的binarySplitは発生しない
      // 1(初回) + 1(左chunk) + 1(右chunk) + 8(個別) = 11回
      expect(mockApiClient.translate).toHaveBeenCalledTimes(11);
    }, 30000);

    it("should not recurse infinitely when ParseCountMismatchError keeps occurring", async () => {
      // ParseCountMismatchError が全レベルで発生し続けても
      // depth=1制限により有限回数のAPI呼び出しで終了すること
      // Why: 8テキスト使用 — INDIVIDUAL_FALLBACK_THRESHOLD=6 を超えてbinary-splitフローに入るため
      await engine.initialize();

      const { ParseCountMismatchError } = await import("../../../src/background/apiClient");

      // INDIVIDUAL_FALLBACK_THRESHOLD=6 を超える8テキストでbinary-splitフローを通す
      const texts = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
      // depth=1制限: 初回(1) + 左chunk(1) + 右chunk(1) + 個別8テキスト(8) = 最大11回
      // ただし個別翻訳でもParseCountMismatchError が発生するため、1テキストずつ投げてエラーになる
      const maxExpectedCalls = 15;

      mockApiClient.translate.mockRejectedValue(new ParseCountMismatchError(8, 1));

      // 個別翻訳でも1テキストでParseCountMismatchErrorが発生 → そのまま上位にthrow
      await expect(
        engine.translateBatch(texts, "Japanese"),
      ).rejects.toBeInstanceOf(ParseCountMismatchError);

      // 無限ループでなければ呼び出し回数は有界
      expect(mockApiClient.translate.mock.calls.length).toBeLessThanOrEqual(maxExpectedCalls);
    }, 30000);
  });

  // RED: setBulkCachedTranslations tests (P1 bulk write)
  describe("setBulkCachedTranslations (P1 bulk write)", () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it("should call browser.storage.local.set only once for multiple translations", async () => {
      mockApiClient.translate.mockResolvedValueOnce(["翻訳1", "翻訳2", "翻訳3"]);

      await engine.translateBatch(["text1", "text2", "text3"], "Japanese");

      // After T1 fix: storage.set should be called exactly once (bulk), not 3 times
      expect((global as any).browser.storage.local.set).toHaveBeenCalledTimes(1);
    });

    it("should update memory cache immediately so subsequent calls hit memory without storage", async () => {
      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      await engine.translateBatch(["Hello"], "Japanese");

      // Clear mock counts but keep implementation
      jest.clearAllMocks();
      // Override storage.get to return empty (simulate storage unavailable)
      (global as any).browser.storage.local.get = jest.fn().mockResolvedValue({});

      // Second call: memory cache should be hit, no API call needed
      await engine.translateBatch(["Hello"], "Japanese");

      // setBulkCachedTranslations updated memory cache synchronously
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it("should not propagate storage write failure to caller", async () => {
      // Make storage.set throw
      (global as any).browser.storage.local.set = jest.fn().mockRejectedValue(
        new Error("Storage quota exceeded"),
      );

      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);

      // Should resolve successfully even when storage write fails
      await expect(
        engine.translateBatch(["Hello"], "Japanese"),
      ).resolves.toEqual(["こんにちは"]);
    });
  });

  // RED: getBulkCachedTranslations tests (P2 bulk read)
  describe("getBulkCachedTranslations (P2 bulk read)", () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it("should not call storage.get with key array when all texts are in memory cache", async () => {
      // Pre-populate memory cache
      mockApiClient.translate.mockResolvedValueOnce(["翻訳A", "翻訳B"]);
      await engine.translateBatch(["TextA", "TextB"], "Japanese");

      jest.clearAllMocks();
      const storageGetSpy = jest.fn().mockResolvedValue({});
      (global as any).browser.storage.local.get = storageGetSpy;
      (global as any).browser.storage.local.set = jest.fn().mockResolvedValue(undefined);

      // Second call: all in memory cache
      await engine.translateBatch(["TextA", "TextB"], "Japanese");

      // No API call
      expect(mockApiClient.translate).not.toHaveBeenCalled();
      // storage.get should NOT be called with a non-empty key array
      const arrayCalls = storageGetSpy.mock.calls.filter(
        (call) => Array.isArray(call[0]) && call[0].length > 0,
      );
      expect(arrayCalls).toHaveLength(0);
    });

    it("should call storage.get once with array of all miss keys", async () => {
      // Fresh engine: no memory cache
      const storageGetSpy = jest.fn().mockResolvedValue({});
      (global as any).browser.storage.local.get = storageGetSpy;

      mockApiClient.translate.mockResolvedValueOnce(["翻訳X", "翻訳Y", "翻訳Z"]);
      await engine.translateBatch(["TextX", "TextY", "TextZ"], "Japanese");

      // storage.get should be called with an array of keys (bulk lookup)
      const arrayCalls = storageGetSpy.mock.calls.filter(
        (call) => Array.isArray(call[0]) && call[0].length > 0,
      );
      expect(arrayCalls.length).toBeGreaterThan(0);
      // The array should contain all 3 cache keys
      const keysRequested = arrayCalls[0][0] as string[];
      expect(keysRequested).toHaveLength(3);
    });

    it("should gracefully degrade when storage.get throws", async () => {
      // Make storage.get throw
      (global as any).browser.storage.local.get = jest
        .fn()
        .mockRejectedValue(new Error("Storage read error"));

      mockApiClient.translate.mockResolvedValueOnce(["翻訳1"]);

      // Should still succeed (graceful degradation)
      await expect(
        engine.translateBatch(["text1"], "Japanese"),
      ).resolves.toEqual(["翻訳1"]);
    });
  });

  // RED: getCacheKey encoding tests (P6 safe key encoding)
  describe("getCacheKey (P6 safe key encoding)", () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it("should cache and retrieve text containing colons correctly", async () => {
      const textWithColons = "http://example.com:8080/path";
      mockApiClient.translate.mockResolvedValueOnce(["例URL翻訳"]);

      const result1 = await engine.translateBatch([textWithColons], "Japanese");
      expect(result1).toEqual(["例URL翻訳"]);

      // Second call should hit memory cache (no API call)
      jest.clearAllMocks();
      const result2 = await engine.translateBatch([textWithColons], "Japanese");
      expect(result2).toEqual(["例URL翻訳"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it("should not use legacy unencoded key for text containing colons", async () => {
      // Without encodeURIComponent: "a:b" with lang "Japanese" → key "translation:a:b:Japanese"
      // With encodeURIComponent: "a:b" → key "translation:a%3Ab:Japanese"
      // Pre-populate with the OLD (unencoded) key to ensure it is NOT returned
      const unencodedKey = "translation:a:b:Japanese";
      const oldEntry = JSON.stringify({ text: "a:b", translation: "古いキャッシュ" });
      mockBrowserStorage.set(unencodedKey, oldEntry);

      // After T4 (encodeURIComponent), getCacheKey("a:b", "Japanese") = "translation:a%3Ab:Japanese"
      // so the pre-populated "translation:a:b:Japanese" should NOT be returned
      mockApiClient.translate.mockResolvedValueOnce(["新しい翻訳"]);
      const result = await engine.translateBatch(["a:b"], "Japanese");

      // API should be called because the old key doesn't match the new encoded key
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(["新しい翻訳"]);
    });
  });

  // RED: TTL cache expiration tests (P8)
  describe("TTL cache expiration (P8)", () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it("should return null for entries older than TTL (expired)", async () => {
      const ONE_HOUR_PLUS = 60 * 60 * 1000 + 1; // TTL + 1ms

      // Store an already-expired entry directly in mock storage
      const cacheKey = "translation:TTLTest:Japanese";
      const expiredEntry = JSON.stringify({
        text: "TTLTest",
        translation: "期限切れ翻訳",
        createdAt: Date.now() - ONE_HOUR_PLUS, // already expired
      });
      mockBrowserStorage.set(cacheKey, expiredEntry);

      // Should be treated as a miss (expired), so API is called
      mockApiClient.translate.mockResolvedValueOnce(["新しい翻訳"]);
      const result = await engine.translateBatch(["TTLTest"], "Japanese");

      // Should get fresh translation, not the expired cached one
      expect(result).toEqual(["新しい翻訳"]);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);
    });

    it("should treat entries without createdAt as valid (backward compatibility)", async () => {
      // Legacy format without createdAt field
      const cacheKey = "translation:LegacyTest:Japanese";
      const legacyEntry = JSON.stringify({
        text: "LegacyTest",
        translation: "レガシー翻訳",
        // No createdAt field
      });
      mockBrowserStorage.set(cacheKey, legacyEntry);

      const result = await engine.translateBatch(["LegacyTest"], "Japanese");

      // Should return the legacy cached value (backward compat — no createdAt = valid forever)
      expect(result).toEqual(["レガシー翻訳"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });
  });

  // RED: browser.storage.local migration tests
  // These tests verify that the engine uses browser.storage.local instead of sessionStorage/localStorage
  // Why: Chrome MV3 Service Workers do not have access to DOM Storage APIs (sessionStorage/localStorage)
  describe("browser.storage.local migration (task-p1-storage)", () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it("should use browser.storage.local.get when checking persistent cache on getCachedTranslation", async () => {
      // RED: browser.storage.local.get should be called during translateBatch (cache lookup)
      // sessionStorage.getItem should NOT be called

      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      await engine.translateBatch(["Hello"], "Japanese");

      // After migration: browser.storage.local.get must be called
      expect((global.chrome.storage.local.get as jest.Mock)).toHaveBeenCalled();

      // After migration: sessionStorage.getItem must NOT be called
      expect(globalThis.sessionStorage.getItem).not.toHaveBeenCalled();
    });

    it("should use browser.storage.local.set when saving to persistent cache on setCachedTranslation", async () => {
      // RED: browser.storage.local.set should be called when translation is saved
      // sessionStorage.setItem and localStorage.setItem should NOT be called

      mockApiClient.translate.mockResolvedValueOnce(["こんにちは"]);
      await engine.translateBatch(["Hello"], "Japanese");

      // After migration: browser.storage.local.set must be called
      expect((global.chrome.storage.local.set as jest.Mock)).toHaveBeenCalled();

      // After migration: sessionStorage.setItem must NOT be called
      expect(globalThis.sessionStorage.setItem).not.toHaveBeenCalled();
      // After migration: localStorage.setItem must NOT be called
      expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
    });

    it("should retrieve translation from browser.storage.local on cache hit", async () => {
      // RED: When browser.storage.local has cached translation, it should be returned without API call

      const cacheKey = "translation:Hello:Japanese";
      const cachedEntry = JSON.stringify({ text: "Hello", translation: "こんにちは(キャッシュ)" });

      // Pre-populate browser.storage.local mock with cached data
      (global.chrome.storage.local.get as jest.Mock).mockResolvedValueOnce({
        [cacheKey]: cachedEntry,
      });

      const result = await engine.translateBatch(["Hello"], "Japanese");

      // Should return cached value from browser.storage.local
      expect(result).toEqual(["こんにちは(キャッシュ)"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });
  });
});
