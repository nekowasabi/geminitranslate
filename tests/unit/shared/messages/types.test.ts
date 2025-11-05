/**
 * Message Types Unit Tests
 *
 * Tests for message type definitions to ensure correct structure
 * and type safety across extension messaging architecture.
 */

import {
  MessageType,
  BatchCompletedMessage,
  TranslationRequestMessage,
  Message,
} from '../../../../src/shared/messages/types';

describe('Message Types', () => {
  describe('BatchCompletedMessage', () => {
    it('should have correct type property', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: ['翻訳1', '翻訳2'],
          nodeIndices: [0, 1],
          phase: 1,
          progress: {
            current: 1,
            total: 5,
            percentage: 20,
          },
        },
      };

      expect(message.type).toBe(MessageType.BATCH_COMPLETED);
      expect(message.type).toBe('batchCompleted');
    });

    it('should have correct payload structure', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 2,
          translations: ['こんにちは', '世界', 'テスト'],
          nodeIndices: [10, 11, 12],
          phase: 1,
          progress: {
            current: 3,
            total: 10,
            percentage: 30,
          },
        },
      };

      expect(message.payload.batchIndex).toBe(2);
      expect(message.payload.translations).toHaveLength(3);
      expect(message.payload.nodeIndices).toEqual([10, 11, 12]);
      expect(message.payload.phase).toBe(1);
      expect(message.payload.progress.current).toBe(3);
      expect(message.payload.progress.total).toBe(10);
      expect(message.payload.progress.percentage).toBe(30);
    });

    it('should support Phase 1 (Viewport translation)', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: ['翻訳'],
          nodeIndices: [0],
          phase: 1,
          progress: {
            current: 1,
            total: 1,
            percentage: 100,
          },
        },
      };

      expect(message.payload.phase).toBe(1);
    });

    it('should support Phase 2 (Full-page translation)', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: ['翻訳'],
          nodeIndices: [0],
          phase: 2,
          progress: {
            current: 1,
            total: 1,
            percentage: 100,
          },
        },
      };

      expect(message.payload.phase).toBe(2);
    });

    it('should be assignable to Message union type', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: ['test'],
          nodeIndices: [0],
          phase: 1,
          progress: {
            current: 1,
            total: 1,
            percentage: 100,
          },
        },
      };

      // Should compile without error
      const unionMessage: Message = message;
      expect(unionMessage.type).toBe(MessageType.BATCH_COMPLETED);
    });

    it('should support empty translations array', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: [],
          nodeIndices: [],
          phase: 1,
          progress: {
            current: 0,
            total: 5,
            percentage: 0,
          },
        },
      };

      expect(message.payload.translations).toHaveLength(0);
      expect(message.payload.nodeIndices).toHaveLength(0);
    });

    it('should support progress with 0% percentage', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: ['test'],
          nodeIndices: [0],
          phase: 1,
          progress: {
            current: 0,
            total: 10,
            percentage: 0,
          },
        },
      };

      expect(message.payload.progress.percentage).toBe(0);
    });

    it('should support progress with 100% percentage', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 9,
          translations: ['test'],
          nodeIndices: [99],
          phase: 2,
          progress: {
            current: 10,
            total: 10,
            percentage: 100,
          },
        },
      };

      expect(message.payload.progress.percentage).toBe(100);
    });

    it('should have matching translations and nodeIndices lengths', () => {
      const message: BatchCompletedMessage = {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: ['翻訳1', '翻訳2', '翻訳3'],
          nodeIndices: [0, 1, 2],
          phase: 1,
          progress: {
            current: 1,
            total: 5,
            percentage: 20,
          },
        },
      };

      expect(message.payload.translations.length).toBe(message.payload.nodeIndices.length);
    });
  });

  describe('MessageType.BATCH_COMPLETED', () => {
    it('should be defined in MessageType enum', () => {
      expect(MessageType.BATCH_COMPLETED).toBeDefined();
      expect(MessageType.BATCH_COMPLETED).toBe('batchCompleted');
    });

    it('should be a valid message type value', () => {
      const allMessageTypes = Object.values(MessageType);
      expect(allMessageTypes).toContain(MessageType.BATCH_COMPLETED);
    });
  });
});
