const { merge } = require('webpack-merge');
const common = require('./webpack.common.cjs');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const fs = require('fs');
const packageJson = require('../package.json');

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
    new HtmlWebpackPlugin({
      template: 'public/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
      inject: 'body',
    }),
    new HtmlWebpackPlugin({
      template: 'public/options.html',
      filename: 'options.html',
      chunks: ['options'],
      inject: 'body',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'public/manifest.v2.json',
          to: 'manifest.json',
          transform(content) {
            const manifest = JSON.parse(content.toString());
            manifest.version = packageJson.version;
            return JSON.stringify(manifest, null, 2);
          },
        },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
        { from: 'src/styles/content.css', to: 'content.css' },
      ],
    }),
  ],
});
