# ユーザーガイド

## 目次
- [初回セットアップ](#初回セットアップ)
- [基本的な使い方](#基本的な使い方)
- [高度な使い方](#高度な使い方)
- [FAQ](#faq)
- [トラブルシューティング](#トラブルシューティング)

---

## 初回セットアップ

### 1. 拡張機能のインストール

#### Chrome/Edgeの場合
1. リポジトリをクローンまたはダウンロード
   ```bash
   git clone https://github.com/doganaylab/geminitranslate.git
   cd geminitranslate
   ```

2. 依存関係をインストール
   ```bash
   npm install
   ```

3. Chrome用にビルド
   ```bash
   npm run build:chrome
   ```

4. Chromeで拡張機能を読み込む
   - `chrome://extensions/` を開く
   - 右上の「デベロッパーモード」をON
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist-chrome/` フォルダを選択

#### Firefoxの場合
1. Firefoxを開き、`about:debugging` にアクセス
2. 「この Firefox」をクリック
3. 「一時的なアドオンを読み込む」をクリック
4. リポジトリ内の `manifest.json` を選択

### 2. API Keyの設定

1. **OpenRouterアカウント作成**
   - [OpenRouter](https://openrouter.ai/)にアクセス
   - Google、GitHub、またはメールでサインアップ（無料）

2. **API Keyを生成**
   - [API Keys](https://openrouter.ai/keys)ページにアクセス
   - 「Create Key」をクリック
   - キーをコピー

3. **拡張機能にAPI Keyを設定**
   - ブラウザのツールバーで拡張機能アイコンをクリック
   - ポップアップが開く
   - 「API Key」欄にコピーしたキーを貼り付け
   - 「Save」ボタンをクリック

4. **接続テスト**
   - 「Test Connection」ボタンをクリック
   - ✅ "Connection successful!" が表示されればOK
   - ❌ エラーが出た場合はキーを確認

### 3. 言語設定

1. **ターゲット言語を選択**
   - ポップアップまたはオプションページで言語を選択
   - 日本語、英語、中国語、韓国語など20+言語対応

2. **モデルを選択**（オプション）
   - デフォルト: `Google Gemini 2.0 Flash (Free)`
   - 他のモデルも選択可能（一部有料）
   - 無料モデル:
     - Google Gemini 2.0 Flash
     - Anthropic Claude 3.5 Haiku

---

## 基本的な使い方

### ページ全体を翻訳する

#### 方法1: ショートカットキー
1. 翻訳したいページを開く
2. **Alt+W**（Windows/Linux）または **Option+W**（Mac）を押す
3. 翻訳が開始される
4. 進捗バーで進行状況を確認
5. 翻訳完了まで待つ（大きなページは数分かかる場合あり）

#### 方法2: ポップアップUI
1. 拡張機能アイコンをクリック
2. 「Translate Page」ボタンをクリック
3. 翻訳が開始される

#### 注意事項
- 翻訳中はタブを閉じないでください
- 既に翻訳済みの部分はキャッシュされ、再翻訳されません
- 途中で止まった場合は、もう一度「Translate Page」をクリック

### 選択したテキストを翻訳する

1. **テキストを選択**
   - マウスでドラッグして翻訳したいテキストを選択

2. **ショートカットキー**
   - **Alt+Y**（Windows/Linux）または **Option+Y**（Mac）を押す

3. **フローティングUIで確認**
   - 選択箇所の近くに翻訳結果が表示される
   - 「Copy」ボタンで結果をコピー可能
   - 外側をクリックで閉じる

### クリップボードの内容を翻訳する

1. **テキストをコピー**
   - 任意のテキストをクリップボードにコピー（Ctrl+C または Cmd+C）

2. **ショートカットキー**
   - **Alt+C**（Windows/Linux）または **Option+C**（Mac）を押す

3. **翻訳結果を確認**
   - フローティングUIに翻訳結果が表示される
   - 「Copy」ボタンで結果をコピー可能

### ページを元に戻す

1. **リセットボタン**
   - ポップアップUIの「Reset to Original」ボタンをクリック

2. **効果**
   - 翻訳されたテキストが元の言語に戻る
   - ページの構造は変わらない

---

## 高度な使い方

### モデルの変更

1. **オプションページを開く**
   - 拡張機能アイコンを右クリック → 「オプション」
   - または、ポップアップから「Options」リンクをクリック

2. **モデルを選択**
   - 「AI Model」セクションでドロップダウンから選択
   - モデル一覧:
     - **Google Gemini 2.0 Flash (Free)** - 最速・無料
     - **Google Gemini Flash 1.5 8B** - 軽量・高速
     - **Anthropic Claude 3.5 Haiku (Free)** - 高品質・無料
     - **OpenAI GPT-4o Mini** - 高精度（有料）
     - その他20+モデル

3. **保存**
   - 「Save」ボタンをクリック

### プロバイダー指定（高度な設定）

特定のプロバイダーを優先させることで、速度やコストを最適化できます。

1. **プロバイダー名を入力**
   - オプションページの「Provider Name」欄に入力
   - 例: `DeepInfra`, `Together`, `Lepton`

2. **効果**
   - OpenRouterが指定したプロバイダーを優先的に使用
   - 速度改善やコスト削減の可能性

### キャッシュのクリア

翻訳結果が古い、または誤っている場合にキャッシュをクリアします。

1. **オプションページを開く**

2. **Cache Managementセクション**
   - 「Clear All Cache」ボタンをクリック
   - または、個別に:
     - 「Clear Memory Cache」- メモリキャッシュのみクリア
     - 「Clear Session Cache」- セッションストレージのみクリア
     - 「Clear Local Cache」- ローカルストレージのみクリア

3. **効果**
   - 全ての翻訳キャッシュが削除される
   - 次回の翻訳で新しい結果が取得される

### フォントサイズ・行間の調整

翻訳後のテキストを読みやすくするために、フォントサイズや行間を調整できます。

1. **オプションページを開く**

2. **Language Settingsセクション**
   - 「Font Size」スライダーを調整（12px - 24px）
   - 「Line Height」スライダーを調整（1.0 - 2.0）

3. **プレビューで確認**
   - 設定欄の下にプレビューが表示される
   - リアルタイムで変更が反映される

4. **保存**
   - 「Save」ボタンをクリック

### ダークモードの切り替え

1. **自動検出**
   - デフォルトではブラウザのテーマ設定に従う
   - ブラウザがダークモードならUIもダークモード

2. **手動切り替え**
   - オプションページの「Appearance Settings」
   - 「Enable Dark Mode」トグルをON/OFF

---

## FAQ

### Q1: 翻訳が遅いのはなぜ？

**A:** 以下の理由が考えられます:
- **ページサイズ**: 大きなページは時間がかかる（10,000+ノードで数分）
- **ネットワーク速度**: インターネット接続が遅い
- **APIレート制限**: 無料プランには制限がある
- **モデル選択**: 一部のモデルは処理が遅い

**対策:**
1. Gemini 2.0 Flash（最速の無料モデル）を使用
2. 高速なインターネット接続を使用
3. キャッシュを有効化（デフォルトON）

### Q2: 一部のテキストが翻訳されない

**A:** 以下の要素は意図的に除外されています:
- `<script>`, `<style>`, `<noscript>` タグ内
- `<iframe>` 内のコンテンツ
- `<code>`, `<pre>` タグ内（コード）
- 非表示要素（`display: none` など）
- 単一文字や数字のみのテキスト

**対策:**
- これは正常な動作です
- コードや特殊な要素を翻訳したい場合は選択翻訳（Alt+Y）を使用

### Q3: 翻訳結果が不自然

**A:** AIモデルによって翻訳品質が異なります。

**対策:**
1. **モデルを変更する**
   - Claude 3.5 Haikuは文章の品質が高い
   - GPT-4o Miniも高品質（有料）

2. **言語ペアを確認**
   - 一部の言語ペアは精度が低い場合あり

3. **キャッシュをクリア**
   - 古い翻訳がキャッシュされている可能性

### Q4: APIキーのコストはどのくらい？

**A:** **無料モデルを使用すれば完全無料です！**

- **Gemini 2.0 Flash (Free)**: 完全無料（デフォルト）
- **Claude 3.5 Haiku (Free)**: 完全無料

有料モデルのコスト例（OpenRouter価格）:
- GPT-4o Mini: $0.15/million tokens
- Claude 3.5 Sonnet: $3/million tokens

参考: 平均的なWebページ（1000単語）= 約1,500トークン

### Q5: プライバシーは大丈夫？

**A:** はい、安全です。

- **APIキー**: ブラウザのローカルストレージに保存（暗号化なし）
- **翻訳テキスト**: OpenRouter APIにのみ送信（HTTPS）
- **ユーザーデータ**: 一切収集・保存されません
- **拡張機能**: オープンソース（コードを確認可能）

詳細: [OpenRouter Privacy Policy](https://openrouter.ai/privacy)

### Q6: 動的コンテンツも翻訳される？

**A:** はい、MutationObserverで自動検出します。

- SPAやAjaxで追加されたコンテンツも翻訳
- ただし、一部のフレームワーク（React、Vueなど）では干渉する可能性

**問題がある場合:**
1. ページをリロードして再翻訳
2. 選択翻訳（Alt+Y）を使用

---

## トラブルシューティング

### 翻訳が全く動作しない

1. **APIキーを確認**
   - オプションページでキーが正しく入力されているか確認
   - 「Test Connection」でテスト

2. **ブラウザコンソールを確認**
   - F12でDevToolsを開く
   - Consoleタブでエラーメッセージを確認
   - よくあるエラー:
     - `401 Unauthorized` → API keyが無効
     - `429 Too Many Requests` → レート制限超過
     - `Network error` → インターネット接続の問題

3. **拡張機能を再インストール**
   - 拡張機能を削除
   - ブラウザを再起動
   - 再度インストール

### Service Workerが停止する（Chrome）

1. **Service Worker Internalsを開く**
   - `chrome://serviceworker-internals/` にアクセス
   - "DoganayLab API Translate" を探す
   - 「Stop」をクリックしてから拡張機能をリロード

2. **Keep-Aliveメカニズム**
   - 拡張機能には自動復旧機能があります
   - 数秒待ってから再試行

### キャッシュが効かない

1. **ストレージ容量を確認**
   - ブラウザのストレージ容量制限を超えていないか確認
   - F12 → Application → Storage

2. **キャッシュをクリア**
   - オプションページ → 「Clear All Cache」
   - 再度翻訳してキャッシュを再構築

3. **キャッシュ設定を確認**
   - オプションページ → 「Cache Enabled」がONか確認

### ダークモードが動作しない

1. **ブラウザのテーマ設定を確認**
   - ブラウザがダークモードになっているか確認

2. **拡張機能をリロード**
   - `chrome://extensions/` または `about:debugging`
   - 拡張機能の「再読み込み」ボタンをクリック

3. **DevToolsでprefers-color-schemeを確認**
   - F12 → Console
   - `window.matchMedia('(prefers-color-scheme: dark)').matches` を実行
   - `true` ならダークモードが有効

### 翻訳が途中で止まる

1. **もう一度「Translate Page」をクリック**
   - キャッシュされているので、残りの部分のみ翻訳される

2. **タブを開いたままにする**
   - タブを閉じると処理が中断される

3. **コンソールでエラーを確認**
   - ネットワークエラーやタイムアウトの可能性

---

## サポート

### バグ報告・機能リクエスト
- GitHub Issues: [https://github.com/doganaylab/geminitranslate/issues](https://github.com/doganaylab/geminitranslate/issues)

### 開発者向けドキュメント
- [ARCHITECTURE.md](../ARCHITECTURE.md) - アーキテクチャ設計
- [API.md](API.md) - API仕様書
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 開発貢献ガイド

---

Happy translating! 🌍
