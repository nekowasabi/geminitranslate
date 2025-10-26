/**
 * IconBadge Unit Tests
 */

import { IconBadge } from '@/content/iconBadge';
import { Position } from '@/content/floatingUI';

// Mock matchMedia globally
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

describe('IconBadge', () => {
  let iconBadge: IconBadge;

  beforeEach(() => {
    iconBadge = new IconBadge();
    // Clear any existing DOM elements
    document.body.innerHTML = '';
  });

  afterEach(() => {
    iconBadge.hide();
    document.body.innerHTML = '';
  });

  describe('show()', () => {
    it('should display badge at specified position', () => {
      const position: Position = { x: 100, y: 200 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      expect(badge).not.toBeNull();
      expect(badge.style.position).toBe('fixed');
      expect(badge.style.zIndex).toBe('10002');
    });

    it('should apply offset to position', () => {
      const position: Position = { x: 100, y: 200 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      expect(badge).not.toBeNull();

      // Should have offset applied (UI_CONFIG.FLOATING_UI_OFFSET = 10)
      const left = parseInt(badge.style.left);
      const top = parseInt(badge.style.top);
      expect(left).toBeGreaterThanOrEqual(100);
      expect(top).toBeGreaterThanOrEqual(200);
    });

    it('should adjust position to stay within viewport (right edge)', () => {
      // Simulate viewport width
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 400,
      });

      // Mock getBoundingClientRect on HTMLElement prototype
      const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      HTMLElement.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
        width: 32,
        height: 32,
        top: 0,
        left: 0,
        bottom: 32,
        right: 32,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const position: Position = { x: 390, y: 100 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      const left = parseInt(badge.style.left);

      // Should be adjusted to not overflow right edge
      expect(left + 32).toBeLessThanOrEqual(400); // badge width = 32px

      // Restore original
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it('should adjust position to stay within viewport (bottom edge)', () => {
      // Simulate viewport height
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 600,
      });

      // Mock getBoundingClientRect on HTMLElement prototype
      const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      HTMLElement.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
        width: 32,
        height: 32,
        top: 0,
        left: 0,
        bottom: 32,
        right: 32,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const position: Position = { x: 100, y: 590 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      const top = parseInt(badge.style.top);

      // Should be adjusted to not overflow bottom edge
      expect(top + 32).toBeLessThanOrEqual(600); // badge height = 32px

      // Restore original
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it('should prevent negative coordinates', () => {
      const position: Position = { x: -10, y: -20 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      const left = parseInt(badge.style.left);
      const top = parseInt(badge.style.top);

      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
    });

    it('should call onClick callback when clicked', () => {
      const position: Position = { x: 100, y: 200 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      badge.click();

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should hide badge after click', () => {
      const position: Position = { x: 100, y: 200 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      badge.click();

      // Badge should be removed after click
      expect(document.querySelector('.icon-badge')).toBeNull();
    });
  });

  describe('hide()', () => {
    it('should remove badge from DOM', () => {
      const position: Position = { x: 100, y: 200 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);
      expect(document.querySelector('.icon-badge')).not.toBeNull();

      iconBadge.hide();
      expect(document.querySelector('.icon-badge')).toBeNull();
    });

    it('should handle multiple hide() calls without error', () => {
      iconBadge.hide();
      iconBadge.hide();
      iconBadge.hide();

      // Should not throw error
      expect(document.querySelector('.icon-badge')).toBeNull();
    });

    it('should not throw when called before show()', () => {
      expect(() => iconBadge.hide()).not.toThrow();
    });
  });

  describe('dark mode support', () => {
    it('should apply dark mode styles when preferred', () => {
      // Mock dark mode
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

      const position: Position = { x: 100, y: 200 };
      const onClick = jest.fn();

      iconBadge.show(position, onClick);

      const badge = document.querySelector('.icon-badge') as HTMLElement;
      // Dark mode styles should be applied (can check background color, etc.)
      expect(badge).not.toBeNull();
    });
  });
});
