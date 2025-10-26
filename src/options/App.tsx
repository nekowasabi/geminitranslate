/**
 * Options Page App Component
 * Main container for settings interface with tabbed navigation
 */

import React, { useState } from 'react';
import { useSettings } from '@options/hooks/useSettings';
import { ApiSettings } from '@options/components/ApiSettings';
import { ModelSelector } from '@options/components/ModelSelector';
import { LanguageSettings } from '@options/components/LanguageSettings';
import { AppearanceSettings } from '@options/components/AppearanceSettings';
import { ConnectionTest } from '@options/components/ConnectionTest';

type TabType = 'api' | 'translation' | 'appearance';

const App: React.FC = () => {
  const {
    settings,
    loading,
    saving,
    testing,
    error,
    updateSettings,
    saveSettings,
    testConnection,
  } = useSettings();

  const [activeTab, setActiveTab] = useState<TabType>('api');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    try {
      await saveSettings();
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? `Failed to save settings: ${err.message}` : 'Failed to save settings';
      console.error('Settings save error:', err);
      setSaveMessage({ type: 'error', text: errorMessage });
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div role="status" className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4"
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
          <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Translation Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Configure your translation preferences and API settings
          </p>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Save Message */}
        {saveMessage && (
          <div
            className={`mb-6 p-4 rounded-md border ${
              saveMessage.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}
          >
            <p
              className={`text-sm ${
                saveMessage.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}
            >
              {saveMessage.text}
            </p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div role="tablist" className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              role="tab"
              aria-selected={activeTab === 'api'}
              aria-controls="tab-panel-api"
              onClick={() => setActiveTab('api')}
              className={`px-6 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
                ${
                  activeTab === 'api'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              API Settings
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'translation'}
              aria-controls="tab-panel-translation"
              onClick={() => setActiveTab('translation')}
              className={`px-6 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
                ${
                  activeTab === 'translation'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              Translation
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'appearance'}
              aria-controls="tab-panel-appearance"
              onClick={() => setActiveTab('appearance')}
              className={`px-6 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
                ${
                  activeTab === 'appearance'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              Appearance
            </button>
          </div>

          {/* Tab Panels */}
          <div className="p-6">
            {/* API Settings Tab */}
            {activeTab === 'api' && (
              <div
                role="tabpanel"
                id="tab-panel-api"
                aria-labelledby="tab-api"
                className="space-y-6"
              >
                <ApiSettings
                  apiKey={settings.openRouterApiKey || ''}
                  onChange={(value) => updateSettings('openRouterApiKey', value)}
                />

                <ModelSelector
                  selectedModel={settings.openRouterModel || 'google/gemini-2.0-flash-exp:free'}
                  onChange={(value) => updateSettings('openRouterModel', value)}
                />

                <ConnectionTest onTest={testConnection} testing={testing} />
              </div>
            )}

            {/* Translation Settings Tab */}
            {activeTab === 'translation' && (
              <div
                role="tabpanel"
                id="tab-panel-translation"
                aria-labelledby="tab-translation"
              >
                <LanguageSettings
                  targetLanguage={settings.targetLanguage || 'en'}
                  fontSize={settings.fontSize || 16}
                  lineHeight={settings.lineHeight || 1.5}
                  onChange={(key, value) => updateSettings(key as any, value as any)}
                />
              </div>
            )}

            {/* Appearance Settings Tab */}
            {activeTab === 'appearance' && (
              <div
                role="tabpanel"
                id="tab-panel-appearance"
                aria-labelledby="tab-appearance"
              >
                <AppearanceSettings
                  darkMode={settings.darkMode || false}
                  onChange={(key, value) => {
                    updateSettings(key as any, value as any);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`
              px-6 py-3 rounded-md font-medium text-white
              ${
                saving
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            `}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
