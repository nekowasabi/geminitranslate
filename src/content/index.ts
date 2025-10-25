/**
 * Content Script Entry Point
 *
 * Initializes ContentScript orchestrator and handles
 * browser-specific setup.
 */

import { ContentScript } from './contentScript';
import { logger } from '@shared/utils';

// Determine browser API
const browserAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (window as any).browser;

// Initialize ContentScript
let contentScript: ContentScript | null = null;

try {
  contentScript = new ContentScript();
  contentScript.initialize();

  logger.log('DoganayLab Translate - Content Script initialized');
} catch (error) {
  logger.error('Failed to initialize content script:', error);
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (contentScript) {
    contentScript.cleanup();
  }
});

// Export for potential testing/debugging
export { contentScript };
