# title: Firefox拡張機能の設定画面修正と保存機能の安定化

## 概要
- dist-firefoxディレクトリのFirefox拡張機能において、設定画面が開けない問題と設定保存の潜在的な問題を修正する
- manifest.jsonにoptions_ui定義を追加し、ブラウザが設定ページを認識できるようにする
- BrowserAdapterとStorageManagerのエラーハンドリングを強化し、設定の保存が確実に動作するようにする

### goal
- ユーザーが拡張機能のポップアップから「Open Settings」ボタンをクリックして設定画面を開ける
- ユーザーが設定画面で各項目（APIキー、言語、フォント、ダークモード）を変更して保存できる
- エラー発生時に具体的なエラーメッセージがユーザーに表示される
- 既存ユーザーのlineHeight設定値が自動的に適切な値に修正される

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- Plan modeでは実装を行わず、計画の承認後に実装を開始すること

## 開発のゴール
- manifest.v2.json（Firefox用）とmanifest.v3.json（Chrome用）にoptions_ui定義を追加
- BrowserAdapterのstorage API（get/set/remove）にchrome.runtime.lastErrorのチェックを追加
- useSettingsとpopup/App.tsxのStorageManagerインスタンス化をuseMemoで最適化
- lineHeightのデフォルト値を4から1.5に修正し、既存データのマイグレーション処理を追加
- エラーメッセージを具体化し、AppearanceSettings（ダークモード）の保存機能を実装

## 実装仕様
- Chrome Extension Manifest V2/V3の仕様に準拠
- React Hooksのベストプラクティスに従う（useMemoの適切な使用）
- ブラウザストレージAPIのエラーハンドリング標準に準拠
- 既存ユーザーへの影響を最小限にするため、データマイグレーション処理を実装

## 生成AIの学習用コンテキスト
### Manifestファイル
- public/manifest.v2.json
  - Firefoxで使用するManifest V2形式の設定ファイル
- public/manifest.v3.json
  - Chromeで使用するManifest V3形式の設定ファイル

### ブラウザアダプター
- src/shared/adapters/BrowserAdapter.ts
  - Chrome/Firefox APIの抽象化レイヤー
  - ストレージ操作のPromiseラッパー

### ストレージ管理
- src/shared/storage/StorageManager.ts
  - ブラウザストレージの操作を管理
- src/shared/types/index.ts
  - StorageData型定義とDEFAULT_STORAGE定義

### オプションページ
- src/options/App.tsx
  - 設定画面のメインコンポーネント
- src/options/hooks/useSettings.ts
  - 設定状態管理フック
- src/options/components/AppearanceSettings.tsx
  - ダークモード設定コンポーネント

### ポップアップ
- src/popup/App.tsx
  - ポップアップのメインコンポーネント

## Process

### process1 manifest.jsonにoptions_ui定義を追加
#### sub1 Firefox用manifest.v2.jsonの修正
@target: public/manifest.v2.json
@ref: なし
- [ ] `commands`セクション（line 68付近）の後にoptions_ui定義を追加
  - `page`: "options.html"
  - `browser_style`: false（プロジェクト独自のTailwind CSSを優先）
  - Firefoxの仕様: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/options_ui

#### sub2 Chrome用manifest.v3.jsonの修正
@target: public/manifest.v3.json
@ref: なし
- [ ] `commands`セクション（line 58付近）の後にoptions_ui定義を追加
  - `page`: "options.html"
  - `open_in_tab`: true（新しいタブで開く）
  - Chromeの仕様: https://developer.chrome.com/docs/extensions/mv3/options/

### process2 BrowserAdapterのエラーハンドリング強化（Phase 1 - CRITICAL）
#### sub1 storage.set関数の修正
@target: src/shared/adapters/BrowserAdapter.ts
@ref: なし
- [ ] Promise内でrejectを使用できるように変更（line 59-64）
- [ ] chrome.runtime.lastErrorのチェックを追加
  - エラーがあればreject(new Error(chrome.runtime.lastError.message))
  - エラーがなければresolve()

#### sub2 storage.get関数の修正
@target: src/shared/adapters/BrowserAdapter.ts
@ref: なし
- [ ] Promise内でrejectを使用できるように変更（line 47-52）
- [ ] chrome.runtime.lastErrorのチェックを追加
  - エラーがあればreject(new Error(chrome.runtime.lastError.message))
  - エラーがなければresolve(result)

#### sub3 storage.remove関数の修正
@target: src/shared/adapters/BrowserAdapter.ts
@ref: なし
- [ ] Promise内でrejectを使用できるように変更（line 71-77）
- [ ] chrome.runtime.lastErrorのチェックを追加
  - エラーがあればreject(new Error(chrome.runtime.lastError.message))
  - エラーがなければresolve()

### process3 StorageManagerインスタンス化の最適化（Phase 1 - CRITICAL）
#### sub1 useSettings.tsの修正
@target: src/options/hooks/useSettings.ts
@ref: なし
- [ ] ReactのインポートにuseMemoを追加（line 1）
- [ ] StorageManagerのインスタンス化をuseMemoでラップ（line 41）
  - `const storageManager = useMemo(() => new StorageManager(), [])`
  - メモリリークとシングルトンパターン違反を防止

#### sub2 popup/App.tsxの修正
@target: src/popup/App.tsx
@ref: なし
- [ ] ReactのインポートにuseMemoを追加（line 1）
- [ ] StorageManagerのインスタンス化をuseMemoでラップ（line 18）
  - `const storageManager = useMemo(() => new StorageManager(), [])`

### process4 lineHeightデフォルト値の修正（Phase 2 - HIGH）
#### sub1 DEFAULT_STORAGEの修正
@target: src/shared/types/index.ts
@ref: src/options/components/LanguageSettings.tsx
- [ ] DEFAULT_STORAGE.lineHeightを4から1.5に変更（line 34）
  - UI仕様（min=1.0, max=2.0）との整合性を確保

#### sub2 データマイグレーション処理の追加
@target: src/shared/storage/StorageManager.ts
@ref: なし
- [ ] get()メソッド内にマイグレーション処理を追加
  - `if (data.lineHeight && data.lineHeight > 2.0)`のチェック
  - 条件に該当する場合、`data.lineHeight = 1.5`に修正
  - `await this.set({ lineHeight: 1.5 })`で永続化
  - 既存ユーザーへの影響を軽減

### process5 エラーメッセージの改善（Phase 3 - MEDIUM）
#### sub1 App.tsxのhandleSave関数の修正
@target: src/options/App.tsx
@ref: なし
- [ ] catchブロックでerr.messageを含む具体的なエラーメッセージを表示（line 36-38）
  - `err instanceof Error`でチェック
  - エラーの場合: `Failed to save settings: ${err.message}`
  - それ以外: `Failed to save settings`
- [ ] エラー時のsetTimeout時間を5000msに延長
- [ ] console.errorでエラーログを出力

### process6 AppearanceSettings（ダークモード）の実装（Phase 3 - MEDIUM）
#### sub1 StorageData型定義の拡張
@target: src/shared/types/index.ts
@ref: なし
- [ ] StorageDataインターフェースにdarkMode?: booleanフィールドを追加（line 26付近）
- [ ] DEFAULT_STORAGEにdarkMode: falseを追加（line 37付近）

#### sub2 App.tsxのAppearanceSettings連携
@target: src/options/App.tsx
@ref: src/options/components/AppearanceSettings.tsx
- [ ] AppearanceSettingsコンポーネントのonChange実装（line 208-213）
  - darkModeプロパティに`settings.darkMode || false`を渡す
  - onChangeで`updateSettings(key as any, value as any)`を呼び出す
- [ ] TODOコメントを削除

### process7 ビルドと動作確認
#### sub1 Firefoxビルドの実行
@target: dist-firefox/
@ref: webpack/webpack.firefox.cjs
- [ ] `npm run build:firefox`を実行
- [ ] dist-firefox/manifest.jsonにoptions_uiが含まれているか確認
- [ ] dist-firefox/popup.htmlとoptions.htmlが正しく生成されているか確認

#### sub2 拡張機能の動作テスト
@target: なし
@ref: なし
- [ ] Firefoxのabout:debuggingで拡張機能を再読込
- [ ] ポップアップの「Open Settings」ボタンをクリックして設定画面が開くか確認
- [ ] 設定画面で各項目（APIキー、言語、フォント、ダークモード）を変更
- [ ] 「Save Settings」ボタンをクリックして保存
- [ ] ブラウザコンソールでエラーがないか確認
- [ ] `chrome.storage.local.get(null, (data) => console.log(data))`で保存内容を確認

#### sub3 エラーハンドリングのテスト
@target: なし
@ref: なし
- [ ] ブラウザコンソールで意図的にストレージエラーをシミュレート
- [ ] エラーメッセージが具体的に表示されるか確認
- [ ] エラーログがconsole.errorに出力されるか確認

### process10 ユニットテスト
- [ ] BrowserAdapterのエラーハンドリングテストケースを追加（オプション）
  - chrome.runtime.lastErrorが設定されている場合のテスト
  - 正常系のテスト
- [ ] StorageManagerのマイグレーション処理テストケースを追加（オプション）
  - lineHeight > 2.0の場合のテスト
  - lineHeight <= 2.0の場合のテスト

### process50 フォローアップ
- 今後、Chrome版でも同様の問題がないか確認
- 他のブラウザストレージ操作箇所でも同様のエラーハンドリングが必要か検証

### process100 リファクタリング
- [ ] BrowserAdapterの重複コード（lastErrorチェック）を共通関数に抽出できないか検討
- [ ] StorageManagerをシングルトンエクスポートに変更できないか検討
  - 各コンポーネントで`new StorageManager()`の代わりに`import storageManager`を使用

### process200 ドキュメンテーション
- [ ] CHANGELOG.mdに変更内容を記載
  - manifest.jsonにoptions_ui追加
  - BrowserAdapterのエラーハンドリング強化
  - lineHeightデフォルト値修正とマイグレーション追加
  - ダークモード設定の保存機能追加
- [ ] README.mdの設定画面セクションを更新（必要に応じて）
- [ ] 開発者向けドキュメントにストレージエラーハンドリングのベストプラクティスを記載
