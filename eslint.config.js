export default [
  {
    ignores: [
      'node_modules/**',
      'dist-chrome/**',
      'web-ext-artifacts/**',
      'coverage/**',
      '.serena/**',
      '*.min.js',
      'browser-polyfill.min.js',
      'popup/browser-polyfill.min.js'
    ]
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        browser: 'readonly',
        chrome: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        MutationObserver: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        // DOM API
        Node: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        Text: 'readonly',
        NodeFilter: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off'
    }
  },
  {
    files: ['tests/**/*.js', '__tests__/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        global: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly'
      }
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly'
      }
    }
  }
];
