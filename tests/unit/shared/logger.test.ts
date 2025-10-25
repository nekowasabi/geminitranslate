/**
 * @jest-environment jsdom
 */
import { logger } from '../../../src/shared/utils/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('log', () => {
    it('should call console.log with prefix', () => {
      logger.log('test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[LOG]');
      expect(callArgs[0]).toContain('test message');
    });

    it('should handle multiple arguments', () => {
      logger.log('test', 'arg1', 'arg2');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain('test');
      expect(callArgs[1]).toBe('arg1');
      expect(callArgs[2]).toBe('arg2');
    });

    it('should include timestamp in output', () => {
      logger.log('timestamped message');

      const callArgs = consoleLogSpy.mock.calls[0];
      // Timestamp format: YYYY-MM-DD HH:MM:SS
      expect(callArgs[0]).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe('warn', () => {
    it('should call console.warn with prefix', () => {
      logger.warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleWarnSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[WARN]');
      expect(callArgs[0]).toContain('warning message');
    });

    it('should handle multiple arguments', () => {
      logger.warn('warning', { key: 'value' });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleWarnSpy.mock.calls[0];
      expect(callArgs[0]).toContain('warning');
      expect(callArgs[1]).toEqual({ key: 'value' });
    });
  });

  describe('error', () => {
    it('should call console.error with prefix', () => {
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleErrorSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[ERROR]');
      expect(callArgs[0]).toContain('error message');
    });

    it('should handle Error objects', () => {
      const error = new Error('test error');
      logger.error('Something went wrong:', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleErrorSpy.mock.calls[0];
      expect(callArgs[0]).toContain('Something went wrong:');
      expect(callArgs[1]).toEqual(error);
    });

    it('should include stack trace for errors', () => {
      const error = new Error('stack trace test');
      logger.error('Error occurred:', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const callArgs = consoleErrorSpy.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('stack');
    });
  });

  describe('production mode', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      // Reset module cache to apply env change
      jest.resetModules();
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      jest.resetModules();
    });

    it('should suppress log in production', () => {
      // Re-import logger with production env
      const { logger: prodLogger } = require('../../../src/shared/utils/logger');

      prodLogger.log('production log');

      // In production, log should be suppressed
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should still show warnings in production', () => {
      const { logger: prodLogger } = require('../../../src/shared/utils/logger');

      prodLogger.warn('production warning');

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should still show errors in production', () => {
      const { logger: prodLogger } = require('../../../src/shared/utils/logger');

      prodLogger.error('production error');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('formatting', () => {
    it('should format objects correctly', () => {
      const obj = { foo: 'bar', nested: { key: 'value' } };
      logger.log('Object:', obj);

      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[1]).toEqual(obj);
    });

    it('should format arrays correctly', () => {
      const arr = [1, 2, 3, 'test'];
      logger.log('Array:', arr);

      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[1]).toEqual(arr);
    });
  });
});
