/**
 * Retry utility with exponential and linear backoff support
 *
 * Features:
 * - Configurable max retries
 * - Exponential or linear backoff strategies
 * - Error callback for retry events
 * - Type-safe generic return values
 *
 * @example
 * ```typescript
 * import { retry } from './retry';
 *
 * // Exponential backoff (default)
 * const result = await retry(
 *   () => fetchData(),
 *   { maxRetries: 3, delay: 1000 }
 * );
 *
 * // Linear backoff with error logging
 * const data = await retry(
 *   () => apiCall(),
 *   {
 *     maxRetries: 5,
 *     delay: 500,
 *     backoff: 'linear',
 *     onError: (error, attempt) => console.log(`Retry ${attempt}:`, error)
 *   }
 * );
 * ```
 */

/**
 * Retry options configuration
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries: number;

  /**
   * Initial delay in milliseconds
   * @default 1000
   */
  delay: number;

  /**
   * Backoff strategy
   * - exponential: delay * 2^attempt
   * - linear: delay * (attempt + 1)
   * @default 'exponential'
   */
  backoff?: 'linear' | 'exponential';

  /**
   * Callback invoked on each error before retry
   * @param error - The error that occurred
   * @param attempt - Current attempt number (0-indexed)
   */
  onError?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with configurable backoff strategy
 *
 * @template T - Return type of the function
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Promise resolving to the function's return value
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * // Basic usage
 * const data = await retry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, delay: 1000 }
 * );
 *
 * // With error handling
 * try {
 *   const result = await retry(
 *     () => riskyOperation(),
 *     {
 *       maxRetries: 5,
 *       delay: 500,
 *       backoff: 'linear',
 *       onError: (err, attempt) => logger.warn(`Attempt ${attempt} failed:`, err)
 *     }
 *   );
 * } catch (error) {
 *   logger.error('All retries exhausted:', error);
 * }
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, delay, backoff = 'exponential', onError } = options;
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Call error callback if provided
      if (onError && attempt < maxRetries) {
        onError(lastError, attempt);
      }

      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        const waitTime =
          backoff === 'exponential'
            ? delay * Math.pow(2, attempt)
            : delay * (attempt + 1);

        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}
