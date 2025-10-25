/**
 * Logger utility for consistent logging across the extension
 *
 * Features:
 * - Timestamp prefix for all logs
 * - Log level indicators ([LOG], [WARN], [ERROR])
 * - Environment-based log suppression (production)
 * - Multiple argument support
 *
 * @example
 * ```typescript
 * import { logger } from './logger';
 *
 * logger.log('User action:', { action: 'translate', target: 'ja' });
 * logger.warn('API rate limit approaching');
 * logger.error('Translation failed:', error);
 * ```
 */

type LogLevel = 'LOG' | 'WARN' | 'ERROR';

/**
 * Logger interface
 */
interface Logger {
  log(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Format timestamp for log output
 * @returns Formatted timestamp string (YYYY-MM-DD HH:MM:SS)
 */
function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Create formatted log prefix
 * @param level - Log level
 * @returns Formatted prefix string
 */
function createPrefix(level: LogLevel): string {
  const timestamp = getTimestamp();
  return `${timestamp} [${level}]`;
}

/**
 * Logger instance providing log, warn, and error methods
 */
export const logger: Logger = {
  /**
   * Log a message (suppressed in production)
   * @param message - Main message to log
   * @param args - Additional arguments to log
   */
  log(message: string, ...args: unknown[]): void {
    if (isProduction) {
      return; // Suppress logs in production
    }

    const prefix = createPrefix('LOG');
    console.log(`${prefix} ${message}`, ...args);
  },

  /**
   * Log a warning message
   * @param message - Warning message to log
   * @param args - Additional arguments to log
   */
  warn(message: string, ...args: unknown[]): void {
    const prefix = createPrefix('WARN');
    console.warn(`${prefix} ${message}`, ...args);
  },

  /**
   * Log an error message
   * @param message - Error message to log
   * @param args - Additional arguments (e.g., Error objects)
   */
  error(message: string, ...args: unknown[]): void {
    const prefix = createPrefix('ERROR');
    console.error(`${prefix} ${message}`, ...args);
  },
};
