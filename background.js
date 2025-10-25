/**
 * OpenRouter API クライアント
 * Gemini API移行用の翻訳クライアント
 *
 * @class OpenRouterClient
 */
class OpenRouterClient {
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

// Cache for translations to reduce API calls
const translationCache = new Map();

// Command handlers
async function handleTranslatePage() {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]) {
		const result = await browser.storage.local.get(["targetLanguage", "fontSize", "lineHeight"]);
		const targetLanguage = result.targetLanguage || "ja";
		const fontSize = result.fontSize || 16;
		const lineHeight = result.lineHeight || 4;

		browser.tabs
			.sendMessage(tabs[0].id, {
				action: "translate",
				targetLanguage: targetLanguage,
				fontSize: fontSize,
				lineHeight: lineHeight,
			})
			.catch((error) => {
				console.error("Error sending translation message:", error);
			});
	}
}

async function handleTranslateClipboard() {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]) {
		console.log("Sending clipboard translation command");
		browser.tabs
			.sendMessage(tabs[0].id, {
				action: "translate-clipboard",
			})
			.catch((error) => {
				console.error("Error sending clipboard translation message:", error);
			});
	}
}

async function handleTranslateSelection() {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]) {
		const result = await browser.storage.local.get("targetLanguage");
		const targetLanguage = result.targetLanguage || "ja";

		browser.tabs
			.sendMessage(tabs[0].id, {
				action: "translate-selection",
				targetLanguage: targetLanguage,
			})
			.catch((error) => {
				console.error("Error sending selection translation message:", error);
			});
	}
}

// Listen for keyboard shortcut command
browser.commands.onCommand.addListener(async (command) => {
	console.log("Command received:", command);

	switch (command) {
		case "translate-page":
			await handleTranslatePage();
			break;
		case "translate-clipboard":
			await handleTranslateClipboard();
			break;
		case "translate-selection":
			await handleTranslateSelection();
			break;
		default:
			console.warn("Unknown command:", command);
	}
});

// Listen for messages from content script and popup
browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	if (message.action === "translateText") {
		return translateText(message.text, message.targetLanguage);
	} else if (message.action === "newContentDetected") {
		// Just acknowledge the message
		return Promise.resolve({ status: "acknowledged" });
	} else if (message.action === "testConnection") {
		// Handle test connection request from popup
		return testConnection(message.apiKey, message.model, message.provider);
	}
	return false;
});

// Function to test OpenRouter API connection
async function testConnection(apiKey, model, provider) {
	try {
		const client = new OpenRouterClient(apiKey, model, provider);
		const result = await client.testConnection();
		return result;
	} catch (error) {
		return {
			success: false,
			error: `Test connection failed: ${error.message}`
		};
	}
}

// Function to translate text using OpenRouter API
async function translateText(text, targetLanguage) {
	try {
		// Check cache first
		const cacheKey = `${text}_${targetLanguage}`;
		if (translationCache.has(cacheKey)) {
			console.log("Using cached translation");
			return Promise.resolve(translationCache.get(cacheKey));
		}

		// Get API settings from storage
		const result = await browser.storage.local.get([
			"openRouterApiKey",
			"openRouterModel",
			"openRouterProvider"
		]);

		const apiKey = result.openRouterApiKey;
		const model = result.openRouterModel || "google/gemini-2.0-flash-exp:free";
		const provider = result.openRouterProvider || null;

		if (!apiKey) {
			throw new Error("OpenRouter API key not found");
		}

		console.log(
			`Sending translation request to OpenRouter API (text length: ${text.length})`,
		);

		// Create OpenRouter client
		const client = new OpenRouterClient(apiKey, model, provider);

		// Translate using OpenRouter
		const translatedText = await client.translate(
			text,
			getLanguageName(targetLanguage),
			4000
		);

		// Store in cache (limit cache size to prevent memory issues)
		if (translationCache.size > 200) {
			// Remove oldest entries (20% of cache)
			const keysToRemove = Math.floor(translationCache.size * 0.2);
			const keys = Array.from(translationCache.keys());
			for (let i = 0; i < keysToRemove; i++) {
				translationCache.delete(keys[i]);
			}
		}
		translationCache.set(cacheKey, translatedText);

		console.log("Translation successful");
		return translatedText;
	} catch (error) {
		console.error("Translation error:", error);
		return Promise.reject(error);
	}
}

// Helper function to get language name from code
function getLanguageName(langCode) {
	const languages = {
		tr: "Turkish",
		en: "English",
		fr: "French",
		de: "German",
		es: "Spanish",
		it: "Italian",
		ru: "Russian",
		zh: "Chinese",
		ja: "Japanese",
		ko: "Korean",
		ar: "Arabic",
		pt: "Portuguese",
		nl: "Dutch",
		pl: "Polish",
		sv: "Swedish",
		da: "Danish",
		fi: "Finnish",
		no: "Norwegian",
		cs: "Czech",
		hu: "Hungarian",
		el: "Greek",
		he: "Hebrew",
		th: "Thai",
		vi: "Vietnamese",
		id: "Indonesian",
		ms: "Malay",
		hi: "Hindi",
		bn: "Bengali",
		fa: "Persian",
		uk: "Ukrainian",
		ro: "Romanian",
		bg: "Bulgarian",
	};

	return languages[langCode] || "Turkish";
}
