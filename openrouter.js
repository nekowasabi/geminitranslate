/**
 * OpenRouter API クライアント
 * Gemini API移行用の翻訳クライアント
 *
 * @class OpenRouterClient
 */
export class OpenRouterClient {
  /**
   * コンストラクタ
   * @param {string} apiKey - OpenRouter APIキー
   * @param {string} model - 使用するモデル名（例: "google/gemini-2.0-flash-exp:free"）
   * @param {string} [provider] - プロバイダー名（オプション、例: "DeepInfra"）
   */
  constructor(apiKey, model, provider) {
    this.apiKey = apiKey;
    this.model = model;
    this.provider = provider;
    this.endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  }

  /**
   * テキストを翻訳
   * @param {string} content - 翻訳するテキスト
   * @param {string} targetLanguage - 翻訳先言語（例: "Japanese", "English"）
   * @param {number} maxTokens - 最大トークン数（デフォルト4000）
   * @returns {Promise<string>} 翻訳されたテキスト
   */
  async translate(content, targetLanguage, maxTokens = 4000) {
    try {
      // PLAN.mdの翻訳プロンプト仕様に従ったシステムプロンプト
      const systemPrompt = `Always translate the following text to ${targetLanguage}, regardless of the original language.
Even if the text is in English, translate it to ${targetLanguage}. Never keep the original text as-is.
Keep the same formatting and preserve all special characters.
Only return the translated text without any explanations or additional text.
If you see "[SPLIT]" markers, keep them exactly as they are in your response.
Maintain HTML tags if present.`;

      const request = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content
          }
        ],
        max_tokens: maxTokens,
        ...(this.provider ? { provider: { order: [this.provider] } } : {})
      };

      const response = await this._makeRequest(request);

      if (!response.ok) {
        const errorResult = this._handleErrorResponse(response);
        throw new Error(errorResult.error || '翻訳リクエストに失敗しました');
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('翻訳リクエストに失敗しました');
    }
  }

  /**
   * OpenRouter APIへの接続をテスト
   * @returns {Promise<{success: boolean, message?: string, error?: string}>} 接続テストの結果
   */
  async testConnection() {
    try {
      const request = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.'
          },
          {
            role: 'user',
            content: 'Say "OK" if you can read this.'
          }
        ],
        max_tokens: 10,
        ...(this.provider ? { provider: { order: [this.provider] } } : {})
      };

      const response = await this._makeRequest(request);

      if (response.ok) {
        return {
          success: true,
          message: '接続に成功しました'
        };
      }

      return this._handleErrorResponse(response);
    } catch (error) {
      return {
        success: false,
        error: `ネットワークエラー: ${error instanceof Error ? error.message : '不明なエラー'}`
      };
    }
  }

  /**
   * OpenRouter APIへリクエストを送信（プライベートメソッド）
   * @private
   * @param {object} request - リクエストボディ
   * @returns {Promise<Response>} レスポンス
   */
  async _makeRequest(request) {
    return fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
  }

  /**
   * エラーレスポンスをハンドリング
   * @private
   * @param {Response} response - レスポンス
   * @returns {{success: boolean, error: string}} エラー結果
   */
  _handleErrorResponse(response) {
    const { status } = response;

    switch (status) {
      case 401:
        return {
          success: false,
          error: '無効なAPIキーです'
        };
      case 429:
        return {
          success: false,
          error: 'レート制限に達しました。しばらく待ってから再試行してください'
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          success: false,
          error: 'サーバーエラーが発生しました。後でもう一度お試しください'
        };
      default:
        return {
          success: false,
          error: `不明なエラーが発生しました (ステータスコード: ${status})`
        };
    }
  }
}
