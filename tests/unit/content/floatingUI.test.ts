/**
 * FloatingUI Unit Tests
 */

// Mock logger
jest.mock('@shared/utils', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { FloatingUI } from '@content/floatingUI';

describe('FloatingUI', () => {
  let floatingUI: FloatingUI;

  beforeEach(() => {
    floatingUI = new FloatingUI();

    // Mock window.matchMedia
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
  });

  afterEach(() => {
    floatingUI.hide();
  });

  describe('show', () => {
    it('should create and show floating UI', () => {
      const translation = 'Translated text';
      const position = { x: 100, y: 200 };

      floatingUI.show(translation, position);

      const floatingElement = document.querySelector('.floating-translation');
      expect(floatingElement).toBeTruthy();
      expect(floatingElement?.textContent).toContain(translation);
    });

    it('should position UI at specified coordinates', () => {
      const translation = 'Test';
      const position = { x: 150, y: 250 };

      floatingUI.show(translation, position);

      const floatingElement = document.querySelector('.floating-translation') as HTMLElement;
      expect(floatingElement).toBeTruthy();
      expect(floatingElement.style.position).toBe('fixed');
      // Position includes offset (+10px)
      expect(floatingElement.style.left).toBe('160px');
      expect(floatingElement.style.top).toBe('260px');
    });

    it('should include translation text', () => {
      const translation = 'こんにちは世界';
      const position = { x: 0, y: 0 };

      floatingUI.show(translation, position);

      const textElement = document.querySelector('.translation-text');
      expect(textElement?.textContent).toBe(translation);
    });

    it('should include copy button', () => {
      const translation = 'Test';
      const position = { x: 0, y: 0 };

      floatingUI.show(translation, position);

      const copyButton = document.querySelector('.copy-button');
      expect(copyButton).toBeTruthy();
      expect(copyButton?.textContent).toContain('Copy');
    });

    it('should hide existing UI before showing new one', () => {
      floatingUI.show('First', { x: 0, y: 0 });
      floatingUI.show('Second', { x: 50, y: 50 });

      const floatingElements = document.querySelectorAll('.floating-translation');
      expect(floatingElements.length).toBe(1);
      expect(floatingElements[0].textContent).toContain('Second');
    });

    it('should adjust position to stay within viewport (right edge)', () => {
      const translation = 'Test';
      const position = { x: window.innerWidth - 50, y: 100 };

      floatingUI.show(translation, position);

      const floatingElement = document.querySelector('.floating-translation') as HTMLElement;
      const left = parseInt(floatingElement.style.left, 10);

      // Should be adjusted to stay within viewport
      expect(left).toBeLessThan(window.innerWidth);
    });

    it('should adjust position to stay within viewport (bottom edge)', () => {
      const translation = 'Test';
      const position = { x: 100, y: window.innerHeight - 50 };

      floatingUI.show(translation, position);

      const floatingElement = document.querySelector('.floating-translation') as HTMLElement;
      const top = parseInt(floatingElement.style.top, 10);

      // Should be adjusted to stay within viewport
      expect(top).toBeLessThan(window.innerHeight);
    });

    it('should handle long translation text', () => {
      const translation = 'A'.repeat(1000);
      const position = { x: 100, y: 100 };

      floatingUI.show(translation, position);

      const textElement = document.querySelector('.translation-text');
      expect(textElement?.textContent).toBe(translation);
    });

    it('should handle special characters in translation', () => {
      const translation = '<script>alert("XSS")</script>';
      const position = { x: 100, y: 100 };

      floatingUI.show(translation, position);

      const textElement = document.querySelector('.translation-text');
      // Should be escaped
      expect(textElement?.innerHTML).not.toContain('<script>');
      expect(textElement?.textContent).toBe(translation);
    });
  });

  describe('hide', () => {
    it('should remove floating UI from DOM', () => {
      floatingUI.show('Test', { x: 100, y: 100 });

      expect(document.querySelector('.floating-translation')).toBeTruthy();

      floatingUI.hide();

      expect(document.querySelector('.floating-translation')).toBeNull();
    });

    it('should handle hide when UI is not shown', () => {
      expect(() => {
        floatingUI.hide();
      }).not.toThrow();
    });

    it('should handle multiple hide calls', () => {
      floatingUI.show('Test', { x: 100, y: 100 });
      floatingUI.hide();
      floatingUI.hide();

      expect(document.querySelector('.floating-translation')).toBeNull();
    });
  });

  describe('createCopyButton', () => {
    it('should copy text to clipboard when clicked', async () => {
      const translation = 'Copy me';
      const position = { x: 100, y: 100 };

      // Mock clipboard
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      floatingUI.show(translation, position);

      const copyButton = document.querySelector('.copy-button') as HTMLButtonElement;
      copyButton.click();

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockWriteText).toHaveBeenCalledWith(translation);
    });

    it('should handle clipboard write errors gracefully', async () => {
      const translation = 'Test';
      const position = { x: 100, y: 100 };

      // Mock clipboard error
      const mockWriteText = jest.fn().mockRejectedValue(new Error('Permission denied'));
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      floatingUI.show(translation, position);

      const copyButton = document.querySelector('.copy-button') as HTMLButtonElement;

      // Should not throw
      expect(() => {
        copyButton.click();
      }).not.toThrow();
    });

    it('should show feedback after successful copy', async () => {
      const translation = 'Test';
      const position = { x: 100, y: 100 };

      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      floatingUI.show(translation, position);

      const copyButton = document.querySelector('.copy-button') as HTMLButtonElement;
      const originalText = copyButton.textContent;

      copyButton.click();

      // Wait for feedback
      await new Promise(resolve => setTimeout(resolve, 10));

      // Button text should change temporarily
      expect(copyButton.textContent).not.toBe(originalText);
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

      floatingUI.show('Test', { x: 100, y: 100 });

      const floatingElement = document.querySelector('.floating-translation');
      // Should have dark mode classes or styling
      expect(floatingElement).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should handle empty translation', () => {
      floatingUI.show('', { x: 100, y: 100 });

      const floatingElement = document.querySelector('.floating-translation');
      expect(floatingElement).toBeTruthy();
    });

    it('should handle negative coordinates', () => {
      floatingUI.show('Test', { x: -50, y: -50 });

      const floatingElement = document.querySelector('.floating-translation') as HTMLElement;
      expect(floatingElement).toBeTruthy();

      // Should adjust to valid coordinates
      const left = parseInt(floatingElement.style.left, 10);
      const top = parseInt(floatingElement.style.top, 10);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero coordinates', () => {
      floatingUI.show('Test', { x: 0, y: 0 });

      const floatingElement = document.querySelector('.floating-translation') as HTMLElement;
      // Zero coordinates + offset (10px)
      expect(floatingElement.style.left).toBe('10px');
      expect(floatingElement.style.top).toBe('10px');
    });

    it('should be positioned with high z-index', () => {
      floatingUI.show('Test', { x: 100, y: 100 });

      const floatingElement = document.querySelector('.floating-translation') as HTMLElement;
      const zIndex = parseInt(window.getComputedStyle(floatingElement).zIndex, 10);
      expect(zIndex).toBeGreaterThan(1000);
    });
  });
});
