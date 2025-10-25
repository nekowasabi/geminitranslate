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
   * Current configuration
   */
  private config: OpenRouterConfig | null = null;

  /**
   * Initialize the client by loading configuration from storage
   */
  async initialize(): Promise<void> {
    const storage = new StorageManager();
    const data = await storage.get(['openRouterApiKey', 'openRouterModel', 'openRouterProvider']);

    this.config = {
      apiKey: data.openRouterApiKey || '',
      model: data.openRouterModel || 'google/gemini-2.0-flash-exp:free',
      provider: data.openRouterProvider,
    };
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
    // Ensure initialized
    if (!this.config) {
      await this.initialize();
    }

    // Validate API key
    if (!this.config?.apiKey) {
      throw new Error('API key not configured');
    }

    // Use retry wrapper for resilience
    return retry(
      async () => {
        const prompt = this.buildPrompt(texts, targetLanguage);
        const requestBody: Record<string, unknown> = {
          model: this.config!.model,
          messages: [{ role: 'user', content: prompt }],
        };

        // Add provider if configured
        if (this.config!.provider) {
          requestBody.provider = { order: [this.config!.provider] };
        }

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

        // Handle errors
        if (!response.ok) {
          const error = await response.json();
          const isRateLimit = response.status === 429;

          logger.error('OpenRouter API error:', error);
          throw new ApiError(
            `API request failed: ${error.error?.message || response.statusText}`,
            response.status,
            isRateLimit
          );
        }

        // Parse response
        const data = await response.json();
        return this.parseResponse(data.choices[0].message.content, texts.length);
      },
      {
        maxRetries: RETRY_CONFIG.MAX_RETRIES,
        delay: RETRY_CONFIG.INITIAL_DELAY,
        backoff: RETRY_CONFIG.BACKOFF,
        onError: (error, attempt) => {
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
   * @param targetLanguage - Target language
   * @returns Formatted prompt
   */
  private buildPrompt(texts: string[], targetLanguage: string): string {
    return `Translate the following texts to ${targetLanguage}. Return only the translations, one per line, without numbering:\n\n${texts.join('\n')}`;
  }

  /**
   * Parse API response content
   *
   * @param content - Response content
   * @param expectedCount - Expected number of translations
   * @returns Array of translations
   */
  private parseResponse(content: string, expectedCount: number): string[] {
    const lines = content
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    if (lines.length !== expectedCount) {
      logger.warn(`Expected ${expectedCount} translations, got ${lines.length}`);
    }

    return lines;
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
}
