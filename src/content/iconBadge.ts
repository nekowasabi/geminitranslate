/**
 * IconBadge - Display icon badge near text selection
 *
 * Responsibilities:
 * - Display badge icon at specified position
 * - Handle click events to trigger translation
 * - Auto-hide after click
 * - Adjust position to stay within viewport
 * - Support dark mode
 */

import { logger } from '@shared/utils';
import { UI_CONFIG } from '@shared/constants';
import { Position } from './floatingUI';
import StorageManager from '@shared/storage/StorageManager';

export class IconBadge {
  private badgeElement: HTMLElement | null = null;
  private clickHandler: (() => void) | null = null;
  private floatingResultElement: HTMLElement | null = null;
  private storageManager: StorageManager;

  constructor() {
    this.storageManager = new StorageManager();
  }

  /**
   * Show icon badge at specified position
   * @param position - Position coordinates { x, y }
   * @param onClick - Callback function to execute when badge is clicked
   */
  show(position: Position, onClick: () => void): void {
    // Hide existing badge
    this.hide();

    // Store click handler
    this.clickHandler = onClick;

    // Create badge element
    this.badgeElement = this.createBadgeElement();

    // Add click event listener
    this.badgeElement.addEventListener('click', this.handleClick.bind(this));

    // Add to DOM
    document.body.appendChild(this.badgeElement);

    // Position element
    this.positionElement(position);

    logger.log('IconBadge shown at', position);
  }

  /**
   * Hide icon badge
   */
  hide(): void {
    if (this.badgeElement && this.badgeElement.parentNode) {
      this.badgeElement.parentNode.removeChild(this.badgeElement);
      this.badgeElement = null;
      this.clickHandler = null;
      logger.log('IconBadge hidden');
    }
  }

  /**
   * Show translation result in FloatingUI
   * @param originalText - Original selected text
   * @param translatedText - Translated text
   * @param targetLanguage - Target language name
   * @param position - Position to display FloatingUI
   */
  async showTranslationResult(
    originalText: string,
    translatedText: string,
    targetLanguage: string,
    position: Position
  ): Promise<void> {
    // Hide badge before showing translation result
    this.hide();

    // Hide existing FloatingUI
    this.hideFloatingResult();

    // Create FloatingUI element
    this.floatingResultElement = await this.createFloatingResultElement(
      originalText,
      translatedText,
      targetLanguage
    );

    // Add to DOM
    document.body.appendChild(this.floatingResultElement);

    // Position element
    this.positionFloatingResult(position);

    logger.log('FloatingUI translation result shown at', position);
  }

  /**
   * Hide FloatingUI translation result
   */
  hideFloatingResult(): void {
    if (this.floatingResultElement && this.floatingResultElement.parentNode) {
      this.floatingResultElement.parentNode.removeChild(this.floatingResultElement);
      this.floatingResultElement = null;
      logger.log('FloatingUI translation result hidden');
    }
  }

  /**
   * Create badge element with styles
   * @returns HTMLElement
   */
  private createBadgeElement(): HTMLElement {
    const badge = document.createElement('div');
    badge.className = 'icon-badge';

    // Detect dark mode
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Apply styles
    Object.assign(badge.style, {
      position: 'fixed',
      zIndex: '10002',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: isDarkMode ? '#6366F1' : '#4F46E5',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      transition: 'all 0.2s ease',
      fontSize: '16px',
      fontWeight: 'bold',
      userSelect: 'none',
    });

    // Add icon content (使用 textContent to prevent XSS)
    badge.textContent = 'T';

    // Add hover effect
    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.1)';
      badge.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
    });

    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1)';
      badge.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
    });

    return badge;
  }

  /**
   * Position badge element at fixed position: right edge, vertically centered on browser window
   * @param position - Position coordinates (unused, kept for API compatibility)
   */
  private positionElement(position: Position): void {
    if (!this.badgeElement) {
      return;
    }

    // Fixed positioning: right edge, vertically centered on browser window
    const rightMargin = 8;
    const rect = this.badgeElement.getBoundingClientRect();
    const iconWidth = rect.width || 32;
    const iconHeight = rect.height || 32;

    // Position at right edge of browser window
    const x = window.innerWidth - iconWidth - rightMargin;
    // Center vertically in browser window (not based on selection position)
    const y = (window.innerHeight - iconHeight) / 2;

    // Apply position
    this.badgeElement.style.left = `${x}px`;
    this.badgeElement.style.top = `${y}px`;
  }

  /**
   * Handle badge click event
   */
  private handleClick(): void {
    logger.log('IconBadge clicked');

    // Execute callback
    if (this.clickHandler) {
      this.clickHandler();
    }

    // NOTE: hide() is now called by showTranslationResult() or error handlers
    // to ensure proper timing with async operations
  }

  /**
   * Create FloatingUI result element
   * @param originalText - Original text
   * @param translatedText - Translated text
   * @param targetLanguage - Target language name
   * @returns HTMLElement
   */
  private async createFloatingResultElement(
    originalText: string,
    translatedText: string,
    targetLanguage: string
  ): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.className = 'gemini-translate-floating-result';

    // Get selection font size from storage and set CSS variable
    const storageData = await this.storageManager.get(['selectionFontSize']);
    const fontSize = storageData.selectionFontSize ?? UI_CONFIG.DEFAULT_SELECTION_FONT_SIZE;
    container.style.setProperty('--selection-font-size', `${fontSize}px`);

    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      this.hideFloatingResult();
    });

    // Header
    const header = document.createElement('div');
    header.className = 'header';

    const title = document.createElement('h3');
    title.textContent = '翻訳結果';

    const langSpan = document.createElement('span');
    langSpan.className = 'target-language';
    langSpan.textContent = targetLanguage;

    header.appendChild(title);
    header.appendChild(langSpan);

    // Content
    const content = document.createElement('div');
    content.className = 'content';

    // Translated text section (original text removed as per user request)
    const translatedSection = document.createElement('div');
    translatedSection.className = 'text-section';

    const translatedLabel = document.createElement('div');
    translatedLabel.className = 'text-label';
    translatedLabel.textContent = '翻訳結果';

    const translatedTextDiv = document.createElement('div');
    translatedTextDiv.className = 'translated-text';
    translatedTextDiv.textContent = translatedText;

    translatedSection.appendChild(translatedLabel);
    translatedSection.appendChild(translatedTextDiv);

    content.appendChild(translatedSection);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'actions';

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = 'コピー';
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(translatedText);
        copyButton.textContent = 'コピーしました！';
        setTimeout(() => {
          copyButton.textContent = 'コピー';
        }, 2000);
      } catch (error) {
        logger.error('Failed to copy to clipboard:', error);
        copyButton.textContent = 'コピー失敗';
        setTimeout(() => {
          copyButton.textContent = 'コピー';
        }, 2000);
      }
    });

    actions.appendChild(copyButton);

    // Assemble
    container.appendChild(closeButton);
    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(actions);

    return container;
  }

  /**
   * Position FloatingUI element - fixed to right edge, full height
   * @param position - Position coordinates (ignored for fixed positioning)
   */
  private positionFloatingResult(position: Position): void {
    if (!this.floatingResultElement) {
      return;
    }

    // Fixed positioning: right edge, full height (CSS handles most styling)
    this.floatingResultElement.style.position = 'fixed';
    this.floatingResultElement.style.right = '0';
    this.floatingResultElement.style.top = '0';
    this.floatingResultElement.style.bottom = '0';
    this.floatingResultElement.style.width = '400px';
    this.floatingResultElement.style.overflowY = 'auto';
    this.floatingResultElement.style.left = 'auto';  // Reset left positioning
  }
}
