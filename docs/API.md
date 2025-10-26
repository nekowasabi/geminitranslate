# API仕様書

## 概要
このドキュメントでは、DoganayLab API Translate App v3.0の内部API仕様と外部API連携について説明します。

## 目次
- [OpenRouter API連携](#openrouter-api連携)
- [内部メッセージングAPI](#内部メッセージングapi)
- [ストレージAPI](#ストレージapi)
- [翻訳エンジンAPI](#翻訳エンジンapi)

---

## OpenRouter API連携

### エンドポイント
```
POST https://openrouter.ai/api/v1/chat/completions
```

### 認証
```typescript
Headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://github.com/doganaylab/geminitranslate',
  'X-Title': 'DoganayLab API Translate'
}
```

### リクエスト形式
```typescript
interface OpenRouterRequest {
  model: string;           // e.g., "google/gemini-2.0-flash-exp:free"
  messages: Array<{
    role: "user" | "system";
    content: string;
  }>;
  max_tokens?: number;     // デフォルト: 1000
  temperature?: number;    // デフォルト: 0.3
  provider?: {
    order: string[];       // e.g., ["DeepInfra", "Together"]
  };
}
```

### レスポンス形式
```typescript
interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      content: string;     // 翻訳結果（改行区切り）
      role: "assistant";
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### プロンプト形式
```typescript
const systemPrompt = `You are a professional translator. Translate the following texts to ${targetLanguage}.
Return only the translated texts, one per line, in the same order.
Do not include explanations, original texts, or line numbers.`;

const userPrompt = texts.map((text, i) => `${i + 1}. ${text}`).join('\n');
```

**例:**
```
System: You are a professional translator. Translate the following texts to Japanese...
User:
1. Hello
2. World
3. How are you?

Response:
こんにちは
世界
お元気ですか？
```

### エラーハンドリング
| ステータスコード | 説明 | 対応 |
|-----------------|------|------|
| 200 | 成功 | 翻訳結果を返す |
| 401 | API key無効 | `ApiError('Invalid API key')` をthrow |
| 429 | レート制限 | Exponential backoffでリトライ（最大3回） |
| 500 | サーバーエラー | リトライ（最大3回） |
| Timeout (30秒) | タイムアウト | `TimeoutError` をthrow |

### リトライ戦略
```typescript
// Exponential backoff
const delays = [1000, 2000, 4000]; // ms
for (let i = 0; i < maxRetries; i++) {
  try {
    return await apiCall();
  } catch (error) {
    if (i === maxRetries - 1) throw error;
    await sleep(delays[i]);
  }
}
```

### キャッシュ戦略
```typescript
// キャッシュキー
const cacheKey = `translation:${text}:${targetLanguage}`;

// TTL (Time To Live)
const TTL = {
  memory: Infinity,        // セッション中
  session: Infinity,       // タブ閉じるまで
  local: 7 * 24 * 60 * 60 * 1000  // 7日間
};

// 検索順序
1. Memory Cache (LRU, max 1000 entries)
2. Session Storage (max ~5MB)
3. Local Storage (max ~10MB)
4. API呼び出し → 3層全てにキャッシュ
```

---

## 内部メッセージングAPI

### MessageBus API
型安全なメッセージング抽象化レイヤー

#### メッセージタイプ
```typescript
type MessageType =
  | 'TRANSLATE_PAGE'
  | 'TRANSLATE_SELECTION'
  | 'TRANSLATE_CLIPBOARD'
  | 'RESET_PAGE'
  | 'GET_STATUS'
  | 'CLEAR_CACHE'
  | 'TEST_CONNECTION';
```

#### リクエスト/レスポンス仕様

##### 1. TRANSLATE_PAGE
**リクエスト:**
```typescript
{
  type: 'TRANSLATE_PAGE',
  payload: {
    targetLanguage: string;  // e.g., "ja"
  }
}
```

**レスポンス:**
```typescript
{
  success: boolean;
  translatedCount: number;
  cacheHitRate: number;
  error?: string;
}
```

##### 2. TRANSLATE_SELECTION
**リクエスト:**
```typescript
{
  type: 'TRANSLATE_SELECTION',
  payload: {
    text: string;
    targetLanguage: string;
  }
}
```

**レスポンス:**
```typescript
{
  success: boolean;
  translatedText: string;
  error?: string;
}
```

##### 3. TRANSLATE_CLIPBOARD
**リクエスト:**
```typescript
{
  type: 'TRANSLATE_CLIPBOARD',
  payload: {
    targetLanguage: string;
  }
}
```

**レスポンス:**
```typescript
{
  success: boolean;
  originalText: string;
  translatedText: string;
  error?: string;
}
```

##### 4. RESET_PAGE
**リクエスト:**
```typescript
{
  type: 'RESET_PAGE',
  payload: {}
}
```

**レスポンス:**
```typescript
{
  success: boolean;
  restoredCount: number;
  error?: string;
}
```

##### 5. GET_STATUS
**リクエスト:**
```typescript
{
  type: 'GET_STATUS',
  payload: {}
}
```

**レスポンス:**
```typescript
{
  isTranslating: boolean;
  progress: number;        // 0-100
  translatedCount: number;
  totalCount: number;
  cacheStats: {
    memory: number;
    session: number;
    local: number;
    hitRate: number;
  };
}
```

##### 6. CLEAR_CACHE
**リクエスト:**
```typescript
{
  type: 'CLEAR_CACHE',
  payload: {
    layer?: 'memory' | 'session' | 'local' | 'all';  // デフォルト: 'all'
  }
}
```

**レスポンス:**
```typescript
{
  success: boolean;
  clearedCount: number;
  error?: string;
}
```

##### 7. TEST_CONNECTION
**リクエスト:**
```typescript
{
  type: 'TEST_CONNECTION',
  payload: {
    apiKey: string;
    model: string;
  }
}
```

**レスポンス:**
```typescript
{
  success: boolean;
  latency: number;    // ms
  model: string;
  error?: string;
}
```

---

## ストレージAPI

### StorageManager API
型安全なストレージ管理インターフェース

#### StorageKeys
```typescript
type StorageKeys = keyof StorageData;

interface StorageData {
  openRouterApiKey: string;
  selectedModel: string;
  providerName: string;
  targetLanguage: string;
  fontSize: number;
  lineHeight: number;
  enableDarkMode: boolean;
  cacheEnabled: boolean;
}
```

#### デフォルト値
```typescript
const DEFAULT_STORAGE: StorageData = {
  openRouterApiKey: '',
  selectedModel: 'google/gemini-2.0-flash-exp:free',
  providerName: '',
  targetLanguage: 'ja',
  fontSize: 16,
  lineHeight: 1.5,
  enableDarkMode: false,
  cacheEnabled: true,
};
```

#### メソッド

##### get()
```typescript
/**
 * ストレージからデータを取得（デフォルト値とマージ）
 * @param keys 取得するキーの配列（省略時は全データ取得）
 * @returns Promise<取得したデータ>
 */
async get<K extends StorageKeys>(keys?: K[]): Promise<StorageData>
```

**例:**
```typescript
// 全データ取得
const data = await storageManager.get();

// 特定キーのみ取得
const { apiKey, model } = await storageManager.get(['openRouterApiKey', 'selectedModel']);
```

##### set()
```typescript
/**
 * ストレージにデータを保存
 * @param data 保存するデータ
 */
async set(data: Partial<StorageData>): Promise<void>
```

**例:**
```typescript
await storageManager.set({
  openRouterApiKey: 'sk-...',
  targetLanguage: 'en',
});
```

##### remove()
```typescript
/**
 * ストレージからデータを削除
 * @param keys 削除するキーの配列
 */
async remove(keys: StorageKeys[]): Promise<void>
```

**例:**
```typescript
await storageManager.remove(['openRouterApiKey']);
```

##### clear()
```typescript
/**
 * ストレージをクリア
 */
async clear(): Promise<void>
```

---

## 翻訳エンジンAPI

### TranslationEngine API
3層キャッシュシステムとバッチ処理を備えた翻訳エンジン

#### クラス定義
```typescript
class TranslationEngine {
  private apiClient: OpenRouterClient;
  private memoryCache: LRUCache<string, string>;
  private cacheStats: CacheStats;

  /**
   * エンジンを初期化
   */
  async initialize(): Promise<void>

  /**
   * テキスト配列を翻訳
   * @param texts 翻訳するテキスト配列
   * @param targetLanguage ターゲット言語コード（ISO 639-1）
   * @returns 翻訳結果の配列
   * @throws {ApiError} API keyが未設定またはAPI呼び出し失敗時
   */
  async translateBatch(texts: string[], targetLanguage: string): Promise<string[]>

  /**
   * キャッシュをクリア
   * @param layer クリアする層（省略時は全層）
   */
  async clearCache(layer?: CacheLayer): Promise<void>

  /**
   * キャッシュ統計を取得
   */
  async getCacheStats(): Promise<CacheStats>
}
```

#### CacheStats
```typescript
interface CacheStats {
  memory: number;      // メモリキャッシュのエントリ数
  session: number;     // セッションストレージのエントリ数
  local: number;       // ローカルストレージのエントリ数
  hitRate: number;     // キャッシュヒット率（0-1）
}
```

#### 使用例
```typescript
const engine = new TranslationEngine();
await engine.initialize();

// バッチ翻訳
const translations = await engine.translateBatch(
  ['Hello', 'World', 'How are you?'],
  'ja'
);
// ['こんにちは', '世界', 'お元気ですか？']

// キャッシュ統計
const stats = await engine.getCacheStats();
// { memory: 3, session: 3, local: 3, hitRate: 0.0 }

// キャッシュクリア
await engine.clearCache('memory');
```

---

## パフォーマンス最適化

### バッチ処理
```typescript
const BATCH_CONFIG = {
  size: 50,              // 1バッチあたりのテキスト数
  concurrency: 5,        // 並列実行数
  delayBetweenBatches: 100  // バッチ間の遅延（ms）
};
```

### リトライ設定
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,    // 初回リトライ遅延（ms）
  maxDelay: 4000,        // 最大遅延（ms）
  backoffMultiplier: 2   // 遅延の倍率
};
```

### キャッシュ設定
```typescript
const CACHE_CONFIG = {
  lruMaxSize: 1000,      // LRUキャッシュの最大サイズ
  localStorageTTL: 7 * 24 * 60 * 60 * 1000,  // 7日間
  sessionStorageTTL: Infinity  // タブ閉じるまで
};
```

---

## エラーコード

| エラークラス | 説明 | HTTPステータス |
|-------------|------|---------------|
| `ApiError` | API呼び出しエラー | 401, 429, 500 |
| `NetworkError` | ネットワークエラー | - |
| `TimeoutError` | タイムアウト | - |
| `ValidationError` | バリデーションエラー | - |
| `StorageError` | ストレージエラー | - |

---

## レート制限

### OpenRouter Free Tier
- **リクエスト数**: 200 requests/day（モデルによって異なる）
- **トークン数**: モデルによって異なる
- **同時接続数**: 5 concurrent requests

### アプリケーション側の制限
```typescript
const RATE_LIMIT = {
  maxConcurrentRequests: 5,
  requestsPerSecond: 10,
  backoffOnRateLimit: true
};
```

---

## セキュリティ

### API Key保存
- **保存場所**: `browser.storage.local`（暗号化なし）
- **アクセス制限**: 拡張機能のみアクセス可能
- **送信先**: OpenRouter APIのみ（HTTPS）

### Content Security Policy
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## 変更履歴

### v3.0.0 (2025-01-XX)
- TypeScript完全リライト
- React 18 UI導入
- 3層キャッシュシステム実装
- MessageBus型安全化
- StorageManager型安全化

---

## 参考リンク

- [OpenRouter API Documentation](https://openrouter.ai/docs)
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/reference/)
- [Firefox WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
