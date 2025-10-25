/**
 * TranslationEngine Unit Tests
 *
 * Tests for the translation engine with 3-tier cache system (Memory/Session/Local)
 * and batch processing with OpenRouter API integration.
 */

import { TranslationEngine } from '../../../src/background/translationEngine';
import { OpenRouterClient } from '../../../src/background/apiClient';
import StorageManager from '../../../src/shared/storage/StorageManager';
import { BATCH_CONFIG } from '../../../src/shared/constants/config';

// Mock dependencies
jest.mock('../../../src/background/apiClient');
jest.mock('../../../src/shared/storage/StorageManager');
jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TranslationEngine', () => {
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
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: jest.fn((key: string) => mockSessionStorage.get(key) || null),
        setItem: jest.fn((key: string, value: string) => mockSessionStorage.set(key, value)),
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
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => mockLocalStorage.get(key) || null),
        setItem: jest.fn((key: string, value: string) => mockLocalStorage.set(key, value)),
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
      translate: jest.fn().mockResolvedValue(['translated']),
      testConnection: jest.fn(),
    } as any;
    (OpenRouterClient as jest.MockedClass<typeof OpenRouterClient>).mockImplementation(
      () => mockApiClient
    );

    // Mock StorageManager
    mockStorage = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as any;
    (StorageManager as jest.MockedClass<typeof StorageManager>).mockImplementation(
      () => mockStorage
    );

    engine = new TranslationEngine();
  });

  describe('initialization', () => {
    it('should initialize OpenRouterClient on instantiation', async () => {
      await engine.initialize();
      expect(mockApiClient.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('translateBatch - Cache Hit Tests', () => {
    it('should return from memory cache without API call', async () => {
      // RED: Memory cache hit should skip API
      await engine.initialize();

      // First call to populate cache
      mockApiClient.translate.mockResolvedValueOnce(['こんにちは', 'さようなら']);
      const firstResult = await engine.translateBatch(['Hello', 'Goodbye'], 'Japanese');
      expect(firstResult).toEqual(['こんにちは', 'さようなら']);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);

      // Second call should use cache
      mockApiClient.translate.mockClear();
      const secondResult = await engine.translateBatch(['Hello', 'Goodbye'], 'Japanese');
      expect(secondResult).toEqual(['こんにちは', 'さようなら']);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it('should promote session storage hit to memory cache', async () => {
      // RED: Session storage hit should populate memory cache
      await engine.initialize();

      // Pre-populate session storage
      mockSessionStorage.set(
        'translation:Hello:Japanese',
        JSON.stringify({ text: 'Hello', translation: 'こんにちは' })
      );

      const result = await engine.translateBatch(['Hello'], 'Japanese');
      expect(result).toEqual(['こんにちは']);
      expect(mockApiClient.translate).not.toHaveBeenCalled();

      // Verify memory cache was populated
      const cacheStats = await engine.getCacheStats();
      expect(cacheStats.memory).toBe(1);
    });

    it('should promote local storage hit to memory and session cache', async () => {
      // RED: Local storage hit should populate memory and session
      await engine.initialize();

      // Pre-populate local storage
      mockLocalStorage.set(
        'translation:Hello:Japanese',
        JSON.stringify({ text: 'Hello', translation: 'こんにちは' })
      );

      const result = await engine.translateBatch(['Hello'], 'Japanese');
      expect(result).toEqual(['こんにちは']);
      expect(mockApiClient.translate).not.toHaveBeenCalled();

      // Verify all caches were populated
      const cacheStats = await engine.getCacheStats();
      expect(cacheStats.memory).toBe(1);
      expect(cacheStats.session).toBe(1);
      expect(cacheStats.local).toBe(1);
    });
  });

  describe('translateBatch - Cache Miss Tests', () => {
    it('should call API on cache miss and save to all cache layers', async () => {
      // RED: Cache miss should trigger API call and save to all layers
      await engine.initialize();

      mockApiClient.translate.mockResolvedValueOnce(['こんにちは']);
      const result = await engine.translateBatch(['Hello'], 'Japanese');

      expect(result).toEqual(['こんにちは']);
      expect(mockApiClient.translate).toHaveBeenCalledWith(['Hello'], 'Japanese');

      // Verify all cache layers are populated
      const cacheStats = await engine.getCacheStats();
      expect(cacheStats.memory).toBe(1);
      expect(cacheStats.session).toBe(1);
      expect(cacheStats.local).toBe(1);
    });

    it('should handle partial cache hits', async () => {
      // RED: Mix of cached and uncached texts
      await engine.initialize();

      // Pre-populate cache with one text
      mockApiClient.translate.mockResolvedValueOnce(['こんにちは']);
      await engine.translateBatch(['Hello'], 'Japanese');
      mockApiClient.translate.mockClear();

      // Translate batch with cached and uncached text
      mockApiClient.translate.mockResolvedValueOnce(['世界']);
      const result = await engine.translateBatch(['Hello', 'World'], 'Japanese');

      expect(result).toEqual(['こんにちは', '世界']);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(1);
      expect(mockApiClient.translate).toHaveBeenCalledWith(['World'], 'Japanese');
    });
  });

  describe('translateBatch - Batch Processing Tests', () => {
    it('should split large batches into chunks of BATCH_SIZE', async () => {
      // RED: 25 texts should split into 3 batches (10+10+5)
      await engine.initialize();

      const texts = Array.from({ length: 25 }, (_, i) => `Text ${i}`);
      const translations = texts.map((_, i) => `Translation ${i}`);

      // Mock API to return translations in batches
      mockApiClient.translate
        .mockResolvedValueOnce(translations.slice(0, 10))
        .mockResolvedValueOnce(translations.slice(10, 20))
        .mockResolvedValueOnce(translations.slice(20, 25));

      const result = await engine.translateBatch(texts, 'Japanese');

      expect(result).toEqual(translations);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(3);
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(1, texts.slice(0, 10), 'Japanese');
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(2, texts.slice(10, 20), 'Japanese');
      expect(mockApiClient.translate).toHaveBeenNthCalledWith(3, texts.slice(20, 25), 'Japanese');
    });

    it('should process batches in parallel', async () => {
      // RED: Verify parallel processing with Promise.all
      await engine.initialize();

      const texts = Array.from({ length: 20 }, (_, i) => `Text ${i}`);
      const translations = texts.map((_, i) => `Translation ${i}`);

      let callOrder: number[] = [];
      mockApiClient.translate.mockImplementation(async (batch: string[]) => {
        const startIndex = texts.indexOf(batch[0]);
        callOrder.push(startIndex);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return translations.slice(startIndex, startIndex + batch.length);
      });

      await engine.translateBatch(texts, 'Japanese');

      // Both batches should be called (parallel execution)
      expect(mockApiClient.translate).toHaveBeenCalledTimes(2);
    });
  });

  describe('translateBatch - Retry Integration Tests', () => {
    it('should retry on API failure', async () => {
      // RED: Verify retry logic integration
      await engine.initialize();

      let callCount = 0;
      mockApiClient.translate.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Network error');
        }
        return ['こんにちは'];
      });

      const result = await engine.translateBatch(['Hello'], 'Japanese');

      expect(result).toEqual(['こんにちは']);
      expect(mockApiClient.translate).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries exhausted', async () => {
      // RED: Should throw after 3 retries (initial + 3 retries = 4 calls)
      await engine.initialize();

      mockApiClient.translate.mockRejectedValue(new Error('Persistent error'));

      await expect(engine.translateBatch(['Hello'], 'Japanese')).rejects.toThrow(
        'Persistent error'
      );

      // Should have tried 4 times (initial + 3 retries)
      expect(mockApiClient.translate).toHaveBeenCalledTimes(4);
    }, 10000); // 10 second timeout
  });

  describe('clearCache', () => {
    beforeEach(async () => {
      await engine.initialize();
      // Populate caches
      mockApiClient.translate.mockResolvedValueOnce(['こんにちは']);
      await engine.translateBatch(['Hello'], 'Japanese');
    });

    it('should clear memory cache only', async () => {
      // RED: clearCache('memory') should only clear memory
      await engine.clearCache('memory');

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBeGreaterThan(0);
      expect(stats.local).toBeGreaterThan(0);
    });

    it('should clear session cache only', async () => {
      // RED: clearCache('session') should only clear session
      await engine.clearCache('session');

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBeGreaterThan(0);
    });

    it('should clear local cache only', async () => {
      // RED: clearCache('local') should only clear local
      await engine.clearCache('local');

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.session).toBeGreaterThan(0);
      expect(stats.local).toBe(0);
    });

    it('should clear all caches when no parameter provided', async () => {
      // RED: clearCache() or clearCache('all') should clear all
      await engine.clearCache();

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });

    it('should clear all caches with "all" parameter', async () => {
      await engine.clearCache('all');

      const stats = await engine.getCacheStats();
      expect(stats.memory).toBe(0);
      expect(stats.session).toBe(0);
      expect(stats.local).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return accurate cache statistics', async () => {
      // RED: Should return correct cache sizes and hit rate
      await engine.initialize();

      // Populate caches
      mockApiClient.translate.mockResolvedValueOnce(['こんにちは', 'さようなら']);
      await engine.translateBatch(['Hello', 'Goodbye'], 'Japanese');

      const stats = await engine.getCacheStats();

      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('session');
      expect(stats).toHaveProperty('local');
      expect(stats).toHaveProperty('hitRate');
      expect(stats.memory).toBe(2);
      expect(stats.session).toBe(2);
      expect(stats.local).toBe(2);
    });

    it('should calculate hit rate correctly', async () => {
      // RED: Hit rate should be (hits / total) * 100
      await engine.initialize();

      // First call - cache miss (hit rate: 0%)
      mockApiClient.translate.mockResolvedValueOnce(['こんにちは']);
      await engine.translateBatch(['Hello'], 'Japanese');
      let stats = await engine.getCacheStats();
      expect(stats.hitRate).toBe(0);

      // Second call - cache hit (hit rate: 50%)
      await engine.translateBatch(['Hello'], 'Japanese');
      stats = await engine.getCacheStats();
      expect(stats.hitRate).toBe(50);

      // Third call - cache hit (hit rate: 66.67%)
      await engine.translateBatch(['Hello'], 'Japanese');
      stats = await engine.getCacheStats();
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('error handling', () => {
    it('should handle empty text array', async () => {
      // RED: Empty array should return empty array
      await engine.initialize();

      const result = await engine.translateBatch([], 'Japanese');
      expect(result).toEqual([]);
      expect(mockApiClient.translate).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      // RED: Storage errors should not crash the engine
      await engine.initialize();

      // Mock storage failure
      globalThis.localStorage.setItem = jest.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      mockApiClient.translate.mockResolvedValueOnce(['こんにちは']);

      // Should still work with memory cache only
      const result = await engine.translateBatch(['Hello'], 'Japanese');
      expect(result).toEqual(['こんにちは']);
    });

    it('should throw error when API client not initialized', async () => {
      // RED: Should throw meaningful error
      const uninitializedEngine = new TranslationEngine();

      await expect(uninitializedEngine.translateBatch(['Hello'], 'Japanese')).rejects.toThrow();
    });
  });
});
