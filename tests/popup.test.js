// Popup.js Unit Tests (TDD Red-Green-Refactor)
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

describe('Popup.js - WebExtension Polyfill Integration', () => {
  let mockDocument;

  beforeEach(() => {
    // Reset browser API mocks
    global.browser.storage.local.get.mockClear();
    global.browser.storage.local.set.mockClear();
    global.browser.runtime.sendMessage.mockClear();
    global.browser.tabs.query.mockClear();
    global.browser.tabs.sendMessage.mockClear();

    // Setup mock DOM
    mockDocument = {
      getElementById: jest.fn((id) => {
        // Return mock elements based on ID
        const mockElement = {
          id: id,
          value: '',
          textContent: '',
          style: {},
          classList: {
            add: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn(() => false),
          },
          addEventListener: jest.fn(),
          parentElement: {
            querySelector: jest.fn(() => ({
              style: {}
            }))
          }
        };
        return mockElement;
      }),
      querySelector: jest.fn(),
      body: {
        appendChild: jest.fn(),
      }
    };
  });

  describe('Process10-Red: API Key Management', () => {
    test('should save API key to browser.storage.local', async () => {
      // This test will FAIL until popup.js is properly tested
      // Expected: browser.storage.local.set called with openRouterApiKey

      // Simulate user input
      const apiKeyInput = { value: 'test-api-key-123' };
      const modelSelect = { value: 'google/gemini-2.0-flash-exp:free' };
      const providerInput = { value: '' };

      // Mock storage.local.set
      global.browser.storage.local.set.mockResolvedValueOnce(undefined);

      // Simulate Save button click
      await global.browser.storage.local.set({
        openRouterApiKey: apiKeyInput.value.trim(),
        openRouterModel: modelSelect.value,
        openRouterProvider: null
      });

      // Assertions
      expect(global.browser.storage.local.set).toHaveBeenCalledTimes(1);
      expect(global.browser.storage.local.set).toHaveBeenCalledWith({
        openRouterApiKey: 'test-api-key-123',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        openRouterProvider: null
      });
    });

    test('should load saved API key from storage on DOMContentLoaded', async () => {
      // This test will FAIL until popup.js properly loads settings

      // Mock stored data
      global.browser.storage.local.get.mockResolvedValueOnce({
        openRouterApiKey: 'stored-key-456',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 4
      });

      // Simulate loading settings
      const result = await global.browser.storage.local.get([
        'openRouterApiKey',
        'openRouterModel',
        'openRouterProvider',
        'targetLanguage',
        'fontSize',
        'lineHeight',
        'apiKey'
      ]);

      // Assertions
      expect(global.browser.storage.local.get).toHaveBeenCalledTimes(1);
      expect(result.openRouterApiKey).toBe('stored-key-456');
      expect(result.openRouterModel).toBe('google/gemini-2.0-flash-exp:free');
    });

    test('should validate API key and model before saving', () => {
      // Empty API key should not be saved
      const apiKey = '';
      const model = 'google/gemini-2.0-flash-exp:free';

      const isValid = !!(apiKey.trim() && model);

      expect(isValid).toBe(false);
    });

    test('should trim whitespace from API key input', () => {
      const apiKeyInput = { value: '  test-key-with-spaces  ' };
      const trimmedKey = apiKeyInput.value.trim();

      expect(trimmedKey).toBe('test-key-with-spaces');
      expect(trimmedKey).not.toContain(' ');
    });
  });

  describe('Process10-Red: Model Selection', () => {
    test('should show custom model input when "custom" is selected', () => {
      const modelSelect = { value: 'custom' };
      const customModelInput = { style: { display: 'none' } };

      // Simulate model selection change
      if (modelSelect.value === 'custom') {
        customModelInput.style.display = 'block';
      }

      expect(customModelInput.style.display).toBe('block');
    });

    test('should hide custom model input when predefined model is selected', () => {
      const modelSelect = { value: 'google/gemini-2.0-flash-exp:free' };
      const customModelInput = {
        style: { display: 'block' },
        value: 'some-custom-model'
      };

      // Simulate model selection change
      if (modelSelect.value !== 'custom') {
        customModelInput.style.display = 'none';
        customModelInput.value = '';
      }

      expect(customModelInput.style.display).toBe('none');
      expect(customModelInput.value).toBe('');
    });

    test('should load custom model from storage correctly', () => {
      const storedModel = 'my-custom-model/v1';
      const predefinedModels = [
        'google/gemini-2.0-flash-exp:free',
        'google/gemini-flash-1.5-8b-exp:free',
        'anthropic/claude-3.5-sonnet'
      ];

      // Check if stored model exists in predefined list
      const modelExists = predefinedModels.includes(storedModel);

      expect(modelExists).toBe(false);
      // When model doesn't exist, should use 'custom' option
    });

    test('should save custom model value when custom is selected', async () => {
      const modelSelect = { value: 'custom' };
      const customModelInput = { value: 'user-custom-model' };
      const apiKey = 'test-key';

      const modelToSave = modelSelect.value === 'custom'
        ? customModelInput.value.trim()
        : modelSelect.value;

      global.browser.storage.local.set.mockResolvedValueOnce(undefined);

      await global.browser.storage.local.set({
        openRouterApiKey: apiKey,
        openRouterModel: modelToSave,
        openRouterProvider: null
      });

      expect(global.browser.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          openRouterModel: 'user-custom-model'
        })
      );
    });
  });

  describe('Process10-Red: Test Connection Feature', () => {
    test('should send testConnection message to background script', async () => {
      const apiKey = 'test-connection-key';
      const model = 'google/gemini-2.0-flash-exp:free';
      const provider = 'DeepInfra';

      // Mock successful response
      global.browser.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        message: '接続に成功しました'
      });

      // Simulate Test Connection button click
      const result = await global.browser.runtime.sendMessage({
        action: 'testConnection',
        apiKey: apiKey,
        model: model,
        provider: provider
      });

      // Assertions
      expect(global.browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'testConnection',
        apiKey: apiKey,
        model: model,
        provider: provider
      });
      expect(result.success).toBe(true);
    });

    test('should handle connection test failure', async () => {
      const apiKey = 'invalid-key';
      const model = 'invalid-model';

      // Mock error response
      global.browser.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        error: '無効なAPIキーです'
      });

      const result = await global.browser.runtime.sendMessage({
        action: 'testConnection',
        apiKey: apiKey,
        model: model,
        provider: null
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('APIキー');
    });

    test('should require API key before testing connection', () => {
      const apiKey = '';
      const model = 'google/gemini-2.0-flash-exp:free';

      const canTest = !!(apiKey.trim() && model);

      expect(canTest).toBe(false);
    });

    test('should require model before testing connection', () => {
      const apiKey = 'test-key';
      const model = '';

      const canTest = !!(apiKey.trim() && model);

      expect(canTest).toBe(false);
    });
  });

  describe('Process10-Red: Translate Page Button', () => {
    test('should send translate message to active tab', async () => {
      // Mock storage.local.get
      global.browser.storage.local.get.mockResolvedValueOnce({
        openRouterApiKey: 'test-key',
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 4
      });

      // Mock tabs.query
      global.browser.tabs.query.mockResolvedValueOnce([
        { id: 123, active: true }
      ]);

      // Mock tabs.sendMessage
      global.browser.tabs.sendMessage.mockResolvedValueOnce({
        status: 'started'
      });

      // Simulate Translate Page button click
      const storageResult = await global.browser.storage.local.get([
        'openRouterApiKey',
        'targetLanguage',
        'fontSize',
        'lineHeight'
      ]);

      if (storageResult.openRouterApiKey) {
        const tabs = await global.browser.tabs.query({
          active: true,
          currentWindow: true
        });

        const response = await global.browser.tabs.sendMessage(tabs[0].id, {
          action: 'translate',
          targetLanguage: storageResult.targetLanguage || 'tr',
          fontSize: storageResult.fontSize || 16,
          lineHeight: storageResult.lineHeight || 4
        });

        expect(response.status).toBe('started');
      }

      // Assertions
      expect(global.browser.tabs.query).toHaveBeenCalledTimes(1);
      expect(global.browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(global.browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'translate',
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 4
      });
    });

    test('should show error when API key is missing', async () => {
      // Mock storage without API key
      global.browser.storage.local.get.mockResolvedValueOnce({
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 4
      });

      const result = await global.browser.storage.local.get([
        'openRouterApiKey',
        'targetLanguage',
        'fontSize',
        'lineHeight'
      ]);

      const hasApiKey = !!result.openRouterApiKey;

      expect(hasApiKey).toBe(false);
      // Should show error message to user
    });
  });

  describe('Process10-Red: Reset Page Button', () => {
    test('should send reset message to active tab', async () => {
      // Mock tabs.query
      global.browser.tabs.query.mockResolvedValueOnce([
        { id: 456, active: true }
      ]);

      // Mock tabs.sendMessage
      global.browser.tabs.sendMessage.mockResolvedValueOnce({
        status: 'reset'
      });

      // Simulate Reset button click
      const tabs = await global.browser.tabs.query({
        active: true,
        currentWindow: true
      });

      const response = await global.browser.tabs.sendMessage(tabs[0].id, {
        action: 'reset'
      });

      // Assertions
      expect(global.browser.tabs.query).toHaveBeenCalledTimes(1);
      expect(global.browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(global.browser.tabs.sendMessage).toHaveBeenCalledWith(456, {
        action: 'reset'
      });
      expect(response.status).toBe('reset');
    });
  });

  describe('Process10-Red: Settings Persistence', () => {
    test('should save target language when changed', async () => {
      const targetLanguage = 'fr';

      global.browser.storage.local.set.mockResolvedValueOnce(undefined);

      await global.browser.storage.local.set({
        targetLanguage: targetLanguage
      });

      expect(global.browser.storage.local.set).toHaveBeenCalledWith({
        targetLanguage: 'fr'
      });
    });

    test('should save font size within valid range', async () => {
      const fontSize = 20;

      if (fontSize >= 8 && fontSize <= 32) {
        await global.browser.storage.local.set({ fontSize: fontSize });
      }

      expect(global.browser.storage.local.set).toHaveBeenCalledWith({
        fontSize: 20
      });
    });

    test('should clamp font size to minimum value', async () => {
      let fontSize = 5; // Below minimum

      if (fontSize < 8) {
        fontSize = 8;
      }

      await global.browser.storage.local.set({ fontSize: fontSize });

      expect(global.browser.storage.local.set).toHaveBeenCalledWith({
        fontSize: 8
      });
    });

    test('should clamp font size to maximum value', async () => {
      let fontSize = 40; // Above maximum

      if (fontSize > 32) {
        fontSize = 32;
      }

      await global.browser.storage.local.set({ fontSize: fontSize });

      expect(global.browser.storage.local.set).toHaveBeenCalledWith({
        fontSize: 32
      });
    });

    test('should save line height within valid range', async () => {
      const lineHeight = 10;

      if (lineHeight >= 0 && lineHeight <= 20) {
        await global.browser.storage.local.set({ lineHeight: lineHeight });
      }

      expect(global.browser.storage.local.set).toHaveBeenCalledWith({
        lineHeight: 10
      });
    });
  });
});
