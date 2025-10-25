/**
 * KeepAlive - Chrome Service Worker Keep-Alive Mechanism
 *
 * Prevents Chrome service workers from being terminated by creating an
 * offscreen document and sending periodic ping messages every 20 seconds.
 *
 * Features:
 * - Offscreen document creation for background activity
 * - Periodic ping messages to keep service worker active
 * - Automatic error handling and recovery
 * - Start/stop lifecycle management
 *
 * Chrome Service Worker Behavior:
 * - Service workers are terminated after ~30 seconds of inactivity
 * - Offscreen documents allow background activity without visible UI
 * - Periodic messages reset the inactivity timer
 *
 * @example
 * ```typescript
 * const keepAlive = new KeepAlive();
 *
 * // Start keep-alive mechanism
 * await keepAlive.start();
 *
 * // Stop when no longer needed
 * keepAlive.stop();
 * ```
 */

import { logger } from '../shared/utils/logger';

/**
 * KeepAlive manages service worker lifecycle in Chrome
 */
export class KeepAlive {
  private intervalId: NodeJS.Timeout | null = null;
  private started: boolean = false;
  private readonly PING_INTERVAL = 20000; // 20 seconds

  /**
   * Start the keep-alive mechanism
   * Creates offscreen document and starts ping interval
   */
  async start(): Promise<void> {
    // Prevent duplicate start
    if (this.started) {
      logger.log('KeepAlive: Already started');
      return;
    }

    try {
      // Create offscreen document
      await this.createOffscreenDocument();

      // Start ping interval
      this.intervalId = setInterval(() => {
        this.sendPing();
      }, this.PING_INTERVAL);

      this.started = true;
      logger.log('KeepAlive: Started successfully');
    } catch (error) {
      logger.warn('KeepAlive: Failed to start', error);
    }
  }

  /**
   * Stop the keep-alive mechanism
   * Clears ping interval
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.started = false;
    logger.log('KeepAlive: Stopped');
  }

  /**
   * Create offscreen document for background activity
   * @private
   */
  private async createOffscreenDocument(): Promise<void> {
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS' as chrome.offscreen.Reason],
        justification: 'Keep service worker alive',
      });

      logger.log('KeepAlive: Offscreen document created');
    } catch (error) {
      // Document may already exist, which is fine
      if (chrome.runtime.lastError) {
        logger.warn('KeepAlive: Failed to create offscreen document', error);
      } else {
        logger.warn('KeepAlive: Failed to create offscreen document', error);
      }
    }
  }

  /**
   * Send ping message to reset inactivity timer
   * @private
   */
  private async sendPing(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({ type: 'keepalive' });
      logger.log('KeepAlive: Ping sent');
    } catch (error) {
      // Ping failures are non-fatal, just log
      logger.error('KeepAlive: Failed to send ping', error);
    }
  }
}
