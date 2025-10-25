// Jest setup file for TypeScript

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
    getManifest: jest.fn(() => ({ version: '3.0.0', manifest_version: 3 })),
    openOptionsPage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        if (callback) {
          callback({});
        }
        return Promise.resolve({});
      }),
      set: jest.fn((data, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
    },
  },
  tabs: {
    query: jest.fn((queryInfo, callback) => {
      if (callback) {
        callback([]);
      }
      return Promise.resolve([]);
    }),
    sendMessage: jest.fn(),
  },
  commands: {
    onCommand: {
      addListener: jest.fn(),
    },
  },
} as any;

// Mock Browser API (Firefox)
(global as any).browser = global.chrome as any;

// Mock console to reduce noise in tests
(global as any).console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
