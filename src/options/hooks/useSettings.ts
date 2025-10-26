/**
 * useSettings Hook
 * Manages settings state and operations for options UI
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import StorageManager from '@shared/storage/StorageManager';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';
import { StorageData } from '@shared/types';

export interface SettingsState extends StorageData {}

export interface TestConnectionResult {
  success: boolean;
  responseTime?: number;
  error?: string;
}

export interface UseSettingsReturn {
  settings: SettingsState;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;
  updateSettings: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  saveSettings: () => Promise<void>;
  testConnection: () => Promise<TestConnectionResult>;
}

/**
 * Custom hook for managing settings state and operations
 */
export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<SettingsState>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const storageManager = useMemo(() => new StorageManager(), []);

  /**
   * Load settings from storage on mount
   */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const data = await storageManager.get();
        setSettings(data);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError('Failed to load settings');
        console.error('Failed to load settings:', errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  /**
   * Update settings locally without saving
   */
  const updateSettings = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  /**
   * Save all settings to storage
   */
  const saveSettings = useCallback(async () => {
    try {
      setSaving(true);
      await storageManager.set(settings);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to save settings');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [settings]);

  /**
   * Test connection to OpenRouter API
   */
  const testConnection = useCallback(async (): Promise<TestConnectionResult> => {
    try {
      setTesting(true);
      const startTime = Date.now();

      const response = await MessageBus.send({
        type: MessageType.TEST_CONNECTION,
        action: 'testConnection',
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (response.success) {
        return {
          success: true,
          responseTime: response.data?.responseTime || responseTime,
        };
      } else {
        return {
          success: false,
          error: response.error || 'Connection failed',
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setTesting(false);
    }
  }, []);

  return {
    settings,
    loading,
    saving,
    testing,
    error,
    updateSettings,
    saveSettings,
    testConnection,
  };
}
