/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectionResult } from '@popup/components/SelectionResult';
import type { SelectionData } from '@popup/hooks/useSelectionTranslation';

// Mock useSelectionTranslation hook
const mockClear = jest.fn();
const mockUseSelectionTranslation = jest.fn();

jest.mock('@popup/hooks/useSelectionTranslation', () => ({
  useSelectionTranslation: () => mockUseSelectionTranslation(),
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

describe('SelectionResult Component', () => {
  beforeEach(() => {
    mockClear.mockClear();
    mockUseSelectionTranslation.mockClear();
    (navigator.clipboard.writeText as jest.Mock).mockClear();
  });

  describe('Rendering Logic', () => {
    it('should not render when data is null', () => {
      mockUseSelectionTranslation.mockReturnValue({
        data: null,
        clear: mockClear,
      });

      const { container } = render(<SelectionResult />);
      expect(container.firstChild).toBeNull();
    });

    it('should render when data is provided', () => {
      const mockData: SelectionData = {
        originalText: 'Hello',
        translatedText: 'こんにちは',
        targetLanguage: 'Japanese',
        timestamp: Date.now(),
      };

      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });

      render(<SelectionResult />);
      expect(screen.getByText(/selected text/i)).toBeInTheDocument();
    });
  });

  describe('Display Content', () => {
    const mockData: SelectionData = {
      originalText: 'Hello World',
      translatedText: 'こんにちは世界',
      targetLanguage: 'Japanese',
      timestamp: Date.now(),
    };

    beforeEach(() => {
      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });
    });

    it('should display original text', () => {
      render(<SelectionResult />);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should display translated text', () => {
      render(<SelectionResult />);
      expect(screen.getByText('こんにちは世界')).toBeInTheDocument();
    });

    it('should display target language', () => {
      render(<SelectionResult />);
      expect(screen.getByText(/japanese/i)).toBeInTheDocument();
    });

    it('should have section labels', () => {
      render(<SelectionResult />);
      expect(screen.getByText('Selected Text')).toBeInTheDocument();
      expect(screen.getByText('Translation')).toBeInTheDocument();
    });
  });

  describe('Copy Button', () => {
    const mockData: SelectionData = {
      originalText: 'Hello',
      translatedText: 'こんにちは',
      targetLanguage: 'Japanese',
      timestamp: Date.now(),
    };

    beforeEach(() => {
      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });
    });

    it('should render copy button', () => {
      render(<SelectionResult />);
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    });

    it('should call navigator.clipboard.writeText when copy button is clicked', async () => {
      render(<SelectionResult />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('こんにちは');
      });
    });

    it('should show success feedback after copying', async () => {
      render(<SelectionResult />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });
    });

    it('should revert button text after 2 seconds', async () => {
      jest.useFakeTimers();

      render(<SelectionResult />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });

      // Fast-forward 2 seconds
      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('Clear Button', () => {
    const mockData: SelectionData = {
      originalText: 'Hello',
      translatedText: 'こんにちは',
      targetLanguage: 'Japanese',
      timestamp: Date.now(),
    };

    beforeEach(() => {
      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });
    });

    it('should render clear button', () => {
      render(<SelectionResult />);
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });

    it('should call clear function when clear button is clicked', () => {
      render(<SelectionResult />);

      const clearButton = screen.getByRole('button', { name: /clear/i });
      fireEvent.click(clearButton);

      expect(mockClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    const mockData: SelectionData = {
      originalText: 'Hello',
      translatedText: 'こんにちは',
      targetLanguage: 'Japanese',
      timestamp: Date.now(),
    };

    beforeEach(() => {
      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });
    });

    it('should have proper ARIA roles', () => {
      const { container } = render(<SelectionResult />);
      expect(container.querySelector('[role="region"]')).toBeInTheDocument();
    });

    it('should have aria-label for the section', () => {
      const { container } = render(<SelectionResult />);
      const region = container.querySelector('[role="region"]');
      expect(region).toHaveAttribute('aria-label', 'Selection translation result');
    });

    it('should have accessible button labels', () => {
      render(<SelectionResult />);
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    const mockData: SelectionData = {
      originalText: 'Hello',
      translatedText: 'こんにちは',
      targetLanguage: 'Japanese',
      timestamp: Date.now(),
    };

    beforeEach(() => {
      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });
    });

    it('should have selection-result-container class', () => {
      const { container } = render(<SelectionResult />);
      expect(container.querySelector('.selection-result-container')).toBeInTheDocument();
    });

    it('should have proper text display classes', () => {
      const { container } = render(<SelectionResult />);
      expect(container.querySelector('.original-text')).toBeInTheDocument();
      expect(container.querySelector('.translated-text')).toBeInTheDocument();
    });

    it('should have action buttons container', () => {
      const { container } = render(<SelectionResult />);
      expect(container.querySelector('.selection-actions')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings gracefully', () => {
      const mockData: SelectionData = {
        originalText: '',
        translatedText: '',
        targetLanguage: 'Japanese',
        timestamp: Date.now(),
      };

      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });

      render(<SelectionResult />);
      // Should still render the component
      expect(screen.getByText(/selected text/i)).toBeInTheDocument();
    });

    it('should handle long text with scrolling', () => {
      const longText = 'A'.repeat(1000);
      const mockData: SelectionData = {
        originalText: longText,
        translatedText: longText,
        targetLanguage: 'Japanese',
        timestamp: Date.now(),
      };

      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });

      const { container } = render(<SelectionResult />);
      // Text containers should have overflow styling
      const textElements = container.querySelectorAll('.original-text, .translated-text');
      expect(textElements.length).toBeGreaterThan(0);
    });

    it('should handle clipboard write failure gracefully', async () => {
      (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(
        new Error('Clipboard access denied')
      );

      const mockData: SelectionData = {
        originalText: 'Hello',
        translatedText: 'こんにちは',
        targetLanguage: 'Japanese',
        timestamp: Date.now(),
      };

      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });

      render(<SelectionResult />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      // Should not crash, button should remain clickable
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      });
    });
  });

  describe('XSS Protection', () => {
    it('should use textContent to prevent XSS attacks', () => {
      const xssPayload = '<script>alert("xss")</script>';
      const mockData: SelectionData = {
        originalText: xssPayload,
        translatedText: xssPayload,
        targetLanguage: 'Japanese',
        timestamp: Date.now(),
      };

      mockUseSelectionTranslation.mockReturnValue({
        data: mockData,
        clear: mockClear,
      });

      const { container } = render(<SelectionResult />);

      // Script tag should be rendered as text, not executed
      const textElements = container.querySelectorAll('.original-text, .translated-text');
      let foundXSS = false;
      textElements.forEach((el) => {
        if (el.textContent === xssPayload) {
          foundXSS = true;
        }
      });
      expect(foundXSS).toBe(true);
      expect(container.querySelector('script')).toBeNull();
    });
  });
});
