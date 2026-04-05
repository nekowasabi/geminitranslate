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
import storageManager, { StorageManager } from '@shared/storage/StorageManager';

/**
 * Toast style constants - consistent with ProgressNotification
 * Why: Reusing ProgressNotification color constants directly would require importing the entire module.
 * Instead, define matching constants here to keep SelectionHandler self-contained.
 */
const TOAST_STYLES = {
  POSITION: {
    BOTTOM: '20px',
    RIGHT: '20px',
  },
  Z_INDEX: '10001',
  COLORS: {
    loading: '#4F46E5',  // ProgressNotification NORMAL_BG
    error: '#EF4444',    // ProgressNotification ERROR_BG
    info: '#3B82F6',     // Informational blue
  },
  AUTO_HIDE_MS: 5000,
} as const;

// Why: shared message constants for toast and inline error — avoids message drift between the two UI surfaces.
const TOAST_MESSAGES = {
  LOADING: '翻訳中...',
  TRANSLATION_FAILED: '翻訳に失敗しました',
  TRANSLATION_ERROR: '翻訳エラーが発生しました',
  IMAGE_SELECTION: '画像を含む選択ではテキスト部分のみ翻訳できます',
} as const;

export type ToastType = 'loading' | 'error' | 'info';

export class SelectionHandler {
  private messageBus: MessageBus;
  private iconBadge: IconBadge;
  private storageManager: StorageManager;
  private enabled = false;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private isTranslating = false;
  private selectionFontSizeCache: number | null = null;
  // Why: error flag instead of re-throw — translateSelection is called directly in tests expecting null return;
  // re-throwing would break those tests. Flag lets the click callback distinguish "error" vs "empty result".
  private lastTranslationErrored = false;

  // Toast notification state
  private toastElement: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.messageBus = new MessageBus();
    this.iconBadge = new IconBadge();
    this.storageManager = storageManager;
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
    this.hideSelectionToast();

    logger.log('SelectionHandler disabled');
  }

  /**
   * Show a lightweight toast notification near the selection area
   * Why: Dedicated toast instead of reusing ProgressNotification — ProgressNotification includes
   // a progress bar and phase management designed for full-page translation. Selection translation
   // needs a simpler, lightweight notification.
   *
   * @param message - Toast message text
   * @param type - Toast style type: 'loading' (persistent), 'error' (auto-hide 5s), 'info' (auto-hide 5s)
   */
  showSelectionToast(message: string, type: ToastType): void {
    this.hideSelectionToast();

    const toast = document.createElement('div');
    toast.className = 'gemini-translate-selection-toast';

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: TOAST_STYLES.POSITION.BOTTOM,
      right: TOAST_STYLES.POSITION.RIGHT,
      zIndex: TOAST_STYLES.Z_INDEX,
      padding: '12px 16px',
      borderRadius: '8px',
      backgroundColor: TOAST_STYLES.COLORS[type],
      color: '#FFFFFF',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      transition: 'opacity 0.3s ease',
      opacity: '0',
    });

    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger fade-in via rAF
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    this.toastElement = toast;

    // Why: loading type has no auto-hide — it persists until explicitly hidden (e.g. translation completes).
    // error/info auto-hide after 5s to avoid lingering stale notifications.
    if (type === 'error' || type === 'info') {
      this.toastTimer = setTimeout(() => this.hideSelectionToast(), TOAST_STYLES.AUTO_HIDE_MS);
    }
  }

  /**
   * Hide and remove the current toast notification
   */
  hideSelectionToast(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.toastElement?.parentNode) {
      this.toastElement.remove();
      this.toastElement = null;
    }
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

    this.lastTranslationErrored = false;
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
      this.lastTranslationErrored = true;
      return null;
    } finally {
      this.isTranslating = false;
    }
  }

  /**
   * Handle mouseup event
   */
  private handleMouseUp(event: MouseEvent): void {
    // Why: stopPropagation単体では将来のUI要素追加時に漏れる可能性あり。二重防御。
    // Why: instanceofチェック — Documentノード等HTMLElement以外のtargetでclosestが未定義となるのを防ぐ
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(`.${IconBadge.CLASS_NAME}`)) {
      return;
    }

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

          // Show IconBadge at fixed position: right edge, vertical center
          this.iconBadge.show(
            {
              x: window.innerWidth - 40,  // Right edge minus icon width (32px) and margin (8px)
              y: window.innerHeight / 2,  // Vertical center
            },
            async () => {
              // IconBadge clicked - trigger translation
              // Use captured selectedText from mouseup event to ensure full text is translated
              // Why: try-finally で setLoading(false) を確実解除。成功/失敗/例外の全パスで解除漏れゼロを保証。
              try {
                this.iconBadge.setLoading(true);
                this.showSelectionToast(TOAST_MESSAGES.LOADING, 'loading');

                const targetLanguage = await this.storageManager.getTargetLanguage();

                if (!targetLanguage) {
                  logger.warn('No target language configured');
                  this.iconBadge.hide();
                  return;
                }

                // Pass selectedText explicitly to ensure full text is translated
                // even if user has deselected the text before clicking IconBadge
                const translatedText = await this.translateSelection(targetLanguage, selectedText);

                // Show FloatingUI with translation result
                if (translatedText && selectedText) {
                  this.hideSelectionToast();
                  await this.iconBadge.showTranslationResult(
                    selectedText,
                    translatedText,
                    targetLanguage,
                    {
                      x: window.innerWidth,  // Right edge (position will be fixed by CSS)
                      y: 0,                  // Top (position will be fixed by CSS)
                    }
                  );
                } else {
                  // Translation failed - show inline error
                  // Why: distinguish exception path (lastTranslationErrored) from empty-response path
                  // to show the correct user-facing message in each case.
                  if (this.lastTranslationErrored) {
                    this.showSelectionToast(TOAST_MESSAGES.TRANSLATION_ERROR, 'error');
                    this.iconBadge.showInlineError(TOAST_MESSAGES.TRANSLATION_ERROR);
                  } else {
                    this.showSelectionToast(TOAST_MESSAGES.TRANSLATION_FAILED, 'error');
                    this.iconBadge.showInlineError(TOAST_MESSAGES.TRANSLATION_FAILED);
                  }
                }
              } catch (error) {
                logger.error('Failed to handle IconBadge click:', error);
                this.showSelectionToast(TOAST_MESSAGES.TRANSLATION_ERROR, 'error');
                this.iconBadge.showInlineError(TOAST_MESSAGES.TRANSLATION_ERROR);
              } finally {
                this.iconBadge.setLoading(false);
              }
            }
          );
        }
      } else {
        // Why: 画像翻訳は大規模機能（OCR等が必要）でスコープ外。
        // ユーザーが「なぜ反応しないか」を理解できるフィードバックに留める。
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const container = range.cloneContents();
          const hasImages = container.querySelectorAll('img').length > 0;
          if (hasImages) {
            this.showSelectionToast(TOAST_MESSAGES.IMAGE_SELECTION, 'info');
          }
        }
      }
    }, 10);
  }
}
