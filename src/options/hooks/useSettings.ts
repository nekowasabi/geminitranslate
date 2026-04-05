/**
 * useSettings Hook
 * Manages settings state and operations for options UI
 *
 * Closure fix: useRef pattern keeps latest settings accessible in async callbacks.
 * Debounce auto-save: 300ms delay after each change before writing to storage.
 * Dirty tracking: Only saves keys that actually changed.
 * Safety net: visibilitychange + pagehide guards flush pending writes.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import storageManager, { StorageManager } from '@shared/storage/StorageManager';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';
import { StorageData, StorageKeys } from '@shared/types';

/** Delay before auto-saving after a settings change (ms) */
const AUTO_SAVE_DELAY = 300;

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
  dirty: boolean;
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
  // Why: dirtyKeys Set rather than boolean dirty flag — allows saving only changed keys,
  // avoiding unnecessary writes and reducing race conditions with debounce.
  const [dirtyKeys, setDirtyKeys] = useState<Set<StorageKeys>>(new Set());


  // --- Closure fix refs ---
  // Why: useRef pattern instead of adding settings to useCallback deps —
  // prevents stale closures in debounced save timer and event listeners
  // that would otherwise capture an outdated settings snapshot.
  const settingsRef = useRef<SettingsState>(settings);
  settingsRef.current = settings;

  const dirtyKeysRef = useRef<Set<StorageKeys>>(dirtyKeys);
  dirtyKeysRef.current = dirtyKeys;

  // Debounce timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Load settings from storage on mount
   */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const data = await storageManager.get();
        setSettings(data);
        setDirtyKeys(new Set());
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
   * Persist only the dirty keys to storage and notify background.
   * Reads latest state from refs so it is never stale.
   */
  const flushDirty = useCallback(async (): Promise<void> => {
    const keys = dirtyKeysRef.current;
    if (keys.size === 0) return;

    const current = settingsRef.current;
    const partialData: Partial<StorageData> = {};
    for (const key of keys) {
      // Why: cast needed — TypeScript indexed access with union key types produces
      // an unsound assignment error. StorageData values are all primitives, so safe.
      (partialData as Record<string, unknown>)[key] = current[key];
    }

    try {
      setSaving(true);
      await storageManager.set(partialData);
      setDirtyKeys(new Set());
      setError(null);

      // Notify background to reload config
      try {
        const response = await MessageBus.send({
          type: MessageType.RELOAD_CONFIG,
          action: 'reloadConfig',
          payload: {},
        });
        if (!response.success) {
          console.warn('[useSettings] Config reload failed but continuing:', response.error);
        }
      } catch (reloadErr) {
        console.warn('[useSettings] Failed to notify config reload:', reloadErr);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to save settings');
      console.error('[useSettings] flushDirty error:', errorMessage);
    } finally {
      setSaving(false);
    }
  }, [storageManager]);

  /**
   * Update settings locally and trigger debounced auto-save
   */
  const updateSettings = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      // Reset debounce timer on each change
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        flushDirty();
      }, AUTO_SAVE_DELAY);
    },
    [flushDirty]
  );

  /**
   * Explicit save-all: flushes any pending debounced writes, then
   * saves the full settings object.
   */
  const saveSettings = useCallback(async () => {
    // Cancel pending debounce timer and flush immediately
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // If there are dirty keys, flush them (includes the full save logic)
    const currentDirty = dirtyKeysRef.current;
    if (currentDirty.size > 0) {
      await flushDirty();
      return;
    }

    // No dirty keys — full save for backward compatibility (e.g. manual Save button)
    try {
      setSaving(true);
      const current = settingsRef.current;
      console.log('[useSettings] Saving settings (full):', current);

      await storageManager.set(current);

      // Verify save
      const saved = await storageManager.get(['openRouterApiKey', 'openRouterModel', 'openRouterProvider']);
      console.log('[useSettings] Verification after save:', saved);

      // Notify background to reload config
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
      }

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to save settings');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [flushDirty, storageManager]);

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
      // Use ref to avoid stale closure
      const current = settingsRef.current;

      // Send current UI settings to test (without saving to storage)
      const response = await MessageBus.send({
        type: MessageType.TEST_CONNECTION,
        action: 'testConnection',
        payload: {
          apiKey: current.openRouterApiKey,
          model: current.openRouterModel,
          provider: current.openRouterProvider,
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
  }, []);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // --- Safety net: visibilitychange + pagehide ---
  // Why: visibilitychange + pagehide instead of beforeunload —
  // Firefox subdialog does not reliably fire beforeunload.
  // visibilitychange is part of the Page Lifecycle API (Firefox 89+).
  // pagehide covers the unload case with synchronous write capability.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && dirtyKeysRef.current.size > 0) {
        // Cancel debounce timer
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        // Synchronous-style flush: fire-and-forget async save
        // (browser keeps the promise alive for storage.local writes)
        flushDirty();
      }
    };

    const handlePageHide = () => {
      if (dirtyKeysRef.current.size > 0) {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        flushDirty();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [flushDirty]);

  const dirty = dirtyKeys.size > 0;

  return {
    settings,
    loading,
    saving,
    testing,
    error,
    dirty,
    updateSettings,
    saveSettings,
    testConnection,
  };
}
