# title: Gemini API から OpenRouter API への移行

## 概要
- 現在Gemini APIを直接呼び出している翻訳機能を、OpenRouter APIを経由する形に完全移行することで、複数のAIモデルを柔軟に選択できる翻訳拡張機能を実現する

### goal
- ユーザーは拡張機能の設定画面で好みのAIモデル（Gemini、Claude等）を選択でき、それを使用してWebページや選択テキストを翻訳できる
- 既存の翻訳機能（ページ全体翻訳、選択テキスト翻訳、クリップボード翻訳）は従来通り利用できる

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること

## 開発のゴール
- Gemini APIの直接呼び出しコードを削除し、OpenRouter APIを使用する形に完全移行
- ユーザーがポップアップUIでモデルを選択できる機能を追加
- プロバイダールーティング機能を設定可能にする
- 既存の翻訳品質とユーザー体験を維持する

## 実装仕様

### 現状分析
#### 現在のGemini API実装
- **background.js**:
  - `translateText()` 関数でGemini API (gemini-2.5-flash-lite) を直接呼び出し
  - エンドポイント: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`
  - APIキーはlocalStorageに保存 (`apiKey`)
  - 翻訳キャッシュ機構を実装
- **popup/popup.js**:
  - APIキー、対象言語、フォントサイズ、行間の設定を管理
- **content.js**:
  - ページ翻訳、選択テキスト翻訳、クリップボード翻訳の3機能を提供
  - background.jsに翻訳リクエストを送信

#### 参照実装 (read-aloud-tab)
- **src/shared/services/openrouter.ts**:
  - OpenRouterClientクラスで接続テスト、翻訳、要約機能を実装
  - プロバイダールーティング対応
  - エラーハンドリング（401, 429, 500番台エラー）
- **src/shared/types/ai.ts**:
  - OpenRouterRequest/Response型定義
  - AiSettings型定義
- **src/shared/constants.ts**:
  - API共通エラーメッセージ定義

### 移行方針
1. ✅ モデル選択: ユーザーがポップアップで選択可能
2. ✅ 移行方法: Gemini APIコードを完全削除し、OpenRouterに置き換え
3. ✅ プロバイダールーティング: 使用する（設定可能）
4. ✅ プロンプト: 現在のGemini用プロンプトをそのまま移行

### 翻訳プロンプト仕様
```
Always translate the following text to ${targetLanguage}, regardless of the original language.
Even if the text is in English, translate it to ${targetLanguage}. Never keep the original text as-is.
Keep the same formatting and preserve all special characters.
Only return the translated text without any explanations or additional text.
If you see "[SPLIT]" markers, keep them exactly as they are in your response.
Maintain HTML tags if present.

${text}
```

### Storage構造
#### 変更前
- `apiKey`: Gemini APIキー
- `targetLanguage`: 翻訳先言語
- `fontSize`: フォントサイズ
- `lineHeight`: 行間

#### 変更後
- `openRouterApiKey`: OpenRouter APIキー
- `openRouterModel`: 使用するモデル名（例: "google/gemini-2.0-flash-exp:free"）
- `openRouterProvider`: プロバイダー名（オプション、例: "DeepInfra"）
- `targetLanguage`: 翻訳先言語（維持）
- `fontSize`: フォントサイズ（維持）
- `lineHeight`: 行間（維持）

## 生成AIの学習用コンテキスト
### 参照実装
- /home/takets/repos/read-aloud-tab/src/shared/services/openrouter.ts
  - OpenRouterClientクラスの実装パターン
- /home/takets/repos/read-aloud-tab/src/shared/types/ai.ts
  - 型定義
- /home/takets/repos/read-aloud-tab/src/shared/constants.ts
  - エラーメッセージ定義

### 現在の実装
- background.js
  - translateText()関数の実装
- popup/popup.js
  - 設定管理の実装
- content.js
  - メッセージング処理

## Process

### process1 OpenRouterクライアントの実装
#### sub1 openrouter.jsファイルの作成
@target: openrouter.js
@ref: /home/takets/repos/read-aloud-tab/src/shared/services/openrouter.ts
- [ ] OpenRouterClientクラスを作成
  - コンストラクタ: apiKey, model, provider（オプション）を受け取る
  - endpoint: 'https://openrouter.ai/api/v1/chat/completions'
- [ ] translate()メソッドを実装
  - content: 翻訳するテキスト
  - targetLanguage: 翻訳先言語
  - maxTokens: 最大トークン数（デフォルト4000）
  - 現在のプロンプト形式を維持
  - provider指定がある場合はリクエストに含める
- [ ] testConnection()メソッドを実装
  - 簡単なテストリクエストを送信
  - 成功/失敗を返す
- [ ] _makeRequest()プライベートメソッドを実装
  - Authorization: Bearer ${apiKey}
  - Content-Type: application/json
- [ ] _handleErrorResponse()メソッドを実装
  - 401: 無効なAPIキー
  - 429: レート制限
  - 500番台: サーバーエラー

### process2 background.jsの書き換え
#### sub1 Gemini API関連コードの削除
@target: background.js
- [ ] Gemini APIのエンドポイント呼び出しコードを削除（121行目）
- [ ] Gemini API固有の処理を削除

#### sub2 OpenRouter APIへの移行
@target: background.js
@ref: openrouter.js
- [ ] openrouter.jsをインポート
- [ ] translateText()関数を書き換え
  - storageからopenRouterApiKey, openRouterModel, openRouterProviderを取得
  - OpenRouterClientインスタンスを生成
  - translate()メソッドを呼び出し
  - キャッシュ機構は維持
- [ ] エラーハンドリングを更新
  - OpenRouterのエラー形式に対応

### process3 ポップアップUIの拡張
#### sub1 popup.htmlの更新
@target: popup/popup.html
- [ ] APIキー入力欄のラベルを「OpenRouter API Key」に変更
- [ ] モデル選択ドロップダウンを追加
  - デフォルトオプション:
    - google/gemini-2.0-flash-exp:free（無料、推奨）
    - google/gemini-flash-1.5-8b
    - anthropic/claude-3.5-sonnet
    - カスタムモデル入力オプション
- [ ] プロバイダー設定入力欄を追加（オプション）
  - プレースホルダー: "Optional: DeepInfra, Together, etc."
- [ ] 接続テストボタンを追加
  - ラベル: "Test Connection"

#### sub2 popup.jsの更新
@target: popup/popup.js
- [ ] 設定読み込み処理を更新
  - openRouterApiKey, openRouterModel, openRouterProviderを読み込み
  - 既存のapiKeyがある場合は移行案内を表示
- [ ] 設定保存処理を更新
  - openRouterApiKey, openRouterModel, openRouterProviderを保存
- [ ] モデル選択の変更イベントハンドラを追加
- [ ] プロバイダー入力の変更イベントハンドラを追加
- [ ] 接続テストボタンのイベントハンドラを追加
  - OpenRouterClientのtestConnection()を呼び出し
  - 結果をユーザーに表示

#### sub3 popup.cssの調整（必要に応じて）
@target: popup/popup.css
- [ ] 新規追加したUI要素のスタイルを調整
  - モデル選択ドロップダウン
  - プロバイダー入力欄
  - 接続テストボタン

### process4 content.jsの調整
#### sub1 エラーメッセージの更新
@target: content.js
- [ ] エラーメッセージを確認
  - OpenRouter APIに関連するエラーメッセージに更新（必要に応じて）
  - 基本的にはbackground.jsからのエラーをそのまま表示

### process5 manifest.jsonの更新
@target: manifest.json
- [ ] descriptionを更新
  - "Translate web pages using OpenRouter API" または類似の説明
- [ ] versionを更新（メジャーバージョンアップ推奨: 2.0.0）

### process10 ユニットテスト
#### sub1 OpenRouterクライアントのテスト
- [ ] translate()メソッドのテスト
  - 正常系: 翻訳が成功する
  - 異常系: APIキーが無効
  - 異常系: レート制限
  - 異常系: ネットワークエラー
- [ ] testConnection()メソッドのテスト
  - 正常系: 接続成功
  - 異常系: 接続失敗

#### sub2 統合テスト
- [ ] ページ全体翻訳のテスト
  - 各種モデルで動作確認
- [ ] 選択テキスト翻訳のテスト
  - ポップアップ表示と翻訳結果の確認
- [ ] クリップボード翻訳のテスト
  - クリップボードからの読み取りと翻訳
- [ ] プロバイダールーティングのテスト
  - プロバイダー指定時の動作確認
- [ ] エラーハンドリングのテスト
  - 各種エラー時の挙動確認

### process50 フォローアップ
#### sub1 既存ユーザーへの移行案内
- [ ] 初回起動時の移行案内を実装
  - 既存のapiKeyが存在し、openRouterApiKeyが存在しない場合
  - 「OpenRouter APIへの移行が必要です」というメッセージを表示
  - 設定画面へのリンクを提供

#### sub2 ドキュメント更新
- [ ] README.mdの更新
  - OpenRouter API使用に関する説明
  - 推奨モデルの記載
  - APIキー取得方法へのリンク

### process100 リファクタリング
- [ ] コードの整理
  - 不要なコメントの削除
  - 一貫性のあるコーディングスタイルの確保
- [ ] エラーハンドリングの統一
  - OpenRouter APIのエラーを一元管理

### process200 ドキュメンテーション
- [ ] CHANGELOG.mdの作成/更新
  - v2.0.0: Gemini API → OpenRouter API移行
  - モデル選択機能の追加
  - プロバイダールーティング機能の追加
- [ ] CLAUDE.mdの更新
  - OpenRouter API統合に関する情報を追加
