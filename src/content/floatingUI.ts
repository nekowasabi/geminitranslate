/**
 * FloatingUI - Floating translation display UI
 *
 * Responsibilities:
 * - Create and display floating UI with translation
 * - Position UI near selection or specified coordinates
 * - Provide copy-to-clipboard functionality
 * - Support dark mode
 * - Adjust position to stay within viewport
 */

import { logger } from '@shared/utils';
import { UI_CONFIG } from '@shared/constants';

export interface Position {
  x: number;
  y: number;
}

export class FloatingUI {
  private floatingElement: HTMLElement | null = null;
  private translation: string = '';

  /**
   * Show floating UI with translation
   * @param translation - Translated text to display
   * @param position - Position coordinates { x, y }
   */
  show(translation: string, position: Position): void {
    // Hide existing UI
    this.hide();

    this.translation = translation;

    // Create floating container
    this.floatingElement = this.createFloatingElement();

    // Add translation text
    const textElement = this.createTextElement(translation);
    this.floatingElement.appendChild(textElement);

    // Add copy button
    const copyButton = this.createCopyButton();
    this.floatingElement.appendChild(copyButton);

    // Add to DOM
    document.body.appendChild(this.floatingElement);

    // Position UI
    this.positionElement(position);

    logger.log('FloatingUI shown at', position);
  }

  /**
   * Hide floating UI
   */
  hide(): void {
    if (this.floatingElement && this.floatingElement.parentNode) {
      this.floatingElement.parentNode.removeChild(this.floatingElement);
      this.floatingElement = null;
      logger.log('FloatingUI hidden');
    }
  }

  /**
   * Create copy button element
   * @returns HTMLButtonElement
   */
  createCopyButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.type = 'button';

    // Add styles
    Object.assign(button.style, {
      marginTop: '8px',
      padding: '6px 12px',
      backgroundColor: '#4F46E5',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
    });

    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.translation);
        button.textContent = 'Copied!';
        button.style.backgroundColor = '#10B981';

        setTimeout(() => {
          button.textContent = 'Copy';
          button.style.backgroundColor = '#4F46E5';
        }, 2000);

        logger.log('Translation copied to clipboard');
      } catch (error) {
        logger.error('Failed to copy to clipboard:', error);
        button.textContent = 'Error';
        button.style.backgroundColor = '#EF4444';

        setTimeout(() => {
          button.textContent = 'Copy';
          button.style.backgroundColor = '#4F46E5';
        }, 2000);
      }
    });

    return button;
  }

  /**
   * Create floating container element
   * @returns HTMLElement
   */
  private createFloatingElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'floating-translation';

    // Detect dark mode
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Add styles
    Object.assign(container.style, {
      position: 'fixed',
      zIndex: '10000',
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      color: isDarkMode ? '#F3F4F6' : '#1F2937',
      padding: '16px',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      maxWidth: '400px',
      minWidth: '200px',
      display: 'flex',
      flexDirection: 'column',
      border: isDarkMode ? '1px solid #374151' : '1px solid #E5E7EB',
    });

    return container;
  }

  /**
   * Create translation text element
   * @param translation - Translation text
   * @returns HTMLElement
   */
  private createTextElement(translation: string): HTMLElement {
    const textElement = document.createElement('div');
    textElement.className = 'translation-text';
    textElement.textContent = translation; // Use textContent to prevent XSS

    // Add styles
    Object.assign(textElement.style, {
      fontSize: '14px',
      lineHeight: '1.5',
      wordBreak: 'break-word',
      marginBottom: '8px',
    });

    return textElement;
  }

  /**
   * Position floating element at specified coordinates
   * @param position - Position coordinates
   */
  private positionElement(position: Position): void {
    if (!this.floatingElement) {
      return;
    }

    const offset = UI_CONFIG.FLOATING_UI_OFFSET;

    // Adjust position to stay within viewport
    let { x, y } = position;

    // Ensure non-negative
    x = Math.max(0, x);
    y = Math.max(0, y);

    // Add offset
    x += offset;
    y += offset;

    // Get element dimensions
    const rect = this.floatingElement.getBoundingClientRect();

    // Adjust if going off right edge
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - offset;
    }

    // Adjust if going off bottom edge
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - offset;
    }

    // Ensure still non-negative after adjustments
    x = Math.max(0, x);
    y = Math.max(0, y);

    // Apply position
    this.floatingElement.style.left = `${x}px`;
    this.floatingElement.style.top = `${y}px`;
  }
}
