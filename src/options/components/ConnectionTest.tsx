/**
 * ConnectionTest Component
 * Tests connection to OpenRouter API
 */

import React, { useState } from 'react';

export interface ConnectionTestResult {
  success: boolean;
  responseTime?: number;
  error?: string;
}

export interface ConnectionTestProps {
  onTest: () => Promise<ConnectionTestResult>;
  testing: boolean;
}

export const ConnectionTest: React.FC<ConnectionTestProps> = ({ onTest, testing }) => {
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const handleTest = async () => {
    try {
      // Clear previous results when starting new test
      setResult(null);

      const testResult = await onTest();
      setResult(testResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setResult({
        success: false,
        error: errorMessage,
      });
    }
  };

  // Clear results when testing starts
  React.useEffect(() => {
    if (testing) {
      setResult(null);
    }
  }, [testing]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Connection Test</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Verify your API connection and check response time
        </p>

        <button
          onClick={handleTest}
          disabled={testing}
          className={`
            px-4 py-2 rounded-md font-medium
            ${
              testing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus:ring-2 focus:ring-blue-500
          `}
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>

        {/* Loading Spinner */}
        {testing && (
          <div role="status" className="inline-block ml-3">
            <svg
              className="animate-spin h-5 w-5 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}
      </div>

      {/* Test Results */}
      {!testing && result && (
        <div
          role="status"
          className={`
            p-4 rounded-md border
            ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }
          `}
        >
          {result.success ? (
            <>
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                ✓ Connection Successful
              </p>
              {result.responseTime !== undefined && (
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  Response time: {result.responseTime} ms
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                ✗ Connection Failed
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {result.error || 'Unknown error occurred'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
