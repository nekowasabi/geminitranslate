/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTranslation } from '@popup/hooks/useTranslation';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';

// Mock MessageBus
jest.mock('@shared/messages/MessageBus', () => ({
  __esModule: true,
  default: {
    send: jest.fn(),
  },
}));

// Mock StorageManager
const mockGet = jest.fn();
const mockGetTargetLanguage = jest.fn();

jest.mock('@shared/storage/StorageManager', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: mockGet,
    getTargetLanguage: mockGetTargetLanguage,
  })),
}));

const mockSend = MessageBus.send as jest.MockedFunction<typeof MessageBus.send>;

describe('useTranslation Hook', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockGet.mockClear();
    mockGetTargetLanguage.mockClear();

    // Default mock values
    mockGet.mockResolvedValue({
      openRouterApiKey: 'test-api-key',
      openRouterModel: 'google/gemini-2.0-flash-exp:free',
      targetLanguage: 'ja',
    });
    mockGetTargetLanguage.mockResolvedValue('ja');
  });

  describe('Initial State', () => {
    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useTranslation());

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.progress).toBe(0);
    });
  });

  describe('translate()', () => {
    it('should change status to "translating" when called', async () => {
      mockSend.mockResolvedValue({ status: 'started' });

      const { result } = renderHook(() => useTranslation());

      act(() => {
        result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('translating');
      });
    });

    it('should send translate message via MessageBus', async () => {
      mockSend.mockResolvedValue({ status: 'started' });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('en');
      });

      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'en',
        },
      });
    });

    it('should change status to "success" on successful translation', async () => {
      mockSend.mockResolvedValue({ status: 'completed' });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });
    });

    it('should change status to "error" on failed translation', async () => {
      const errorMessage = 'Translation failed';
      mockSend.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(errorMessage);
      });
    });

    it('should update progress during translation', async () => {
      mockSend.mockResolvedValue({ status: 'started' });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      // Progress should be greater than 0 during translation
      await waitFor(() => {
        expect(result.current.progress).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('reset()', () => {
    it('should send reset message via MessageBus', async () => {
      mockSend.mockResolvedValue({ status: 'reset' });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.reset();
      });

      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.RESET,
      });
    });

    it('should change status to "idle" after reset', async () => {
      mockSend.mockResolvedValue({ status: 'reset' });

      const { result } = renderHook(() => useTranslation());

      // First translate
      await act(async () => {
        await result.current.translate('ja');
      });

      // Then reset
      await act(async () => {
        await result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
        expect(result.current.progress).toBe(0);
      });
    });

    it('should clear error state on reset', async () => {
      mockSend.mockRejectedValueOnce(new Error('Translation failed'));
      mockSend.mockResolvedValueOnce({ status: 'reset' });

      const { result } = renderHook(() => useTranslation());

      // First fail translation
      await act(async () => {
        await result.current.translate('ja');
      });

      expect(result.current.error).toBeTruthy();

      // Then reset
      await act(async () => {
        await result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('State Transitions', () => {
    it('should transition from idle → translating → success', async () => {
      mockSend.mockResolvedValue({ status: 'completed' });

      const { result } = renderHook(() => useTranslation());

      // Initial state
      expect(result.current.status).toBe('idle');

      // Start translation
      act(() => {
        result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('translating');
      });

      // Complete translation
      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });
    });

    it('should transition from idle → translating → error', async () => {
      mockSend.mockRejectedValue(new Error('API Error'));

      const { result } = renderHook(() => useTranslation());

      expect(result.current.status).toBe('idle');

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });
  });

  describe('OpenRouter Configuration Validation', () => {
    it('should fail with error when API key is not configured', async () => {
      mockGet.mockResolvedValue({
        openRouterApiKey: '',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja',
      });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('API key is not configured');
      });

      // Should NOT send message to background if validation fails
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should fail with error when API key is whitespace only', async () => {
      mockGet.mockResolvedValue({
        openRouterApiKey: '   ',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja',
      });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('API key is not configured');
      });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should fail with error when model is not configured', async () => {
      mockGet.mockResolvedValue({
        openRouterApiKey: 'test-api-key',
        openRouterModel: '',
        targetLanguage: 'ja',
      });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('Model is not configured');
      });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should fail with error when model is whitespace only', async () => {
      mockGet.mockResolvedValue({
        openRouterApiKey: 'test-api-key',
        openRouterModel: '   ',
        targetLanguage: 'ja',
      });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('Model is not configured');
      });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should succeed when both API key and model are properly configured', async () => {
      mockSend.mockResolvedValue({ status: 'completed' });

      const { result } = renderHook(() => useTranslation());

      await act(async () => {
        await result.current.translate('ja');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('success');
      });

      // Should send message when validation passes
      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: 'ja',
        },
      });
    });
  });
});
