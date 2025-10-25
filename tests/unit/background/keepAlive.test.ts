/**
 * KeepAlive Unit Tests
 *
 * Tests for the Chrome Service Worker keep-alive mechanism that prevents
 * the service worker from being terminated by creating an offscreen document
 * and sending periodic ping messages.
 */

import { KeepAlive } from '../../../src/background/keepAlive';

// Mock chrome API
const mockChrome = {
  offscreen: {
    createDocument: jest.fn(),
    closeDocument: jest.fn(),
  },
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
  },
};

// @ts-ignore
global.chrome = mockChrome;

jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('KeepAlive', () => {
  let keepAlive: KeepAlive;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock setInterval and clearInterval
    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');

    // Reset chrome mocks
    mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
    mockChrome.runtime.sendMessage.mockResolvedValue(undefined);
    mockChrome.runtime.lastError = null;

    keepAlive = new KeepAlive();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockSetInterval.mockRestore();
    mockClearInterval.mockRestore();
  });

  describe('start()', () => {
    it('should create offscreen document and start ping interval', async () => {
      // Act
      await keepAlive.start();

      // Assert
      expect(mockChrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: 'offscreen.html',
        reasons: ['BLOBS' as chrome.offscreen.Reason],
        justification: 'Keep service worker alive',
      });
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 20000);
    });

    it('should not create duplicate offscreen document if already started', async () => {
      // Arrange
      await keepAlive.start();
      mockChrome.offscreen.createDocument.mockClear();

      // Act
      await keepAlive.start();

      // Assert
      expect(mockChrome.offscreen.createDocument).not.toHaveBeenCalled();
    });

    it('should handle createDocument errors gracefully', async () => {
      // Arrange
      const mockError = new Error('Document already exists');
      mockChrome.offscreen.createDocument.mockRejectedValue(mockError);
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await keepAlive.start();

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        'KeepAlive: Failed to create offscreen document',
        mockError
      );
    });

    it('should send ping messages at 20 second intervals', async () => {
      // Arrange
      await keepAlive.start();

      // Act - Advance timer by 20 seconds
      jest.advanceTimersByTime(20000);
      await Promise.resolve(); // Flush promises

      // Assert
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'keepalive',
      });
    });

    it('should send multiple ping messages over time', async () => {
      // Arrange
      await keepAlive.start();

      // Act - Advance timer by 60 seconds (3 pings)
      jest.advanceTimersByTime(20000);
      await Promise.resolve();
      jest.advanceTimersByTime(20000);
      await Promise.resolve();
      jest.advanceTimersByTime(20000);
      await Promise.resolve();

      // Assert
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe('stop()', () => {
    it('should clear ping interval', async () => {
      // Arrange
      await keepAlive.start();
      const intervalId = (keepAlive as any).intervalId;

      // Act
      keepAlive.stop();

      // Assert
      expect(mockClearInterval).toHaveBeenCalledWith(intervalId);
    });

    it('should handle stop when not started', () => {
      // Act & Assert - Should not throw
      expect(() => keepAlive.stop()).not.toThrow();
    });

    it('should mark as not started after stop', async () => {
      // Arrange
      await keepAlive.start();
      keepAlive.stop();

      // Act - Should create new document after stop
      mockChrome.offscreen.createDocument.mockClear();
      await keepAlive.start();

      // Assert
      expect(mockChrome.offscreen.createDocument).toHaveBeenCalled();
    });
  });

  describe('sendPing()', () => {
    it('should send keepalive message to runtime', async () => {
      // Act
      await keepAlive.start();
      jest.advanceTimersByTime(20000);
      await Promise.resolve();

      // Assert
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'keepalive',
      });
    });

    it('should handle ping errors gracefully', async () => {
      // Arrange
      const mockError = new Error('Message send failed');
      mockChrome.runtime.sendMessage.mockRejectedValue(mockError);
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await keepAlive.start();
      jest.advanceTimersByTime(20000);
      await Promise.resolve();

      // Assert - Should not throw, just log error
      expect(logger.error).toHaveBeenCalledWith(
        'KeepAlive: Failed to send ping',
        mockError
      );
    });
  });

  describe('Chrome runtime.lastError handling', () => {
    it('should handle runtime.lastError during document creation', async () => {
      // Arrange
      const mockError = new Error('Document already exists');
      mockChrome.offscreen.createDocument.mockRejectedValue(mockError);
      mockChrome.runtime.lastError = { message: 'Document already exists' };
      const { logger } = require('../../../src/shared/utils/logger');

      // Act
      await keepAlive.start();

      // Assert - Should log warning when document creation fails
      expect(logger.warn).toHaveBeenCalledWith(
        'KeepAlive: Failed to create offscreen document',
        mockError
      );
    });
  });
});
