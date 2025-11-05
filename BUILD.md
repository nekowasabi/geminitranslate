# Build Instructions for DoganayLab API Translate App

このドキュメントでは、DoganayLab API Translate AppのFirefox拡張機能を完全に再構築するための手順を説明します。

## システム要件

### OS
- Linux (Ubuntu 20.04+, Fedora 34+など)
- macOS (10.15+)
- Windows 10/11

### 必須ツール

#### Node.js と npm
- **Node.js**: v18.0.0 以上
- **npm**: v9.0.0 以上

Node.jsとnpmのインストール確認:
```bash
node --version  # v18.x.x 以上
npm --version   # v9.x.x 以上
```

インストールしていない場合:
- [Node.js 公式サイト](https://nodejs.org/) から LTS版をダウンロード
- または、パッケージマネージャーを使用:
  ```bash
  # Ubuntu/Debian
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs

  # macOS (Homebrew)
  brew install node@18

  # Windows (Chocolatey)
  choco install nodejs
  ```

#### Python (オプション)
- Node.jsビルドツール（node-gyp）で必要な場合のみ
- **Python**: v3.7 以上

#### Firefox (テスト用)
- Firefox 58 以上

## ステップバイステップビルド手順

### 1. ソースコードの準備

```bash
# リポジトリをクローン（またはzipファイルを解凍）
git clone https://github.com/doganaylab/geminitranslate.git
cd geminitranslate

# または、ダウンロードしたzipファイルを解凍
unzip doganaylab-api-translate-source-3.0.1.zip
cd geminitranslate
```

### 2. 依存関係のインストール

```bash
# 依存パッケージをインストール
npm install
```

このコマンドは `package-lock.json` に基づいて、確認されたバージョンの全ての依存パッケージをインストールします。

**期待される出力**: `added XXX packages` というメッセージ

### 3. Firefox拡張機能のビルド

```bash
# Firefoxビルド実行
npm run build:firefox
```

このコマンドは以下を実行します:
1. TypeScriptコンパイル
2. Webpack バンドリング
3. マニフェストファイルのコピー
4. アイコンファイルのコピー

**期待される出力**:
```
> NODE_ENV=production webpack --config webpack/webpack.firefox.cjs

webpack 5.102.1 compiled successfully in XXXX ms
```

**ビルド成果物の場所**: `dist-firefox/`

### 4. ビルド成功確認

```bash
# マニフェストファイルが正しく生成されたか確認
cat dist-firefox/manifest.json | grep -A2 version

# 出力例:
# "version": "3.0.1",
```

### 5. Firefox へのロード（テスト用）

#### 方法1: about:debuggingを使用

1. Firefox を開く
2. アドレスバーに `about:debugging` と入力
3. 「このFirefox」をクリック
4. 「一時的なアドオンを読み込む...」ボタンをクリック
5. `dist-firefox/manifest.json` を選択

#### 方法2: web-extを使用

```bash
# web-extコマンドで自動的にFirefoxで実行
web-ext run --source-dir=dist-firefox
```

## デバッグとトラブルシューティング

### npm install が失敗する場合

```bash
# キャッシュをクリアして再試行
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### ビルドが失敗する場合

```bash
# キャッシュをクリア
npm run clean:firefox

# 再度ビルド
npm run build:firefox
```

### Firefox での読み込みに失敗する場合

1. DevTools (F12) のコンソールでエラーを確認
2. `manifest.json` のバージョンが正しいか確認
3. 一時的なアドオンを削除して再度読み込む

## その他のビルドコマンド

```bash
# Chrome拡張機能のビルド
npm run build:chrome

# 両方をビルド
npm run build:all

# Firefoxパッケージを作成 (.xpi)
npm run package:firefox

# Chromeパッケージを作成 (.zip)
npm run package:chrome

# コード品質チェック
npm run lint

# テスト実行
npm run test

# 開発モード（ファイル変更時に自動リビルド）
npm run dev:firefox
```

## 検証チェックリスト

ビルドが完了したら、以下の項目を確認してください:

- [ ] `npm install` が正常に完了（エラーなし）
- [ ] `npm run build:firefox` が正常に完了
- [ ] `dist-firefox/manifest.json` が存在
- [ ] `dist-firefox/manifest.json` にバージョン "3.0.1" が記載
- [ ] `dist-firefox/content.js` が存在（33KB以上）
- [ ] `dist-firefox/background.js` が存在（29KB以上）
- [ ] Firefox で一時的に読み込めた
- [ ] 拡張機能がポップアップメニューに表示される
- [ ] 翻訳機能が正常に動作する

## ビルド環境設定（オプション）

### npm設定の最適化

`.npmrc` ファイルで npm の動作をカスタマイズできます:

```ini
# npm レジストリの設定
registry=https://registry.npmjs.org/

# 監査スキップ（本番環境では推奨しません）
audit=false

# タイムアウト設定（遅いネットワーク用）
fetch-timeout=60000
```

### Node.js バージョン管理

複数のNode.jsバージョンを管理する場合は、nvm (Node Version Manager) を使用:

```bash
# nvm のインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Node.js v18 をインストール
nvm install 18
nvm use 18
```

## 参考情報

- [Node.js 公式ドキュメント](https://nodejs.org/docs/)
- [npm 公式ドキュメント](https://docs.npmjs.com/)
- [Mozilla WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Firefox Add-ons Submission Guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Distribution)

## サポート

ビルドに問題が発生した場合:

1. このドキュメントのトラブルシューティングセクションを確認
2. `npm run lint` でコード品質をチェック
3. Firefox DevTools でエラーメッセージを確認
4. GitHub Issues でサポートを依頼
