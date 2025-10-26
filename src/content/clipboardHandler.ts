/**
 * ClipboardHandler - Clipboard content reading and translation
 *
 * Responsibilities:
 * - Read text from system clipboard
 * - Request translation via MessageBus
 * - Handle clipboard API permissions
 * - Error handling for clipboard access
 */

import { MessageBus } from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';
import { logger } from '@shared/utils';

export class ClipboardHandler {
  private messageBus: MessageBus;

  constructor() {
    this.messageBus = new MessageBus();
  }

  /**
   * Read text from clipboard
   * @returns Clipboard text or null if empty/error
   */
  async read(): Promise<string | null> {
    try {
      // Check if Clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        logger.warn('Clipboard API not available');
        return null;
      }

      const text = await navigator.clipboard.readText();
      const trimmedText = text.trim();

      if (!trimmedText) {
        logger.log('Clipboard is empty');
        return null;
      }

      logger.log('Clipboard read:', trimmedText.substring(0, 50));
      return trimmedText;
    } catch (error) {
      logger.error('Failed to read clipboard:', error);
      return null;
    }
  }

  /**
   * Translate clipboard content
   * @param targetLanguage - Target language code
   * @returns Translated text or null if error
   */
  async translateClipboard(targetLanguage: string): Promise<string | null> {
    try {
      // Read clipboard
      const clipboardText = await this.read();

      if (!clipboardText) {
        logger.log('No clipboard text to translate');
        return null;
      }

      logger.log('Translating clipboard content to', targetLanguage);

      // Request translation
      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: [clipboardText],
          targetLanguage,
        },
      });

      if (response?.payload?.translations && response.payload.translations.length > 0) {
        return response.payload.translations[0];
      }

      logger.warn('Empty translation response for clipboard');
      return null;
    } catch (error) {
      logger.error('Failed to translate clipboard:', error);
      return null;
    }
  }
}
