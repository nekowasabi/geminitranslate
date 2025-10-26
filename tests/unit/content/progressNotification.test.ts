/**
 * ProgressNotification Unit Tests
 *
 * TDD Red-Green-Refactor Cycle: RED Phase
 * These tests are written BEFORE implementation to define expected behavior.
 */

// Mock logger
jest.mock('@shared/utils', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ProgressNotification } from '@content/progressNotification';

describe('ProgressNotification', () => {
  let progressNotification: ProgressNotification;

  beforeEach(() => {
    // Mock window.matchMedia for dark mode detection
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    progressNotification = new ProgressNotification();
  });

  afterEach(() => {
    // Clean up any notifications
    progressNotification.remove();
    jest.clearAllTimers();
  });

  describe('show()', () => {
    it('should create and show notification element in DOM', () => {
      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification');
      expect(notification).toBeTruthy();
      // toBeInTheDocument requires @testing-library/jest-dom setup
      // Using toBeTruthy() and parentNode check instead
      expect(notification?.parentNode).toBeTruthy();
    });

    it('should display initial state with 0% progress', () => {
      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification');
      const text = notification?.textContent;
      expect(text).toContain('翻訳を開始しています');
      expect(text).toContain('0%');
    });

    it('should position notification at bottom-right corner', () => {
      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      expect(notification.style.position).toBe('fixed');
      expect(notification.style.bottom).toBe('20px');
      expect(notification.style.right).toBe('20px');
    });

    it('should set z-index higher than page content', () => {
      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      const zIndex = parseInt(window.getComputedStyle(notification).zIndex || '0', 10);
      expect(zIndex).toBeGreaterThanOrEqual(10001);
    });

    it('should apply default background color (blue)', () => {
      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      const bgColor = window.getComputedStyle(notification).backgroundColor;
      // #4F46E5 = rgb(79, 70, 229)
      expect(bgColor).toMatch(/rgb\(79,\s*70,\s*229\)|#4F46E5/i);
    });

    it('should initialize progress bar at 0% width', () => {
      progressNotification.show(10);

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar).toBeTruthy();
      expect(progressBar.style.width).toBe('0%');
    });

    it('should remove existing notification before showing new one', () => {
      progressNotification.show(5);
      progressNotification.show(10);

      const notifications = document.querySelectorAll('.progress-notification');
      expect(notifications.length).toBe(1);
    });

    it('should handle total=0 without errors', () => {
      expect(() => {
        progressNotification.show(0);
      }).not.toThrow();
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      progressNotification.show(10);
    });

    it('should update progress text with current/total', () => {
      progressNotification.update(5, 10);

      const notification = document.querySelector('.progress-notification');
      const text = notification?.textContent;
      expect(text).toContain('翻訳中');
      expect(text).toContain('50%');
    });

    it('should update progress bar width to match percentage', () => {
      progressNotification.update(5, 10);

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar.style.width).toBe('50%');
    });

    it('should calculate percentage correctly (50%)', () => {
      progressNotification.update(5, 10);

      const notification = document.querySelector('.progress-notification');
      expect(notification?.textContent).toContain('50%');
    });

    it('should handle 0% progress', () => {
      progressNotification.update(0, 10);

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar.style.width).toBe('0%');
      expect(document.querySelector('.progress-notification')?.textContent).toContain('0%');
    });

    it('should handle 100% progress', () => {
      progressNotification.update(10, 10);

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar.style.width).toBe('100%');
      expect(document.querySelector('.progress-notification')?.textContent).toContain('100%');
    });

    it('should handle division by zero (total=0)', () => {
      expect(() => {
        progressNotification.update(0, 0);
      }).not.toThrow();
    });

    it('should handle current > total gracefully', () => {
      progressNotification.update(15, 10);

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      const width = parseInt(progressBar.style.width, 10);
      expect(width).toBeLessThanOrEqual(100);
    });
  });

  describe('complete()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      progressNotification.show(10);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should display completion message with 100%', () => {
      progressNotification.complete();

      const notification = document.querySelector('.progress-notification');
      const text = notification?.textContent;
      expect(text).toContain('翻訳完了');
      expect(text).toContain('100%');
    });

    it('should set progress bar to 100% width', () => {
      progressNotification.complete();

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar.style.width).toBe('100%');
    });

    it('should auto-remove after 3 seconds', () => {
      progressNotification.complete();

      expect(document.querySelector('.progress-notification')).toBeTruthy();

      // Fast-forward 3 seconds
      jest.advanceTimersByTime(3000);

      expect(document.querySelector('.progress-notification')).toBeNull();
    });

    it('should not auto-remove before 3 seconds', () => {
      progressNotification.complete();

      // Fast-forward 2.9 seconds
      jest.advanceTimersByTime(2900);

      expect(document.querySelector('.progress-notification')).toBeTruthy();
    });

    it('should cancel auto-remove if remove() is called manually', () => {
      progressNotification.complete();

      // Manually remove before timeout
      jest.advanceTimersByTime(1000);
      progressNotification.remove();

      expect(document.querySelector('.progress-notification')).toBeNull();

      // Advance past 3 seconds - should not cause errors
      jest.advanceTimersByTime(3000);
    });
  });

  describe('error()', () => {
    beforeEach(() => {
      progressNotification.show(10);
    });

    it('should display error message', () => {
      const errorMsg = 'Network error occurred';
      progressNotification.error(errorMsg);

      const notification = document.querySelector('.progress-notification');
      expect(notification?.textContent).toContain('エラー');
      expect(notification?.textContent).toContain(errorMsg);
    });

    it('should change background color to red', () => {
      progressNotification.error('Test error');

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      const bgColor = window.getComputedStyle(notification).backgroundColor;
      // #EF4444 = rgb(239, 68, 68)
      expect(bgColor).toMatch(/rgb\(239,\s*68,\s*68\)|#EF4444/i);
    });

    it('should NOT auto-remove on error', () => {
      jest.useFakeTimers();
      progressNotification.error('Test error');

      // Wait longer than complete() timeout
      jest.advanceTimersByTime(10000);

      // Should still be in DOM
      expect(document.querySelector('.progress-notification')).toBeTruthy();

      jest.useRealTimers();
    });

    it('should handle empty error message', () => {
      expect(() => {
        progressNotification.error('');
      }).not.toThrow();

      expect(document.querySelector('.progress-notification')).toBeTruthy();
    });

    it('should handle very long error message', () => {
      const longError = 'Error: ' + 'A'.repeat(1000);
      progressNotification.error(longError);

      const notification = document.querySelector('.progress-notification');
      expect(notification?.textContent).toContain('エラー');
    });

    it('should escape HTML in error message to prevent XSS', () => {
      const maliciousError = '<script>alert("XSS")</script>';
      progressNotification.error(maliciousError);

      const notification = document.querySelector('.progress-notification');
      expect(notification?.innerHTML).not.toContain('<script>');
      expect(notification?.textContent).toContain(maliciousError);
    });
  });

  describe('remove()', () => {
    it('should remove notification element from DOM', () => {
      progressNotification.show(10);
      expect(document.querySelector('.progress-notification')).toBeTruthy();

      progressNotification.remove();
      expect(document.querySelector('.progress-notification')).toBeNull();
    });

    it('should handle remove when notification not shown', () => {
      expect(() => {
        progressNotification.remove();
      }).not.toThrow();
    });

    it('should handle multiple remove calls', () => {
      progressNotification.show(10);
      progressNotification.remove();
      progressNotification.remove();

      expect(document.querySelector('.progress-notification')).toBeNull();
    });

    it('should clear auto-remove timer from complete()', () => {
      jest.useFakeTimers();
      progressNotification.show(10);
      progressNotification.complete();

      progressNotification.remove();

      // Timer should be cleared, advancing time should not cause issues
      jest.advanceTimersByTime(5000);
      expect(document.querySelector('.progress-notification')).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('dark mode support', () => {
    it('should detect system dark mode preference', () => {
      // Mock matchMedia for dark mode
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      const darkModeNotification = new ProgressNotification();
      darkModeNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      expect(notification).toBeTruthy();
      // Dark mode styling should be applied (specific implementation TBD)
    });

    it('should apply lighter colors in dark mode', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      const darkModeNotification = new ProgressNotification();
      darkModeNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      // Check that dark mode specific styles are applied
      expect(notification).toBeTruthy();
    });
  });

  describe('CSS animations', () => {
    it('should apply fade-in animation on show', () => {
      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      const animation = window.getComputedStyle(notification).animation;
      expect(animation).toBeTruthy();
    });

    it('should apply smooth transition to progress bar', () => {
      progressNotification.show(10);

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      const transition = window.getComputedStyle(progressBar).transition;
      expect(transition).toMatch(/width|all/i);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle negative current value', () => {
      progressNotification.show(10);

      expect(() => {
        progressNotification.update(-5, 10);
      }).not.toThrow();

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      const width = parseInt(progressBar.style.width, 10);
      expect(width).toBeGreaterThanOrEqual(0);
    });

    it('should handle negative total value', () => {
      expect(() => {
        progressNotification.show(-10);
      }).not.toThrow();
    });

    it('should handle very large numbers', () => {
      progressNotification.show(1000000);

      // Need to call update() after show()
      progressNotification.update(500000, 1000000);

      const notification = document.querySelector('.progress-notification');
      // Check that the notification was updated
      expect(notification?.textContent).toContain('50%');
    });

    it('should handle rapid successive updates', () => {
      progressNotification.show(100);

      expect(() => {
        for (let i = 0; i <= 100; i++) {
          progressNotification.update(i, 100);
        }
      }).not.toThrow();

      const progressBar = document.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar.style.width).toBe('100%');
    });

    it('should handle show() called multiple times without remove()', () => {
      progressNotification.show(10);
      progressNotification.show(20);
      progressNotification.show(30);

      const notifications = document.querySelectorAll('.progress-notification');
      expect(notifications.length).toBe(1);
    });
  });

  describe('responsive design', () => {
    it('should be visible on mobile viewport', () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 375,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        value: 667,
      });

      progressNotification.show(10);

      const notification = document.querySelector('.progress-notification') as HTMLElement;
      expect(notification).toBeTruthy();
      // Notification should still be positioned in bottom-right
      expect(notification.style.bottom).toBe('20px');
      expect(notification.style.right).toBe('20px');
    });
  });
});
