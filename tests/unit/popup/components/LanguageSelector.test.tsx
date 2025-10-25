/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LanguageSelector } from '@popup/components/LanguageSelector';
import { SUPPORTED_LANGUAGES } from '@shared/constants/languages';

// Mock StorageManager
const mockGetTargetLanguage = jest.fn();
const mockSetTargetLanguage = jest.fn();

jest.mock('@shared/storage/StorageManager', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getTargetLanguage: mockGetTargetLanguage,
    setTargetLanguage: mockSetTargetLanguage,
  })),
}));

describe('LanguageSelector Component', () => {
  beforeEach(() => {
    mockGetTargetLanguage.mockClear();
    mockSetTargetLanguage.mockClear();
    mockGetTargetLanguage.mockResolvedValue('en');
  });

  describe('Rendering', () => {
    it('should render language selector dropdown', async () => {
      render(<LanguageSelector />);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });
    });

    it('should render all supported languages as options', async () => {
      render(<LanguageSelector />);

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBe(SUPPORTED_LANGUAGES.length);
      });
    });

    it('should display language in native name', async () => {
      render(<LanguageSelector />);

      await waitFor(() => {
        // Check for Japanese native name (exact match)
        expect(screen.getByRole('option', { name: '日本語' })).toBeInTheDocument();
        // Check for English name
        expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
      });
    });
  });

  describe('Initial Value', () => {
    it('should load saved language from storage on mount', async () => {
      mockGetTargetLanguage.mockResolvedValue('ja');

      render(<LanguageSelector />);

      await waitFor(() => {
        expect(mockGetTargetLanguage).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('ja');
      });
    });

    it('should default to English if no saved language', async () => {
      mockGetTargetLanguage.mockResolvedValue('en');

      render(<LanguageSelector />);

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('en');
      });
    });
  });

  describe('Language Selection', () => {
    it('should save selected language to storage', async () => {
      mockGetTargetLanguage.mockResolvedValue('en');

      render(<LanguageSelector />);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'ja' } });

      await waitFor(() => {
        expect(mockSetTargetLanguage).toHaveBeenCalledWith('ja');
      });
    });

    it('should update UI when language is changed', async () => {
      mockGetTargetLanguage.mockResolvedValue('en');

      render(<LanguageSelector />);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'fr' } });

      await waitFor(() => {
        expect(select.value).toBe('fr');
      });
    });
  });

  describe('Label', () => {
    it('should render label for language selector', async () => {
      render(<LanguageSelector />);

      await waitFor(() => {
        expect(screen.getByText(/target language/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label', async () => {
      render(<LanguageSelector />);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toHaveAttribute('aria-label', expect.stringContaining('language'));
      });
    });

    it('should associate label with select element', async () => {
      render(<LanguageSelector />);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        const label = screen.getByText(/target language/i);
        expect(label).toHaveAttribute('for');
        expect(select).toHaveAttribute('id');
      });
    });
  });
});
