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

  // Mock storage data
  const mockSessionStorage: Map<string, string> = new Map();
  const mockLocalStorage: Map<string, string> = new Map();

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    mockSessionStorage.clear();
    mockLocalStorage.clear();

    // Mock sessionStorage
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: jest.fn((key: string) => mockSessionStorage.get(key) || null),
        setItem: jest.fn((key: string, value: string) =>
          mockSessionStorage.set(key, value),
        ),
        removeItem: jest.fn((key: string) => mockSessionStorage.delete(key)),
        clear: jest.fn(() => mockSessionStorage.clear()),
        get length() {
          return mockSessionStorage.size;
        },
        key: jest.fn((index: number) => {
          const keys = Array.from(mockSessionStorage.keys());
          return keys[index] || null;
        }),
      },
      writable: true,
      configurable: true,
    });

    // Mock localStorage
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: jest.fn((key: string) => mockLocalStorage.get(key) || null),
        setItem: jest.fn((key: string, value: string) =>
          mockLocalStorage.set(key, value),
        ),
        removeItem: jest.fn((key: string) => mockLocalStorage.delete(key)),
        clear: jest.fn(() => mockLocalStorage.clear()),
        get length() {
          return mockLocalStorage.size;
        },
        key: jest.fn((index: number) => {
          const keys = Array.from(mockLocalStorage.keys());
          return keys[index] || null;
        }),
      },
      writable: true,
      configurable: true,
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

    it("should promote session storage hit to memory cache", async () => {
      // RED: Session storage hit should populate memory cache
      await engine.initialize();

      // Pre-populate session storage
      mockSessionStorage.set(
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

    it("should promote local storage hit to memory and session cache", async () => {
      // RED: Local storage hit should populate memory and session
      await engine.initialize();

      // Pre-populate local storage
      mockLocalStorage.set(
        "translation:Hello:Japanese",
        JSON.stringify({ text: "Hello", translation: "こんにちは" }),
      );

      const result = await engine.translateBatch(["Hello"], "Japanese");
      expect(result).toEqual(["こんにちは"]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();

      // Verify all caches were populated
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

    it("should clear session cache only", async () => {
      // RED: clearCache('session') should only clear session
      await engine.clearCache("session");

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBeGreaterThan(0);
    });

    it("should clear local cache only", async () => {
      // RED: clearCache('local') should only clear local
      await engine.clearCache("local");

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.session).toBeGreaterThan(0);
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
});
