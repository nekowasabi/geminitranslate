/**
 * UpdateManifestVersionPlugin
 *
 * package.jsonのversionをmanifest.jsonに自動的に反映するWebpackプラグイン
 *
 * Usage:
 *   new UpdateManifestVersionPlugin()
 */
const fs = require('fs');
const path = require('path');

function readPackageVersion() {
  // Why: fs.readFileSync instead of require — require cache would keep a stale version
  // if package.json is bumped in the same Node process.
  const packageJsonPath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function syncSourceManifest(filePath, version) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (manifest.version === version) {
    return;
  }

  const oldVersion = manifest.version;
  manifest.version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `[UpdateManifestVersionPlugin] Synced ${path.basename(filePath)}: ${oldVersion} → ${version}`,
  );
}

class UpdateManifestVersionPlugin {
  apply(compiler) {
    compiler.hooks.beforeRun.tap('UpdateManifestVersionPlugin', () => {
      const version = readPackageVersion();
      syncSourceManifest(path.join(__dirname, '../public/manifest.v2.json'), version);
      syncSourceManifest(path.join(__dirname, '../public/manifest.v3.json'), version);
    });

    compiler.hooks.watchRun.tap('UpdateManifestVersionPlugin', () => {
      const version = readPackageVersion();
      syncSourceManifest(path.join(__dirname, '../public/manifest.v2.json'), version);
      syncSourceManifest(path.join(__dirname, '../public/manifest.v3.json'), version);
    });

    compiler.hooks.thisCompilation.tap('UpdateManifestVersionPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'UpdateManifestVersionPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
        },
        (assets) => {
          const manifestAsset = assets['manifest.json'];
          if (!manifestAsset) {
            console.warn('[UpdateManifestVersionPlugin] manifest.json not found in assets');
            return;
          }

          try {
            const version = readPackageVersion();
            const manifestContent = manifestAsset.source().toString();
            const manifest = JSON.parse(manifestContent);

            const oldVersion = manifest.version;
            manifest.version = version;

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
