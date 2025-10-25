# Firefox リグレッションテスト手順書

## 目的
WebExtension Polyfill導入後もFirefoxで拡張機能が正常に動作することを確認する。

## 前提条件
- Firefox（最新版推奨）
- 本リポジトリのソースコード
- OpenRouter APIキー

## テスト環境セットアップ

### 1. 拡張機能の読み込み
```bash
# リポジトリルートで実行
cd /path/to/geminitranslate
```

1. Firefoxを開く
2. `about:debugging` に移動
3. 「このFirefox」をクリック
4. 「一時的なアドオンを読み込む...」をクリック
5. プロジェクトルートの `manifest.json` を選択

### 2. 初期設定
1. ツールバーの拡張機能アイコンをクリック
2. ポップアップが開くことを確認
3. バージョン番号が表示されることを確認（`v2.0.0`以上）

---

## テストケース

### TC1: ポップアップUI表示
**目的:** ポップアップが正常に表示され、全要素が機能すること

**手順:**
1. 拡張機能アイコンをクリック
2. ポップアップが開くことを確認

**期待結果:**
- ✅ ポップアップが開く
- ✅ 「DoganayLab API Translate App v2.x.x」のタイトルが表示される
- ✅ 以下のフィールドが表示される:
  - API Key入力欄
  - Model選択ドロップダウン
  - Provider入力欄（オプション）
  - Font Size入力欄
  - Line Height入力欄
  - Target Language選択
- ✅ 以下のボタンが表示される:
  - Save
  - Test Connection
  - Translate Page
  - Reset to Original

**エラーチェック:**
- F12でブラウザコンソールを開く
- `browser is not defined` エラーが**出ないこと**を確認

---

### TC2: APIキー保存
**目的:** APIキーとモデル設定が正しく保存されること

**手順:**
1. API Key欄に有効なOpenRouter APIキーを入力
2. Modelドロップダウンから「Google Gemini 2.0 Flash (Free)」を選択
3. 「Save」ボタンをクリック

**期待結果:**
- ✅ 「API key saved!」メッセージが表示される
- ✅ メッセージが3秒後に自動的に消える
- ✅ ポップアップを閉じて再度開いた時、設定が保持されている

---

### TC3: CustomModel選択
**目的:** Custom Modelオプションが正しく機能すること

**手順:**
1. Modelドロップダウンから「Custom Model...」を選択

**期待結果:**
- ✅ カスタムモデル入力欄が表示される
- ✅ 任意のモデル名（例: `anthropic/claude-3.5-sonnet`）を入力できる
- ✅ 「Save」ボタンクリック後、設定が保存される

**追加確認:**
1. 別のモデル（例: Google Gemini）を選択
2. カスタムモデル入力欄が非表示になることを確認

---

### TC4: Test Connection機能
**目的:** API接続テストが正常に動作すること

**手順:**
1. 有効なAPIキーとモデルを設定
2. 「Test Connection」ボタンをクリック

**期待結果:**
- ✅ ボタンが「Testing...」に変わる
- ✅ 「Connecting to OpenRouter...」メッセージが表示される
- ✅ 成功時: 「✓ 接続に成功しました」が緑色で表示される
- ✅ 失敗時: 「✗ エラーメッセージ」が赤色で表示される
- ✅ 5秒後にメッセージが自動的に消える

**エラーケース:**
1. 無効なAPIキーでテスト → 「✗ 無効なAPIキーです」
2. API Key未入力でテスト → 「Please enter API key and select model first」

---

### TC5: ページ全体翻訳
**目的:** ページ翻訳機能が正常に動作すること

**手順:**
1. 英語のWebページ（例: https://www.wikipedia.org/）を開く
2. Target Languageで「Japanese」を選択
3. 「Translate Page」ボタンをクリック

**期待結果:**
- ✅ ボタンが「Translating...」に変わる
- ✅ ページ上部に進捗バナー「翻訳中... 0%」が表示される
- ✅ 進捗率が増加する（例: 25%, 50%, 75%, 100%）
- ✅ 翻訳完了後、バナーが「翻訳完了」に変わり3秒後に消える
- ✅ ページのテキストが日本語に翻訳される
- ✅ ページのレイアウトが崩れない

**エラーチェック:**
- コンソールに`browser.tabs.query`関連のエラーが**出ないこと**
- コンソールに`browser.runtime.sendMessage`関連のエラーが**出ないこと**

---

### TC6: ページリセット
**目的:** 翻訳をリセットできること

**手順:**
1. TC5でページを翻訳した状態で実行
2. 「Reset to Original」ボタンをクリック

**期待結果:**
- ✅ ボタンが「Resetting...」に変わる
- ✅ ページのテキストが元の言語（英語）に戻る
- ✅ 「Page reset to original」メッセージが表示される

---

### TC7: キーボードショートカット（Alt+W）
**目的:** キーボードショートカットが機能すること

**手順:**
1. 英語のWebページを開く
2. `Alt+W` キーを押す

**期待結果:**
- ✅ ページ翻訳が自動的に開始される
- ✅ TC5と同じ挙動を示す

**エラーチェック:**
- コンソールに`browser.commands.onCommand`関連のエラーが**出ないこと**

---

### TC8: 動的コンテンツ翻訳
**目的:** MutationObserverが動的コンテンツを検出すること

**手順:**
1. 動的にコンテンツが追加されるページ（例: Twitter/X）を開く
2. ページを翻訳
3. スクロールして新しいコンテンツを読み込む

**期待結果:**
- ✅ 新しく追加されたコンテンツも自動的に翻訳される
- ✅ コンソールエラーが発生しない

---

### TC9: 設定の永続化
**目的:** 全ての設定が保存され、再起動後も保持されること

**手順:**
1. 以下の設定を行う:
   - API Key: （有効なキー）
   - Model: Google Gemini 2.0 Flash
   - Target Language: Japanese
   - Font Size: 20
   - Line Height: 10
2. Firefoxを完全に終了
3. Firefoxを再起動
4. `about:debugging` → 拡張機能を再読み込み
5. ポップアップを開く

**期待結果:**
- ✅ APIキーが保持されている（マスク表示）
- ✅ モデル選択が保持されている
- ✅ Target Languageが「Japanese」
- ✅ Font Sizeが「20」
- ✅ Line Heightが「10」

---

### TC10: WebExtension Polyfill互換性
**目的:** polyfill導入後も`browser` APIが正常に機能すること

**手順:**
1. TC2〜TC9を全て実行
2. ブラウザコンソールでエラーを確認

**期待結果:**
- ✅ 以下のエラーが**一切出ないこと**:
  - `browser is not defined`
  - `browser.storage is not defined`
  - `browser.runtime is not defined`
  - `browser.tabs is not defined`
  - `browser.commands is not defined`
- ✅ 全ての機能が正常動作する

---

## テスト実行記録

| TC# | テスト項目 | 結果 | 実施日 | 備考 |
|-----|-----------|------|--------|------|
| TC1 | ポップアップUI表示 | ⬜ | YYYY-MM-DD | |
| TC2 | APIキー保存 | ⬜ | YYYY-MM-DD | |
| TC3 | CustomModel選択 | ⬜ | YYYY-MM-DD | |
| TC4 | Test Connection機能 | ⬜ | YYYY-MM-DD | |
| TC5 | ページ全体翻訳 | ⬜ | YYYY-MM-DD | |
| TC6 | ページリセット | ⬜ | YYYY-MM-DD | |
| TC7 | キーボードショートカット | ⬜ | YYYY-MM-DD | |
| TC8 | 動的コンテンツ翻訳 | ⬜ | YYYY-MM-DD | |
| TC9 | 設定の永続化 | ⬜ | YYYY-MM-DD | |
| TC10 | Polyfill互換性 | ⬜ | YYYY-MM-DD | |

**凡例:** ⬜ 未実施 / ✅ 合格 / ❌ 不合格

---

## トラブルシューティング

### 問題: ポップアップが開かない
- manifest.jsonのpopupパスを確認
- `popup/browser-polyfill.min.js`が存在するか確認
- コンソールエラーを確認

### 問題: 翻訳が動作しない
- APIキーが正しく保存されているか確認
- OpenRouter APIクレジットが残っているか確認
- ネットワークタブでAPI通信を確認

### 問題: コンソールに`browser is not defined`エラー
- `popup/popup.html` 62行目に`<script src="browser-polyfill.min.js"></script>`が存在するか確認
- manifest.jsonの`content_scripts`で`browser-polyfill.min.js`が先に読み込まれているか確認

---

## 完了基準
- 全10テストケースが「✅ 合格」であること
- ブラウザコンソールに重大なエラーが無いこと
- 既存のFirefox機能（v2.0.0以前）が全て動作すること

---

## 関連ドキュメント
- [PLAN.md](../PLAN.md) - Chrome対応実装計画
- [README.md](../README.md) - 拡張機能の使い方
- [tests/popup.test.js](./popup.test.js) - ポップアップ自動テスト
- [tests/background.test.js](./background.test.js) - バックグラウンド自動テスト
