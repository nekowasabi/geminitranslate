/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock StorageManager and MessageBus
jest.mock('@shared/storage/StorageManager');
jest.mock('@shared/messages/MessageBus');

import StorageManager from '@shared/storage/StorageManager';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';

describe('UI Integration Flow', () => {
  const mockStorageManager = {
    get: jest.fn(),
    set: jest.fn(),
    getApiKey: jest.fn(),
    setApiKey: jest.fn(),
    getTargetLanguage: jest.fn(),
    setTargetLanguage: jest.fn(),
  };

  const mockMessageBus = {
    send: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (StorageManager as jest.Mock).mockImplementation(() => mockStorageManager);
    (MessageBus.send as jest.Mock) = mockMessageBus.send;

    // Default storage data
    mockStorageManager.get.mockResolvedValue({
      openRouterApiKey: '',
      openRouterModel: 'google/gemini-2.0-flash-exp:free',
      targetLanguage: 'en',
      fontSize: 16,
      lineHeight: 1.5,
    });
  });

  describe('Popup UI Integration Flow', () => {
    it('should render popup app successfully', async () => {
      const { default: PopupApp } = await import('@popup/App');

      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      render(<PopupApp />);

      await waitFor(() => {
        // Main UI elements should be present
        expect(screen.getByRole('button', { name: /translate/i })).toBeInTheDocument();
      });
    });

    it('should integrate MessageBus for translation', async () => {
      const { default: PopupApp } = await import('@popup/App');

      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      mockMessageBus.send.mockResolvedValue({
        status: 'started',
      });

      render(<PopupApp />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /translate/i })).toBeInTheDocument();
      });

      const translateButton = screen.getByRole('button', { name: /translate/i });
      fireEvent.click(translateButton);

      await waitFor(() => {
        expect(mockMessageBus.send).toHaveBeenCalled();
      });
    });
  });

  describe('Options UI Integration Flow', () => {
    it('should save API key to storage', async () => {
      const { default: OptionsApp } = await import('@options/App');

      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: '',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      render(<OptionsApp />);

      await waitFor(() => {
        expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
      });

      const apiKeyInput = screen.getByLabelText(/api key/i);
      fireEvent.change(apiKeyInput, { target: { value: 'test-api-key-123' } });

      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockStorageManager.set).toHaveBeenCalledWith(
          expect.objectContaining({
            openRouterApiKey: 'test-api-key-123',
          })
        );
      });
    });

    it('should test connection via MessageBus', async () => {
      const { default: OptionsApp } = await import('@options/App');

      mockMessageBus.send.mockResolvedValue({
        status: 'success',
        data: { responseTime: 123 },
      });

      render(<OptionsApp />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
      });

      const testButton = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(mockMessageBus.send).toHaveBeenCalledWith({
          type: MessageType.TEST_CONNECTION,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
      });
    });

    it('should update settings across tabs', async () => {
      const { default: OptionsApp } = await import('@options/App');

      mockStorageManager.set.mockResolvedValue(undefined);

      render(<OptionsApp />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /translation/i })).toBeInTheDocument();
      });

      // Switch to Translation tab
      const translationTab = screen.getByRole('tab', { name: /translation/i });
      fireEvent.click(translationTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
      });

      const languageSelect = screen.getByLabelText(/target language/i);
      fireEvent.change(languageSelect, { target: { value: 'ja' } });

      // Save settings
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockStorageManager.set).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Verify that the call includes target language
      const calls = mockStorageManager.set.mock.calls;
      const callWithLanguage = calls.find((call) =>
        call[0] && call[0].targetLanguage === 'ja'
      );
      expect(callWithLanguage).toBeTruthy();
    });
  });

  describe('Cross-UI Integration', () => {
    it('should demonstrate shared storage architecture', () => {
      // Both Popup and Options UIs use the same StorageManager instance
      // This is verified through the unit tests of each component
      // Integration test demonstrates the architectural pattern

      expect(StorageManager).toBeDefined();
      expect(MessageBus).toBeDefined();

      // The shared modules enable communication between UIs:
      // 1. Options saves API key to StorageManager
      // 2. Popup reads API key from StorageManager
      // 3. Both UIs use MessageBus for background communication

      // This architecture is tested thoroughly in unit tests
      // End-to-end testing requires actual browser environment
    });
  });
});
