/**
 * MessageHandler Unit Tests
 *
 * Tests for the message routing handler that processes incoming messages
 * and delegates to appropriate services (TranslationEngine, OpenRouterClient).
 */

import { MessageHandler } from "../../../src/background/messageHandler";
import { TranslationEngine } from "../../../src/background/translationEngine";
import { OpenRouterClient } from "../../../src/background/apiClient";
import { MessageType } from "../../../src/shared/messages/types";

// Mock dependencies
jest.mock("../../../src/background/translationEngine");
jest.mock("../../../src/background/apiClient");
jest.mock("../../../src/shared/utils/logger", () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("MessageHandler", () => {
  let handler: MessageHandler;
  let mockEngine: jest.Mocked<TranslationEngine>;
  let mockClient: jest.Mocked<OpenRouterClient>;
  let mockSendResponse: jest.Mock;
  let mockSender: chrome.runtime.MessageSender;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockEngine = new TranslationEngine() as jest.Mocked<TranslationEngine>;
    mockClient = new OpenRouterClient() as jest.Mocked<OpenRouterClient>;

    // Create handler
    handler = new MessageHandler(mockEngine, mockClient);

    // Mock sendResponse callback
    mockSendResponse = jest.fn();

    // Mock sender
    mockSender = {
      tab: {
        id: 1,
        index: 0,
        pinned: false,
        highlighted: false,
        active: true,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        windowId: 1,
      },
      id: "test-extension-id",
      url: "https://example.com",
    };
  });

  describe("handle() - Message Routing", () => {
    describe("requestTranslation action", () => {
      it("should call TranslationEngine.translateBatch() and return success response", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "requestTranslation",
          payload: {
            texts: ["Hello", "World"],
            targetLanguage: "Japanese",
          },
        };

        const mockTranslations = ["こんにちは", "世界"];
        mockEngine.translateBatch = jest
          .fn()
          .mockResolvedValue(mockTranslations);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true); // Async response
        expect(mockEngine.translateBatch).toHaveBeenCalledWith(
          ["Hello", "World"],
          "Japanese",
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { translations: mockTranslations },
        });
      });

      it("should handle translation errors and return error response", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "requestTranslation",
          payload: {
            texts: ["Hello"],
            targetLanguage: "Japanese",
          },
        };

        const mockError = new Error("API rate limit exceeded");
        mockEngine.translateBatch = jest.fn().mockRejectedValue(mockError);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: "API rate limit exceeded",
        });
      });
    });

    describe("clearCache action", () => {
      it("should call TranslationEngine.clearCache() with specified layer", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "clearCache",
          payload: {
            layer: "memory" as const,
          },
        };

        mockEngine.clearCache = jest.fn().mockResolvedValue(undefined);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockEngine.clearCache).toHaveBeenCalledWith("memory");
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { message: "Cache cleared successfully" },
        });
      });

      it('should default to "all" layer if not specified', async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "clearCache",
          payload: {},
        };

        mockEngine.clearCache = jest.fn().mockResolvedValue(undefined);

        // Act
        await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(mockEngine.clearCache).toHaveBeenCalledWith("all");
      });
    });

    describe("getCacheStats action", () => {
      it("should call TranslationEngine.getCacheStats() and return stats", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "getCacheStats",
          payload: {},
        };

        const mockStats = {
          memory: 10,
          session: 5,
          local: 20,
          hitRate: 0.75,
        };
        mockEngine.getCacheStats = jest.fn().mockResolvedValue(mockStats);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockEngine.getCacheStats).toHaveBeenCalled();
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockStats,
        });
      });
    });

    describe("testConnection action", () => {
      it("should call OpenRouterClient.testConnection() when no payload provided", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "testConnection",
          payload: {},
        };

        const mockResult = {
          success: true,
          message: "Connection successful!",
        };
        mockClient.testConnection = jest.fn().mockResolvedValue(mockResult);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockClient.testConnection).toHaveBeenCalled();
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });

      it("should call OpenRouterClient.testConnectionWithConfig() when payload contains apiKey", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "testConnection",
          payload: {
            apiKey: "test-api-key",
            model: "google/gemini-2.0-flash-exp:free",
            provider: "Google",
          },
        };

        const mockResult = {
          success: true,
          message: "Connection successful!",
        };
        mockClient.testConnectionWithConfig = jest
          .fn()
          .mockResolvedValue(mockResult);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockClient.testConnectionWithConfig).toHaveBeenCalledWith({
          apiKey: "test-api-key",
          model: "google/gemini-2.0-flash-exp:free",
          provider: "Google",
        });
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });

      it("should return error when API key is empty in payload", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "testConnection",
          payload: {
            apiKey: "",
            model: "google/gemini-2.0-flash-exp:free",
          },
        };

        const mockResult = {
          success: false,
          error:
            "API key is required. Please configure your OpenRouter API key.",
        };
        mockClient.testConnectionWithConfig = jest
          .fn()
          .mockResolvedValue(mockResult);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockClient.testConnectionWithConfig).toHaveBeenCalledWith({
          apiKey: "",
          model: "google/gemini-2.0-flash-exp:free",
          provider: undefined,
        });
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });

      it("should handle connection errors", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "testConnection",
          payload: {},
        };

        const mockError = new Error("Network timeout");
        mockClient.testConnection = jest.fn().mockRejectedValue(mockError);

        // Act
        await handler.handle(message, mockSender, mockSendResponse);

        // Assert
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: "Network timeout",
        });
      });
    });

    describe("reloadConfig action", () => {
      it("should call OpenRouterClient.initialize() and return success", async () => {
        // Arrange
        const message = {
          type: MessageType.RELOAD_CONFIG,
          action: "reloadConfig",
          payload: {},
        };
        mockClient.initialize = jest.fn().mockResolvedValue(undefined);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockClient.initialize).toHaveBeenCalledTimes(1);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { message: "Configuration reloaded successfully" },
        });
      });

      it("should return error when initialize() fails", async () => {
        // Arrange
        const message = {
          type: MessageType.RELOAD_CONFIG,
          action: "reloadConfig",
          payload: {},
        };
        const error = new Error("Storage read failed");
        mockClient.initialize = jest.fn().mockRejectedValue(error);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockClient.initialize).toHaveBeenCalledTimes(1);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: "Storage read failed",
        });
      });

      it("should handle unknown error in initialize()", async () => {
        // Arrange
        const message = {
          type: MessageType.RELOAD_CONFIG,
          action: "reloadConfig",
          payload: {},
        };
        mockClient.initialize = jest.fn().mockRejectedValue("Unknown error");

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: "Failed to reload config",
        });
      });
    });

    describe("Unknown action", () => {
      it("should return error for unknown action", async () => {
        // Arrange
        const message = {
          type: MessageType.REQUEST_TRANSLATION,
          action: "unknownAction",
          payload: {},
        };

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: "Unknown action: unknownAction",
        });
      });
    });

    describe("Invalid message format", () => {
      it("should return error for message without action and unknown type", async () => {
        // Arrange
        const message = {
          type: "unknownMessageType",
          payload: {},
        };

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: expect.stringContaining(
            "Invalid message format: missing action",
          ),
        });
      });

      it("should infer action from type for backward compatibility", async () => {
        // Arrange
        const message = {
          type: "requestTranslation",
          payload: {
            texts: ["Hello"],
            targetLanguage: "Japanese",
          },
        };

        const mockTranslations = ["こんにちは"];
        mockEngine.translateBatch = jest
          .fn()
          .mockResolvedValue(mockTranslations);

        // Act
        const result = await handler.handle(
          message,
          mockSender,
          mockSendResponse,
        );

        // Assert
        expect(result).toBe(true);
        expect(mockEngine.translateBatch).toHaveBeenCalledWith(
          ["Hello"],
          "Japanese",
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: true,
          data: { translations: mockTranslations },
        });
      });
    });
  });

  describe("Error Handling", () => {
    it("should catch and handle unexpected errors in action handlers", async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: ["Test"],
          targetLanguage: "Japanese",
        },
      };

      // Mock translateBatch to throw a non-Error object
      mockEngine.translateBatch = jest.fn().mockImplementation(() => {
        throw "String error";
      });

      // Act
      const result = await handler.handle(
        message,
        mockSender,
        mockSendResponse,
      );

      // Assert
      expect(result).toBe(true);
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: "Translation failed",
      });
    });

    it("should catch and handle unexpected errors at top level", async () => {
      // Arrange - Create a message that will cause an error at the handler level
      const message = {
        type: "unknownType",
        action: null as any, // This will cause an error at the validation level
        payload: {},
      };

      // Act
      const result = await handler.handle(
        message,
        mockSender,
        mockSendResponse,
      );

      // Assert
      expect(result).toBe(true);
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining(
          "Invalid message format: missing action",
        ),
      });
    });
  });

  describe("requestTranslation - BATCH_COMPLETED streaming", () => {
    let mockChromeTabs: any;

    beforeEach(() => {
      // Mock chrome.tabs.sendMessage
      mockChromeTabs = {
        sendMessage: jest.fn(),
      };
      (global as any).chrome = {
        tabs: mockChromeTabs,
      };
    });

    afterEach(() => {
      delete (global as any).chrome;
    });

    it("should send BATCH_COMPLETED message for each batch in semi-parallel mode", async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: Array.from({ length: 25 }, (_, i) => `Text ${i}`), // 2 batches
          targetLanguage: "Japanese",
          semiParallel: true,
          priorityCount: 1,
          phase: 1,
        },
      };

      // Mock translateBatchSemiParallel to invoke callback
      mockEngine.translateBatchSemiParallel = jest
        .fn()
        .mockImplementation(
          async (
            texts: string[],
            lang: string,
            priority: number,
            callback?: (
              batchIndex: number,
              translations: string[],
              nodeIndices: number[],
            ) => void,
          ) => {
            // Simulate 2 batches
            if (callback) {
              callback(
                0,
                Array(20).fill("translated"),
                Array.from({ length: 20 }, (_, i) => i),
              );
              callback(
                1,
                Array(5).fill("translated"),
                Array.from({ length: 5 }, (_, i) => 20 + i),
              );
            }
            return Array(25).fill("translated");
          },
        );

      // Act
      await handler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(mockChromeTabs.sendMessage).toHaveBeenCalledTimes(2);

      // First BATCH_COMPLETED (batch 0)
      expect(mockChromeTabs.sendMessage).toHaveBeenNthCalledWith(1, 1, {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 0,
          translations: expect.any(Array),
          nodeIndices: expect.any(Array),
          phase: 1,
          progress: {
            current: 20,
            total: 25,
            percentage: 80,
          },
        },
      });

      // Second BATCH_COMPLETED (batch 1)
      expect(mockChromeTabs.sendMessage).toHaveBeenNthCalledWith(2, 1, {
        type: MessageType.BATCH_COMPLETED,
        payload: {
          batchIndex: 1,
          translations: expect.any(Array),
          nodeIndices: expect.any(Array),
          phase: 1,
          progress: {
            current: 25,
            total: 25,
            percentage: 100,
          },
        },
      });
    });

    it("should not send BATCH_COMPLETED in non-semiParallel mode", async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: Array(25).fill("test"),
          targetLanguage: "Japanese",
          semiParallel: false, // Standard parallel mode
        },
      };

      mockEngine.translateBatch = jest
        .fn()
        .mockResolvedValue(Array(25).fill("translated"));

      // Act
      await handler.handle(message, mockSender, mockSendResponse);

      // Assert
      expect(mockChromeTabs.sendMessage).not.toHaveBeenCalled();
      expect(mockEngine.translateBatch).toHaveBeenCalled();
    });

    it("should handle missing sender.tab.id gracefully", async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: Array(25).fill("test"),
          targetLanguage: "Japanese",
          semiParallel: true,
          priorityCount: 1,
        },
      };

      const senderWithoutTab = {
        id: "test-extension-id",
        url: "https://example.com",
      };

      mockEngine.translateBatchSemiParallel = jest
        .fn()
        .mockImplementation(
          async (
            texts: string[],
            lang: string,
            priority: number,
            callback?: (
              batchIndex: number,
              translations: string[],
              nodeIndices: number[],
            ) => void,
          ) => {
            // Callback should not crash even without tabId
            if (callback) {
              callback(
                0,
                Array(20).fill("translated"),
                Array.from({ length: 20 }, (_, i) => i),
              );
            }
            return Array(25).fill("translated");
          },
        );

      // Act & Assert - Should not throw
      await expect(
        handler.handle(message, senderWithoutTab as any, mockSendResponse),
      ).resolves.not.toThrow();

      // sendMessage should not be called without tabId
      expect(mockChromeTabs.sendMessage).not.toHaveBeenCalled();
    });

    it("should handle chrome.tabs.sendMessage errors gracefully", async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: Array(25).fill("test"),
          targetLanguage: "Japanese",
          semiParallel: true,
          priorityCount: 1,
          phase: 1,
        },
      };

      // Mock sendMessage to throw error (e.g., tab closed)
      mockChromeTabs.sendMessage.mockImplementation(() => {
        throw new Error("Tab not found");
      });

      mockEngine.translateBatchSemiParallel = jest
        .fn()
        .mockImplementation(
          async (
            texts: string[],
            lang: string,
            priority: number,
            callback?: (
              batchIndex: number,
              translations: string[],
              nodeIndices: number[],
            ) => void,
          ) => {
            if (callback) {
              callback(
                0,
                Array(20).fill("translated"),
                Array.from({ length: 20 }, (_, i) => i),
              );
            }
            return Array(25).fill("translated");
          },
        );

      // Act & Assert - Should not throw, translation should still succeed
      await expect(
        handler.handle(message, mockSender, mockSendResponse),
      ).resolves.not.toThrow();

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: { translations: expect.any(Array) },
      });
    });

    it("should calculate progress percentage correctly", async () => {
      // Arrange
      const message = {
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: Array.from({ length: 60 }, (_, i) => `Text ${i}`), // 3 batches
          targetLanguage: "Japanese",
          semiParallel: true,
          priorityCount: 1,
          phase: 1,
        },
      };

      mockEngine.translateBatchSemiParallel = jest
        .fn()
        .mockImplementation(
          async (
            texts: string[],
            lang: string,
            priority: number,
            callback?: (
              batchIndex: number,
              translations: string[],
              nodeIndices: number[],
            ) => void,
          ) => {
            if (callback) {
              callback(
                0,
                Array(20).fill("translated"),
                Array.from({ length: 20 }, (_, i) => i),
              );
              callback(
                1,
                Array(20).fill("translated"),
                Array.from({ length: 20 }, (_, i) => 20 + i),
              );
              callback(
                2,
                Array(20).fill("translated"),
                Array.from({ length: 20 }, (_, i) => 40 + i),
              );
            }
            return Array(60).fill("translated");
          },
        );

      // Act
      await handler.handle(message, mockSender, mockSendResponse);

      // Assert - Check percentage calculation
      expect(mockChromeTabs.sendMessage).toHaveBeenCalledTimes(3);

      // Batch 0: 33%
      expect(mockChromeTabs.sendMessage).toHaveBeenNthCalledWith(
        1,
        1,
        expect.objectContaining({
          payload: expect.objectContaining({
            progress: {
              current: 20,
              total: 60,
              percentage: 33,
            },
          }),
        }),
      );

      // Batch 1: 67%
      expect(mockChromeTabs.sendMessage).toHaveBeenNthCalledWith(
        2,
        1,
        expect.objectContaining({
          payload: expect.objectContaining({
            progress: {
              current: 40,
              total: 60,
              percentage: 67,
            },
          }),
        }),
      );

      // Batch 2: 100%
      expect(mockChromeTabs.sendMessage).toHaveBeenNthCalledWith(
        3,
        1,
        expect.objectContaining({
          payload: expect.objectContaining({
            progress: {
              current: 60,
              total: 60,
              percentage: 100,
            },
          }),
        }),
      );
    });
  });
});
