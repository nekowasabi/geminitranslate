const { merge } = require('webpack-merge');
const common = require('./webpack.common.cjs');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
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
        { from: 'public/manifest.v2.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],
});
