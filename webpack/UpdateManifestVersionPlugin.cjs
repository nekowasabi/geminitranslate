/**
 * UpdateManifestVersionPlugin
 *
 * package.jsonのversionをmanifest.jsonに自動的に反映するWebpackプラグイン
 *
 * Usage:
 *   new UpdateManifestVersionPlugin()
 */
class UpdateManifestVersionPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('UpdateManifestVersionPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'UpdateManifestVersionPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
        },
        (assets) => {
          // manifest.jsonを探す
          const manifestAsset = assets['manifest.json'];
          if (!manifestAsset) {
            console.warn('[UpdateManifestVersionPlugin] manifest.json not found in assets');
            return;
          }

          try {
            // package.jsonからバージョンを取得
            const packageJson = require('../package.json');
            const version = packageJson.version;

            // manifest.jsonを読み込んで更新
            const manifestContent = manifestAsset.source().toString();
            const manifest = JSON.parse(manifestContent);

            const oldVersion = manifest.version;
            manifest.version = version;

            // 更新されたmanifestをアセットに戻す
            const updatedContent = JSON.stringify(manifest, null, 2);

            compilation.updateAsset('manifest.json',
              new compiler.webpack.sources.RawSource(updatedContent)
            );

            if (oldVersion !== version) {
              console.log(`[UpdateManifestVersionPlugin] Updated manifest version: ${oldVersion} → ${version}`);
            }
          } catch (error) {
            compilation.errors.push(
              new Error(`[UpdateManifestVersionPlugin] Failed to update manifest version: ${error.message}`)
            );
          }
        }
      );
    });
  }
}

module.exports = UpdateManifestVersionPlugin;
