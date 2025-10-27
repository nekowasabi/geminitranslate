/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '@options/App';

// Mock child components
jest.mock('@options/components/ApiSettings', () => ({
  ApiSettings: ({ apiKey, onChange }: any) => (
    <div data-testid="api-settings">
      <input
        data-testid="api-key-input"
        value={apiKey}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// ModelSelector component no longer exists - removed mock

jest.mock('@options/components/LanguageSettings', () => ({
  LanguageSettings: ({ targetLanguage, fontSize, onChange }: any) => (
    <div data-testid="language-settings">
      <select
        data-testid="language-select"
        value={targetLanguage}
        onChange={(e) => onChange('targetLanguage', e.target.value)}
      >
        <option value="en">English</option>
        <option value="ja">Japanese</option>
      </select>
      <input
        data-testid="font-size-input"
        type="number"
        value={fontSize}
        onChange={(e) => onChange('fontSize', Number(e.target.value))}
      />
    </div>
  ),
}));

jest.mock('@options/components/AppearanceSettings', () => ({
  AppearanceSettings: ({ darkMode, selectionFontSize, onChange }: any) => (
    <div data-testid="appearance-settings">
      <input
        data-testid="dark-mode-toggle"
        type="checkbox"
        checked={darkMode}
        onChange={(e) => onChange('darkMode', e.target.checked)}
      />
      <input
        data-testid="selection-font-size-input"
        type="range"
        min="10"
        max="24"
        step="2"
        value={selectionFontSize}
        onChange={(e) => onChange('selectionFontSize', Number(e.target.value))}
      />
    </div>
  ),
}));

jest.mock('@options/components/ConnectionTest', () => ({
  ConnectionTest: ({ onTest, testing }: any) => (
    <div data-testid="connection-test">
      <button onClick={onTest} disabled={testing}>
        {testing ? 'Testing...' : 'Test Connection'}
      </button>
    </div>
  ),
}));

// Mock useSettings hook
const mockSaveSettings = jest.fn();
const mockTestConnection = jest.fn();
const mockUpdateSettings = jest.fn();

let mockUseSettings = jest.fn(() => ({
  settings: {
    openRouterApiKey: '',
    openRouterModel: 'google/gemini-2.0-flash-exp:free',
    targetLanguage: 'en',
    fontSize: 16,
    lineHeight: 1.5,
    selectionFontSize: 14,
    darkMode: false,
  },
  loading: false,
  saving: false,
  testing: false,
  error: null,
  updateSettings: mockUpdateSettings,
  saveSettings: mockSaveSettings,
  testConnection: mockTestConnection,
}));

jest.mock('@options/hooks/useSettings', () => ({
  useSettings: () => mockUseSettings(),
}));

describe('Options App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Layout', () => {
    it('should render tab navigation', () => {
      render(<App />);

      expect(screen.getByRole('tab', { name: /api settings/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /translation/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /appearance/i })).toBeInTheDocument();
    });

    it('should render save button', () => {
      render(<App />);

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      expect(saveButton).toBeInTheDocument();
    });

    it('should have proper page title', () => {
      render(<App />);

      expect(screen.getByText(/translation settings/i)).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should show API Settings tab by default', () => {
      render(<App />);

      expect(screen.getByTestId('api-settings')).toBeInTheDocument();
      expect(screen.getByTestId('connection-test')).toBeInTheDocument();
    });

    it('should switch to Translation tab when clicked', () => {
      render(<App />);

      const translationTab = screen.getByRole('tab', { name: /translation/i });
      fireEvent.click(translationTab);

      expect(screen.getByTestId('language-settings')).toBeInTheDocument();
    });

    it('should switch to Appearance tab when clicked', () => {
      render(<App />);

      const appearanceTab = screen.getByRole('tab', { name: /appearance/i });
      fireEvent.click(appearanceTab);

      expect(screen.getByTestId('appearance-settings')).toBeInTheDocument();
    });

    it('should highlight active tab', () => {
      render(<App />);

      const apiTab = screen.getByRole('tab', { name: /api settings/i });
      expect(apiTab).toHaveAttribute('aria-selected', 'true');

      const translationTab = screen.getByRole('tab', { name: /translation/i });
      fireEvent.click(translationTab);

      expect(translationTab).toHaveAttribute('aria-selected', 'true');
      expect(apiTab).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Settings Management', () => {
    it('should call updateSettings when API key changes', () => {
      render(<App />);

      const apiKeyInput = screen.getByTestId('api-key-input');
      fireEvent.change(apiKeyInput, { target: { value: 'new-key' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith('openRouterApiKey', 'new-key');
    });

    it('should call updateSettings when selection font size changes', () => {
      render(<App />);

      const appearanceTab = screen.getByRole('tab', { name: /appearance/i });
      fireEvent.click(appearanceTab);

      const selectionFontSizeInput = screen.getByTestId('selection-font-size-input');
      fireEvent.change(selectionFontSizeInput, { target: { value: '18' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith('selectionFontSize', 18);
    });

    it('should call saveSettings when save button is clicked', async () => {
      mockSaveSettings.mockResolvedValue(undefined);

      render(<App />);

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockSaveSettings).toHaveBeenCalledTimes(1);
      });
    });

    it('should show success message after saving', async () => {
      mockSaveSettings.mockResolvedValue(undefined);

      render(<App />);

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/settings saved/i)).toBeInTheDocument();
      });
    });

    it('should show error message if save fails', async () => {
      mockSaveSettings.mockRejectedValue(new Error('Save failed'));

      render(<App />);

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
      });
    });
  });

  describe('Connection Test Integration', () => {
    it('should call testConnection when test button is clicked', async () => {
      mockTestConnection.mockResolvedValue({ success: true, responseTime: 150 });

      render(<App />);

      const testButton = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(mockTestConnection).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Loading States', () => {
    it('should disable save button while saving', () => {
      // Override mock for this test
      mockUseSettings = jest.fn(() => ({
        settings: {
          openRouterApiKey: '',
          openRouterModel: 'google/gemini-2.0-flash-exp:free',
          targetLanguage: 'en',
          fontSize: 16,
          lineHeight: 1.5,
        },
        loading: false,
        saving: true,
        testing: false,
        error: null,
        updateSettings: mockUpdateSettings,
        saveSettings: mockSaveSettings,
        testConnection: mockTestConnection,
      }));

      render(<App />);

      const saveButton = screen.getByRole('button', { name: /saving/i });
      expect(saveButton).toBeDisabled();

      // Reset mock
      mockUseSettings = jest.fn(() => ({
        settings: {
          openRouterApiKey: '',
          openRouterModel: 'google/gemini-2.0-flash-exp:free',
          targetLanguage: 'en',
          fontSize: 16,
          lineHeight: 1.5,
        },
        loading: false,
        saving: false,
        testing: false,
        error: null,
        updateSettings: mockUpdateSettings,
        saveSettings: mockSaveSettings,
        testConnection: mockTestConnection,
      }));
    });

    it('should show loading spinner while loading settings', () => {
      // Override mock for this test
      mockUseSettings = jest.fn(() => ({
        settings: {
          openRouterApiKey: '',
          openRouterModel: 'google/gemini-2.0-flash-exp:free',
          targetLanguage: 'en',
          fontSize: 16,
          lineHeight: 1.5,
        },
        loading: true,
        saving: false,
        testing: false,
        error: null,
        updateSettings: mockUpdateSettings,
        saveSettings: mockSaveSettings,
        testConnection: mockTestConnection,
      }));

      render(<App />);

      expect(screen.getByRole('status')).toBeInTheDocument();

      // Reset mock
      mockUseSettings = jest.fn(() => ({
        settings: {
          openRouterApiKey: '',
          openRouterModel: 'google/gemini-2.0-flash-exp:free',
          targetLanguage: 'en',
          fontSize: 16,
          lineHeight: 1.5,
        },
        loading: false,
        saving: false,
        testing: false,
        error: null,
        updateSettings: mockUpdateSettings,
        saveSettings: mockSaveSettings,
        testConnection: mockTestConnection,
      }));
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA roles for tabs', () => {
      render(<App />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(3);
    });

    it('should have proper ARIA attributes for tab panels', () => {
      render(<App />);

      const apiTab = screen.getByRole('tab', { name: /api settings/i });
      const panelId = apiTab.getAttribute('aria-controls');

      expect(panelId).toBeTruthy();
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', panelId!);
    });
  });
});
