# title: Chrome拡張機能のポップアップ動作修正

## 概要
- Firefox用に開発された拡張機能（manifest v2）をChrome対応（manifest v3）に変換した際、ポップアップのボタンが無反応になる問題を解決する
- WebExtension Polyfillを導入し、Firefox専用の`browser` APIをChromeの`chrome` APIに自動変換する

### goal
- ユーザーがChromeでポップアップを開き、APIキーの保存・モデル選択・翻訳機能のテストが正常に動作すること
- CustomModel選択時にモデル名入力用のテキストボックスが正しく表示されること

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること

## 開発のゴール
- popup.jsとbackground.jsでFirefox専用の`browser` APIが使用されている問題を解決
- ChromeとFirefoxの両方で動作する拡張機能を実現
- ビルドプロセスの自動化により、開発者がブラウザごとの差異を意識せずに開発できる環境を構築

## 実装仕様

### 問題の詳細
**現象:**
1. ポップアップ画面のボタン（Save, Test Connection, Translate等）を押しても無反応
2. CustomModelを選択してもモデル名入力用のテキストボックスが表示されない

**根本原因:**
- popup.jsが14箇所で`browser` APIを使用（Chrome未サポート）
  - 3行目: `browser.runtime.getManifest()`
  - 22行目以降: `browser.storage.local.get/set()`
  - 188行目: `browser.runtime.sendMessage()`
  - 254, 287行目: `browser.tabs.query/sendMessage()`

- background.jsも複数箇所で`browser` APIを使用
  - 170, 191, 205行目: `browser.tabs.query()`
  - 222行目: `browser.commands.onCommand`
  - 241行目: `browser.runtime.onMessage`

**技術的背景:**
- Firefoxの`browser` API: Promise-based（非同期処理が簡潔）
- Chromeの`chrome` API: Callback-based（コールバック地獄）
- WebExtension Polyfill: Firefoxの優れたAPIをChromeで利用可能にするラッパー

### 解決策
Mozilla公式のWebExtension Polyfillを導入し、`browser` APIを自動的に`chrome` APIに変換する。

## 生成AIの学習用コンテキスト

### HTMLファイル
- popup/popup.html
  - polyfillスクリプトの挿入位置を確認

### JavaScriptファイル
- popup/popup.js
  - `browser` API使用箇所の確認
- background.js
  - `browser` API使用箇所の確認

### 設定ファイル
- manifest.json
  - background scriptsの設定確認
- build-chrome.sh
  - ビルドプロセスの自動化

## Process

### process1 WebExtension Polyfillのダウンロード
@target: popup/browser-polyfill.min.js
@ref: https://unpkg.com/webextension-polyfill@0.10.0/dist/browser-polyfill.min.js
- [x] Mozilla公式のpolyfillをダウンロード
  ```bash
  curl -o popup/browser-polyfill.min.js https://unpkg.com/webextension-polyfill@0.10.0/dist/browser-polyfill.min.js
  ```
- [x] ファイルサイズ・内容を確認
- [x] .gitignoreに追加するか検討（推奨: リポジトリにコミット）

### process2 popup.htmlの修正
@target: popup/popup.html
@ref: popup/browser-polyfill.min.js
- [x] 84行目の`<script src="popup.js"></script>`の前にpolyfillを追加
  ```html
  <script src="browser-polyfill.min.js"></script>
  <script src="popup.js"></script>
  ```
- [x] ブラウザで動作確認
  - F12でコンソールエラーが消えることを確認
  - 各ボタンの動作確認

### process3 background.jsのpolyfill対応
@target: background.js, manifest.json
@ref: popup/browser-polyfill.min.js
- [x] 現在の簡易polyfill（`var browser = chrome`）の問題点を確認
- [x] Manifest v3のservice worker制約を調査
  - service workerでは複数スクリプトの配列が使えない
  - importScripts()またはバンドルが必要
- [x] 2つの選択肢を検討:
  1. background.jsの先頭にpolyfillコードを直接埋め込む
  2. importScripts('browser-polyfill.min.js')を使用
- [x] 選択したアプローチを実装

### process4 ビルドスクリプトの自動化
@target: build-chrome.sh
@ref: convert-manifest-v3.cjs, add-chrome-polyfill.cjs
- [x] polyfillファイルをdist-chromeにコピーする処理を追加
- [x] popup/popup.htmlへのpolyfill挿入を自動化
  - sedコマンドまたはNode.jsスクリプトで実装
- [x] background.jsへのpolyfill適用を自動化
- [x] 動作確認: `npm run build:chrome`で完全なChrome用パッケージが生成されることを確認

### process5 content.jsの互換性確認
@target: content.js
- [ ] content.js内で`browser` APIが使用されているか調査
- [ ] 使用されている場合、polyfillの適用方法を検討
  - content_scriptsはmanifest.jsonで配列指定可能
  - polyfillを先に読み込む設定を追加

### process10 ユニットテスト
- [ ] ポップアップ画面の動作テスト
  - [ ] APIキーの保存・読み込み
  - [ ] モデル選択（特にCustomModel）
  - [ ] Test Connection機能
- [ ] background.jsの通信テスト
  - [ ] コマンドリスナーの動作確認
  - [ ] content.jsとのメッセージング確認
- [ ] Firefoxでの動作確認（リグレッションテスト）
  - [ ] polyfill追加後もFirefoxで正常動作すること

### process50 フォローアップ

### process100 リファクタリング
- [ ] add-chrome-polyfill.cjsの改善
  - 現在の簡易的な変数宣言を正式なpolyfillに置き換え
- [ ] ビルドスクリプトの最適化
  - エラーハンドリングの追加
  - ログ出力の改善

### process200 ドキュメンテーション
- [x] PLAN.mdに調査結果と実装手順を記録
- [ ] README.mdにChrome対応の手順を追加
  - 開発者向け: ビルド方法
  - ユーザー向け: インストール方法
- [ ] CHANGELOG.mdにChrome対応を記載
  - 変更内容: WebExtension Polyfill導入
  - 影響: Chrome/Edgeでの動作サポート

## 検証方法

### 修正前の症状
1. ブラウザコンソール（F12）で "browser is not defined" エラーが表示される
2. ポップアップのボタンをクリックしても何も起こらない
3. CustomModel選択時にテキストボックスが表示されない

### 修正後の期待動作
1. ブラウザコンソールにエラーが表示されない
2. "Save"ボタンをクリック → "API key saved!"のメッセージが表示される
3. モデル選択で"Custom Model..."を選択 → テキストボックスが表示される
4. "Test Connection"ボタンをクリック → 接続テストが実行され結果が表示される
5. "Translate"系ボタンが正常に動作する

## リスクと緩和策

### リスク1: Manifest v3の破壊的変更
- **影響**: webRequest APIの制限により一部機能が動作しない可能性
- **緩和策**: まずpolyfillのみ追加してv2のまま動作確認、その後v3移行を検討

### リスク2: CDN依存によるオフライン動作不可
- **影響**: インターネット接続なしでpolyfillが読み込めない
- **緩和策**: ローカルにpolyfillファイルを配置（推奨）

### リスク3: Service Worker化によるストレージアクセス変更
- **影響**: Manifest v3のbackground service workerは永続的でない
- **緩和策**: 段階的移行、まずv2でpolyfill動作確認

