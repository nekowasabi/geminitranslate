/**
 * OpenRouter API Client
 *
 * Handles communication with OpenRouter API for translation requests
 *
 * Features:
 * - API key and model configuration from storage
 * - Batch translation with prompt building
 * - Response parsing with error handling
 * - Connection testing
 * - Automatic retry with exponential backoff
 * - Request timeout handling
 *
 * @example
 * ```typescript
 * const client = new OpenRouterClient();
 * await client.initialize();
 * const translations = await client.translate(['Hello', 'Goodbye'], 'Japanese');
 * // ['こんにちは', 'さようなら']
 * ```
 */

import StorageManager from '../shared/storage/StorageManager';
import { logger } from '../shared/utils/logger';
import { retry } from '../shared/utils/retry';
import { API_CONFIG, RETRY_CONFIG } from '../shared/constants/config';
import { getLanguageName } from '../shared/constants/languages';

/**
 * OpenRouter configuration interface
 */
interface OpenRouterConfig {
  /**
   * OpenRouter API key
   */
  apiKey: string;

  /**
   * Model identifier (e.g., 'google/gemini-2.0-flash-exp:free')
   */
  model: string;

  /**
   * Optional provider preference
   */
  provider?: string;
}

/**
 * Connection test result
 */
interface ConnectionTestResult {
  /**
   * Whether the connection test succeeded
   */
  success: boolean;

  /**
   * Success message
   */
  message?: string;

  /**
   * Error message
   */
  error?: string;
}

/**
 * Custom error class for API-related errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRateLimitError: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Custom error class for timeout errors
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * OpenRouter API client for translation
 */
export class OpenRouterClient {
  /**
   * OpenRouter API endpoint
   */
  private readonly API_ENDPOINT = API_CONFIG.ENDPOINT;

  /**
   * Separator used to distinguish multiple texts in translation requests
   * This allows proper handling of multi-paragraph texts while maintaining
   * batch translation functionality
   */
  private readonly TEXT_SEPARATOR = '---NEXT-TEXT---';

  /**
   * Current configuration
   */
  private config: OpenRouterConfig | null = null;

  /**
   * Initialize the client by loading configuration from storage
   */
  async initialize(): Promise<void> {
    console.log('[OpenRouterClient] initialize() called');
    const storage = new StorageManager();
    const data = await storage.get(['openRouterApiKey', 'openRouterModel', 'openRouterProvider']);

    console.log('[OpenRouterClient] Data received from StorageManager:', data);
    console.log('[OpenRouterClient] openRouterApiKey exists:', !!data.openRouterApiKey);
    console.log('[OpenRouterClient] openRouterApiKey value:', data.openRouterApiKey);
    console.log('[OpenRouterClient] openRouterModel exists:', !!data.openRouterModel);
    console.log('[OpenRouterClient] openRouterModel value:', data.openRouterModel);

    this.config = {
      apiKey: data.openRouterApiKey || '',
      model: data.openRouterModel || '',
      provider: data.openRouterProvider,
    };

    console.log('[OpenRouterClient] Config set to:', this.config);
  }

  /**
   * Translate texts to target language
   *
   * @param texts - Array of texts to translate
   * @param targetLanguage - Target language name (e.g., 'Japanese', 'French')
   * @returns Array of translated texts
   * @throws Error if API key is not configured or API request fails
   */
  async translate(texts: string[], targetLanguage: string): Promise<string[]> {
    const timestamp = new Date().toISOString();
    console.log(`[Background:OpenRouterClient] ${timestamp} - translate() called:`, {
      textsCount: texts.length,
      targetLanguage,
      firstText: texts[0]?.substring(0, 50)
    });

    // Ensure initialized
    if (!this.config) {
      console.log(`[Background:OpenRouterClient] ${timestamp} - Config not loaded, initializing...`);
      await this.initialize();
    }

    console.log(`[Background:OpenRouterClient] ${timestamp} - Using config:`, {
      hasApiKey: !!this.config?.apiKey,
      apiKeyPrefix: this.config?.apiKey?.substring(0, 10) + '...',
      model: this.config?.model,
      provider: this.config?.provider
    });

    // Validate API key - check for empty or whitespace-only strings
    if (!this.config?.apiKey || this.config.apiKey.trim() === '') {
      console.error(`[Background:OpenRouterClient] ${timestamp} - API key not configured or empty`);
      throw new Error('API key not configured or empty');
    }

    // Validate model - check for empty or whitespace-only strings
    if (!this.config?.model || this.config.model.trim() === '') {
      console.error(`[Background:OpenRouterClient] ${timestamp} - Model not configured or empty`);
      throw new Error('Model not configured or empty. Please specify a model in the settings.');
    }

    // Use retry wrapper for resilience
    return retry(
      async () => {
        const prompt = this.buildPrompt(texts, targetLanguage);
        console.log(`[Background:OpenRouterClient] ${timestamp} - Built prompt (first 100 chars):`, {
          prompt: prompt.substring(0, 100)
        });

        const requestBody: Record<string, unknown> = {
          model: this.config!.model,
          messages: [{ role: 'user', content: prompt }],
        };

        // Add provider if configured
        if (this.config!.provider) {
          requestBody.provider = { order: [this.config!.provider] };
        }

        console.log(`[Background:OpenRouterClient] ${timestamp} - Making API request:`, {
          endpoint: this.API_ENDPOINT,
          model: this.config!.model,
          hasProvider: !!this.config!.provider
        });

        // Make API request with timeout
        const response = await this.fetchWithTimeout(this.API_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config!.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': API_CONFIG.REFERER,
          },
          body: JSON.stringify(requestBody),
        });

        console.log(`[Background:OpenRouterClient] ${timestamp} - Received API response:`, {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        // Handle errors
        if (!response.ok) {
          const error = await response.json();
          const isRateLimit = response.status === 429;

          console.error(`[Background:OpenRouterClient] ${timestamp} - API request failed:`, {
            status: response.status,
            statusText: response.statusText,
            error,
            isRateLimit
          });

          logger.error('OpenRouter API error:', error);
          throw new ApiError(
            `API request failed: ${error.error?.message || response.statusText}`,
            response.status,
            isRateLimit
          );
        }

        // Parse response
        const data = await response.json();
        console.log(`[Background:OpenRouterClient] ${timestamp} - Parsing API response:`, {
          hasChoices: !!data.choices,
          choicesLength: data.choices?.length,
          hasContent: !!data.choices?.[0]?.message?.content
        });

        const translations = this.parseResponse(data.choices[0].message.content, texts.length);

        console.log(`[Background:OpenRouterClient] ${timestamp} - Translation successful:`, {
          translationsCount: translations.length,
          firstTranslation: translations[0]?.substring(0, 50)
        });

        return translations;
      },
      {
        maxRetries: RETRY_CONFIG.MAX_RETRIES,
        delay: RETRY_CONFIG.INITIAL_DELAY,
        backoff: RETRY_CONFIG.BACKOFF,
        onError: (error, attempt) => {
          console.warn(`[Background:OpenRouterClient] ${timestamp} - Retry attempt ${attempt + 1}:`, {
            error: error.message,
            attempt
          });
          logger.warn(`Translation attempt ${attempt + 1} failed:`, error.message);
        },
      }
    );
  }

  /**
   * Fetch with timeout
   *
   * @param url - Request URL
   * @param options - Fetch options
   * @returns Fetch response
   * @throws TimeoutError if request exceeds timeout
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${API_CONFIG.TIMEOUT}ms`);
      }
      throw error;
    }
  }

  /**
   * Build translation prompt
   *
   * @param texts - Texts to translate
   * @param targetLanguage - Target language code (e.g., 'ja', 'tr', 'en')
   * @returns Formatted prompt
   */
  private buildPrompt(texts: string[], targetLanguage: string): string {
    // Convert language code to English language name for better LLM understanding
    // e.g., 'ja' → 'Japanese', 'tr' → 'Turkish', 'en' → 'English'
    const languageName = getLanguageName(targetLanguage, false);

    // Use special separator to distinguish multi-paragraph texts
    const combined = texts.join(`\n${this.TEXT_SEPARATOR}\n`);

    return `Translate the following texts to ${languageName}.

IMPORTANT INSTRUCTIONS:
- Return ONLY the translation, NOT the original text
- Do NOT include both original and translation (no side-by-side format)
- Translate the COMPLETE text, do NOT summarize or shorten
- Preserve ALL information, sentences, and paragraphs
- Maintain the original length and detail level
- Each text is independent - translate them separately
- Texts are separated by "${this.TEXT_SEPARATOR}"
- Return translations in the same format, separated by "${this.TEXT_SEPARATOR}"

${combined}`;
  }

  /**
   * Prompt patterns to detect and remove from LLM responses
   * These patterns indicate the LLM echoed back the prompt instructions
   * Includes both English and Japanese translations of prompt fragments
   */
  private readonly PROMPT_PATTERNS = [
    // English patterns
    /^Translate the following texts? to \w+\.?\s*/i,
    /^IMPORTANT INSTRUCTIONS:[\s\S]*?---NEXT-TEXT---\s*/i,
    /Texts? (?:are|is) separated by ["']---NEXT-TEXT---["']\.?\s*/i,
    /Return translations? in the same format,? separated by ["']---NEXT-TEXT---["'][\s:]*\n?/i,

    // Japanese translated patterns - LLM sometimes translates the prompt
    // Pattern: |」で区切られていること - 翻訳も同じ形式で、「|前へ|親 |
    /[|「」]?で区切られていること[^。]*?[|「]/g,
    /翻訳も同じ形式で[^。]*?[|「]/g,
    /テキストは[\s\S]*?で区切られています\.?\s*/g,
    // More aggressive pattern for the full instruction
    /\|」で区切られていること\s*-\s*翻訳も同じ形式で、「\|[^|]*\|/g,

    // Pipe-separated navigation artifacts (from Hacker News, Reddit, etc.)
    /\s*\|[前後]へ\|/g,
    /\s*\|親\s*\|/g,
    /\s*\|root\|/gi,
    /親\s*\|/g, // Orphaned pipe suffix
    /\s*\|[^|]{1,10}\|\s*$/g, // Generic pipe-separated suffix like |親 | at end
  ];

  /**
   * Remove prompt artifacts from LLM response
   *
   * Some LLMs echo back the prompt or include instruction text in their response.
   * This method removes such artifacts to get clean translation output.
   *
   * @param content - Raw LLM response content
   * @returns Cleaned content with prompt artifacts removed
   */
  private removePromptArtifacts(content: string): string {
    let cleaned = content;

    for (const pattern of this.PROMPT_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * Attempt to intelligently split response when separator is missing
   *
   * When the LLM doesn't include separators, tries to split by:
   * 1. Double newlines (paragraph breaks)
   * 2. Single newlines (line breaks)
   *
   * @param content - Response content without separators
   * @param expectedCount - Expected number of translations
   * @returns Array of translations
   */
  private splitWithoutSeparator(content: string, expectedCount: number): string[] {
    // If only 1 expected, return as-is
    if (expectedCount === 1) {
      return [content.trim()];
    }

    // Try splitting by double newlines first (paragraph breaks)
    const byParagraph = content
      .split(/\n\n+/)
      .map((s) => s.trim())
      .filter((s) => s);

    if (byParagraph.length === expectedCount) {
      logger.log('Split by paragraph breaks matched expected count');
      return byParagraph;
    }

    // Try splitting by single newlines
    const byLine = content
      .split(/\n/)
      .map((s) => s.trim())
      .filter((s) => s);

    if (byLine.length === expectedCount) {
      logger.log('Split by line breaks matched expected count');
      return byLine;
    }

    // If paragraph split is closer to expected, use it
    if (
      byParagraph.length > 1 &&
      Math.abs(byParagraph.length - expectedCount) < Math.abs(byLine.length - expectedCount)
    ) {
      logger.warn(
        `Using paragraph split (${byParagraph.length}) as fallback, expected ${expectedCount}`
      );
      return byParagraph;
    }

    // If line split is closer, use it
    if (byLine.length > 1) {
      logger.warn(`Using line split (${byLine.length}) as fallback, expected ${expectedCount}`);
      return byLine;
    }

    // Last resort: return the whole content as single translation
    logger.warn(
      `Could not split response into ${expectedCount} parts, returning as single translation`
    );
    return [content.trim()];
  }

  /**
   * Parse API response content
   *
   * Handles various LLM response formats:
   * 1. Standard format with ---NEXT-TEXT--- separators
   * 2. Responses with prompt artifacts (removes them)
   * 3. Responses without separators (intelligent fallback splitting)
   *
   * @param content - Response content
   * @param expectedCount - Expected number of translations
   * @returns Array of translations
   */
  private parseResponse(content: string, expectedCount: number): string[] {
    // Step 1: Remove any prompt artifacts from response
    const cleanedContent = this.removePromptArtifacts(content);

    // Step 2: Try standard separator-based split
    if (cleanedContent.includes(this.TEXT_SEPARATOR)) {
      const translations = cleanedContent
        .split(this.TEXT_SEPARATOR)
        .map((text) => text.trim())
        .filter((text) => text);

      if (translations.length === expectedCount) {
        return translations;
      }

      // If count doesn't match but we have some translations, log and return
      if (translations.length > 0) {
        logger.warn(
          `Separator split: expected ${expectedCount} translations, got ${translations.length}`
        );
        return translations;
      }
    }

    // Step 3: No separator found or empty result, use intelligent fallback
    logger.log('No separator found in response, using fallback splitting');
    return this.splitWithoutSeparator(cleanedContent, expectedCount);
  }

  /**
   * Test API connection
   *
   * @returns Connection test result
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      if (!this.config) {
        await this.initialize();
      }

      // Early validation: Check API key before attempting translation
      if (!this.config?.apiKey || this.config.apiKey.trim() === '') {
        return {
          success: false,
          error: 'API key is required. Please configure your OpenRouter API key.',
        };
      }

      await this.translate(['Hello'], 'Japanese');
      return {
        success: true,
        message: `Connection successful! Model: ${this.config?.model}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test API connection with temporary config (without saving to storage)
   *
   * This method allows testing a configuration before saving it to storage.
   * Useful for validating API keys and models in the Options UI.
   *
   * @param config - Temporary configuration to test
   * @returns Connection test result
   *
   * @example
   * ```typescript
   * const result = await client.testConnectionWithConfig({
   *   apiKey: 'sk-or-...',
   *   model: 'google/gemini-2.0-flash-exp:free',
   *   provider: 'Google',
   * });
   * ```
   */
  async testConnectionWithConfig(config: OpenRouterConfig): Promise<ConnectionTestResult> {
    try {
      // Early validation: Check API key before attempting translation
      if (!config.apiKey || config.apiKey.trim() === '') {
        return {
          success: false,
          error: 'API key is required. Please configure your OpenRouter API key.',
        };
      }

      // Early validation: Check model before attempting translation
      if (!config.model || config.model.trim() === '') {
        return {
          success: false,
          error: 'Model is required. Please specify a model in the settings.',
        };
      }

      // Temporarily use provided config
      const originalConfig = this.config;
      this.config = {
        apiKey: config.apiKey,
        model: config.model,
        provider: config.provider,
      };

      try {
        await this.translate(['Hello'], 'Japanese');
        return {
          success: true,
          message: `Connection successful! Model: ${this.config.model}`,
        };
      } finally {
        // Restore original config
        this.config = originalConfig;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
