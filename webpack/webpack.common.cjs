const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV || 'production',

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: [/node_modules/, /tests/],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@shared': path.resolve(__dirname, '../src/shared'),
      '@background': path.resolve(__dirname, '../src/background'),
      '@content': path.resolve(__dirname, '../src/content'),
      '@popup': path.resolve(__dirname, '../src/popup'),
      '@options': path.resolve(__dirname, '../src/options'),
    },
  },

  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          priority: 10,
        },
      },
    },
  },
};
