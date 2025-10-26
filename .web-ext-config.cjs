module.exports = {
  // Firefox用のビルド成果物ディレクトリを指定
  sourceDir: './dist-firefox',

  // パッケージング成果物の保存先
  artifactsDir: './web-ext-artifacts',

  // パッケージに含めないファイル・ディレクトリ
  ignoreFiles: [
    'web-ext-artifacts',
    'node_modules',
    '.git',
    'src',
    'webpack',
    'tests',
    'tmp',
    'public',
    'docs',
    '*.md',
    '.eslintrc.*',
    '.eslintignore',
    'tsconfig.json',
    'package*.json',
    'postcss.config.js',
    'jest.config.js',
    'tailwind.config.js',
  ],

  // ビルド設定
  build: {
    overwriteDest: true,
  },
};
