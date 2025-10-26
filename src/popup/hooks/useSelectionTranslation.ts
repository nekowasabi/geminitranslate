/**
 * useSelectionTranslation Hook
 * Manages selection translation state for popup UI
 *
 * @example
 * ```tsx
 * function SelectionResult() {
 *   const { data, clear } = useSelectionTranslation();
 *
 *   if (!data) return null;
 *
 *   return (
 *     <div>
 *       <p>Original: {data.originalText}</p>
 *       <p>Translation: {data.translatedText}</p>
 *       <button onClick={clear}>Clear</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { MessageType } from '@shared/messages/types';

/**
 * Selection translation data structure
 */
export interface SelectionData {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  timestamp: number;
}

/**
 * Hook return type
 */
export interface UseSelectionTranslationReturn {
  /**
   * Current selection translation data (null if no translation)
   */
  data: SelectionData | null;

  /**
   * Clear the current translation data
   */
  clear: () => void;
}

/**
 * Custom hook for managing selection translation state
 *
 * Listens to SELECTION_TRANSLATED messages from background/content scripts
 * and maintains the latest translation data for display in popup UI.
 *
 * @returns Selection translation data and clear function
 */
export function useSelectionTranslation(): UseSelectionTranslationReturn {
  const [data, setData] = useState<SelectionData | null>(null);

  /**
   * Clear translation data
   */
  const clear = useCallback(() => {
    setData(null);
  }, []);

  /**
   * Load saved translation from session storage and listen for new messages
   */
  useEffect(() => {
    // Load saved translation from session storage on mount
    const loadSavedTranslation = async () => {
      try {
        const result = await browser.storage.session.get('lastSelectionTranslation');
        if (result.lastSelectionTranslation) {
          console.log('[useSelectionTranslation] Loaded from session storage:', {
            originalText: result.lastSelectionTranslation.originalText?.substring(0, 50),
            translatedText: result.lastSelectionTranslation.translatedText?.substring(0, 50),
            targetLanguage: result.lastSelectionTranslation.targetLanguage,
          });
          setData(result.lastSelectionTranslation);
        } else {
          console.log('[useSelectionTranslation] No saved translation in session storage');
        }
      } catch (error) {
        console.error('[useSelectionTranslation] Failed to load from session storage:', error);
      }
    };

    loadSavedTranslation();

    // Message listener for SELECTION_TRANSLATED messages
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void
    ) => {
      // Only handle SELECTION_TRANSLATED messages
      if (message?.type === MessageType.SELECTION_TRANSLATED) {
        const payload = message.payload;

        console.log('[useSelectionTranslation] Received runtime message:', {
          originalText: payload.originalText?.substring(0, 50),
          translatedText: payload.translatedText?.substring(0, 50),
          targetLanguage: payload.targetLanguage,
        });

        // Update state with new translation data
        setData({
          originalText: payload.originalText,
          translatedText: payload.translatedText,
          targetLanguage: payload.targetLanguage,
          timestamp: payload.timestamp,
        });

        // Also save to session storage for persistence
        browser.storage.session.set({
          lastSelectionTranslation: payload
        }).catch(err => console.error('[useSelectionTranslation] Failed to save to session:', err));
      }
    };

    // Register listener
    browser.runtime.onMessage.addListener(handleMessage);

    // Cleanup on unmount
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return {
    data,
    clear,
  };
}
