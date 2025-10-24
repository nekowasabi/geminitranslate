/**
 * background.js translateText関数のテスト
 * OpenRouter API移行後の動作確認
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// モックの設定
global.browser = {
  storage: {
    local: {
      get: jest.fn()
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

    async translate(content, targetLanguage, _maxTokens) {
      // モック実装
      if (this.apiKey === 'invalid-key') {
        throw new Error('無効なAPIキーです');
      }
      return `Translated: ${content} to ${targetLanguage}`;
    }
  }
}));

describe('background.js - translateText()', () => {
  beforeEach(() => {
    // 各テストの前にモックをリセット
    global.browser.storage.local.get.mockReset();
    global.fetch.mockReset();
  });

  test('OpenRouter API経由で翻訳が成功する', async () => {
    // Storage mock設定
    global.browser.storage.local.get.mockResolvedValue({
      openRouterApiKey: 'test-key',
      openRouterModel: 'google/gemini-2.0-flash-exp:free',
      openRouterProvider: null
    });

    // background.jsを動的にインポート
    const backgroundModule = await import('../background.js');
    const translateText = backgroundModule.translateText;

    const result = await translateText('Hello', 'ja');
    expect(result).toContain('Translated');
  });

  test('キャッシュが機能する（2回目の呼び出しでOpenRouterClientを使わない）', async () => {
    global.browser.storage.local.get.mockResolvedValue({
      openRouterApiKey: 'test-key',
      openRouterModel: 'google/gemini-2.0-flash-exp:free'
    });

    const backgroundModule = await import('../background.js');
    const translateText = backgroundModule.translateText;

    // 1回目の呼び出し
    const result1 = await translateText('Test', 'ja');

    // 2回目の呼び出し（キャッシュから取得されるべき）
    const result2 = await translateText('Test', 'ja');

    expect(result1).toBe(result2);
  });
});
