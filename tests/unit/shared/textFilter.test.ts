/**
 * Tests for Text Filter utility
 */

import {
  shouldTranslateText,
  filterBatchTexts,
  reconstructResults,
  isAlreadyInTargetLanguage,
} from "../../../src/shared/utils/textFilter";

describe("textFilter", () => {
  describe("shouldTranslateText", () => {
    it("should return true for normal text", () => {
      const result = shouldTranslateText("Hello World");
      expect(result.shouldTranslate).toBe(true);
    });

    it("should return true for CJK text", () => {
      expect(shouldTranslateText("こんにちは").shouldTranslate).toBe(true);
      expect(shouldTranslateText("你好").shouldTranslate).toBe(true);
      expect(shouldTranslateText("안녕하세요").shouldTranslate).toBe(true);
    });

    it("should return false for too short text", () => {
      const result = shouldTranslateText("A");
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe("too_short");
    });

    it("should return false for empty text", () => {
      const result = shouldTranslateText("");
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe("too_short");
    });

    it("should return false for whitespace only", () => {
      const result = shouldTranslateText("   ");
      expect(result.shouldTranslate).toBe(false);
      expect(result.reason).toBe("too_short");
    });

    it("should return false for numbers only", () => {
      expect(shouldTranslateText("123").shouldTranslate).toBe(false);
      expect(shouldTranslateText("123-456-7890").shouldTranslate).toBe(false);
      expect(shouldTranslateText("2024/01/15").shouldTranslate).toBe(false);
      expect(shouldTranslateText("10:30").shouldTranslate).toBe(false);
      expect(shouldTranslateText("+1 (555) 123-4567").shouldTranslate).toBe(
        false,
      );
    });

    it("should return true for text with numbers", () => {
      expect(shouldTranslateText("Item 1").shouldTranslate).toBe(true);
      expect(shouldTranslateText("123 Main Street").shouldTranslate).toBe(true);
    });

    it("should return false for URLs", () => {
      expect(shouldTranslateText("https://example.com").shouldTranslate).toBe(
        false,
      );
      expect(
        shouldTranslateText("http://example.com/path").shouldTranslate,
      ).toBe(false);
      expect(shouldTranslateText("www.example.com").shouldTranslate).toBe(
        false,
      );
    });

    it("should return false for email addresses", () => {
      expect(shouldTranslateText("user@example.com").shouldTranslate).toBe(
        false,
      );
      expect(
        shouldTranslateText("test.user+tag@domain.co.jp").shouldTranslate,
      ).toBe(false);
    });

    it("should return false for symbols only", () => {
      expect(shouldTranslateText("---").shouldTranslate).toBe(false);
      expect(shouldTranslateText("***").shouldTranslate).toBe(false);
      expect(shouldTranslateText("...").shouldTranslate).toBe(false);
      expect(shouldTranslateText("→ ←").shouldTranslate).toBe(false);
    });

    it("should return true for text with symbols", () => {
      expect(shouldTranslateText("Hello!").shouldTranslate).toBe(true);
      expect(shouldTranslateText("What?").shouldTranslate).toBe(true);
    });

    it("should return false for code-like content", () => {
      expect(shouldTranslateText("variableName").shouldTranslate).toBe(false);
      expect(shouldTranslateText("function_name").shouldTranslate).toBe(false);
      expect(shouldTranslateText("CONSTANT_NAME").shouldTranslate).toBe(false);
      expect(shouldTranslateText("methodCall()").shouldTranslate).toBe(false);
      expect(shouldTranslateText("$variable").shouldTranslate).toBe(false);
      expect(shouldTranslateText("my_var").shouldTranslate).toBe(false);
      expect(shouldTranslateText("camelCase").shouldTranslate).toBe(false);
    });

    it("should return true for multi-word text containing code-like patterns", () => {
      // camelCase words embedded in sentences (e.g. ChatGPT, iPhone)
      expect(
        shouldTranslateText("services like ChatGPT, Claude").shouldTranslate,
      ).toBe(true);
      expect(shouldTranslateText("The iPhone is popular").shouldTranslate).toBe(
        true,
      );
      // Dollar signs in natural language
      expect(shouldTranslateText("Price is $50").shouldTranslate).toBe(true);
      expect(
        shouldTranslateText("They raised $100 million").shouldTranslate,
      ).toBe(true);
      // Underscores in natural language
      expect(
        shouldTranslateText("Use hello_world function in your code")
          .shouldTranslate,
      ).toBe(true);
      // Mixed patterns in real article text
      expect(
        shouldTranslateText("CEO Enzor-DeMeo announced the merger")
          .shouldTranslate,
      ).toBe(true);
    });

    it("should return true for natural sentences containing code-like tokens", () => {
      expect(
        shouldTranslateText("Use camelCase in documentation text")
          .shouldTranslate,
      ).toBe(true);
      expect(
        shouldTranslateText("The variable_name appears in this sentence")
          .shouldTranslate,
      ).toBe(true);
    });

    it("should return true for single CJK character", () => {
      expect(shouldTranslateText("日").shouldTranslate).toBe(true);
      expect(shouldTranslateText("中").shouldTranslate).toBe(true);
      expect(shouldTranslateText("あ").shouldTranslate).toBe(true);
    });
  });

  describe("filterBatchTexts", () => {
    it("should separate translatable and skipped texts", () => {
      const texts = ["Hello", "123", "World", "https://example.com", "Goodbye"];
      const result = filterBatchTexts(texts);

      expect(result.textsToTranslate).toEqual(["Hello", "World", "Goodbye"]);
      expect(result.originalIndices).toEqual([0, 2, 4]);
      expect(result.skippedIndices.size).toBe(2);
      expect(result.skippedIndices.get(1)).toBe("123");
      expect(result.skippedIndices.get(3)).toBe("https://example.com");
    });

    it("should handle all translatable texts", () => {
      const texts = ["Hello", "World", "Goodbye"];
      const result = filterBatchTexts(texts);

      expect(result.textsToTranslate).toEqual(texts);
      expect(result.originalIndices).toEqual([0, 1, 2]);
      expect(result.skippedIndices.size).toBe(0);
    });

    it("should handle all skipped texts", () => {
      const texts = ["123", "456", "https://..."];
      const result = filterBatchTexts(texts);

      expect(result.textsToTranslate).toEqual([]);
      expect(result.originalIndices).toEqual([]);
      expect(result.skippedIndices.size).toBe(3);
    });

    it("should handle empty input", () => {
      const result = filterBatchTexts([]);

      expect(result.textsToTranslate).toEqual([]);
      expect(result.originalIndices).toEqual([]);
      expect(result.skippedIndices.size).toBe(0);
    });
  });

  describe("reconstructResults", () => {
    it("should reconstruct results with translations and skipped texts", () => {
      const translations = ["こんにちは", "世界", "さようなら"];
      const originalIndices = [0, 2, 4];
      const skippedIndices = new Map<number, string>([
        [1, "123"],
        [3, "https://example.com"],
      ]);

      const results = reconstructResults(
        translations,
        originalIndices,
        skippedIndices,
        5,
      );

      expect(results).toEqual([
        "こんにちは",
        "123",
        "世界",
        "https://example.com",
        "さようなら",
      ]);
    });

    it("should handle no skipped texts", () => {
      const translations = ["こんにちは", "世界"];
      const originalIndices = [0, 1];
      const skippedIndices = new Map<number, string>();

      const results = reconstructResults(
        translations,
        originalIndices,
        skippedIndices,
        2,
      );

      expect(results).toEqual(["こんにちは", "世界"]);
    });

    it("should handle all skipped texts", () => {
      const translations: string[] = [];
      const originalIndices: number[] = [];
      const skippedIndices = new Map<number, string>([
        [0, "123"],
        [1, "456"],
      ]);

      const results = reconstructResults(
        translations,
        originalIndices,
        skippedIndices,
        2,
      );

      expect(results).toEqual(["123", "456"]);
    });

    it("should fill missing translations with original texts", () => {
      const results = reconstructResults(["こんにちは"], [0], new Map(), 2, [
        "Hello",
        "World",
      ]);

      expect(results).toEqual(["こんにちは", "World"]);
    });
  });

  describe("already in target language", () => {
    it("skips Japanese text when the target is ja", () => {
      expect(shouldTranslateText("これは日本語の文章です。", "ja")).toEqual({
        shouldTranslate: false,
        reason: "already_target_language",
      });
    });

    it("does not skip English text when the target is ja", () => {
      expect(
        shouldTranslateText("This is an English sentence.", "ja")
          .shouldTranslate,
      ).toBe(true);
    });

    it("does not skip mixed text that is mostly Latin", () => {
      expect(
        isAlreadyInTargetLanguage("Click ここ to start the process now", "ja"),
      ).toBe(false);
    });

    it("ignores placeholder markup when judging the language", () => {
      expect(
        isAlreadyInTargetLanguage("<1>これは</1>日本語です<2/>", "ja"),
      ).toBe(true);
    });

    it("never skips for Latin-script targets or without a target", () => {
      expect(isAlreadyInTargetLanguage("Hello there, friend", "en")).toBe(
        false,
      );
      expect(isAlreadyInTargetLanguage("これは日本語です", undefined)).toBe(
        false,
      );
    });

    it("filterBatchTexts forwards the target language", () => {
      const result = filterBatchTexts(
        ["Hello world", "こんにちは世界です"],
        "ja",
      );
      expect(result.textsToTranslate).toEqual(["Hello world"]);
      expect(result.skippedIndices.get(1)).toBe("こんにちは世界です");
    });
  });
});
