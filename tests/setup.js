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
    onMessage: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    sendMessage: jest.fn(() => Promise.resolve()),
  },
};

// Mock chrome API (for compatibility)
global.chrome = global.browser;
