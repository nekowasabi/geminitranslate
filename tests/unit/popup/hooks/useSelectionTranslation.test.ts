/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSelectionTranslation } from '@popup/hooks/useSelectionTranslation';
import { MessageType } from '@shared/messages/types';

// Mock browser API
const mockAddListener = jest.fn();
const mockRemoveListener = jest.fn();

global.browser = {
  runtime: {
    onMessage: {
      addListener: mockAddListener,
      removeListener: mockRemoveListener,
    },
  },
} as any;

describe('useSelectionTranslation Hook', () => {
  let messageListener: any;

  beforeEach(() => {
    mockAddListener.mockClear();
    mockRemoveListener.mockClear();
    messageListener = null;

    // Capture the listener function when addListener is called
    mockAddListener.mockImplementation((listener: any) => {
      messageListener = listener;
    });
  });

  describe('Initial State', () => {
    it('should initialize with null data', () => {
      const { result } = renderHook(() => useSelectionTranslation());

      expect(result.current.data).toBeNull();
    });

    it('should provide clear function', () => {
      const { result } = renderHook(() => useSelectionTranslation());

      expect(typeof result.current.clear).toBe('function');
    });
  });

  describe('Message Listener Registration', () => {
    it('should register browser.runtime.onMessage listener on mount', () => {
      renderHook(() => useSelectionTranslation());

      expect(mockAddListener).toHaveBeenCalledTimes(1);
      expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should remove listener on unmount', () => {
      const { unmount } = renderHook(() => useSelectionTranslation());

      expect(mockAddListener).toHaveBeenCalledTimes(1);

      unmount();

      expect(mockRemoveListener).toHaveBeenCalledTimes(1);
      expect(mockRemoveListener).toHaveBeenCalledWith(messageListener);
    });
  });

  describe('SELECTION_TRANSLATED Message Handling', () => {
    it('should update data when SELECTION_TRANSLATED message is received', async () => {
      const { result } = renderHook(() => useSelectionTranslation());

      expect(result.current.data).toBeNull();

      // Simulate receiving SELECTION_TRANSLATED message
      act(() => {
        messageListener({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: 'Hello',
            translatedText: 'こんにちは',
            targetLanguage: 'Japanese',
            timestamp: Date.now(),
          },
        });
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
        expect(result.current.data?.originalText).toBe('Hello');
        expect(result.current.data?.translatedText).toBe('こんにちは');
        expect(result.current.data?.targetLanguage).toBe('Japanese');
        expect(result.current.data?.timestamp).toBeDefined();
      });
    });

    it('should ignore non-SELECTION_TRANSLATED messages', async () => {
      const { result } = renderHook(() => useSelectionTranslation());

      expect(result.current.data).toBeNull();

      // Simulate receiving different message types
      act(() => {
        messageListener({
          type: MessageType.TRANSLATE_PAGE,
          payload: { targetLanguage: 'ja' },
        });
      });

      await waitFor(() => {
        expect(result.current.data).toBeNull();
      });

      act(() => {
        messageListener({
          type: MessageType.TRANSLATION_PROGRESS,
          payload: { current: 5, total: 10, percentage: 50 },
        });
      });

      await waitFor(() => {
        expect(result.current.data).toBeNull();
      });
    });

    it('should update data with new translation when multiple messages are received', async () => {
      const { result } = renderHook(() => useSelectionTranslation());

      // First translation
      act(() => {
        messageListener({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: 'Hello',
            translatedText: 'こんにちは',
            targetLanguage: 'Japanese',
            timestamp: 1000,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.data?.originalText).toBe('Hello');
      });

      // Second translation
      act(() => {
        messageListener({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: 'World',
            translatedText: '世界',
            targetLanguage: 'Japanese',
            timestamp: 2000,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.data?.originalText).toBe('World');
        expect(result.current.data?.translatedText).toBe('世界');
        expect(result.current.data?.timestamp).toBe(2000);
      });
    });
  });

  describe('clear() Function', () => {
    it('should reset data to null when called', async () => {
      const { result } = renderHook(() => useSelectionTranslation());

      // Set data first
      act(() => {
        messageListener({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: 'Hello',
            translatedText: 'こんにちは',
            targetLanguage: 'Japanese',
            timestamp: Date.now(),
          },
        });
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      // Clear data
      act(() => {
        result.current.clear();
      });

      await waitFor(() => {
        expect(result.current.data).toBeNull();
      });
    });

    it('should handle clear when data is already null', () => {
      const { result } = renderHook(() => useSelectionTranslation());

      expect(result.current.data).toBeNull();

      // Should not throw error
      expect(() => {
        act(() => {
          result.current.clear();
        });
      }).not.toThrow();

      expect(result.current.data).toBeNull();
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should properly cleanup listener to prevent memory leaks', () => {
      const { unmount } = renderHook(() => useSelectionTranslation());

      // Verify listener was added
      expect(mockAddListener).toHaveBeenCalledTimes(1);
      const addedListener = mockAddListener.mock.calls[0][0];

      // Unmount component
      unmount();

      // Verify the exact same listener was removed
      expect(mockRemoveListener).toHaveBeenCalledTimes(1);
      expect(mockRemoveListener).toHaveBeenCalledWith(addedListener);
    });
  });

  describe('Edge Cases', () => {
    it('should handle message with missing payload fields gracefully', async () => {
      const { result } = renderHook(() => useSelectionTranslation());

      act(() => {
        messageListener({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: 'Hello',
            // Missing translatedText
            targetLanguage: 'Japanese',
            timestamp: Date.now(),
          },
        });
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
        expect(result.current.data?.originalText).toBe('Hello');
        expect(result.current.data?.translatedText).toBeUndefined();
      });
    });

    it('should handle message with extra payload fields', async () => {
      const { result } = renderHook(() => useSelectionTranslation());

      act(() => {
        messageListener({
          type: MessageType.SELECTION_TRANSLATED,
          payload: {
            originalText: 'Hello',
            translatedText: 'こんにちは',
            targetLanguage: 'Japanese',
            timestamp: Date.now(),
            extraField: 'should be ignored',
          },
        });
      });

      await waitFor(() => {
        expect(result.current.data?.originalText).toBe('Hello');
        expect(result.current.data?.translatedText).toBe('こんにちは');
      });
    });
  });
});
