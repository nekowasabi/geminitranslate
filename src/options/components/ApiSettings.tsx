/**
 * ApiSettings Component
 * Manages API key input and provider selection
 */

import React, { useState } from 'react';

export interface ApiSettingsProps {
  apiKey: string;
  onChange: (apiKey: string) => void;
}

export const ApiSettings: React.FC<ApiSettingsProps> = ({ apiKey, onChange }) => {
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

        {/* Provider Label */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Provider
          </label>
          <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-gray-700 dark:text-gray-300">
            OpenRouter
          </div>
        </div>

        {/* API Key Input */}
        <div>
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
