/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OpenRouterClient, ApiError } from '../../../src/background/apiClient';
import StorageManager from '../../../src/shared/storage/StorageManager';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;
  let mockStorage: jest.Mocked<StorageManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    client = new OpenRouterClient();

    // Mock StorageManager
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
      getApiKey: jest.fn(),
      setApiKey: jest.fn(),
    } as unknown as jest.Mocked<StorageManager>;

    // Default storage mock - API key configured
    (mockStorage.get as jest.Mock).mockResolvedValue({
      openRouterApiKey: 'test-api-key',
      openRouterModel: 'google/gemini-2.0-flash-exp:free',
      openRouterProvider: 'Google',
    });

    // Mock global storage
    (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
      const data = {
        openRouterApiKey: 'test-api-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        openRouterProvider: 'Google',
      };
      if (callback) {
        callback(data);
      }
      return Promise.resolve(data);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialize', () => {
    it('should load configuration from storage', async () => {
      await client.initialize();

      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        ['openRouterApiKey', 'openRouterModel', 'openRouterProvider'],
        expect.any(Function)
      );
    });

    it('should use default model when not configured', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback({ openRouterApiKey: 'test-key' });
        }
        return Promise.resolve({ openRouterApiKey: 'test-key' });
      });

      await client.initialize();

      // Test with translate to verify default model is used
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(['Hello'], 'Japanese');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.model).toBe('google/gemini-2.0-flash-exp:free');
    });
  });

  describe('translate', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should throw error when API key is not configured', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback({});
        }
        return Promise.resolve({});
      });

      const clientNoKey = new OpenRouterClient();

      await expect(clientNoKey.translate(['Hello'], 'Japanese')).rejects.toThrow(
        'API key not configured'
      );
    });

    it('should make API request with correct parameters', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは\nさようなら' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(['Hello', 'Goodbye'], 'Japanese');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/doganaylab/geminitranslate',
          },
          body: expect.any(String),
        })
      );

      const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(requestBody.model).toBe('google/gemini-2.0-flash-exp:free');
      expect(requestBody.messages[0].role).toBe('user');
      expect(requestBody.messages[0].content).toContain('Hello');
      expect(requestBody.messages[0].content).toContain('Goodbye');
      expect(requestBody.provider).toEqual({ order: ['Google'] });
    });

    it('should return translated texts', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは\nさようなら' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(['Hello', 'Goodbye'], 'Japanese');

      expect(result).toEqual(['こんにちは', 'さようなら']);
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid API key' },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const translatePromise = client.translate(['Hello'], 'Japanese');

      // Run all timers (retries) and wait for promise to settle
      const [result] = await Promise.allSettled([translatePromise, jest.runAllTimersAsync()]);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ApiError);
      }
    });

    it('should handle rate limit errors', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: jest.fn().mockResolvedValue({
          error: { message: 'Rate limit exceeded' },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const translatePromise = client.translate(['Hello'], 'Japanese');

      // Run all timers (retries) and wait for promise to settle
      const [result] = await Promise.allSettled([translatePromise, jest.runAllTimersAsync()]);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ApiError);
        expect((result.reason as ApiError).isRateLimitError).toBe(true);
      }
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const translatePromise = client.translate(['Hello'], 'Japanese');

      // Run all timers (retries) and wait for promise to settle
      const [result] = await Promise.allSettled([translatePromise, jest.runAllTimersAsync()]);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect((result.reason as Error).message).toBe('Network error');
      }
    });

    it('should not include provider when not configured', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        const data = {
          openRouterApiKey: 'test-api-key',
          openRouterModel: 'google/gemini-2.0-flash-exp:free',
        };
        if (callback) {
          callback(data);
        }
        return Promise.resolve(data);
      });

      const clientNoProvider = new OpenRouterClient();
      await clientNoProvider.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await clientNoProvider.translate(['Hello'], 'Japanese');

      const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(requestBody.provider).toBeUndefined();
    });
  });

  describe('buildPrompt', () => {
    it('should build correct prompt for translation', async () => {
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Bonjour\nAu revoir' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(['Hello', 'Goodbye'], 'French');

      const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      const prompt = requestBody.messages[0].content;

      expect(prompt).toContain('Translate the following texts to French');
      expect(prompt).toContain('Hello');
      expect(prompt).toContain('Goodbye');
    });
  });

  describe('parseResponse', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should parse newline-separated translations', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '  こんにちは  \n  さようなら  \n  ありがとう  ' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(['Hello', 'Goodbye', 'Thank you'], 'Japanese');

      expect(result).toEqual(['こんにちは', 'さようなら', 'ありがとう']);
    });

    it('should handle empty lines in response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは\n\nさようなら' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(['Hello', 'Goodbye'], 'Japanese');

      expect(result).toEqual(['こんにちは', 'さようなら']);
    });

    it('should warn when translation count mismatch', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(['Hello', 'Goodbye'], 'Japanese');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expected 2 translations, got 1')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('testConnection', () => {
    it('should return success when connection is valid', async () => {
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connection successful');
      expect(result.message).toContain('google/gemini-2.0-flash-exp:free');
    });

    it('should return error when API key is invalid', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback({});
        }
        return Promise.resolve({});
      });

      const clientNoKey = new OpenRouterClient();

      const result = await clientNoKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should return error when API key is empty string', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback({ openRouterApiKey: '' });
        }
        return Promise.resolve({ openRouterApiKey: '' });
      });

      const clientEmptyKey = new OpenRouterClient();
      const result = await clientEmptyKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should return error when API key is whitespace only', async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        if (callback) {
          callback({ openRouterApiKey: '   ' });
        }
        return Promise.resolve({ openRouterApiKey: '   ' });
      });

      const clientWhitespaceKey = new OpenRouterClient();
      const result = await clientWhitespaceKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should return error when API request fails', async () => {
      await client.initialize();

      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid API key' },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const promise = client.testConnection();

      // Run all timers (retries)
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });
  });

  describe('testConnectionWithConfig', () => {
    it('should test connection with temporary config without saving', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.testConnectionWithConfig({
        apiKey: 'temp-api-key',
        model: 'google/gemini-1.5-flash',
        provider: 'Google',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connection successful');
      expect(result.message).toContain('google/gemini-1.5-flash');

      // Verify the temporary config was used
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestHeaders = fetchCall[1].headers;
      expect(requestHeaders.Authorization).toBe('Bearer temp-api-key');

      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.model).toBe('google/gemini-1.5-flash');
    });

    it('should return error when temporary API key is empty', async () => {
      const result = await client.testConnectionWithConfig({
        apiKey: '',
        model: 'google/gemini-2.0-flash-exp:free',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should return error when temporary API key is whitespace only', async () => {
      const result = await client.testConnectionWithConfig({
        apiKey: '   ',
        model: 'google/gemini-2.0-flash-exp:free',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should use default model when not specified in temporary config', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.testConnectionWithConfig({
        apiKey: 'temp-api-key',
        model: '', // Empty model
      });

      expect(result.success).toBe(true);

      // Verify default model was used
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.model).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('should restore original config after testing', async () => {
      // Initialize with saved config
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'こんにちは' } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Test with temporary config
      await client.testConnectionWithConfig({
        apiKey: 'temp-api-key',
        model: 'google/gemini-1.5-flash',
      });

      // Clear fetch mock
      (global.fetch as jest.Mock).mockClear();

      // Make another translate call to verify original config is restored
      await client.translate(['Hello'], 'Japanese');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestHeaders = fetchCall[1].headers;
      const requestBody = JSON.parse(fetchCall[1].body);

      // Should use original config from storage
      expect(requestHeaders.Authorization).toBe('Bearer test-api-key');
      expect(requestBody.model).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('should return error when temporary config API request fails', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid API key' },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const promise = client.testConnectionWithConfig({
        apiKey: 'invalid-key',
        model: 'google/gemini-2.0-flash-exp:free',
      });

      // Run all timers (retries)
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });
  });
});
