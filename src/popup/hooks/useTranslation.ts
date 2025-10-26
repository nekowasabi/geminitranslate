/**
 * useTranslation Hook
 * Manages translation state and operations for popup UI
 */

import { useState, useCallback } from 'react';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';
import StorageManager from '@shared/storage/StorageManager';

export type TranslationStatus = 'idle' | 'translating' | 'success' | 'error';

export interface TranslationState {
  status: TranslationStatus;
  error: string | null;
  progress: number;
}

export interface UseTranslationReturn extends TranslationState {
  translate: (targetLanguage?: string) => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * Custom hook for managing translation state and operations
 */
export function useTranslation(): UseTranslationReturn {
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const storageManager = new StorageManager();

  /**
   * Translate the current page
   */
  const translate = useCallback(async (targetLanguage?: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[Popup:useTranslation] ${timestamp} - translate() called`, { targetLanguage });

    try {
      setStatus('translating');
      setError(null);
      setProgress(0);

      // Get target language from storage if not provided
      const lang = targetLanguage || await storageManager.getTargetLanguage();
      console.log(`[Popup:useTranslation] ${timestamp} - Target language resolved:`, lang);

      // Send translation request via MessageBus
      console.log(`[Popup:useTranslation] ${timestamp} - Sending TRANSLATE_PAGE message to background`, {
        type: MessageType.TRANSLATE_PAGE,
        payload: { targetLanguage: lang }
      });

      const response = await MessageBus.send({
        type: MessageType.TRANSLATE_PAGE,
        payload: {
          targetLanguage: lang,
        },
      });

      console.log(`[Popup:useTranslation] ${timestamp} - Received response from background:`, response);

      if (response.status === 'completed' || response.status === 'started') {
        console.log(`[Popup:useTranslation] ${timestamp} - Translation successful`);
        setStatus('success');
        setProgress(100);
      } else {
        console.error(`[Popup:useTranslation] ${timestamp} - Translation failed - unexpected response status:`, response);
        throw new Error('Translation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Popup:useTranslation] ${timestamp} - Error during translation:`, {
        error: err,
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined
      });
      setStatus('error');
      setError(errorMessage);
      setProgress(0);
    }
  }, []);

  /**
   * Reset the page to original content
   */
  const reset = useCallback(async () => {
    try {
      // Send reset request via MessageBus
      await MessageBus.send({
        type: MessageType.RESET,
      });

      // Reset state
      setStatus('idle');
      setError(null);
      setProgress(0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    }
  }, []);

  return {
    status,
    error,
    progress,
    translate,
    reset,
  };
}
