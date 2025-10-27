/**
 * SelectionHandler - Text selection detection and translation
 *
 * Responsibilities:
 * - Detect text selection via mouseup events
 * - Extract selected text from DOM
 * - Request translation via MessageBus
 * - Display IconBadge near selection
 * - Enable/disable selection monitoring
 */

import { MessageBus } from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';
import { logger } from '@shared/utils';
import { IconBadge } from './iconBadge';
import StorageManager from '@shared/storage/StorageManager';

export class SelectionHandler {
  private messageBus: MessageBus;
  private iconBadge: IconBadge;
  private storageManager: StorageManager;
  private enabled = false;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private isTranslating = false;
  private selectionFontSizeCache: number | null = null;

  constructor() {
    this.messageBus = new MessageBus();
    this.iconBadge = new IconBadge();
    this.storageManager = new StorageManager();
    this.setupStorageListener();
  }

  /**
   * Setup storage change listener to invalidate cache
   */
  private setupStorageListener(): void {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.selectionFontSize) {
          this.selectionFontSizeCache = null;
          logger.log('Selection font size cache invalidated');
        }
      });
    }
  }

  /**
   * Get selection font size from cache or storage
   * @returns Font size in pixels
   */
  private async getSelectionFontSize(): Promise<number> {
    if (this.selectionFontSizeCache !== null) {
      return this.selectionFontSizeCache;
    }

    const storageData = await this.storageManager.get(['selectionFontSize']);
    const fontSize = storageData.selectionFontSize ?? 14;
    this.selectionFontSizeCache = fontSize;

    return fontSize;
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
    this.iconBadge.hide();

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
   * @param text - Optional text to translate (if not provided, uses current selection)
   * @returns Translated text or null if error/no selection
   */
  async translateSelection(targetLanguage: string, text?: string): Promise<string | null> {
    // Prevent concurrent translations
    if (this.isTranslating) {
      logger.log('Translation already in progress, skipping');
      return null;
    }

    // Use provided text or get current selection
    const selectedText = text || this.getSelectedText();

    if (!selectedText) {
      logger.log('No text selected for translation');
      return null;
    }

    try {
      this.isTranslating = true;
      logger.log('Translating selection:', selectedText.substring(0, 50));

      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: [selectedText],
          targetLanguage,
        },
      });

      if (response?.success && response?.data?.translations && response.data.translations.length > 0) {
        const translation = response.data.translations[0];

        logger.log('Translation successful, sending SELECTION_TRANSLATED message:', {
          originalText: selectedText.substring(0, 50),
          translatedText: translation.substring(0, 50),
          targetLanguage,
        });

        // Send message to Popup via Background Script
        await this.messageBus.send({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: selectedText,
            translatedText: translation,
            targetLanguage,
            timestamp: Date.now(),
          },
        });

        logger.log('SELECTION_TRANSLATED message sent successfully');

        return translation;
      }

      logger.warn('Empty translation response');
      return null;
    } catch (error) {
      logger.error('Failed to translate selection:', error);
      return null;
    } finally {
      this.isTranslating = false;
    }
  }

  /**
   * Handle mouseup event
   */
  private handleMouseUp(event: MouseEvent): void {
    // Small delay to ensure selection is complete
    setTimeout(async () => {
      const selectedText = this.getSelectedText();

      if (selectedText) {
        logger.log('Text selected:', selectedText.substring(0, 50));

        // Get selection position for IconBadge
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Show IconBadge near selection
          this.iconBadge.show(
            {
              x: rect.right,
              y: rect.bottom,
            },
            async () => {
              // IconBadge clicked - trigger translation
              // Use captured selectedText from mouseup event to ensure full text is translated
              try {
                const targetLanguage = await this.storageManager.getTargetLanguage();

                if (!targetLanguage) {
                  logger.warn('No target language configured');
                  return;
                }

                // Pass selectedText explicitly to ensure full text is translated
                // even if user has deselected the text before clicking IconBadge
                const translatedText = await this.translateSelection(targetLanguage, selectedText);

                // Show FloatingUI with translation result
                if (translatedText && selectedText) {
                  await this.iconBadge.showTranslationResult(
                    selectedText,
                    translatedText,
                    targetLanguage,
                    {
                      x: rect.right,
                      y: rect.bottom,
                    }
                  );
                }
              } catch (error) {
                logger.error('Failed to handle IconBadge click:', error);
              }
            }
          );
        }
      }
    }, 10);
  }
}
