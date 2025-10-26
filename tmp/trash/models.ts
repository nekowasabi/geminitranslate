/**
 * OpenRouter model configurations and constants
 *
 * @module constants/models
 */

/**
 * Model configuration
 */
export interface ModelConfig {
  /** Model ID used in API requests */
  id: string;
  /** Display name for UI */
  name: string;
  /** Model provider */
  provider: string;
  /** Whether this is a free model */
  isFree: boolean;
  /** Context window size */
  contextWindow: number;
  /** Optional description */
  description?: string;
}

/**
 * Supported OpenRouter models
 *
 * Free models are prioritized for extension use
 */
export const SUPPORTED_MODELS: readonly ModelConfig[] = [
  // Google Gemini models (Free)
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash (Free)',
    provider: 'Google',
    isFree: true,
    contextWindow: 1048576,
    description: 'Latest Gemini model with fast responses',
  },
  {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini 1.5 Flash',
    provider: 'Google',
    isFree: false,
    contextWindow: 1048576,
    description: 'Fast and efficient Gemini model',
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    isFree: false,
    contextWindow: 2097152,
    description: 'Advanced Gemini model with larger context',
  },
  // OpenAI models
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    isFree: false,
    contextWindow: 128000,
    description: 'Latest GPT-4 with improved performance',
  },
  {
    id: 'openai/gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    isFree: false,
    contextWindow: 16385,
    description: 'Fast and cost-effective model',
  },
  // Anthropic models
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    isFree: false,
    contextWindow: 200000,
    description: 'Most capable Claude model',
  },
  {
    id: 'anthropic/claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    isFree: false,
    contextWindow: 200000,
    description: 'Balanced performance and speed',
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    isFree: false,
    contextWindow: 200000,
    description: 'Fastest Claude model',
  },
  // Meta models
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    isFree: false,
    contextWindow: 131072,
    description: 'Open-source large language model',
  },
] as const;

/**
 * Default model for translation
 */
export const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

/**
 * Model ID to ModelConfig mapping
 */
export const MODEL_MAP: ReadonlyMap<string, ModelConfig> = new Map(
  SUPPORTED_MODELS.map((model) => [model.id, model])
);

/**
 * Get free models only
 *
 * @returns Array of free model configs
 *
 * @example
 * ```typescript
 * const freeModels = getFreeModels();
 * // [{ id: 'google/gemini-2.0-flash-exp:free', ... }]
 * ```
 */
export function getFreeModels(): readonly ModelConfig[] {
  return SUPPORTED_MODELS.filter((model) => model.isFree);
}

/**
 * Get models by provider
 *
 * @param provider - Provider name (e.g., 'Google', 'OpenAI')
 * @returns Array of models from the provider
 *
 * @example
 * ```typescript
 * const googleModels = getModelsByProvider('Google');
 * ```
 */
export function getModelsByProvider(provider: string): readonly ModelConfig[] {
  return SUPPORTED_MODELS.filter((model) => model.provider === provider);
}

/**
 * Get model configuration by ID
 *
 * @param modelId - Model ID
 * @returns Model config or undefined
 *
 * @example
 * ```typescript
 * const model = getModelConfig('google/gemini-2.0-flash-exp:free');
 * console.log(model?.name); // 'Gemini 2.0 Flash (Free)'
 * ```
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODEL_MAP.get(modelId);
}

/**
 * Check if model is supported
 *
 * @param modelId - Model ID to check
 * @returns True if model is supported
 *
 * @example
 * ```typescript
 * isModelSupported('google/gemini-2.0-flash-exp:free'); // true
 * isModelSupported('unknown-model'); // false
 * ```
 */
export function isModelSupported(modelId: string): boolean {
  return MODEL_MAP.has(modelId);
}
