/**
 * OpenRouterClient のテスト
 * TDD Red-Green-Refactorサイクルに従った実装
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { OpenRouterClient } from '../openrouter.js';

describe('OpenRouterClient', () => {
  let client;
  const mockApiKey = 'test-api-key';
  const mockModel = 'google/gemini-2.0-flash-exp:free';

  beforeEach(() => {
    client = new OpenRouterClient(mockApiKey, mockModel);
    global.fetch = jest.fn();
  });

  describe('translate()', () => {
    test('正常系: 翻訳が成功する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'こんにちは' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.translate('Hello', 'Japanese', 4000);
      expect(result).toBe('こんにちは');

      // fetch呼び出しの検証
      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json'
          }
        })
      );

      // リクエストボディの検証
      const callArgs = global.fetch.mock.calls[0][1];
      const requestBody = JSON.parse(callArgs.body);
      expect(requestBody.model).toBe(mockModel);
      expect(requestBody.max_tokens).toBe(4000);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0].role).toBe('system');
      expect(requestBody.messages[1].role).toBe('user');
      expect(requestBody.messages[1].content).toBe('Hello');
    });

    test('異常系: APIキーが無効（401エラー）', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      await expect(client.translate('Hello', 'Japanese', 4000))
        .rejects.toThrow('無効なAPIキー');
    });

    test('異常系: レート制限（429エラー）', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429
      });

      await expect(client.translate('Hello', 'Japanese', 4000))
        .rejects.toThrow('レート制限');
    });

    test('異常系: サーバーエラー（500エラー）', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(client.translate('Hello', 'Japanese', 4000))
        .rejects.toThrow('サーバーエラー');
    });

    test('プロバイダー指定時: リクエストにproviderが含まれる', async () => {
      const clientWithProvider = new OpenRouterClient(mockApiKey, mockModel, 'DeepInfra');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'translated' } }] })
      });

      await clientWithProvider.translate('Test', 'Japanese', 4000);

      const callArgs = global.fetch.mock.calls[0][1];
      const requestBody = JSON.parse(callArgs.body);
      expect(requestBody.provider).toEqual({ order: ['DeepInfra'] });
    });
  });

  describe('testConnection()', () => {
    test('正常系: 接続成功', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] })
      });

      const result = await client.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('接続に成功しました');
    });

    test('異常系: 接続失敗（401エラー）', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const result = await client.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('無効なAPIキー');
    });

    test('異常系: 接続失敗（500エラー）', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await client.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('サーバーエラー');
    });

    test('異常系: ネットワークエラー', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await client.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('ネットワークエラー');
    });
  });
});
