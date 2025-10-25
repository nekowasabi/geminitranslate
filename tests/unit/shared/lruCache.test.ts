import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import LRUCache from '@shared/utils/lruCache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3); // Small size for testing
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('LRU Eviction', () => {
    it('should evict oldest entry when max size exceeded', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      expect(cache.size()).toBe(3);

      // Adding 4th item should evict key1 (oldest)
      cache.set('key4', 'value4');
      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBeNull(); // Evicted
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should move accessed entries to front', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 (moves to front)
      cache.get('key1');

      // Add 4th item should evict key2 (now oldest)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('value1'); // Still present
      expect(cache.get('key2')).toBeNull(); // Evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update existing keys without evicting', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update key1
      cache.set('key1', 'updated1');
      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBe('updated1');
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.usage).toBeCloseTo(66.67, 1);
    });

    it('should return all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('TTL Eviction', () => {
    it('should evict entries older than TTL', async () => {
      // Mock Date.now() for controlled timing
      const originalDateNow = Date.now;
      let currentTime = 1000;
      Date.now = jest.fn(() => currentTime) as any;

      cache.set('key1', 'value1'); // timestamp: 1000
      currentTime += 100; // 1100
      cache.set('key2', 'value2'); // timestamp: 1100
      currentTime += 100; // 1200
      cache.set('key3', 'value3'); // timestamp: 1200

      expect(cache.size()).toBe(3);

      // Current time: 1200
      // key1: age 200ms
      // key2: age 100ms
      // key3: age 0ms
      // Evict entries older than 150ms should evict key1 only
      const evicted = cache.evictOlderThan(150);

      expect(evicted).toBe(1); // key1 should be evicted
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');

      // Restore Date.now()
      Date.now = originalDateNow;
    });

    it('should not evict recent entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const evicted = cache.evictOlderThan(10000); // 10 seconds
      expect(evicted).toBe(0);
      expect(cache.size()).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle cache size of 1', () => {
      const smallCache = new LRUCache<string>(1);
      smallCache.set('key1', 'value1');
      expect(smallCache.size()).toBe(1);

      smallCache.set('key2', 'value2');
      expect(smallCache.size()).toBe(1);
      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key2')).toBe('value2');
    });

    it('should handle large cache sizes', () => {
      const largeCache = new LRUCache<string>(10000);
      for (let i = 0; i < 5000; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }
      expect(largeCache.size()).toBe(5000);
    });

    it('should handle complex value types', () => {
      interface TestObject {
        id: number;
        name: string;
      }

      const objectCache = new LRUCache<TestObject>(3);
      objectCache.set('obj1', { id: 1, name: 'Test1' });
      objectCache.set('obj2', { id: 2, name: 'Test2' });

      const obj1 = objectCache.get('obj1');
      expect(obj1).toEqual({ id: 1, name: 'Test1' });
    });
  });

  describe('Performance', () => {
    it('should handle many operations efficiently', () => {
      const perfCache = new LRUCache<string>(1000);
      const startTime = Date.now();

      // 10000 operations
      for (let i = 0; i < 10000; i++) {
        perfCache.set(`key${i}`, `value${i}`);
        perfCache.get(`key${i}`);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
      expect(perfCache.size()).toBe(1000); // Only last 1000 should remain
    });
  });
});
