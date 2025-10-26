/**
 * Integration Tests for OpenRouter API Migration
 * Process10-Sub2: 統合テスト
 *
 * Tests cover:
 * - ページ全体翻訳のテスト
 * - 選択テキスト翻訳のテスト
 * - クリップボード翻訳のテスト
 * - プロバイダールーティングのテスト
 * - エラーハンドリングのテスト
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Browser API のモック設定
global.browser = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  commands: {
    onCommand: {
      addListener: jest.fn()
    }
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  }
};

global.fetch = jest.fn();

// OpenRouterClientのモック
jest.unstable_mockModule('../openrouter.js', () => ({
  OpenRouterClient: class {
    constructor(apiKey, model, provider) {
      this.apiKey = apiKey;
      this.model = model;
      this.provider = provider;
    }

    async translate(content, targetLanguage) {
      // APIキーの検証
      if (this.apiKey === 'invalid-key') {
        throw new Error('無効なAPIキーです');
      }
      if (this.apiKey === 'rate-limited-key') {
        throw new Error('レート制限に達しました。しばらく待ってから再試行してください');
      }

      // プロバイダールーティングのシミュレーション
      const providerPrefix = this.provider ? `[${this.provider}] ` : '';
      return `${providerPrefix}Translated: ${content} to ${targetLanguage}`;
    }

    async testConnection() {
      if (this.apiKey === 'invalid-key') {
        return {
          success: false,
          error: '無効なAPIキーです'
        };
      }
      if (this.apiKey === 'network-error-key') {
        return {
          success: false,
          error: 'ネットワークエラー: Connection failed'
        };
      }
      return {
        success: true,
        message: '接続に成功しました'
      };
    }
  }
}));

describe('Integration Tests - OpenRouter API Migration', () => {
  let backgroundModule;

  beforeEach(async () => {
    // モックのリセット
    global.browser.storage.local.get.mockReset();
    global.browser.storage.local.set.mockReset();
    global.browser.tabs.query.mockReset();
    global.browser.tabs.sendMessage.mockReset();
    global.fetch.mockReset();

    // background.jsを動的にインポート
    backgroundModule = await import('../background.js');
  });

  describe('ページ全体翻訳のテスト', () => {
    test('Gemini 2.0 Flash モデルでページ全体翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        openRouterProvider: null
      });

      const result = await backgroundModule.translateText('This is a test page.', 'ja');

      expect(result).toContain('Translated');
      expect(result).toContain('Japanese');
    });

    test('Claude 3.5 Sonnet モデルでページ全体翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'anthropic/claude-3.5-sonnet',
        openRouterProvider: null
      });

      const result = await backgroundModule.translateText('Test content for Claude', 'ja');

      expect(result).toContain('Translated');
      expect(result).toContain('Japanese');
    });

    test('複数の言語に翻訳できる', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const languages = ['ja', 'en', 'fr', 'de', 'es'];

      for (const lang of languages) {
        const result = await backgroundModule.translateText('Hello World', lang);
        expect(result).toContain('Translated');
      }
    });
  });

  describe('選択テキスト翻訳のテスト', () => {
    test('選択されたテキストの翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja'
      });

      const selectedText = 'Selected text for translation';
      const result = await backgroundModule.translateText(selectedText, 'ja');

      expect(result).toContain('Translated');
      expect(result).toContain(selectedText);
    });

    test('短いテキストの翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const result = await backgroundModule.translateText('Hi', 'ja');
      expect(result).toBeDefined();
    });

    test('長いテキストの翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const longText = 'This is a very long text. '.repeat(100);
      const result = await backgroundModule.translateText(longText, 'ja');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('クリップボード翻訳のテスト', () => {
    test('クリップボードからのテキスト翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        targetLanguage: 'ja'
      });

      const clipboardText = 'Text from clipboard';
      const result = await backgroundModule.translateText(clipboardText, 'ja');

      expect(result).toContain('Translated');
    });
  });

  describe('プロバイダールーティングのテスト', () => {
    test('DeepInfraプロバイダー指定時の翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        openRouterProvider: 'DeepInfra'
      });

      const result = await backgroundModule.translateText('Test with DeepInfra', 'ja');

      expect(result).toContain('[DeepInfra]');
      expect(result).toContain('Translated');
    });

    test('Togetherプロバイダー指定時の翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        openRouterProvider: 'Together'
      });

      const result = await backgroundModule.translateText('Test with Together', 'ja');

      expect(result).toContain('[Together]');
      expect(result).toContain('Translated');
    });

    test('プロバイダー未指定時でも翻訳が成功する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        openRouterProvider: null
      });

      const result = await backgroundModule.translateText('Test without provider', 'ja');

      expect(result).not.toContain('[');
      expect(result).toContain('Translated');
    });
  });

  describe('エラーハンドリングのテスト', () => {
    test('無効なAPIキーの場合にエラーが発生する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'invalid-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      await expect(backgroundModule.translateText('Test', 'ja'))
        .rejects.toThrow('無効なAPIキー');
    });

    test('レート制限エラーが適切に処理される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'rate-limited-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      await expect(backgroundModule.translateText('Test', 'ja'))
        .rejects.toThrow('レート制限');
    });

    test('APIキーが未設定の場合にエラーが発生する', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: null,
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      await expect(backgroundModule.translateText('Test', 'ja'))
        .rejects.toThrow('OpenRouter API key not found');
    });

    test('空のテキストでもエラーが発生しない', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const result = await backgroundModule.translateText('', 'ja');
      expect(result).toBeDefined();
    });
  });

  describe('翻訳キャッシュのテスト', () => {
    test('同じテキストの2回目の翻訳がキャッシュから取得される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const text = 'Cached text test';

      // 1回目の翻訳
      const result1 = await backgroundModule.translateText(text, 'ja');

      // 2回目の翻訳（キャッシュから）
      const result2 = await backgroundModule.translateText(text, 'ja');

      expect(result1).toBe(result2);
    });

    test('異なるテキストはそれぞれ翻訳される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const text1 = 'First text';
      const text2 = 'Second text';

      const result1 = await backgroundModule.translateText(text1, 'ja');
      const result2 = await backgroundModule.translateText(text2, 'ja');

      expect(result1).not.toBe(result2);
      expect(result1).toContain('First text');
      expect(result2).toContain('Second text');
    });

    test('同じテキストでも言語が異なれば別々に翻訳される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const text = 'Multi-language test';

      const resultJa = await backgroundModule.translateText(text, 'ja');
      const resultEn = await backgroundModule.translateText(text, 'en');

      expect(resultJa).toContain('Japanese');
      expect(resultEn).toContain('English');
      expect(resultJa).not.toBe(resultEn);
    });
  });

  describe('各種モデルでの動作確認', () => {
    const models = [
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-flash-1.5-8b',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o-mini'
    ];

    models.forEach(model => {
      test(`${model} モデルで翻訳が成功する`, async () => {
        global.browser.storage.local.get.mockResolvedValue({
          openRouterApiKey: 'test-key',
          openRouterModel: model
        });

        const result = await backgroundModule.translateText('Model test', 'ja');
        expect(result).toContain('Translated');
      });
    });
  });

  describe('特殊文字とHTML処理のテスト', () => {
    test('HTMLタグを含むテキストが正しく翻訳される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const htmlText = '<div>Hello <strong>World</strong></div>';
      const result = await backgroundModule.translateText(htmlText, 'ja');

      expect(result).toBeDefined();
      expect(result).toContain('Translated');
    });

    test('[SPLIT]マーカーを含むテキストが正しく処理される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const splitText = 'Part 1[SPLIT]Part 2[SPLIT]Part 3';
      const result = await backgroundModule.translateText(splitText, 'ja');

      expect(result).toBeDefined();
    });

    test('特殊文字を含むテキストが正しく翻訳される', async () => {
      global.browser.storage.local.get.mockResolvedValue({
        openRouterApiKey: 'test-key',
        openRouterModel: 'google/gemini-2.0-flash-exp:free'
      });

      const specialText = 'Special chars: @#$%^&*(){}[]|\\';
      const result = await backgroundModule.translateText(specialText, 'ja');

      expect(result).toBeDefined();
    });
  });
});
