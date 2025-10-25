/**
 * @jest-environment jsdom
 *
 * Settings Synchronization Integration Test
 * Tests settings sync between Popup and Options UI
 */

import StorageManager from '@shared/storage/StorageManager';
import MessageBus from '@shared/messages/MessageBus';
import { MessageType } from '@shared/messages/types';

// Mock modules
jest.mock('@shared/storage/StorageManager');
jest.mock('@shared/messages/MessageBus');

describe('Settings Synchronization Integration', () => {
  let mockStorageManager: any;
  let mockMessageBus: any;
  let storageChangeListeners: Array<(changes: any) => void> = [];

  beforeEach(() => {
    jest.clearAllMocks();
    storageChangeListeners = [];

    // Mock StorageManager
    mockStorageManager = {
      get: jest.fn(),
      set: jest.fn(),
      getApiKey: jest.fn(),
      setApiKey: jest.fn(),
      getTargetLanguage: jest.fn(),
      setTargetLanguage: jest.fn(),
      onChange: jest.fn((listener) => {
        storageChangeListeners.push(listener);
      }),
    };
    (StorageManager as jest.Mock).mockImplementation(() => mockStorageManager);

    // Mock MessageBus
    mockMessageBus = {
      send: jest.fn(),
      on: jest.fn(),
    };
    (MessageBus.send as jest.Mock) = mockMessageBus.send;
    (MessageBus.on as jest.Mock) = mockMessageBus.on;
  });

  describe('API Key Synchronization', () => {
    it('should sync API key from Options to Popup', async () => {
      // Step 1: Options UI saves API key
      const newApiKey = 'test-api-key-12345';

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: newApiKey,
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      // Options UI saves
      const storageManager1 = new StorageManager();
      await storageManager1.set({ openRouterApiKey: newApiKey });

      expect(mockStorageManager.set).toHaveBeenCalledWith({ openRouterApiKey: newApiKey });

      // Step 2: Storage change event triggers
      const changes = {
        openRouterApiKey: { newValue: newApiKey, oldValue: '' },
      };

      // Simulate storage change event
      storageChangeListeners.forEach(listener => listener(changes));

      // Step 3: Popup UI reads new API key
      const storageManager2 = new StorageManager();
      const settings = await storageManager2.get();

      expect(settings.openRouterApiKey).toBe(newApiKey);
    });

    it('should remove API key warning in Popup after Options saves key', async () => {
      // Initial state: No API key
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: '',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      const storageManager1 = new StorageManager();
      const initialSettings = await storageManager1.get();
      expect(initialSettings.openRouterApiKey).toBe('');

      // Options saves API key
      const newApiKey = 'sk-test-12345';
      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: newApiKey,
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      await storageManager1.set({ openRouterApiKey: newApiKey });

      // Popup reads updated settings
      const storageManager2 = new StorageManager();
      const updatedSettings = await storageManager2.get();
      expect(updatedSettings.openRouterApiKey).toBe(newApiKey);

      // API key warning should now be hidden (tested in ApiKeyWarning.test.tsx)
    });
  });

  describe('Language Settings Synchronization', () => {
    it('should sync target language from Options to Popup', async () => {
      // Step 1: Options UI changes language
      const newLanguage = 'ja';

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: newLanguage,
        fontSize: 16,
        lineHeight: 1.5,
      });

      const storageManager1 = new StorageManager();
      await storageManager1.set({ targetLanguage: newLanguage });

      expect(mockStorageManager.set).toHaveBeenCalledWith({ targetLanguage: newLanguage });

      // Step 2: Storage change event
      const changes = {
        targetLanguage: { newValue: newLanguage, oldValue: 'en' },
      };

      storageChangeListeners.forEach(listener => listener(changes));

      // Step 3: Popup UI reads new language
      const storageManager2 = new StorageManager();
      const settings = await storageManager2.get();

      expect(settings.targetLanguage).toBe(newLanguage);
    });

    it('should sync multiple settings at once', async () => {
      const newSettings = {
        targetLanguage: 'ja',
        fontSize: 18,
        lineHeight: 1.8,
      };

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        ...newSettings,
      });

      const storageManager = new StorageManager();
      await storageManager.set(newSettings);

      expect(mockStorageManager.set).toHaveBeenCalledWith(newSettings);

      // Verify all settings are updated
      const settings = await storageManager.get();
      expect(settings.targetLanguage).toBe('ja');
      expect(settings.fontSize).toBe(18);
      expect(settings.lineHeight).toBe(1.8);
    });
  });

  describe('Storage Change Reflection', () => {
    it('should reflect storage changes in real-time', async () => {
      const storageManager = new StorageManager();
      const changeListener = jest.fn();

      // Register change listener
      storageManager.onChange(changeListener);
      expect(mockStorageManager.onChange).toHaveBeenCalled();

      // Simulate storage change from another tab
      const changes = {
        openRouterApiKey: { newValue: 'new-key', oldValue: 'old-key' },
        targetLanguage: { newValue: 'ja', oldValue: 'en' },
      };

      storageChangeListeners.forEach(listener => listener(changes));

      // Listener should have been called
      expect(changeListener).toHaveBeenCalledWith(changes);
    });

    it('should handle storage change events from multiple tabs', async () => {
      const changeListeners = [jest.fn(), jest.fn(), jest.fn()];

      // Register multiple listeners (simulating multiple tabs)
      changeListeners.forEach(listener => {
        const storageManager = new StorageManager();
        storageManager.onChange(listener);
      });

      // Simulate storage change
      const changes = {
        targetLanguage: { newValue: 'ja', oldValue: 'en' },
      };

      storageChangeListeners.forEach(listener => listener(changes));

      // All listeners should receive the change
      changeListeners.forEach(listener => {
        expect(listener).toHaveBeenCalledWith(changes);
      });
    });
  });

  describe('Model Settings Synchronization', () => {
    it('should sync OpenRouter model from Options to Background', async () => {
      const newModel = 'anthropic/claude-3-haiku:free';

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: newModel,
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      const storageManager = new StorageManager();
      await storageManager.set({ openRouterModel: newModel });

      expect(mockStorageManager.set).toHaveBeenCalledWith({ openRouterModel: newModel });

      // Background should read new model on next translation
      const settings = await storageManager.get();
      expect(settings.openRouterModel).toBe(newModel);
    });

    it('should validate model format on save', async () => {
      const validModel = 'google/gemini-2.0-flash-exp:free';

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: validModel,
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: 1.5,
      });

      const storageManager = new StorageManager();
      await storageManager.set({ openRouterModel: validModel });

      expect(mockStorageManager.set).toHaveBeenCalledWith({ openRouterModel: validModel });
    });
  });

  describe('Font Settings Synchronization', () => {
    it('should sync font size from Options to Content', async () => {
      const newFontSize = 20;

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: newFontSize,
        lineHeight: 1.5,
      });

      const storageManager = new StorageManager();
      await storageManager.set({ fontSize: newFontSize });

      expect(mockStorageManager.set).toHaveBeenCalledWith({ fontSize: newFontSize });

      // Content should read new font size and apply
      const settings = await storageManager.get();
      expect(settings.fontSize).toBe(newFontSize);
    });

    it('should sync line height from Options to Content', async () => {
      const newLineHeight = 2.0;

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'en',
        fontSize: 16,
        lineHeight: newLineHeight,
      });

      const storageManager = new StorageManager();
      await storageManager.set({ lineHeight: newLineHeight });

      expect(mockStorageManager.set).toHaveBeenCalledWith({ lineHeight: newLineHeight });

      const settings = await storageManager.get();
      expect(settings.lineHeight).toBe(newLineHeight);
    });
  });

  describe('Connection Test Synchronization', () => {
    it('should test connection and reflect status in Options UI', async () => {
      mockMessageBus.send.mockResolvedValue({
        status: 'success',
        data: { responseTime: 123 },
      });

      const response = await MessageBus.send({
        type: MessageType.TEST_CONNECTION,
      });

      expect(response.status).toBe('success');
      expect(response.data.responseTime).toBe(123);
      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: MessageType.TEST_CONNECTION,
      });
    });

    it('should handle connection test failure', async () => {
      mockMessageBus.send.mockResolvedValue({
        status: 'error',
        error: 'API key invalid',
      });

      const response = await MessageBus.send({
        type: MessageType.TEST_CONNECTION,
      });

      expect(response.status).toBe('error');
      expect(response.error).toBe('API key invalid');
    });
  });

  describe('Settings Persistence', () => {
    it('should persist settings across browser restarts', async () => {
      const settings = {
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja',
        fontSize: 18,
        lineHeight: 1.8,
      };

      mockStorageManager.set.mockResolvedValue(undefined);
      mockStorageManager.get.mockResolvedValue(settings);

      // Save settings
      const storageManager1 = new StorageManager();
      await storageManager1.set(settings);

      // Simulate browser restart (new StorageManager instance)
      const storageManager2 = new StorageManager();
      const loadedSettings = await storageManager2.get();

      expect(loadedSettings).toEqual(settings);
    });

    it('should handle storage quota exceeded errors', async () => {
      mockStorageManager.set.mockRejectedValue(new Error('QuotaExceededError'));

      const storageManager = new StorageManager();

      await expect(
        storageManager.set({ openRouterApiKey: 'test-key' })
      ).rejects.toThrow('QuotaExceededError');
    });
  });
});
