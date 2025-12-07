# package.jsonバージョン自動反映機能の実装

## 概要

package.jsonのバージョンを自動的にmanifest.json（Firefox用/Chrome用）に反映する仕組みをWebpackプラグインとして実装しました。

## 実装日時

2025-11-08

## 課題

- `npm run build:ext` 実行時に、zipファイルのバージョンがpackage.jsonと一致しない問題
- `public/manifest.v2.json` (Firefox)と`public/manifest.v3.json` (Chrome)のバージョンを手動で更新する必要があった
- ビルド時にバージョンの不一致が発生しやすい

## 解決策

### 1. カスタムWebpackプラグインの作成

`webpack/UpdateManifestVersionPlugin.cjs`を作成し、以下の機能を実装：

**主な機能:**
- ビルド時にpackage.jsonからバージョンを読み取る
- 出力されたmanifest.jsonのversionフィールドを自動更新
- バージョン変更時にコンソールにログ出力

**実装の特徴:**
```javascript
// webpack hooks を使用してビルドプロセスに統合
compiler.hooks.thisCompilation.tap('UpdateManifestVersionPlugin', (compilation) => {
  compilation.hooks.processAssets.tap(
    {
      name: 'UpdateManifestVersionPlugin',
      stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
    },
    (assets) => {
      // manifest.jsonを検索・更新
    }
  );
});
```

### 2. Webpack設定への統合

両方のWebpack設定ファイルにプラグインを追加：

**webpack/webpack.firefox.cjs:**
```javascript
const UpdateManifestVersionPlugin = require('./UpdateManifestVersionPlugin.cjs');

plugins: [
  // ... other plugins
  new UpdateManifestVersionPlugin(),
],
```

**webpack/webpack.chrome.cjs:**
```javascript
const UpdateManifestVersionPlugin = require('./UpdateManifestVersionPlugin.cjs');

plugins: [
  // ... other plugins
  new UpdateManifestVersionPlugin(),
],
```

## 動作確認

### テスト手順

1. `public/manifest.v2.json`と`public/manifest.v3.json`のバージョンを`1.0.0`に変更
2. Firefox/Chromeのビルドを実行
3. 自動的に`3.0.3`に更新されることを確認

### 実行結果

```bash
# Firefox版
$ npm run build:firefox
[UpdateManifestVersionPlugin] Updated manifest version: 1.0.0 → 3.0.3
✓ dist-firefox/manifest.json のバージョン: 3.0.3

# Chrome版
$ npm run build:chrome
[UpdateManifestVersionPlugin] Updated manifest version: 1.0.0 → 3.0.3
✓ dist-chrome/manifest.json のバージョン: 3.0.3

# パッケージング
$ npm run build:ext:firefox
✓ doganaylab_api_translate_app-3.0.3.zip が作成される
```

## メリット

1. **バージョン管理の一元化**: package.jsonのみを更新すればよい
2. **ヒューマンエラーの削減**: 手動更新によるバージョン不一致を防止
3. **ビルドプロセスの自動化**: ビルド時に自動的にバージョンが同期
4. **可視性の向上**: バージョン更新時にログが出力される

## 今後の運用

### バージョン更新時の手順

1. `package.json`のバージョンを更新
2. `npm run build:firefox` または `npm run build:chrome` を実行
3. プラグインが自動的にmanifest.jsonのバージョンを同期

### 注意事項

- `public/manifest.v2.json`と`public/manifest.v3.json`のバージョンフィールドは、ビルド時に上書きされる
- ソースのmanifestファイルのバージョンは参照用として保持しても問題ない

## 関連ファイル

- `webpack/UpdateManifestVersionPlugin.cjs` - プラグイン本体
- `webpack/webpack.firefox.cjs` - Firefox用Webpack設定
- `webpack/webpack.chrome.cjs` - Chrome用Webpack設定
- `public/manifest.v2.json` - Firefox用manifest（ソース）
- `public/manifest.v3.json` - Chrome用manifest（ソース）
- `package.json` - バージョンの単一ソース

## 実装者

Claude Code (AI Assistant)
