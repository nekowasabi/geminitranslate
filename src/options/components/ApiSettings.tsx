/**
 * ApiSettings Component
 * Manages API key, model, and provider input
 */

import React, { useState } from 'react';

export interface ApiSettingsProps {
  apiKey: string;
  model?: string;
  provider?: string;
  onChange: (apiKey: string) => void;
  onModelChange?: (model: string) => void;
  onProviderChange?: (provider: string) => void;
}

export const ApiSettings: React.FC<ApiSettingsProps> = ({
  apiKey,
  model = 'google/gemini-2.0-flash-exp:free',
  provider = '',
  onChange,
  onModelChange,
  onProviderChange,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onChange(value);

    // Clear validation error when user starts typing
    if (value && validationError) {
      setValidationError(null);
    }
  };

  const handleBlur = () => {
    if (!apiKey || apiKey.trim() === '') {
      setValidationError('API key is required');
    } else {
      setValidationError(null);
    }
  };

  const toggleVisibility = () => {
    setShowPassword(!showPassword);
  };

  const errorId = 'api-key-error';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">API Configuration</h3>

        {/* API Key Input */}
        <div className="mb-4">
          <label
            htmlFor="api-key"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            API Key
          </label>
          <div className="relative">
            <input
              id="api-key"
              type={showPassword ? 'text' : 'password'}
              value={apiKey}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={validationError ? 'true' : 'false'}
              aria-describedby={validationError ? errorId : undefined}
              className={`
                w-full px-3 py-2 pr-20 border rounded-md
                focus:outline-none focus:ring-2 focus:ring-blue-500
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                ${validationError ? 'border-red-500' : 'border-gray-300'}
              `}
              placeholder="Enter your OpenRouter API key"
            />
            <button
              type="button"
              onClick={toggleVisibility}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Validation Error */}
          {validationError && (
            <p id={errorId} className="mt-2 text-sm text-red-600 dark:text-red-400">
              {validationError}
            </p>
          )}
        </div>

        {/* Model Input */}
        <div className="mb-4">
          <label
            htmlFor="openRouterModel"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            OpenRouterモデル名
          </label>
          <input
            id="openRouterModel"
            type="text"
            value={model}
            onChange={(event) => onModelChange?.(event.target.value)}
            placeholder="google/gemini-2.0-flash-exp:free"
            aria-label="OpenRouterモデル名"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-blue-500
                       dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Provider Input */}
        <div className="mb-4">
          <label
            htmlFor="openRouterProvider"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            プロバイダ指定（オプション）
          </label>
          <input
            id="openRouterProvider"
            type="text"
            value={provider}
            onChange={(event) => onProviderChange?.(event.target.value)}
            placeholder="例: DeepInfra, Together, OpenAI"
            aria-label="OpenRouterプロバイダ"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-blue-500
                       dark:bg-gray-800 dark:text-white"
          />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            特定のプロバイダを優先したい場合に指定してください。空欄の場合は自動選択されます。
          </p>
        </div>
      </div>

      {/* Security Warning */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Security Notice:</strong> Your API key is stored locally in your browser and
          is never shared with any third party. It is only used to make requests to the
          OpenRouter API.
        </p>
      </div>
    </div>
  );
};
