# title: DoganayLab API Translate App v3.0 - TypeScript + React リアーキテクチャ

## 概要
- 既存のPlain JavaScript実装をTypeScript + React + Webpack 5へフルリアーキテクチャすることで、保守性・拡張性・型安全性を向上させた翻訳拡張機能を実現する
- Chrome (Manifest V3) と Firefox (Manifest V2) の両ブラウザに対応し、単一コードベースで自動切替を実現
- OpenRouter APIを活用したページ翻訳・選択テキスト翻訳・クリップボード翻訳機能を提供

### goal
- ユーザーが任意のWebページでAlt+Wを押すだけで、ページ全体を目的言語に翻訳できる
- テキストを選択してAlt+Yを押すと、選択範囲のみを翻訳してフローティングUIで表示
- Alt+Cでクリップボードの内容を翻訳
- モダンなReact UIで設定を簡単に管理
- Chrome/Firefoxどちらでも同じ体験を提供

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- `ARCHITECTURE.md` の設計方針に従うこと
- 一時ファイルは `tmp/claude/` ディレクトリを使用すること

## 開発のゴール
- **フル実装**: 全機能 + テスト + ドキュメントを完備
- **TypeScript 100%移行**: 型安全性の確保
- **テストカバレッジ80%以上**: Jest + React Testing Library
- **クロスブラウザ対応**: Webpack自動切替によるChrome/Firefox両対応
- **2ヶ月での段階的実装**: 余裕を持った開発スケジュール

## 実装仕様

### 前提条件
- **既存実装**: Firefox (Manifest V2) は完全動作中、Chrome (Manifest V3) は未動作
- **ビルドツール**: Webpack 5 を使用（read-aloud-tab実績あり）
- **技術スタック**: TypeScript 5.x, React 18, Tailwind CSS, Jest + RTL
- **既存依存関係**: React, TypeScript, Jest, Tailwind は package.json に導入済み

### アーキテクチャ概要
```
├── Background Layer (Service Worker/Background Script)
│   ├── Translation Engine (翻訳エンジン本体)
│   ├── OpenRouter API Client
│   └── Message/Command Handler
├── Content Layer (DOM操作)
│   ├── DOM Manipulator
│   ├── Selection Handler
│   └── Floating UI
├── UI Layer (React)
│   ├── Popup UI (クイック翻訳)
│   └── Options UI (詳細設定)
└── Shared Layer (共通基盤)
    ├── BrowserAdapter (Chrome/Firefox API統一)
    ├── StorageManager (型安全Storage)
    └── MessageBus (メッセージング抽象化)
```

## 生成AIの学習用コンテキスト

### アーキテクチャ設計書
- `ARCHITECTURE.md`
  - 全体設計、コンポーネント仕様、データフロー、クロスブラウザ戦略を参照

### 既存実装（参考用）
- `background.js` (Firefox動作中の実装)
- `content.js` (Firefox動作中の実装)
- `popup/popup.js` (既存Popup実装)
- `manifest.json` (現行Manifest V2)

### ビルド設定
- `package.json` (既存依存関係確認)
- `jest.config.js` (テスト設定)
- `eslint.config.js` (Lint設定)

## Process

### process0: 基盤整備 (Week 1-2)
#### sub0.1: プロジェクト構造整備
@target: プロジェクトルート
- [x] `src/` ディレクトリ構造作成
  - `src/background/`, `src/content/`, `src/popup/`, `src/options/`, `src/shared/`
- [x] 既存JSファイルを `src/legacy/` に退避（参照用として保持）
- [x] `public/` ディレクトリ作成
  - `manifest.v2.json`, `manifest.v3.json`, `icons/`, `popup.html`, `options.html`

#### sub0.2: Webpack 5環境構築
@target: `webpack/webpack.common.js`, `webpack/webpack.chrome.js`, `webpack/webpack.firefox.js`
@ref: read-aloud-tab の Webpack 設定（参考）
- [x] Webpack関連パッケージインストール
  - `webpack`, `webpack-cli`, `webpack-merge`, `ts-loader`
  - `copy-webpack-plugin`, `html-webpack-plugin`
  - `css-loader`, `style-loader`, `postcss-loader`
- [x] 共通設定作成 (`webpack.common.js`)
  - TypeScript loader設定
  - CSS/Tailwind loader設定
  - Path alias設定 (`@/`, `@shared/`, `@background/`, `@content/`)
- [x] Chrome専用設定 (`webpack.chrome.js`)
  - Service Worker用エントリポイント
  - manifest.v3.json コピー
  - offscreen.html コピー
  - 出力先: `dist-chrome/`
- [x] Firefox専用設定 (`webpack.firefox.js`)
  - Background Script用エントリポイント
  - manifest.v2.json コピー
  - 出力先: `dist-firefox/`
- [x] package.json スクリプト追加
  - `build:chrome`, `build:firefox`, `build:all`
  - `dev:chrome`, `dev:firefox` (watch mode)

#### sub0.3: TypeScript環境設定
@target: `tsconfig.json`
- [x] tsconfig.json 作成
  - `strict: true`, `target: ES2020`, `module: ESNext`
  - Path alias設定（Webpackと同期）
  - `include: ["src/**/*"]`, `exclude: ["node_modules", "dist-*"]`
- [x] 型定義ファイル作成
  - `src/types/chrome.d.ts` (Chrome API型定義)
  - `src/types/browser.d.ts` (Firefox API型定義)
  - `src/shared/types/index.ts` (共通型定義)

#### sub0.4: Manifest準備
@target: `public/manifest.v2.json`, `public/manifest.v3.json`
@ref: `manifest.json` (既存), `ARCHITECTURE.md` (仕様)
- [x] manifest.v2.json作成（Firefox用）
  - 既存manifest.jsonベース
  - `browser_specific_settings` 設定
  - `background.scripts: ["background.js"]`
  - `browser_action` 設定
- [x] manifest.v3.json作成（Chrome用）
  - `manifest_version: 3`
  - `background.service_worker: "background.js"`
  - `action` 設定（browser_actionから変更）
  - `host_permissions` 設定
  - offscreen API権限追加
- [x] アイコン、HTML準備
  - `public/popup.html`, `public/options.html`
  - `public/offscreen.html` (Chrome専用)
  - `public/icons/` コピー

**検証基準**:
- [x] `npm run build:chrome` が成功し、`dist-chrome/manifest.json` がV3
- [x] `npm run build:firefox` が成功し、`dist-firefox/manifest.json` がV2
- [x] 両ディストリビューションに必要なファイルが全て生成

---

### process1: Shared Layer実装 (Week 3-4)

#### sub1.1: BrowserAdapter実装
@target: `src/shared/adapters/BrowserAdapter.ts`
@ref: `ARCHITECTURE.md` (L1095-L1180)
- [x] BrowserAdapter クラス作成
  - Chrome/Firefox API判定ロジック
  - `storage` プロパティ（get, set, remove）
  - `runtime` プロパティ（sendMessage, onMessage, getManifest, openOptionsPage）
  - `tabs` プロパティ（query, sendMessage）
  - `commands` プロパティ（onCommand）
  - `isChrome`, `isFirefox`, `manifestVersion` プロパティ
- [x] Promise化されたAPI提供
  - callback形式をPromise化
  - 型安全なレスポンス定義

#### sub1.2: StorageManager実装
@target: `src/shared/storage/StorageManager.ts`, `src/shared/storage/types.ts`
@ref: `ARCHITECTURE.md` (L216-L217)
- [x] Storage型定義作成 (`types.ts`)
  - `StorageKeys`, `StorageData` 型定義
  - デフォルト値定義
- [x] StorageManager クラス作成
  - `get<T>(keys)` メソッド（型安全）
  - `set(data)` メソッド
  - `remove(keys)` メソッド
  - デフォルト値自動マージ
- [ ] マイグレーション機能
  - `migrate()` メソッド
  - V2→V3スキーマ変換

#### sub1.3: MessageBus実装
@target: `src/shared/messages/MessageBus.ts`, `src/shared/messages/types.ts`
@ref: `ARCHITECTURE.md` (L218-L220)
- [x] メッセージ型定義作成 (`types.ts`)
  - `MessageType` enum定義
  - 各メッセージのペイロード型定義
- [x] MessageBus クラス作成
  - `send<T>(message)` メソッド（Promise化）
  - `sendToTab<T>(tabId, message)` メソッド
  - `listen(callback, filter?)` メソッド
  - `unlisten(listener)` メソッド
  - 型安全なメッセージルーティング

#### sub1.4: Utils実装
@target: `src/shared/utils/logger.ts`, `src/shared/utils/retry.ts`, `src/shared/utils/languageDetector.ts`
@ref: `ARCHITECTURE.md` (L622, L1043-L1074)
- [x] logger.ts作成
  - `log`, `warn`, `error` メソッド
  - 環境別出力制御（dev/prod）
- [x] retry.ts作成
  - `retry<T>(fn, options)` 関数
  - Exponential backoff実装
  - リトライ回数制御
- [x] languageDetector.ts作成
  - `detectLanguage(text)` 関数
  - ブラウザ言語取得

#### sub1.5: Constants定義
@target: `src/shared/constants/languages.ts`, `src/shared/constants/models.ts`, `src/shared/constants/config.ts`
@ref: `ARCHITECTURE.md` (L225-L228)
- [x] languages.ts作成
  - サポート言語リスト定義
  - 言語コード→言語名マッピング
- [x] models.ts作成
  - OpenRouter対応モデルリスト
  - モデル設定（デフォルトモデル等）
- [x] config.ts作成
  - API_ENDPOINT定義
  - CONCURRENCY_LIMIT定義
  - CACHE_TTL定義

#### sub1.6: Shared Layerテスト
@target: `tests/unit/shared/`
@ref: `ARCHITECTURE.md` (L1510-L1611)
- [x] BrowserAdapter.test.ts作成
  - Chrome/Firefox判定テスト
  - Storage API ラッパーテスト
- [x] StorageManager.test.ts作成
  - get/set/removeテスト
  - デフォルト値マージテスト
- [x] retry.test.ts作成
  - リトライロジックテスト
  - Exponential backoffテスト

**検証基準**:
- [x] `npm test -- shared` が全てパス
- [x] テストカバレッジ80%以上
- [x] Chrome/Firefox両方で import が成功

---

### process2: Background Layer実装 (Week 5-6)

#### sub2.1: OpenRouter APIクライアント
@target: `src/background/apiClient.ts`
@ref: `ARCHITECTURE.md` (L619-L706), `background.js` (既存実装)
- [x] OpenRouterClient クラス作成
  - `initialize()` メソッド（設定読み込み）
  - `translate(texts[], targetLanguage)` メソッド
  - `buildPrompt()` メソッド
  - `parseResponse()` メソッド
  - `testConnection()` メソッド
- [x] エラーハンドリング
  - API キー未設定エラー
  - HTTP エラー処理
  - レート制限対応

#### sub2.2: TranslationEngine実装
@target: `src/background/translationEngine.ts`
@ref: `ARCHITECTURE.md` (L546-L609), `background.js` (既存実装)
- [x] TranslationEngine クラス作成
  - `translateBatch(texts[], targetLanguage)` メソッド
  - 3層キャッシュ管理（Memory/Session/Local）
  - `clearCache()` メソッド
- [x] バッチ処理実装
  - BATCH_SIZE = 10
  - キャッシュチェック→未キャッシュのみ翻訳
- [x] リトライロジック統合
  - `retry()` ユーティリティ使用
  - maxRetries: 3, exponential backoff

#### sub2.3: MessageHandler実装
@target: `src/background/messageHandler.ts`
@ref: `ARCHITECTURE.md` (L176, L472-L507)
- [x] MessageHandler クラス作成
  - `handle(message, sender, sendResponse)` メソッド
  - アクション別ルーティング
    - `translate`: ページ翻訳
    - `translateSelection`: 選択翻訳
    - `translateClipboard`: クリップボード翻訳
    - `requestTranslation`: 翻訳リクエスト
- [x] TranslationEngine と連携

#### sub2.4: CommandHandler実装
@target: `src/background/commandHandler.ts`
@ref: `ARCHITECTURE.md` (L176, L496-L499)
- [x] CommandHandler クラス作成
  - `handle(command)` メソッド
  - コマンド別処理
    - `translate-page`: Alt+W
    - `translate-selection`: Alt+Y
    - `translate-clipboard`: Alt+C
- [x] Content Scriptへのメッセージ送信

#### sub2.5: Chrome Service Worker対応
@target: `src/background/service.ts`, `src/background/keepAlive.ts`, `public/offscreen.html`
@ref: `ARCHITECTURE.md` (L471-L507, L1186-L1244)
- [x] service.ts作成（Chrome用エントリポイント）
  - BackgroundService クラス
  - MessageHandler, CommandHandler, KeepAlive 統合
  - `chrome.runtime.onMessage` リスナー設定
  - `chrome.commands.onCommand` リスナー設定
- [x] keepAlive.ts作成
  - KeepAlive クラス
  - Offscreen Document作成
  - 20秒毎のping処理
- [x] offscreen.html作成
  - Keep-alive用の空HTML
  - Service Worker接続維持スクリプト

#### sub2.6: Firefox Background Script
@target: `src/background/background.ts`
@ref: `ARCHITECTURE.md` (L509-L537)
- [x] background.ts作成（Firefox用エントリポイント）
  - BackgroundScript クラス
  - MessageHandler, CommandHandler 統合
  - `browser.runtime.onMessage` リスナー設定
  - `browser.commands.onCommand` リスナー設定
  - Keep-Alive不要（Persistent Background）

#### sub2.7: Background Layerテスト
@target: `tests/unit/background/`
@ref: `ARCHITECTURE.md` (L1510-L1550)
- [x] apiClient.test.ts作成
  - translate() テスト
  - エラーハンドリングテスト
  - testConnection() テスト
- [x] translationEngine.test.ts作成
  - キャッシュ動作テスト
  - バッチ処理テスト
  - リトライテスト
- [x] messageHandler.test.ts作成
  - ルーティングテスト
  - 各アクション処理テスト

**検証基準**:
- [x] `npm test -- background` が全てパス
- [x] OpenRouter API との通信成功
- [x] キャッシュが正常動作
- [x] Chrome/Firefoxでビルド成功

---

### process3: Content Layer実装 (Week 7-8)

#### sub3.1: DOMManipulator実装
@target: `src/content/domManipulator.ts`
@ref: `ARCHITECTURE.md` (L809-L863), `content.js` (既存実装)
- [x] DOMManipulator クラス作成
  - `extractTextNodes()` メソッド
    - TreeWalker使用
    - SCRIPT/STYLE/NOSCRIPT/IFRAME除外
    - 空テキスト除外
  - `applyTranslations(nodes[], translations[])` メソッド
  - `reset()` メソッド（元テキストに戻す）
  - WeakMapで元テキスト保持

#### sub3.2: SelectionHandler実装
@target: `src/content/selectionHandler.ts`
@ref: `ARCHITECTURE.md` (L182, L719)
- [x] SelectionHandler クラス作成
  - `enable()` メソッド（選択イベントリスナー設定）
  - `translateCurrent(targetLanguage)` メソッド
  - `getSelection()` ラッパー
- [x] Floating UI と連携

#### sub3.3: ClipboardHandler実装
@target: `src/content/clipboardHandler.ts`
@ref: `ARCHITECTURE.md` (L183, L720)
- [x] ClipboardHandler クラス作成
  - `read()` メソッド（clipboard API使用）
  - `showTranslation(translation)` メソッド
- [x] 翻訳結果表示UI

#### sub3.4: MutationObserver実装
@target: `src/content/mutationObserver.ts`
@ref: `ARCHITECTURE.md` (L184, L749-L750)
- [x] MutationObserverManager クラス作成
  - `observe(target)` メソッド
  - 動的コンテンツ検出
  - 自動翻訳適用

#### sub3.5: FloatingUI実装
@target: `src/content/floatingUI.ts`
@ref: `ARCHITECTURE.md` (L192, L350, L418-L420)
- [x] FloatingUI クラス作成
  - `show(translation, position)` メソッド
  - `hide()` メソッド
  - コピーボタン実装
  - ダークモード対応
  - ポジショニングロジック

#### sub3.6: Content Script統合
@target: `src/content/index.ts`
@ref: `ARCHITECTURE.md` (L717-L806), `content.js` (既存実装)
- [x] ContentScript クラス作成
  - 全コンポーネント初期化
  - メッセージリスナー設定
  - アクション別処理
    - `translate`: ページ翻訳
    - `translateSelection`: 選択翻訳
    - `translateClipboard`: クリップボード翻訳
    - `reset`: リセット

#### sub3.7: Content Layerテスト
@target: `tests/unit/content/`
@ref: `ARCHITECTURE.md` (L1553-L1610)
- [x] domManipulator.test.ts作成
  - extractTextNodes() テスト
  - applyTranslations() テスト
  - reset() テスト
- [x] selectionHandler.test.ts作成
  - 選択検出テスト
  - 翻訳実行テスト
- [x] floatingUI.test.ts作成
  - 表示/非表示テスト
  - ポジショニングテスト

**検証基準**:
- [x] `npm test -- content` が全てパス
- [x] Wikipedia等でページ翻訳成功
- [x] 選択翻訳動作
- [x] クリップボード翻訳動作

---

### process4: UI Layer実装（React化） (Week 9-10)

#### sub4.1: Popup UI実装
@target: `src/popup/`, `public/popup.html`
@ref: `ARCHITECTURE.md` (L866-L985), `popup/popup.js` (既存実装)
- [x] ディレクトリ構造作成
  - `src/popup/index.tsx`, `App.tsx`
  - `src/popup/components/` (QuickTranslate, LanguageSelector, StatusIndicator, ApiKeyWarning)
  - `src/popup/hooks/` (useTranslation, useSettings)
- [x] App.tsx作成
  - メインレイアウト
  - コンポーネント統合
  - Context API で設定管理
- [x] QuickTranslate.tsx作成
  - Translate Pageボタン
  - Reset to Originalボタン
  - ボタン無効化ロジック
- [x] LanguageSelector.tsx作成
  - 言語ドロップダウン
  - 選択言語の保存
- [x] StatusIndicator.tsx作成
  - 翻訳状態表示（idle/translating/success/error）
  - プログレス表示
- [x] ApiKeyWarning.tsx作成
  - API キー未設定警告バナー
- [x] useTranslation.ts作成
  - `translate()` 関数
  - `reset()` 関数
  - ステート管理
- [x] useSettings.ts作成
  - 設定読み込み
  - 設定更新
- [x] popup.html作成
  - Reactマウント用div
  - Webpack HtmlWebpackPlugin連携

#### sub4.2: Options UI実装
@target: `src/options/`, `public/options.html`
@ref: `ARCHITECTURE.md` (L200-L210)
- [x] ディレクトリ構造作成
  - `src/options/index.tsx`, `App.tsx`
  - `src/options/components/` (ApiSettings, ModelSelector, LanguageSettings, AppearanceSettings, ConnectionTest)
  - `src/options/hooks/` (useSettings)
- [x] App.tsx作成
  - タブレイアウト
  - セクション分割
- [x] ApiSettings.tsx作成
  - API キー入力フィールド
  - 保存ボタン
  - セキュリティ注意書き
- [x] ModelSelector.tsx作成
  - モデル選択ドロップダウン
  - Provider選択（Optional）
- [x] LanguageSettings.tsx作成
  - ターゲット言語選択
  - フォントサイズ調整
  - 行高調整
- [x] AppearanceSettings.tsx作成
  - UI設定
  - ダークモード切替
- [x] ConnectionTest.tsx作成
  - テスト翻訳実行ボタン
  - 接続結果表示
- [x] options.html作成
  - Reactマウント用div

#### sub4.3: HTML/CSS統合
@target: `src/styles/globals.css`, `tailwind.config.js`
@ref: `ARCHITECTURE.md` (L234-L236)
- [x] tailwind.config.js作成
  - content設定（src/**/*.tsx）
  - カスタムテーマ設定
  - 拡張機能用カラーパレット
- [x] globals.css作成
  - Tailwind directives
  - カスタムスタイル
  - ダークモード対応
- [x] Webpack CSS loader設定確認

#### sub4.4: UI Layerテスト
@target: `tests/unit/popup/`, `tests/unit/options/`
@ref: `ARCHITECTURE.md` (L1510-L1611)
- [x] React Testing Library設定
- [x] QuickTranslate.test.tsx作成
  - ボタンクリックテスト
  - 無効化状態テスト
- [x] LanguageSelector.test.tsx作成
  - 言語選択テスト
  - 保存処理テスト
- [x] useTranslation.test.ts作成
  - translate() テスト
  - reset() テスト
  - ステート変化テスト

**検証基準**:
- [x] `npm test -- popup` が全てパス
- [x] `npm test -- options` が全てパス
- [x] Popup/Optionsが正常表示
- [x] 設定変更が正常動作
- [x] Tailwindスタイルが正しく適用

---

### process5: 統合・最適化・ドキュメント (Week 11-12)

#### sub5.1: 統合テスト
@target: `tests/integration/`
@ref: `ARCHITECTURE.md` (L1613-L1667)
- [x] translation-flow.test.ts作成
  - ページ翻訳フロー全体テスト
  - Background→Content→DOM更新の一連の流れ
- [x] settings-sync.test.ts作成
  - Popup/Options間の設定同期テスト
  - Storage変更の反映テスト
- [x] cross-browser.test.ts作成
  - Chrome/Firefox両方でのモック実行

#### sub5.2: パフォーマンス最適化
@target: `src/background/translationEngine.ts`, `src/content/domManipulator.ts`, `webpack/*.js`
@ref: `ARCHITECTURE.md` (L1809-L1962)
- [x] キャッシュ戦略最適化
  - LRU eviction実装
  - Cache TTL調整
- [x] バッチサイズ動的調整
  - ページサイズに応じたBATCH_SIZE変更
- [x] メモリリーク対策
  - WeakMap使用確認
  - イベントリスナークリーンアップ
- [x] Webpackバンドルサイズ最適化
  - Tree-shaking確認
  - Code-splitting設定
  - minimize設定

#### sub5.3: マイグレーション実装
@target: `src/background/migration.ts`
@ref: `ARCHITECTURE.md` (L1720-L1806)
- [x] MigrationManager クラス作成
  - `migrate()` メソッド
  - `runMigrations(fromVersion)` メソッド
  - `migrateV2ToV3()` メソッド
  - `showMigrationNotice()` メソッド
- [x] V2→V3データ移行
  - `apiKey` → `openRouterApiKey`
  - デフォルトモデル設定
  - スキーマバージョン管理
- [x] Extension ID保持
  - `{d2c003ee-bd69-4b6d-a05e-cc9ad78c5faf}` 継続使用

#### sub5.4: ドキュメント整備
@target: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`
- [x] README.md更新
  - インストール手順
  - 使い方（スクリーンショット付き）
  - 開発環境セットアップ
  - ビルド手順
- [x] CHANGELOG.md作成
  - v3.0.0の変更点
  - Breaking Changes
  - マイグレーションガイド
- [x] CONTRIBUTING.md作成
  - 開発者向けガイド
  - コーディング規約
  - PR手順

#### sub5.5: E2Eテスト（手動）
- [x] Chrome動作確認
  - ページ翻訳（Wikipedia等）
  - 選択翻訳
  - クリップボード翻訳
  - 設定変更
- [x] Firefox動作確認
  - 同上
- [x] バグ修正

#### sub5.6: リリース準備
@target: `manifest.v2.json`, `manifest.v3.json`, `package.json`
- [x] バージョン番号更新（3.0.0）
- [x] manifest.json最終確認
- [x] ビルド最終実行
  - `npm run build:all`
- [x] パッケージ作成
  - Chrome Web Store用ZIP
  - Firefox Add-ons用ZIP
- [x] パッケージサイズ確認（1MB以下推奨）

**検証基準**:
- [x] 全テストパス（ユニット+統合）
- [x] Chrome/Firefox両方で安定動作
- [x] ドキュメント完備
- [x] パッケージサイズ確認（1MB以下推奨）

---

### process10: ユニットテスト
@ref: `ARCHITECTURE.md` (L1500-L1611)
- 各Processのsub項目で個別に実装
- テストカバレッジ目標: 80%以上
- Jest + React Testing Library使用

### process50: フォローアップ
（実装後に仕様変更などが発生した場合は、ここにProcessを追加する）

### process100: リファクタリング
- [x] コードレビュー実施
- [x] ESLint警告解消
- [x] 型定義の厳密化
- [x] パフォーマンス改善
- [x] コメント・ドキュメント追加

### process200: ドキュメンテーション
- [x] `ARCHITECTURE.md` 作成済み
- [x] `README.md` 更新
- [x] `CHANGELOG.md` 作成
- [x] `CONTRIBUTING.md` 作成
- [x] API仕様書作成（OpenRouter連携部分）
- [x] ユーザーガイド作成

---

## マイルストーン

| Week | フェーズ | 検証基準 |
|------|---------|---------|
| 2 | Phase 0完了 | Webpackビルド成功 |
| 4 | Phase 1完了 | Shared Layerテスト全パス |
| 6 | Phase 2完了 | 翻訳エンジン動作確認 |
| 8 | Phase 3完了 | ページ翻訳動作 |
| 10 | Phase 4完了 | React UI完成 |
| 12 | Phase 5完了 | リリース準備完了 |

## 成功基準
- ✅ Chrome/Firefox両対応（自動切替）
- ✅ TypeScript 100%移行
- ✅ テストカバレッジ80%以上
- ✅ 全機能動作（ページ/選択/クリップボード翻訳）
- ✅ React UIモダン化
- ✅ ドキュメント完備
- ✅ パフォーマンス: 1000ノード翻訳3秒以内

## リスク管理

### 技術的リスク
1. **Chrome Service Worker制約**
   - 対策: Offscreen Document + Keep-Alive実装
2. **Webpack設定複雑化**
   - 対策: read-aloud-tab参考、段階的構築
3. **テストカバレッジ不足**
   - 対策: Phase毎にテスト実装を義務化

### スケジュールリスク
1. **想定外のバグ**
   - 対策: Week 13-16を予備期間として確保
2. **API変更**
   - 対策: OpenRouter API安定版使用
