/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '@popup/App';

// Mock components
jest.mock('@popup/components/QuickTranslate', () => ({
  QuickTranslate: () => <div data-testid="quick-translate">QuickTranslate</div>,
}));

jest.mock('@popup/components/LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector">LanguageSelector</div>,
}));

jest.mock('@popup/components/StatusIndicator', () => ({
  StatusIndicator: () => <div data-testid="status-indicator">StatusIndicator</div>,
}));

jest.mock('@popup/components/ApiKeyWarning', () => ({
  ApiKeyWarning: ({ hasApiKey }: any) => (
    <div data-testid="api-key-warning">
      {hasApiKey ? 'Has API Key' : 'No API Key'}
    </div>
  ),
}));

jest.mock('@popup/components/SelectionResult', () => ({
  SelectionResult: () => <div data-testid="selection-result">SelectionResult</div>,
}));

// Mock hooks
jest.mock('@popup/hooks/useTranslation', () => ({
  useTranslation: () => ({
    status: 'idle',
    error: null,
    progress: null,
  }),
}));

// Mock StorageManager
const mockGetApiKey = jest.fn();
jest.mock('@shared/storage/StorageManager', () => {
  return jest.fn().mockImplementation(() => ({
    getApiKey: mockGetApiKey,
  }));
});

// Mock chrome.runtime
const mockOpenOptionsPage = jest.fn();
const mockGetManifest = jest.fn();

global.chrome = {
  runtime: {
    openOptionsPage: mockOpenOptionsPage,
    getManifest: mockGetManifest,
  },
} as any;

describe('Popup App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetManifest.mockReturnValue({ version: '1.0.0' });
    mockGetApiKey.mockResolvedValue('test-api-key');
  });

  describe('Header with Settings Button', () => {
    it('should render settings gear icon button', () => {
      render(<App />);

      const settingsButton = screen.getByRole('button', { name: /open settings/i });
      expect(settingsButton).toBeInTheDocument();
    });

    it('should render settings button when API key is present', async () => {
      mockGetApiKey.mockResolvedValue('test-api-key');

      render(<App />);

      // Wait for component to mount
      await screen.findByTestId('quick-translate');

      const settingsButton = screen.getByRole('button', { name: /open settings/i });
      expect(settingsButton).toBeInTheDocument();
    });

    it('should render settings button when API key is missing', async () => {
      mockGetApiKey.mockResolvedValue(null);

      render(<App />);

      // Wait for component to mount
      await screen.findByTestId('quick-translate');

      const settingsButton = screen.getByRole('button', { name: /open settings/i });
      expect(settingsButton).toBeInTheDocument();
    });

    it('should open settings page when gear icon is clicked', () => {
      render(<App />);

      const settingsButton = screen.getByRole('button', { name: /open settings/i });
      fireEvent.click(settingsButton);

      expect(mockOpenOptionsPage).toHaveBeenCalledTimes(1);
    });

    it('should display extension version', () => {
      render(<App />);

      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });

    it('should display Quick Translate title', () => {
      render(<App />);

      expect(screen.getByRole('heading', { name: /quick translate/i })).toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('should render ApiKeyWarning component', () => {
      render(<App />);

      expect(screen.getByTestId('api-key-warning')).toBeInTheDocument();
    });

    it('should render QuickTranslate component', () => {
      render(<App />);

      expect(screen.getByTestId('quick-translate')).toBeInTheDocument();
    });

    it('should render LanguageSelector component', () => {
      render(<App />);

      expect(screen.getByTestId('language-selector')).toBeInTheDocument();
    });

    it('should render StatusIndicator component', () => {
      render(<App />);

      expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    });

    it('should render footer with OpenRouter credit', () => {
      render(<App />);

      expect(screen.getByText(/powered by openrouter/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label for settings button', () => {
      render(<App />);

      const settingsButton = screen.getByRole('button', { name: /open settings/i });
      expect(settingsButton).toHaveAttribute('aria-label', 'Open Settings');
    });

    it('should have title attribute for settings button', () => {
      render(<App />);

      const settingsButton = screen.getByRole('button', { name: /open settings/i });
      expect(settingsButton).toHaveAttribute('title', 'Settings');
    });
  });
});
