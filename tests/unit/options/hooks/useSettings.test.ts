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
    it('should send test connection message via MessageBus', async () => {
      mockMessageBus.send.mockResolvedValue({
        status: 'success',
        data: { responseTime: 123 },
      });

      const { result } = renderHook(() => useSettings());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      let testResult;
      await act(async () => {
        testResult = await result.current.testConnection();
      });

      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: MessageType.TEST_CONNECTION,
      });

      expect(testResult).toEqual({
        success: true,
        responseTime: 123,
      });
    });

    it('should set testing state during connection test', async () => {
      mockMessageBus.send.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ status: 'success' }), 100))
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
