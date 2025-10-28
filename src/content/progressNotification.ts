/**
 * ProgressNotification
 *
 * Displays translation progress notification in the bottom-right corner of the page.
 *
 * Features:
 * - Real-time progress updates with percentage and progress bar
 * - Auto-hide on completion (3 seconds)
 * - Error state with red background (manual close only)
 * - Dark mode support
 * - CSS-in-JS styling
 * - XSS protection via textContent
 *
 * @example
 * ```typescript
 * const notification = new ProgressNotification();
 * notification.show(10); // Start with total=10
 * notification.update(5, 10); // Update to 50%
 * notification.complete(); // Show completion, auto-hide after 3s
 * notification.error('API error'); // Show error, no auto-hide
 * notification.remove(); // Manual cleanup
 * ```
 */

import { logger } from '@shared/utils';

/**
 * Style constants for progress notification
 */
const STYLES = {
  POSITION: {
    BOTTOM: '20px',
    RIGHT: '20px',
  },
  Z_INDEX: '10001',
  COLORS: {
    NORMAL_BG: '#4F46E5',    // Blue
    ERROR_BG: '#EF4444',      // Red
    TEXT: '#FFFFFF',
    PROGRESS_BG_LIGHT: 'rgba(0,0,0,0.1)',
    PROGRESS_BG_DARK: 'rgba(255,255,255,0.2)',
    PROGRESS_BAR: '#FFFFFF',
  },
  SIZING: {
    PADDING: '16px 20px',
    MIN_WIDTH: '280px',
    MAX_WIDTH: '400px',
    BORDER_RADIUS: '8px',
    PROGRESS_HEIGHT: '6px',
  },
  FONT: {
    FAMILY: 'system-ui, -apple-system, sans-serif',
    SIZE: '14px',
    WEIGHT: '500',
  },
  SHADOW: {
    LIGHT: '0 4px 12px rgba(0, 0, 0, 0.15)',
    DARK: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
  ANIMATION: {
    FADE_IN: 'fadeIn 0.3s ease',
    TRANSITION: 'width 0.3s ease',
  },
  TIMING: {
    AUTO_HIDE_DELAY: 3000, // 3 seconds
  },
} as const;

/**
 * CSS keyframes for animations
 */
const KEYFRAMES = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

/**
 * ProgressNotification class manages translation progress UI
 */
export class ProgressNotification {
  private container: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private messageElement: HTMLElement | null = null;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isDarkMode: boolean;
  private currentPhase: 1 | 2 | null = null;

  constructor() {
    this.isDarkMode = this.detectDarkMode();
    logger.log('ProgressNotification initialized', { isDarkMode: this.isDarkMode });
  }

  /**
   * Detect system dark mode preference
   */
  private detectDarkMode(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
  }

  /**
   * Show progress notification with initial state (0%)
   * @param total - Total number of items to process
   */
  show(total: number): void {
    logger.log('ProgressNotification.show() called', { total });

    // Remove existing notification first
    this.remove();

    // Create notification container
    this.container = document.createElement('div');
    this.container.className = 'progress-notification';

    // Apply styles
    this.applyContainerStyles(this.container, false);

    // Create message element
    this.messageElement = this.createMessageElement();

    // Create progress bar
    const progressBarContainer = this.createProgressBarContainer();
    this.progressBar = this.createProgressBar();
    progressBarContainer.appendChild(this.progressBar);

    // Assemble notification
    this.container.appendChild(this.messageElement);
    this.container.appendChild(progressBarContainer);

    // Add to DOM
    document.body.appendChild(this.container);

    logger.log('ProgressNotification shown');
  }

  /**
   * Update progress with current/total
   * @param current - Current progress count
   * @param total - Total count
   */
  update(current: number, total: number): void {
    if (!this.container || !this.progressBar || !this.messageElement) {
      logger.warn('ProgressNotification.update() called but notification not shown');
      return;
    }

    // Calculate percentage (handle division by zero)
    const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

    // Update message
    this.messageElement.textContent = `翻訳中... ${percentage}%`;

    // Update progress bar width
    this.progressBar.style.width = `${percentage}%`;

    logger.log('ProgressNotification updated', { current, total, percentage });
  }

  /**
   * Show completion state and auto-hide after 3 seconds
   */
  complete(): void {
    if (!this.container || !this.progressBar || !this.messageElement) {
      logger.warn('ProgressNotification.complete() called but notification not shown');
      return;
    }

    // Update to 100%
    this.messageElement.textContent = '翻訳完了 100%';
    this.progressBar.style.width = '100%';

    // Auto-hide after configured delay
    this.autoHideTimer = setTimeout(() => {
      this.remove();
    }, STYLES.TIMING.AUTO_HIDE_DELAY);

    logger.log('ProgressNotification completed, will auto-hide in 3s');
  }

  /**
   * Show error state (no auto-hide)
   * @param errorMessage - Error message to display
   */
  error(errorMessage: string): void {
    if (!this.container || !this.messageElement) {
      logger.warn('ProgressNotification.error() called but notification not shown');
      // Create notification if not exists
      this.show(0);
    }

    if (!this.container || !this.messageElement) {
      return;
    }

    // Update message (use textContent for XSS protection)
    this.messageElement.textContent = `エラー: ${errorMessage}`;

    // Change background to red
    this.applyContainerStyles(this.container, true);

    // Cancel any auto-hide timer
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }

    logger.error('ProgressNotification error displayed', { errorMessage });
  }

  /**
   * Remove notification from DOM and cleanup
   */
  remove(): void {
    // Clear auto-hide timer
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }

    // Remove from DOM - use querySelector to ensure we're removing ALL instances
    const notifications = document.querySelectorAll('.progress-notification');
    notifications.forEach(notification => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });

    // Clear references
    this.container = null;
    this.progressBar = null;
    this.messageElement = null;

    logger.log('ProgressNotification removed');
  }

  /**
   * Create message element with styles
   */
  private createMessageElement(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'progress-message';
    element.textContent = '翻訳を開始しています... 0%';
    element.style.marginBottom = '8px';
    element.style.fontSize = STYLES.FONT.SIZE;
    element.style.fontWeight = STYLES.FONT.WEIGHT;
    return element;
  }

  /**
   * Create progress bar container with styles
   */
  private createProgressBarContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'progress-bar-container';
    container.style.width = '100%';
    container.style.height = STYLES.SIZING.PROGRESS_HEIGHT;
    container.style.backgroundColor = this.isDarkMode
      ? STYLES.COLORS.PROGRESS_BG_DARK
      : STYLES.COLORS.PROGRESS_BG_LIGHT;
    container.style.borderRadius = '3px';
    container.style.overflow = 'hidden';
    return container;
  }

  /**
   * Create progress bar element with styles
   */
  private createProgressBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = '0%';
    bar.style.height = '100%';
    bar.style.backgroundColor = STYLES.COLORS.PROGRESS_BAR;
    bar.style.transition = STYLES.ANIMATION.TRANSITION;
    bar.style.borderRadius = '3px';
    return bar;
  }

  /**
   * Apply CSS-in-JS styles to container
   * @param element - Container element
   * @param isError - Whether to apply error styles
   */
  private applyContainerStyles(element: HTMLElement, isError: boolean): void {
    // Position and layout
    element.style.position = 'fixed';
    element.style.bottom = STYLES.POSITION.BOTTOM;
    element.style.right = STYLES.POSITION.RIGHT;
    element.style.zIndex = STYLES.Z_INDEX;
    element.style.padding = STYLES.SIZING.PADDING;
    element.style.borderRadius = STYLES.SIZING.BORDER_RADIUS;
    element.style.minWidth = STYLES.SIZING.MIN_WIDTH;
    element.style.maxWidth = STYLES.SIZING.MAX_WIDTH;

    // Colors and typography
    element.style.color = STYLES.COLORS.TEXT;
    element.style.fontFamily = STYLES.FONT.FAMILY;
    element.style.backgroundColor = isError ? STYLES.COLORS.ERROR_BG : STYLES.COLORS.NORMAL_BG;

    // Shadow and animation
    element.style.boxShadow = this.isDarkMode ? STYLES.SHADOW.DARK : STYLES.SHADOW.LIGHT;
    element.style.animation = STYLES.ANIMATION.FADE_IN;

    // Inject keyframe animation if not exists
    this.injectAnimationStyles();
  }

  /**
   * Inject animation keyframes into document head
   */
  private injectAnimationStyles(): void {
    if (!document.querySelector('#progress-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'progress-notification-styles';
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
    }
  }

  /**
   * Show phase-based progress notification
   *
   * Displays a progress notification with phase-specific messaging.
   * Used for viewport-priority translation to show Phase 1 (viewport)
   * and Phase 2 (full page) progress separately.
   *
   * @param phase - Translation phase (1: Viewport, 2: Full page)
   * @param total - Total number of items to process in this phase
   *
   * @example
   * ```typescript
   * // Phase 1: Viewport translation
   * progressNotification.showPhase(1, 10);
   * progressNotification.updatePhase(1, 5, 10); // 50%
   * progressNotification.completePhase(1);
   *
   * // Phase 2: Full page translation
   * progressNotification.showPhase(2, 20);
   * progressNotification.updatePhase(2, 10, 20); // 50%
   * progressNotification.completePhase(2);
   * ```
   */
  showPhase(phase: 1 | 2, total: number): void {
    this.currentPhase = phase;

    // Remove existing notification first
    this.remove();

    // Create notification container
    this.container = document.createElement('div');
    this.container.className = 'progress-notification';

    // Apply styles
    this.applyContainerStyles(this.container, false);

    // Create message element with phase-specific message
    this.messageElement = this.createMessageElement();
    const phaseMessage = phase === 1
      ? 'ビューポート内を翻訳中... 0%'
      : 'ページ全体を翻訳中... 0%';
    this.messageElement.textContent = phaseMessage;

    // Create progress bar
    const progressBarContainer = this.createProgressBarContainer();
    this.progressBar = this.createProgressBar();
    progressBarContainer.appendChild(this.progressBar);

    // Assemble notification
    this.container.appendChild(this.messageElement);
    this.container.appendChild(progressBarContainer);

    // Add to DOM
    document.body.appendChild(this.container);

    logger.log(`ProgressNotification.showPhase(${phase}, ${total}) called`);
  }

  /**
   * Update phase-based progress
   *
   * Updates the progress notification with current progress for the specified phase.
   * Displays phase-specific messaging and updates progress bar.
   *
   * @param phase - Translation phase (1: Viewport, 2: Full page)
   * @param current - Current progress count
   * @param total - Total count for this phase
   *
   * @example
   * ```typescript
   * progressNotification.updatePhase(1, 5, 10); // Phase 1: 50%
   * progressNotification.updatePhase(2, 15, 20); // Phase 2: 75%
   * ```
   */
  updatePhase(phase: 1 | 2, current: number, total: number): void {
    if (!this.container || !this.progressBar || !this.messageElement) {
      logger.warn('ProgressNotification.updatePhase() called but notification not shown');
      return;
    }

    this.currentPhase = phase;

    // Calculate percentage (handle division by zero)
    const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

    // Phase-specific message
    const phaseMessage = phase === 1
      ? `ビューポート内を翻訳中... ${percentage}%`
      : `ページ全体を翻訳中... ${percentage}%`;

    // Update message
    this.messageElement.textContent = phaseMessage;

    // Update progress bar width
    this.progressBar.style.width = `${percentage}%`;

    logger.log(`ProgressNotification.updatePhase(${phase}, ${current}, ${total}) - ${percentage}%`);
  }

  /**
   * Complete current phase
   *
   * Shows phase completion message. Unlike complete(), this does NOT
   * auto-hide the notification, allowing smooth transition to the next phase.
   *
   * @param phase - Translation phase being completed
   *
   * @example
   * ```typescript
   * progressNotification.completePhase(1); // "ビューポート内の翻訳完了"
   * progressNotification.completePhase(2); // "ページ全体の翻訳完了"
   * ```
   */
  completePhase(phase: 1 | 2): void {
    if (!this.container || !this.messageElement) {
      logger.warn('ProgressNotification.completePhase() called but notification not shown');
      return;
    }

    // Phase-specific completion message
    const phaseMessage = phase === 1
      ? 'ビューポート内の翻訳完了'
      : 'ページ全体の翻訳完了';

    // Update message
    this.messageElement.textContent = phaseMessage;

    logger.log(`ProgressNotification.completePhase(${phase})`);
  }
}
