/**
 * @jest-environment jsdom
 */
import { retry } from '../../../src/shared/utils/retry';

describe('Retry Utility', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const promise = retry(fn, { maxRetries: 3, delay: 100 });

      // Wait for all pending promises
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxRetries: 3, delay: 100 });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after max retries', async () => {
      const error = new Error('persistent failure');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn, { maxRetries: 2, delay: 100 });

      // Run all timers and wait for promise to reject
      const runTimers = jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('persistent failure');
      await runTimers;

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('exponential backoff', () => {
    it('should use exponential backoff by default', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxRetries: 2, delay: 100 });

      // First call (immediate)
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait for first retry (100ms * 2^0 = 100ms)
      await jest.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Wait for second retry (100ms * 2^1 = 200ms)
      await jest.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      await promise;
    });

    it('should use exponential backoff when specified', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        maxRetries: 1,
        delay: 100,
        backoff: 'exponential',
      });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // Exponential: 100ms * 2^0 = 100ms
      await jest.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      await promise;
    });
  });

  describe('linear backoff', () => {
    it('should use linear backoff when specified', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        maxRetries: 2,
        delay: 100,
        backoff: 'linear',
      });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // Linear: 100ms * (0 + 1) = 100ms
      await jest.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Linear: 100ms * (1 + 1) = 200ms
      await jest.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      await promise;
    });
  });

  describe('edge cases', () => {
    it('should handle maxRetries = 0', async () => {
      const error = new Error('immediate failure');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn, { maxRetries: 0, delay: 100 });

      const runTimers = jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('immediate failure');
      await runTimers;

      expect(fn).toHaveBeenCalledTimes(1); // no retries
    });

    it('should handle very short delays', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxRetries: 1, delay: 1 });

      await jest.runAllTimersAsync();
      await promise;

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle synchronous errors', async () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('sync error');
      });

      const promise = retry(fn, { maxRetries: 1, delay: 100 });

      const runTimers = jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('sync error');
      await runTimers;
    });

    it('should handle Promise rejections', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('async error'));

      const promise = retry(fn, { maxRetries: 1, delay: 100 });

      const runTimers = jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('async error');
      await runTimers;
    });
  });

  describe('type safety', () => {
    it('should preserve return type', async () => {
      const fn = jest.fn().mockResolvedValue(42);

      const promise = retry(fn, { maxRetries: 3, delay: 100 });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(typeof result).toBe('number');
      expect(result).toBe(42);
    });

    it('should work with complex return types', async () => {
      interface ComplexType {
        id: number;
        data: string[];
      }

      const complexData: ComplexType = {
        id: 1,
        data: ['a', 'b', 'c'],
      };

      const fn = jest.fn().mockResolvedValue(complexData);

      const promise = retry(fn, { maxRetries: 2, delay: 50 });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(complexData);
    });
  });

  describe('callback functionality', () => {
    it('should call onError callback on each failure', async () => {
      const error1 = new Error('fail 1');
      const error2 = new Error('fail 2');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValue('success');

      const onError = jest.fn();

      const promise = retry(fn, {
        maxRetries: 2,
        delay: 100,
        onError,
      });

      await jest.runAllTimersAsync();
      await promise;

      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenNthCalledWith(1, error1, 0);
      expect(onError).toHaveBeenNthCalledWith(2, error2, 1);
    });

    it('should not call onError on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const onError = jest.fn();

      const promise = retry(fn, {
        maxRetries: 3,
        delay: 100,
        onError,
      });

      await jest.runAllTimersAsync();
      await promise;

      expect(onError).not.toHaveBeenCalled();
    });
  });
});
