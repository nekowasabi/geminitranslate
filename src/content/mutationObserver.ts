/**
 * MutationObserverManager - Dynamic content detection
 *
 * Responsibilities:
 * - Monitor DOM for dynamic content changes
 * - Detect new text nodes added to the page
 * - Trigger callbacks on mutations
 * - Manage observer lifecycle
 */

import { logger } from "@shared/utils";

export type MutationCallback = (
  mutations: MutationRecord[],
) => void | Promise<void>;

export class MutationObserverManager {
  private observer: MutationObserver | null = null;
  private callback: MutationCallback | null = null;
  private isObserving = false;

  /**
   * Start observing DOM mutations
   * @param callback - Function to call when mutations occur
   */
  observe(callback: MutationCallback): void {
    if (this.isObserving) {
      logger.log("MutationObserver already observing");
      return;
    }

    this.callback = callback;

    // Create MutationObserver
    this.observer = new MutationObserver((mutations) => {
      try {
        if (this.callback) {
          Promise.resolve(this.callback(mutations)).catch((error) => {
            logger.error("Error in async MutationObserver callback:", error);
          });
        }
      } catch (error) {
        logger.error("Error in MutationObserver callback:", error);
      }
    });

    // Start observing document.body
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: false,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "aria-expanded",
        "open",
      ],
    });

    this.isObserving = true;
    logger.log("MutationObserver started");
  }

  /**
   * Stop observing DOM mutations
   */
  disconnect(): void {
    if (!this.isObserving || !this.observer) {
      return;
    }

    this.observer.disconnect();
    this.observer = null;
    this.callback = null;
    this.isObserving = false;

    logger.log("MutationObserver disconnected");
  }
}
