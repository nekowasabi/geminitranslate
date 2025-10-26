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
      console.log('[useSettings] Saving settings:', settings);

      await storageManager.set(settings);

      // 保存直後に読み込んで検証
      const saved = await storageManager.get(['openRouterApiKey', 'openRouterModel', 'openRouterProvider']);
      console.log('[useSettings] Verification after save:', saved);
      console.log('[useSettings] Saved openRouterApiKey:', saved.openRouterApiKey);
      console.log('[useSettings] Saved openRouterModel:', saved.openRouterModel);

      // Background Scriptに設定変更を通知して再初期化
      try {
        console.log('[useSettings] Notifying background to reload config...');
        const response = await MessageBus.send({
          type: MessageType.RELOAD_CONFIG,
          action: 'reloadConfig',
          payload: {},
        });
        console.log('[useSettings] Config reload response:', response);

        if (!response.success) {
          console.warn('[useSettings] Config reload failed but continuing:', response.error);
        }
      } catch (reloadErr) {
        console.warn('[useSettings] Failed to notify config reload:', reloadErr);
        // 通知失敗してもエラーにしない（設定保存自体は成功している）
      }

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
   *
   * Tests the current UI settings WITHOUT saving them to storage.
   * This allows users to validate their configuration before committing changes.
   */
  const testConnection = useCallback(async (): Promise<TestConnectionResult> => {
    try {
      setTesting(true);
      const startTime = Date.now();

      // Send current UI settings to test (without saving to storage)
      const response = await MessageBus.send({
        type: MessageType.TEST_CONNECTION,
        action: 'testConnection',
        payload: {
          apiKey: settings.openRouterApiKey,
          model: settings.openRouterModel,
          provider: settings.openRouterProvider,
        },
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // IMPORTANT: Check both outer response.success (MessageHandler success)
      // and inner response.data.success (actual connection test result)
      if (response.success && response.data) {
        // response.data contains the actual ConnectionTestResult from apiClient
        return {
          success: response.data.success,
          responseTime: response.data.responseTime || responseTime,
          error: response.data.error,
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
  }, [settings]);

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
