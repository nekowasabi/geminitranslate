/**
 * @jest-environment jsdom
 */
import { detectLanguage, getBrowserLanguage } from '../../../src/shared/utils/languageDetector';

describe('Language Detector', () => {
  describe('detectLanguage', () => {
    it('should detect Japanese text', () => {
      const text = 'こんにちは、世界';
      const result = detectLanguage(text);
      expect(result).toBe('ja');
    });

    it('should detect English text', () => {
      const text = 'Hello, world!';
      const result = detectLanguage(text);
      expect(result).toBe('en');
    });

    it('should detect Chinese (Simplified) text', () => {
      const text = '你好世界';
      const result = detectLanguage(text);
      expect(result).toBe('zh');
    });

    it('should detect Korean text', () => {
      const text = '안녕하세요 세계';
      const result = detectLanguage(text);
      expect(result).toBe('ko');
    });

    it('should detect Spanish text', () => {
      const text = 'Hola mundo';
      const result = detectLanguage(text);
      expect(result).toBe('es');
    });

    it('should detect French text', () => {
      const text = 'Bonjour le monde';
      const result = detectLanguage(text);
      expect(result).toBe('fr');
    });

    it('should detect German text', () => {
      const text = 'Hallo Welt';
      const result = detectLanguage(text);
      expect(result).toBe('de');
    });

    it('should detect Russian text', () => {
      const text = 'Привет мир';
      const result = detectLanguage(text);
      expect(result).toBe('ru');
    });

    it('should detect Arabic text', () => {
      const text = 'مرحبا بالعالم';
      const result = detectLanguage(text);
      expect(result).toBe('ar');
    });

    it('should default to en for empty text', () => {
      const result = detectLanguage('');
      expect(result).toBe('en');
    });

    it('should default to en for whitespace only', () => {
      const result = detectLanguage('   \n  \t  ');
      expect(result).toBe('en');
    });

    it('should handle mixed content by detecting dominant language', () => {
      const text = 'Hello こんにちは world 世界';
      const result = detectLanguage(text);
      // Should detect based on character frequency
      expect(['en', 'ja']).toContain(result);
    });

    it('should handle text with numbers and punctuation', () => {
      const text = 'Hello 123 world!!!';
      const result = detectLanguage(text);
      expect(result).toBe('en');
    });

    it('should detect language from longer text samples', () => {
      const text = `
        JavaScript is a high-level, interpreted programming language.
        It is a language which is also characterized as dynamic, weakly typed,
        prototype-based and multi-paradigm.
      `;
      const result = detectLanguage(text);
      expect(result).toBe('en');
    });
  });

  describe('getBrowserLanguage', () => {
    let originalNavigator: Navigator;

    beforeEach(() => {
      originalNavigator = global.navigator;
    });

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    });

    it('should return browser language from navigator.language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'ja-JP', languages: ['ja-JP', 'en-US'] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('ja');
    });

    it('should handle language codes with region', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'en-US', languages: ['en-US'] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('en');
    });

    it('should handle language codes without region', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'fr', languages: ['fr'] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('fr');
    });

    it('should fallback to first language in navigator.languages', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: undefined, languages: ['de-DE', 'en-US'] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('de');
    });

    it('should default to en when no language is available', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: undefined, languages: [] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('en');
    });

    it('should handle Chinese language variants', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'zh-CN', languages: ['zh-CN'] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('zh');
    });

    it('should handle Spanish language variants', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'es-MX', languages: ['es-MX', 'en-US'] },
        writable: true,
        configurable: true,
      });

      const result = getBrowserLanguage();
      expect(result).toBe('es');
    });
  });

  describe('integration', () => {
    it('should work together for user language preference', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'ja-JP', languages: ['ja-JP'] },
        writable: true,
        configurable: true,
      });

      const browserLang = getBrowserLanguage();
      expect(browserLang).toBe('ja');

      // User writes in their native language
      const userText = 'こんにちは';
      const detectedLang = detectLanguage(userText);
      expect(detectedLang).toBe('ja');

      // Both should match for consistent UX
      expect(browserLang).toBe(detectedLang);
    });
  });
});
