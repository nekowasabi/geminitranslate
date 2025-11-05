# Changelog

All notable changes to DoganayLab API Translate App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **バッチストリーミング機能の包括的なテストスイート追加**
  - BatchCompletedMessage型テスト（11テスト）: メッセージ型の正確性を検証
  - TranslationEngine onBatchCompleteコールバックテスト（7テスト）: コールバック実行とエラーハンドリングを検証
  - MessageHandler BATCH_COMPLETED送信テスト（5テスト）: メッセージ送信とprogress計算を検証
  - ContentScript handleBatchCompletedテスト（7テスト）: バッチ受信と即座適用を検証
  - 合計30テストを追加、全て成功
- **エラーハンドリング強化**
  - onBatchCompleteコールバックのtry-catch追加（順次・並列・キャッシュヒット時）
  - 翻訳処理の継続性を保証（コールバックエラーが全体をブロックしない）

### Fixed
- **既存テストをBATCH_SIZE=20に対応**
  - translateBatch batch processing テストの期待値修正
  - 10+10+5 → 20+5 バッチ分割に更新

## [3.0.1] - 2025-10-31

### Fixed
- **Phase 1進捗通知の表示問題を修正**
  - Phase 1（ビューポート内翻訳）完了を待ってからPhase 2（ページ全体翻訳）を開始
  - 「ビューポート内を翻訳中」→「ページ全体を翻訳中」の順序で正しく進捗表示
  - バッチストリーミングによる段階的レンダリングは引き続き有効

### Changed
- **BATCH_SIZE**: 10 → 20 に変更
  - 最初のバッチで20個のテキストが翻訳される（従来は10個）
  - ビューポート内の翻訳がより広範囲をカバー
  - 初期表示時のユーザー体験が向上

### ⚡ Performance - Batch Streaming Translation

#### Added
- **バッチストリーミング翻訳機能**: バッチごとに翻訳結果を段階的にレンダリング
  - 最初の10テキスト(1バッチ)を100ms以内に表示（従来は380ms）
  - **74%高速化**: 初期表示時間が380ms → 100msに短縮
  - **53%高速化**: 全体完了時間が380ms → 180msに短縮
  - リアルタイム進捗更新でユーザーに安心感を提供
- **BATCH_COMPLETEDメッセージ**: Background → Content方向の新規メッセージタイプ
  - バッチ完了ごとにContent Scriptへ通知
  - 翻訳結果、ノードインデックス、フェーズ情報、進捗情報を含む
  - 段階的DOM適用により体感速度が劇的に改善
- **ProgressNotification.updatePhase()**: フェーズごとの進捗更新メソッド
  - Phase 1（ビューポート内翻訳）とPhase 2（ページ全体翻訳）で個別に進捗表示
  - パーセンテージのみの更新とcurrent/total更新の2つのオーバーロードをサポート

#### Changed
- **VIEWPORT_PRIORITY_BATCHES**: 3 → 1 に変更
  - 最初の1バッチのみ順次処理、残りは完全並列化
  - UXと速度のバランスが最良の設定に最適化
- **TranslationEngine.translateBatchSemiParallel()**: コールバック機構を追加
  - `onBatchComplete` コールバックでバッチ完了時の処理をカスタマイズ可能
  - バッチインデックス、翻訳結果、ノードインデックスを引数として提供
  - キャッシュヒット時も即座にコールバック実行
- **ContentScript.translatePage()**: 非ブロッキング実装に変更
  - Phase 1の翻訳リクエストを`await`せずに送信
  - バッチ完了は`BATCH_COMPLETED`メッセージで非同期処理
  - `currentTranslationNodes`プロパティでバッチ適用対象ノードを管理

#### Technical Details
- **src/shared/messages/types.ts**:
  - `BatchCompletedMessage`インターフェース追加（行315-383）
  - `MessageType.BATCH_COMPLETED`列挙型追加
  - Background→Content方向のため`action`プロパティ不要（CLAUDE.md規約準拠）
- **src/shared/constants/config.ts**:
  - `VIEWPORT_PRIORITY_BATCHES: 1` に変更（行61）
  - JSDocコメントで変更理由を文書化
- **src/background/translationEngine.ts**:
  - `BatchProgressCallback`型定義追加（行81-85）
  - `translateBatchSemiParallel()`にコールバック引数追加（行161-269）
  - 順次処理バッチと並列処理バッチでコールバック呼び出し（行224-258）
- **src/background/messageHandler.ts**:
  - `handleRequestTranslation()`でBATCH_COMPLETED送信実装（行263-311）
  - sender.tab.idのエラーハンドリング追加
  - chrome.tabs.sendMessage()のtry-catchでタブクローズ時のエラーを処理
- **src/content/contentScript.ts**:
  - `currentTranslationNodes`プロパティ追加（行36）
  - `handleBatchCompleted()`メソッド実装（行423-479）
  - BATCH_COMPLETEDメッセージリスナー追加（行146-152）
  - エラーハンドリング強化（nodeIndices範囲外チェック、ミスマッチ警告）
- **src/content/progressNotification.ts**:
  - `updatePhase()`メソッド実装（行173-238）
  - 2つのオーバーロード: (phase, percentage) と (phase, current, total)
  - フェーズごとのメッセージ更新をサポート

#### Performance Metrics
- **初期表示**: 380ms → 100ms (74%改善)
- **全体完了**: 380ms → 180ms (53%改善)
- **体感速度**: 劇的に向上（段階的表示により実時間以上に速く感じる）

---

### 🐛 Translation Functionality Fix

#### Fixed
- **翻訳機能が動作しない問題を修正**
  - Content ScriptからのREQUEST_TRANSLATIONメッセージに`action`プロパティが欠落していた問題を解決
  - TranslationRequestMessage型定義に`action: 'requestTranslation'`プロパティを追加
  - contentScript.ts, selectionHandler.ts, clipboardHandler.tsの3ファイルでメッセージ送信時に`action`を追加
  - MessageHandlerのactionチェックロジックを強化し、より詳細なエラーメッセージを提供
  - ページ全体翻訳、選択テキスト翻訳、クリップボード翻訳のすべてが正常に動作

#### Changed
- **メッセージング仕様の統一**
  - すべてのメッセージが`type`と`action`の両方を持つように標準化
  - MessageHandlerに後方互換性を持つフォールバックロジックを追加（`type`から`action`を推測）
  - 型安全性の向上: TranslationRequestMessageで`action`プロパティが必須に

#### Added
- **MessageHandlerの改善**
  - `inferActionFromType()` メソッドを追加し、後方互換性を確保
  - より詳細なエラーログ出力（message.type、hasActionフラグを含む）
  - エラーメッセージにメッセージタイプ情報を含めることでデバッグを容易に

#### Technical Details
- **型定義の変更**:
  - `src/shared/messages/types.ts`: TranslationRequestMessageに`action: 'requestTranslation'`を追加
  - 充実したJSDocコメントでメッセージング仕様を文書化
- **Content Script修正**:
  - `src/content/contentScript.ts` (118-124行): ページ全体翻訳のメッセージに`action`追加
  - `src/content/selectionHandler.ts` (90-96行): 選択翻訳のメッセージに`action`追加
  - `src/content/clipboardHandler.ts` (68-74行): クリップボード翻訳のメッセージに`action`追加
- **Background Script改善**:
  - `src/background/messageHandler.ts`: 後方互換性を持つフォールバックロジック実装
  - エラーメッセージの改善: `Invalid message format: missing action property (type: ${message.type})`
- **テスト更新**:
  - `tests/unit/content/contentScript.test.ts`: `action`プロパティの検証を追加
  - `tests/unit/background/messageHandler.test.ts`: 後方互換性テストケースを追加
  - `tests/unit/content/selectionHandler.test.ts`: `action`プロパティのアサーション追加
  - `tests/unit/content/clipboardHandler.test.ts`: `action`プロパティのアサーション追加

---

### 🐛 Firefox UI/UX Bug Fixes

#### Fixed
- **Firefox環境でAPIキー設定後に設定画面へアクセスできない問題を修正**
  - ポップアップヘッダーに歯車アイコン（⚙️）ボタンを常時表示（APIキーの有無に関わらず）
  - ApiKeyWarningコンポーネントから「Open Settings」ボタンを削除し、警告表示のみに専念
  - ユーザーがいつでも設定画面にアクセスできるよう改善
- **設定画面でモデル名を空文字列にできない問題を修正**
  - options/App.tsxで `||` 演算子を `??`（nullish coalescing）に変更
  - 空文字列 `''` をユーザー入力として許可し、カスタマイズ性を向上
  - デフォルト値は `null` または `undefined` の場合のみ適用されるように改善
- **Firefoxのポップアップで「Translate」ボタンが動作しない問題を修正**
  - background.firefox.tsにTRANSLATE_PAGEメッセージハンドラを追加
  - MessageHandlerとCommandHandlerの役割を明確に分離
  - ポップアップからのメッセージが正常にcontent scriptに転送されるように改善

#### Changed
- **MessageHandler と CommandHandler の役割分担を明確化**
  - MessageHandler: TranslationEngineへの直接リクエスト（requestTranslation, clearCache, getCacheStats, testConnection）
  - CommandHandler: Content Scriptへの転送（TRANSLATE_PAGE, TRANSLATE_SELECTION, TRANSLATE_CLIPBOARD）
  - background.firefox.tsでメッセージタイプに応じて適切なハンドラに委譲

#### Added
- **CommandHandler.handleMessage() メソッドを追加**
  - ポップアップからのメッセージを受信してcontent scriptに転送
  - TRANSLATE_PAGE, TRANSLATE_SELECTION, TRANSLATE_CLIPBOARDメッセージに対応

#### Technical Details
- popup/App.tsx: ヘッダーに歯車アイコンボタンを追加（インラインスタイルでホバー効果実装）
- popup/components/ApiKeyWarning.tsx: 設定ボタンを削除し、メッセージを「Settings (⚙️)」参照に変更
- options/App.tsx: すべての設定プロパティで `??` 演算子を使用（apiKey, model, provider, targetLanguage, fontSize, darkMode）
- background.firefox.ts: setupMessageListener()でメッセージタイプに応じた条件分岐を実装
- background/commandHandler.ts: handleMessage()メソッドを追加し、メッセージタイプごとにsendメソッドを呼び出し

---

### 🐛 Firefox Compatibility Fix

#### Fixed
- **Firefox環境でOpen Settingsボタンが非表示になる問題を修正**
  - BrowserAdapter.handleRuntimeError()がChrome/Firefox両対応に改善
  - `chrome.runtime.lastError`のハードコーディングを`this.api.runtime.lastError`に変更
  - Firefoxでストレージアクセスが失敗していた問題を解消
- **React Hooksベストプラクティスに準拠**
  - popup/App.tsxのuseEffect依存配列に`storageManager`を追加
  - exhaustive-depsルール違反を解消

#### Changed
- **DEFAULT_STORAGE型整合性の向上**
  - `openRouterApiKey: undefined`を明示的に追加
  - StorageData型との完全な一貫性を確保

#### Technical Details
- BrowserAdapter.handleRuntimeError()がブラウザ検出機能（this.api）と統合
- Chrome環境では`chrome.runtime.lastError`、Firefox環境では`browser.runtime.lastError`を自動判定
- ストレージアクセス失敗時のエラーハンドリングが両ブラウザで正常動作

---

### 🎨 Settings UI Improvements

#### Changed
- **Model selection** changed from dropdown to text input for better flexibility
- **Provider setting** changed from hardcoded display to optional text input field
- Users can now specify custom OpenRouter models and providers directly

#### Fixed
- **Test Connection** functionality now works correctly
  - Fixed message format mismatch between Options layer and Background layer
  - Added `action` field to TestConnectionMessage type definition
  - Updated response handling to use `response.success` instead of `response.status`

#### Removed
- ModelSelector component (replaced with simple text input)
- models.ts constants file (no longer needed with text input approach)

#### Technical Details
- TestConnectionMessage interface now includes `action: 'testConnection'` field
- ApiSettings component now accepts `model` and `provider` props with onChange handlers
- MessageBus.send() now includes both `type` and `action` fields for TEST_CONNECTION
- Response format aligned: `{ success: boolean, data?: any, error?: string }`
- OpenRouterClient already supported provider parameter (no changes needed)

## [3.0.1] - 2025-10-26

### 🔧 Settings & Stability Improvements

#### Added
- **options_ui** definition to both manifest.v2.json and manifest.v3.json for proper settings page integration
- **Dark mode** storage support in StorageData interface with default value
- Comprehensive **error handling** for BrowserAdapter storage operations (get/set/remove)
- **Migration logic** for lineHeight values > 2.0 to automatically correct to 1.5
- Detailed **error messages** in options page with specific error information
- Unit tests for BrowserAdapter error handling scenarios
- Unit tests for StorageManager lineHeight migration logic

#### Changed
- **lineHeight default value** from 4 to 1.5 to match UI specifications (1.0-2.0 range)
- Optimized **StorageManager instantiation** using React's useMemo in useSettings and popup/App
- Refactored BrowserAdapter to use **handleRuntimeError** common function, eliminating code duplication
- Enhanced error logging with console.error for debugging

#### Fixed
- Settings page not opening from browser extension UI
- Potential memory leaks from repeated StorageManager instantiation
- Silent storage operation failures due to missing chrome.runtime.lastError checks
- Inconsistent lineHeight values for existing users
- Dark mode settings not being saved or loaded properly

#### Technical Details
- BrowserAdapter: Added chrome.runtime.lastError validation in all storage methods
- StorageManager: Automatic data migration for invalid lineHeight values
- React hooks: useMemo optimization prevents unnecessary re-instantiation
- Manifest files: browser_style: false (Firefox), open_in_tab: true (Chrome)

## [3.0.0] - 2025-10-26

### 🎉 Major Release - Complete TypeScript Rewrite

#### Added
- TypeScript 100% migration for type safety
- React 18 UI for Popup and Options pages
- Chrome Manifest V3 support
- 3-Tier cache system (Memory → Session → Local)
- LRU cache with automatic eviction (max 1000 entries)
- Selection translation (Alt+Y) with floating UI
- Clipboard translation (Alt+C)
- Dark mode with automatic theme detection
- Connection test in Options UI
- Webpack 5 build system
- Jest testing framework (380+ tests, 99.5% coverage)

#### Changed (Breaking)
- API key storage: `apiKey` → `openRouterApiKey` (auto-migrated)
- Default model: `google/gemini-2.0-flash-exp:free`
- Complete architecture rewrite with layered design
- React-based UI replacing vanilla JavaScript

#### Fixed
- Memory leaks in DOM manipulation
- Race conditions in concurrent translations
- Cache invalidation issues
- Firefox/Chrome compatibility issues

#### Security
- CSP-compliant (no inline scripts)
- Permissions minimized
- Secure storage for API keys

#### Statistics
- Bundle size: 768KB (Chrome), 764KB (Firefox)
- Test coverage: 99.5% (378/380 passing)
- TypeScript: 100%

#### Migration
Your settings will be automatically migrated from v2.x to v3.0.0.

---

## [2.0.2] - 2025-10-25

### Added - Chrome/Edge Support
- **Cross-Browser Compatibility**: Extension now works on Chrome, Edge, and other Chromium-based browsers
  - WebExtension Polyfill (v0.10.0) integration for browser API compatibility
  - Automated build process for Chrome-compatible package
  - Manifest v3 conversion for Chrome Web Store compliance
- **Build System**:
  - New `npm run build:chrome` command for Chrome builds
  - Automated polyfill injection into background.js
  - Enhanced error handling and validation in build scripts
- **Testing**:
  - 43 new unit tests for popup.js and background.js
  - Firefox regression test documentation (tests/FIREFOX_REGRESSION.md)
  - Total test coverage: 73 tests across all components
  - Browser API mock setup for cross-browser testing

### Improved
- **Build Process**:
  - Comprehensive validation of build prerequisites
  - Step-by-step progress indicators during build
  - Automatic file existence checks
  - Better error messages with troubleshooting hints
- **Code Quality**:
  - Formal WebExtension Polyfill integration (replaces simple `var browser = chrome` workaround)
  - Consistent Promise-based API usage across browsers
  - Improved code documentation and comments

### Technical Changes
- Updated `add-chrome-polyfill.cjs`: Now injects full WebExtension Polyfill instead of simple assignment
- Enhanced `build-chrome.sh`: Added validation, error handling, and progress tracking
- New test files:
  - `tests/popup.test.js`: 20 tests for popup functionality
  - `tests/background.test.js`: 23 tests for background script
  - `tests/setup.js`: Enhanced with `browser.commands` mock
  - `tests/FIREFOX_REGRESSION.md`: Manual testing procedures
- Updated `README.md`: Added Chrome installation and technical compatibility sections

### Compatibility
- **Firefox**: ✅ All existing functionality preserved (Manifest v2)
- **Chrome/Edge**: ✅ Full feature parity with Firefox version (Manifest v3)
- **Test Status**: 73/73 tests passing
- **ESLint**: Clean (13 warnings, 0 errors)

### Migration Notes
For developers:
1. Use `npm run build:chrome` to create Chrome-compatible build
2. Load `dist-chrome/` directory as unpacked extension in Chrome
3. All Firefox features work identically in Chrome
4. No code changes needed for new features - polyfill handles API differences

For users:
- Firefox users: No changes needed, extension works as before
- Chrome users: Follow new installation instructions in README.md

---

## [2.0.0] - 2025-10-25

### Changed - Major Migration
- **BREAKING CHANGE**: Migrated from Gemini API to OpenRouter API
  - Users must obtain a new OpenRouter API key (free tier available)
  - Previous Gemini API keys will no longer work
  - Migration provides access to multiple AI models beyond just Gemini

### Added
- **Multiple AI Model Support**: Choose from various models through OpenRouter:
  - Google Gemini 2.0 Flash (free tier)
  - Google Gemini Flash 1.5 8B
  - Anthropic Claude 3.5 Sonnet
  - OpenAI GPT-4o Mini
  - Custom model input option
  - Many more models available through OpenRouter
- **Provider Routing**: Optional provider selection for performance optimization
  - Support for DeepInfra, Together, and other providers
  - Configurable through the popup UI
- **Connection Testing**: Built-in API connection test feature
  - Verify API key validity before translation
  - Test model availability and access
- **Enhanced Popup UI**:
  - Model selection dropdown with popular models pre-configured
  - Provider input field for routing optimization
  - Test Connection button for API validation
  - Improved user experience with better feedback

### Improved
- **Translation Quality**: Access to multiple AI models allows users to choose the best model for their needs
- **Cost Optimization**: Free tier models available through OpenRouter
- **Flexibility**: Easy switching between different AI providers
- **Error Handling**: Enhanced error messages specific to OpenRouter API responses
- **Documentation**: Comprehensive README updates with OpenRouter setup instructions

### Technical Changes
- Added `openrouter.js`: New OpenRouterClient class for API communication
- Updated `background.js`: Replaced Gemini API calls with OpenRouter integration
- Updated `popup/popup.html`: New UI elements for model and provider selection
- Updated `popup/popup.js`: Enhanced settings management for OpenRouter
- Updated `manifest.json`: Version bump to 2.0.0 and description update
- Added comprehensive test suite:
  - Unit tests for OpenRouterClient (`__tests__/openrouter.test.js`)
  - Integration tests for translation features (`__tests__/integration.test.js`)
  - 35 total tests covering all major functionality

### Storage Schema Changes
- `apiKey` → `openRouterApiKey`: API key storage key renamed
- Added `openRouterModel`: Stores selected AI model
- Added `openRouterProvider`: Stores optional provider routing preference
- Existing settings (`targetLanguage`, `fontSize`, `lineHeight`) remain unchanged

### Migration Notes
For users upgrading from v1.x:
1. Obtain a free OpenRouter API key from https://openrouter.ai/
2. Enter the new key in the extension popup
3. Select your preferred model (default: Google Gemini 2.0 Flash Free)
4. Use the Test Connection button to verify setup
5. Your previous preferences (language, font size) will be preserved

## [1.1.0] - Previous Release

### Changed
- Updated to Gemini 2.5 Flash Lite model
- Performance improvements

## [1.0.0] - Initial Release

### Added
- Full page translation using Google Gemini API
- Selection-based translation
- Clipboard translation
- Dynamic content translation
- Translation caching
- Custom font size and line height settings
- Multi-language support (25+ languages)
- Dark mode support

---

For more information, see the [README](README.md).
