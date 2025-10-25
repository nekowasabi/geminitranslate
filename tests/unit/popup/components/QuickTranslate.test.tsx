/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuickTranslate } from '@popup/components/QuickTranslate';

// Mock useTranslation hook
const mockTranslate = jest.fn();
const mockReset = jest.fn();
let mockUseTranslation = jest.fn(() => ({
  translate: mockTranslate,
  reset: mockReset,
  status: 'idle',
  error: null,
  progress: 0,
}));

jest.mock('@popup/hooks/useTranslation', () => ({
  useTranslation: () => mockUseTranslation(),
}));

describe('QuickTranslate Component', () => {
  beforeEach(() => {
    mockTranslate.mockClear();
    mockReset.mockClear();
  });

  describe('Rendering', () => {
    it('should render translate button', () => {
      render(<QuickTranslate />);
      const translateButton = screen.getByRole('button', { name: /translate page/i });
      expect(translateButton).toBeInTheDocument();
    });

    it('should render reset button', () => {
      render(<QuickTranslate />);
      const resetButton = screen.getByRole('button', { name: /reset to original/i });
      expect(resetButton).toBeInTheDocument();
    });
  });

  describe('Translate Button Interaction', () => {
    it('should call translate() when translate button is clicked', async () => {
      render(<QuickTranslate />);
      const translateButton = screen.getByRole('button', { name: /translate page/i });

      fireEvent.click(translateButton);

      await waitFor(() => {
        expect(mockTranslate).toHaveBeenCalledTimes(1);
      });
    });

    it('should be disabled when status is "translating"', () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'translating',
        error: null,
        progress: 50,
      }));

      render(<QuickTranslate />);
      const translateButton = screen.getByRole('button', { name: /translating/i });

      expect(translateButton).toBeDisabled();
    });

    it('should be enabled when status is "idle"', () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'idle',
        error: null,
        progress: 0,
      }));

      render(<QuickTranslate />);
      const translateButton = screen.getByRole('button', { name: /translate page/i });

      expect(translateButton).not.toBeDisabled();
    });
  });

  describe('Reset Button Interaction', () => {
    it('should call reset() when reset button is clicked', async () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'success',
        error: null,
        progress: 100,
      }));

      render(<QuickTranslate />);
      const resetButton = screen.getByRole('button', { name: /reset to original/i });

      fireEvent.click(resetButton);

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledTimes(1);
      });
    });

    it('should be enabled when translation is successful', () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'success',
        error: null,
        progress: 100,
      }));

      render(<QuickTranslate />);
      const resetButton = screen.getByRole('button', { name: /reset to original/i });

      expect(resetButton).not.toBeDisabled();
    });

    it('should be disabled when status is "idle"', () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'idle',
        error: null,
        progress: 0,
      }));

      render(<QuickTranslate />);
      const resetButton = screen.getByRole('button', { name: /reset to original/i });

      expect(resetButton).toBeDisabled();
    });
  });

  describe('Button States', () => {
    it('should show loading state during translation', () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'translating',
        error: null,
        progress: 50,
      }));

      render(<QuickTranslate />);

      expect(screen.getByText(/translating/i)).toBeInTheDocument();
    });

    it('should show success state after translation', () => {
      mockUseTranslation = jest.fn(() => ({
        translate: mockTranslate,
        reset: mockReset,
        status: 'success',
        error: null,
        progress: 100,
      }));

      render(<QuickTranslate />);
      const translateButton = screen.getByRole('button', { name: /translate page/i });

      expect(translateButton).not.toBeDisabled();
    });
  });
});
