// Jest setup file for browser extension environment
import { jest } from '@jest/globals';

// Mock browser API
global.browser = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
    },
  },
  runtime: {
    sendMessage: jest.fn(() => Promise.resolve()),
    getURL: jest.fn((path) => `chrome-extension://mock-extension-id/${path}`),
    getManifest: jest.fn(() => ({ version: '2.0.1' })),
    onMessage: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    sendMessage: jest.fn(() => Promise.resolve()),
  },
  commands: {
    onCommand: {
      addListener: jest.fn(),
    },
  },
};

// Mock chrome API (for compatibility)
global.chrome = global.browser;

// Export jest for tests that need it
global.jest = jest;
