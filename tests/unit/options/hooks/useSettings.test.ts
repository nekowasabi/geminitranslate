/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useSettings } from '@options/hooks/useSettings';
import StorageManager from '@shared/storage/StorageManager';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';

// Mock dependencies
jest.mock('@shared/storage/StorageManager');
jest.mock('@shared/messages/MessageBus');

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

describe('useSettings Hook', () => {
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

  describe('Initial State', () => {
    it('should load settings from StorageManager on mount', async () => {
      const { result } = renderHook(() => useSettings());

      // Wait for initial load
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(mockStorageManager.get).toHaveBeenCalledTimes(1);
      expect(result.current.settings.openRouterModel).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('should have loading state initially', () => {
      const { result } = renderHook(() => useSettings());

      expect(result.current.loading).toBe(true);
    });

    it('should set loading to false after data is loaded', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('should update API key locally without saving', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.updateSettings('openRouterApiKey', 'test-key-123');
      });

      expect(result.current.settings.openRouterApiKey).toBe('test-key-123');
      expect(mockStorageManager.set).not.toHaveBeenCalled();
    });

    it('should update model selection', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.updateSettings('openRouterModel', 'openai/gpt-4-turbo');
      });

      expect(result.current.settings.openRouterModel).toBe('openai/gpt-4-turbo');
    });

    it('should allow empty string for model selection', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.updateSettings('openRouterModel', '');
      });

      expect(result.current.settings.openRouterModel).toBe('');
    });

    it('should update target language', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.updateSettings('targetLanguage', 'ja');
      });

      expect(result.current.settings.targetLanguage).toBe('ja');
    });

    it('should update font size', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.updateSettings('fontSize', 18);
      });

      expect(result.current.settings.fontSize).toBe(18);
    });
  });

  describe('saveSettings', () => {
    it('should save all settings to StorageManager', async () => {
      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.updateSettings('openRouterApiKey', 'new-key');
        result.current.updateSettings('targetLanguage', 'ja');
      });

      await act(async () => {
        await result.current.saveSettings();
      });

      expect(mockStorageManager.set).toHaveBeenCalledWith({
        openRouterApiKey: 'new-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 1.5,
      });
    });

    it('should set saving state during save', async () => {
      mockStorageManager.set.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.saveSettings();
      });

      expect(result.current.saving).toBe(true);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.saving).toBe(false);
    });

    it('should handle save errors', async () => {
      const error = new Error('Storage error');
      mockStorageManager.set.mockRejectedValue(error);

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        await expect(result.current.saveSettings()).rejects.toThrow('Storage error');
      });

      expect(result.current.saving).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should send test connection message via MessageBus with current settings', async () => {
      mockMessageBus.send.mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: 'Connection successful!',
          responseTime: 123,
        },
      });

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Update API key to test with current UI state
      act(() => {
        result.current.updateSettings('openRouterApiKey', 'test-key-123');
      });

      let testResult;
      await act(async () => {
        testResult = await result.current.testConnection();
      });

      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: MessageType.TEST_CONNECTION,
        action: 'testConnection',
        payload: {
          apiKey: 'test-key-123',
          model: 'google/gemini-2.0-flash-exp:free',
          provider: undefined,
        },
      });

      expect(testResult).toEqual({
        success: true,
        responseTime: 123,
        error: undefined,
      });
    });

    it('should return error when API key is empty', async () => {
      mockMessageBus.send.mockResolvedValue({
        success: true,
        data: {
          success: false,
          error: 'API key is required. Please configure your OpenRouter API key.',
        },
      });

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Settings has empty API key by default
      let testResult;
      await act(async () => {
        testResult = await result.current.testConnection();
      });

      expect(testResult.success).toBe(false);
      expect(testResult.error).toBe('API key is required. Please configure your OpenRouter API key.');
      expect(typeof testResult.responseTime).toBe('number');
    });

    it('should set testing state during connection test', async () => {
      mockMessageBus.send.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.testConnection();
      });

      expect(result.current.testing).toBe(true);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.testing).toBe(false);
    });

    it('should handle connection test errors', async () => {
      mockMessageBus.send.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      let testResult;
      await act(async () => {
        testResult = await result.current.testConnection();
      });

      expect(testResult).toEqual({
        success: false,
        error: 'Connection failed',
      });
    });
  });

  describe('saveSettings() - Config Reload Notification', () => {
    it('should send RELOAD_CONFIG message after successful save', async () => {
      // Arrange
      mockMessageBus.send.mockResolvedValue({ success: true, data: { message: 'Config reloaded' } });
      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'test-model',
        openRouterProvider: undefined,
      });

      const { result } = renderHook(() => useSettings());

      // Wait for initial load
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Set some settings
      act(() => {
        result.current.updateSettings('openRouterApiKey', 'test-key');
        result.current.updateSettings('openRouterModel', 'test-model');
      });

      // Act
      await act(async () => {
        await result.current.saveSettings();
      });

      // Assert
      expect(mockStorageManager.set).toHaveBeenCalled();
      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: MessageType.RELOAD_CONFIG,
        action: 'reloadConfig',
        payload: {},
      });
    });

    it('should continue saving even if config reload fails', async () => {
      // Arrange
      mockMessageBus.send.mockResolvedValue({
        success: false,
        error: 'Background script not ready',
      });
      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
      });

      const { result } = renderHook(() => useSettings());

      // Wait for initial load
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Act
      await act(async () => {
        await result.current.saveSettings();
      });

      // Assert - 保存自体は成功していること
      expect(mockStorageManager.set).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it('should continue saving even if MessageBus.send throws', async () => {
      // Arrange
      mockMessageBus.send.mockRejectedValue(new Error('Network error'));
      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
      });

      const { result } = renderHook(() => useSettings());

      // Wait for initial load
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Act
      await act(async () => {
        await result.current.saveSettings();
      });

      // Assert - 保存自体は成功していること
      expect(mockStorageManager.set).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle storage load errors gracefully', async () => {
      mockStorageManager.get.mockRejectedValue(new Error('Load error'));

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to load settings');
    });
  });
});
