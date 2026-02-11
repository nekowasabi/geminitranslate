/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  OpenRouterClient,
  ApiError,
  ParseCountMismatchError,
} from "../../../src/background/apiClient";
import StorageManager from "../../../src/shared/storage/StorageManager";

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe("OpenRouterClient", () => {
  let client: OpenRouterClient;
  let mockStorage: jest.Mocked<StorageManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    client = new OpenRouterClient();

    // Mock StorageManager
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
      getApiKey: jest.fn(),
      setApiKey: jest.fn(),
    } as unknown as jest.Mocked<StorageManager>;

    // Default storage mock - API key configured
    (mockStorage.get as jest.Mock).mockResolvedValue({
      openRouterApiKey: "test-api-key",
      openRouterModel: "google/gemini-2.0-flash-exp:free",
      openRouterProvider: "Google",
    });

    // Mock global storage
    (global.chrome.storage.local.get as jest.Mock).mockImplementation(
      (keys, callback) => {
        const data = {
          openRouterApiKey: "test-api-key",
          openRouterModel: "google/gemini-2.0-flash-exp:free",
          openRouterProvider: "Google",
        };
        if (callback) {
          callback(data);
        }
        return Promise.resolve(data);
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialize", () => {
    it("should load configuration from storage", async () => {
      await client.initialize();

      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        ["openRouterApiKey", "openRouterModel", "openRouterProvider"],
        expect.any(Function),
      );
    });

    it("should throw error when model is not configured", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          if (callback) {
            callback({ openRouterApiKey: "test-key" });
          }
          return Promise.resolve({ openRouterApiKey: "test-key" });
        },
      );

      const clientNoModel = new OpenRouterClient();
      await clientNoModel.initialize();

      // Should throw error because model is not configured
      await expect(
        clientNoModel.translate(["Hello"], "Japanese"),
      ).rejects.toThrow("Model not configured");
    });
  });

  describe("translate", () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it("should throw error when API key is not configured", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          if (callback) {
            callback({});
          }
          return Promise.resolve({});
        },
      );

      const clientNoKey = new OpenRouterClient();

      await expect(
        clientNoKey.translate(["Hello"], "Japanese"),
      ).rejects.toThrow("API key not configured");
    });

    it("should throw error when model is not configured", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          if (callback) {
            callback({ openRouterApiKey: "test-api-key" });
          }
          return Promise.resolve({ openRouterApiKey: "test-api-key" });
        },
      );

      const clientNoModel = new OpenRouterClient();

      await expect(
        clientNoModel.translate(["Hello"], "Japanese"),
      ).rejects.toThrow("Model not configured");
    });

    it("should make API request with correct parameters", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは\nさようなら" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(["Hello", "Goodbye"], "Japanese");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/doganaylab/geminitranslate",
          },
          body: expect.any(String),
        }),
      );

      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(requestBody.model).toBe("google/gemini-2.0-flash-exp:free");
      expect(requestBody.messages[0].role).toBe("user");
      expect(requestBody.messages[0].content).toContain("Hello");
      expect(requestBody.messages[0].content).toContain("Goodbye");
      expect(requestBody.provider).toEqual({ order: ["Google"] });
    });

    it("should return translated texts", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            { message: { content: "こんにちは---NEXT-TEXT---さようなら" } },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      expect(result).toEqual(["こんにちは", "さようなら"]);
    });

    it("should handle API errors", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: jest.fn().mockResolvedValue({
          error: { message: "Invalid API key" },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const translatePromise = client.translate(["Hello"], "Japanese");

      // Run all timers (retries) and wait for promise to settle
      const [result] = await Promise.allSettled([
        translatePromise,
        jest.runAllTimersAsync(),
      ]);

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ApiError);
      }
    });

    it("should handle rate limit errors", async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: jest.fn().mockResolvedValue({
          error: { message: "Rate limit exceeded" },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const translatePromise = client.translate(["Hello"], "Japanese");

      // Run all timers (retries) and wait for promise to settle
      const [result] = await Promise.allSettled([
        translatePromise,
        jest.runAllTimersAsync(),
      ]);

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ApiError);
        expect((result.reason as ApiError).isRateLimitError).toBe(true);
      }
    });

    it("should handle network errors", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const translatePromise = client.translate(["Hello"], "Japanese");

      // Run all timers (retries) and wait for promise to settle
      const [result] = await Promise.allSettled([
        translatePromise,
        jest.runAllTimersAsync(),
      ]);

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect((result.reason as Error).message).toBe("Network error");
      }
    });

    it("should not include provider when not configured", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          const data = {
            openRouterApiKey: "test-api-key",
            openRouterModel: "google/gemini-2.0-flash-exp:free",
          };
          if (callback) {
            callback(data);
          }
          return Promise.resolve(data);
        },
      );

      const clientNoProvider = new OpenRouterClient();
      await clientNoProvider.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await clientNoProvider.translate(["Hello"], "Japanese");

      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(requestBody.provider).toBeUndefined();
    });
  });

  describe("buildPrompt", () => {
    it("should build correct prompt for translation", async () => {
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            { message: { content: "Bonjour---NEXT-TEXT---Au revoir" } },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(["Hello", "Goodbye"], "French");

      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const prompt = requestBody.messages[0].content;

      expect(prompt).toContain("Translate the following texts to French");
      expect(prompt).toContain("Hello");
      expect(prompt).toContain("Goodbye");
    });

    it("should use separator for multi-paragraph texts", async () => {
      await client.initialize();

      const multiParagraphText =
        "First paragraph\n\nSecond paragraph\n\nThird paragraph";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "最初の段落\n\n2番目の段落\n\n3番目の段落",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate([multiParagraphText], "Japanese");

      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const prompt = requestBody.messages[0].content;

      // Prompt should contain separator instruction
      expect(prompt).toContain("---NEXT-TEXT---");
      expect(prompt).toContain('separated by "---NEXT-TEXT---"');
      // Should contain the multi-paragraph text
      expect(prompt).toContain("First paragraph");
      expect(prompt).toContain("Second paragraph");
      expect(prompt).toContain("Third paragraph");
    });

    it("should separate multiple texts with separator", async () => {
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "こんにちは---NEXT-TEXT---さようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(["Hello", "Goodbye"], "Japanese");

      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const prompt = requestBody.messages[0].content;

      // Should use separator instead of newline
      expect(prompt).toContain("---NEXT-TEXT---");
      expect(prompt).toContain("Hello");
      expect(prompt).toContain("Goodbye");
    });

    it("should include anti-summarization instructions in prompt", async () => {
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await client.translate(["Hello"], "Japanese");

      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const prompt = requestBody.messages[0].content;

      // Should contain anti-summarization instructions
      expect(prompt).toContain("IMPORTANT INSTRUCTIONS");
      expect(prompt).toContain("do NOT summarize");
      expect(prompt).toContain("COMPLETE text");
      expect(prompt).toContain("Preserve ALL information");
      expect(prompt).toContain("Maintain the original length");
    });

    it("should translate long text without summarization", async () => {
      await client.initialize();

      // Create a long text (200+ characters)
      const longText =
        "This is a very long paragraph that contains multiple sentences and detailed information. " +
        "It is important that the translation preserves all of this content without summarizing or shortening it. " +
        "Every sentence should be translated completely, maintaining the original meaning and detail level.";

      const mockTranslation =
        "これは複数の文と詳細な情報を含む非常に長い段落です。" +
        "翻訳がこのコンテンツを要約したり短縮したりせずに保持することが重要です。" +
        "すべての文は完全に翻訳され、元の意味と詳細レベルを維持する必要があります。";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: mockTranslation } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate([longText], "Japanese");

      // Verify prompt includes anti-summarization instructions
      const requestBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(requestBody.messages[0].content).toContain("do NOT summarize");
      expect(requestBody.messages[0].content).toContain("COMPLETE text");

      // Verify translation result exists and is not empty
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mockTranslation);
      expect(result[0].length).toBeGreaterThan(0);
    });

    it("should preserve multi-paragraph structure in translation", async () => {
      await client.initialize();

      const multiParagraphText =
        "Paragraph 1: This is the first paragraph with some content.\n\n" +
        "Paragraph 2: This is the second paragraph with more details.\n\n" +
        "Paragraph 3: This is the third paragraph concluding the text.";

      const mockTranslation =
        "段落1：これはいくつかの内容を含む最初の段落です。\n\n" +
        "段落2：これはより詳細な2番目の段落です。\n\n" +
        "段落3：これはテキストを締めくくる3番目の段落です。";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: mockTranslation } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate([multiParagraphText], "Japanese");

      // Verify all paragraphs are preserved in the result
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mockTranslation);

      // Count paragraphs (separated by double newlines)
      const originalParagraphs = multiParagraphText.split("\n\n").length;
      const translatedParagraphs = result[0].split("\n\n").length;
      expect(translatedParagraphs).toBe(originalParagraphs);
    });
  });

  describe("parseResponse", () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it("should parse separator-separated translations", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  "  こんにちは  ---NEXT-TEXT---  さようなら  ---NEXT-TEXT---  ありがとう  ",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(
        ["Hello", "Goodbye", "Thank you"],
        "Japanese",
      );

      expect(result).toEqual(["こんにちは", "さようなら", "ありがとう"]);
    });

    it("should handle multi-paragraph text with separator", async () => {
      const multiParagraphText =
        "First paragraph\n\nSecond paragraph\n\nThird paragraph";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "最初の段落\n\n2番目の段落\n\n3番目の段落",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate([multiParagraphText], "Japanese");

      // Should return single element with all paragraphs preserved
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("最初の段落");
      expect(result[0]).toContain("2番目の段落");
      expect(result[0]).toContain("3番目の段落");
    });

    it("should handle empty separators in response", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "こんにちは---NEXT-TEXT------NEXT-TEXT---さようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      // Empty strings between separators should be filtered out
      expect(result).toEqual(["こんにちは", "さようなら"]);
    });

    it("should throw when translation count mismatches expected count", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        client.translate(["Hello", "Goodbye"], "Japanese"),
      ).rejects.toBeInstanceOf(ParseCountMismatchError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should remove prompt artifacts from LLM response", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  "Translate the following texts to Japanese.\nIMPORTANT INSTRUCTIONS:\n---NEXT-TEXT---\nこんにちは---NEXT-TEXT---さようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      // Prompt artifacts should be removed, leaving clean translations
      expect(result).toEqual(["こんにちは", "さようなら"]);
    });

    it("should fallback to line splitting when no separator", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "こんにちは\nさようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      // Should fall back to line splitting
      expect(result).toEqual(["こんにちは", "さようなら"]);
    });

    it("should fallback to paragraph splitting when no separator", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "こんにちは\n\nさようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      // Should fall back to paragraph splitting
      expect(result).toEqual(["こんにちは", "さようなら"]);
    });

    it("should remove Japanese-translated prompt artifacts from LLM response", async () => {
      // LLM sometimes translates the prompt instructions into Japanese
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  "|」で区切られていること - 翻訳も同じ形式で、「|前へ|親 |こんにちは---NEXT-TEXT---さようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      // Japanese prompt artifacts should be removed
      expect(result).toEqual(["こんにちは", "さようなら"]);
    });

    it("should throw when separator instruction artifacts still cause count mismatch", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  "区切られていること---NEXT-TEXT---翻訳も同じ形式で---NEXT-TEXT---こんにちは---NEXT-TEXT---さようなら",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        client.translate(["Hello", "Goodbye"], "Japanese"),
      ).rejects.toBeInstanceOf(ParseCountMismatchError);
    });

    it("should remove pipe-separated navigation artifacts", async () => {
      // Pattern seen in Hacker News: |前へ|親 |root|
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  "こんにちは |前へ|親 |---NEXT-TEXT---さようなら |root|",
              },
            },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.translate(["Hello", "Goodbye"], "Japanese");

      // Pipe-separated navigation should be cleaned
      expect(result[0]).not.toContain("|前へ|");
      expect(result[0]).not.toContain("|親 |");
    });
  });

  describe("testConnection", () => {
    it("should return success when connection is valid", async () => {
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("Connection successful");
      expect(result.message).toContain("google/gemini-2.0-flash-exp:free");
    });

    it("should return error when API key is invalid", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          if (callback) {
            callback({});
          }
          return Promise.resolve({});
        },
      );

      const clientNoKey = new OpenRouterClient();

      const result = await clientNoKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should return error when API key is empty string", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          if (callback) {
            callback({ openRouterApiKey: "" });
          }
          return Promise.resolve({ openRouterApiKey: "" });
        },
      );

      const clientEmptyKey = new OpenRouterClient();
      const result = await clientEmptyKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should return error when API key is whitespace only", async () => {
      (global.chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback) => {
          if (callback) {
            callback({ openRouterApiKey: "   " });
          }
          return Promise.resolve({ openRouterApiKey: "   " });
        },
      );

      const clientWhitespaceKey = new OpenRouterClient();
      const result = await clientWhitespaceKey.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should return error when API request fails", async () => {
      await client.initialize();

      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: jest.fn().mockResolvedValue({
          error: { message: "Invalid API key" },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const promise = client.testConnection();

      // Run all timers (retries)
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid API key");
    });
  });

  describe("testConnectionWithConfig", () => {
    it("should test connection with temporary config without saving", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.testConnectionWithConfig({
        apiKey: "temp-api-key",
        model: "google/gemini-1.5-flash",
        provider: "Google",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Connection successful");
      expect(result.message).toContain("google/gemini-1.5-flash");

      // Verify the temporary config was used
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestHeaders = fetchCall[1].headers;
      expect(requestHeaders.Authorization).toBe("Bearer temp-api-key");

      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.model).toBe("google/gemini-1.5-flash");
    });

    it("should return error when temporary API key is empty", async () => {
      const result = await client.testConnectionWithConfig({
        apiKey: "",
        model: "google/gemini-2.0-flash-exp:free",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should return error when temporary API key is whitespace only", async () => {
      const result = await client.testConnectionWithConfig({
        apiKey: "   ",
        model: "google/gemini-2.0-flash-exp:free",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should return error when model is empty in temporary config", async () => {
      const result = await client.testConnectionWithConfig({
        apiKey: "temp-api-key",
        model: "", // Empty model
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Model");
    });

    it("should restore original config after testing", async () => {
      // Initialize with saved config
      await client.initialize();

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "こんにちは" } }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Test with temporary config
      await client.testConnectionWithConfig({
        apiKey: "temp-api-key",
        model: "google/gemini-1.5-flash",
      });

      // Clear fetch mock
      (global.fetch as jest.Mock).mockClear();

      // Make another translate call to verify original config is restored
      await client.translate(["Hello"], "Japanese");

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestHeaders = fetchCall[1].headers;
      const requestBody = JSON.parse(fetchCall[1].body);

      // Should use original config from storage
      expect(requestHeaders.Authorization).toBe("Bearer test-api-key");
      expect(requestBody.model).toBe("google/gemini-2.0-flash-exp:free");
    });

    it("should return error when temporary config API request fails", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: jest.fn().mockResolvedValue({
          error: { message: "Invalid API key" },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const promise = client.testConnectionWithConfig({
        apiKey: "invalid-key",
        model: "google/gemini-2.0-flash-exp:free",
      });

      // Run all timers (retries)
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid API key");
    });
  });
});
