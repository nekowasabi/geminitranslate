/**
 * SelectionHandler - Text selection detection and translation
 *
 * Responsibilities:
 * - Detect text selection via mouseup events
 * - Extract selected text from DOM
 * - Request translation via MessageBus
 * - Enable/disable selection monitoring
 */

import { MessageBus } from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';
import { logger } from '@shared/utils';

export class SelectionHandler {
  private messageBus: MessageBus;
  private enabled = false;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.messageBus = new MessageBus();
  }

  /**
   * Enable selection monitoring
   */
  enable(): void {
    if (this.enabled) {
      return; // Already enabled
    }

    this.mouseUpHandler = this.handleMouseUp.bind(this);
    document.addEventListener('mouseup', this.mouseUpHandler);
    this.enabled = true;

    logger.log('SelectionHandler enabled');
  }

  /**
   * Disable selection monitoring
   */
  disable(): void {
    if (!this.enabled || !this.mouseUpHandler) {
      return; // Not enabled
    }

    document.removeEventListener('mouseup', this.mouseUpHandler);
    this.mouseUpHandler = null;
    this.enabled = false;

    logger.log('SelectionHandler disabled');
  }

  /**
   * Get currently selected text
   * @returns Selected text or null if no selection
   */
  getSelectedText(): string | null {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const selectedText = selection.toString().trim();

    if (!selectedText) {
      return null;
    }

    return selectedText;
  }

  /**
   * Translate selected text
   * @param targetLanguage - Target language code
   * @returns Translated text or null if error/no selection
   */
  async translateSelection(targetLanguage: string): Promise<string | null> {
    const selectedText = this.getSelectedText();

    if (!selectedText) {
      logger.log('No text selected for translation');
      return null;
    }

    try {
      logger.log('Translating selection:', selectedText.substring(0, 50));

      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        payload: {
          texts: [selectedText],
          targetLanguage,
        },
      });

      if (response?.payload?.translations && response.payload.translations.length > 0) {
        return response.payload.translations[0];
      }

      logger.warn('Empty translation response');
      return null;
    } catch (error) {
      logger.error('Failed to translate selection:', error);
      return null;
    }
  }

  /**
   * Handle mouseup event
   */
  private handleMouseUp(event: MouseEvent): void {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      const selectedText = this.getSelectedText();

      if (selectedText) {
        logger.log('Text selected:', selectedText.substring(0, 50));
        // Selection detected - can be used by other components
      }
    }, 10);
  }
}
