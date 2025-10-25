const { merge } = require('webpack-merge');
const common = require('./webpack.common.cjs');
const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = merge(common, {
  entry: {
    background: './src/background/background.firefox.ts',
    content: './src/content/index.ts',
    popup: './src/popup/index.tsx',
    options: './src/options/index.tsx',
  },

  output: {
    path: path.resolve(__dirname, '../dist-firefox'),
    filename: '[name].js',
    clean: true,
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public/manifest.v2.json', to: 'manifest.json' },
        { from: 'public/popup.html', to: 'popup.html', noErrorOnMissing: true },
        { from: 'public/options.html', to: 'options.html', noErrorOnMissing: true },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],
});
