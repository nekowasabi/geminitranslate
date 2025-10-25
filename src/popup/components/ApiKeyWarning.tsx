/**
 * ApiKeyWarning Component
 * Displays warning banner when API key is not configured
 */

import React from 'react';

export interface ApiKeyWarningProps {
  hasApiKey: boolean;
}

export const ApiKeyWarning: React.FC<ApiKeyWarningProps> = ({ hasApiKey }) => {
  if (hasApiKey) {
    return null;
  }

  const handleOpenSettings = () => {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  return (
    <div className="api-key-warning warning" role="alert">
      <div className="warning-content">
        <div className="warning-icon">⚠️</div>
        <div className="warning-message">
          <strong>API Key Required</strong>
          <p>Please configure your OpenRouter API key to use translation features.</p>
        </div>
      </div>
      <button
        onClick={handleOpenSettings}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleOpenSettings();
          }
        }}
        className="open-settings-button"
        aria-label="Open Settings"
      >
        Open Settings
      </button>
    </div>
  );
};
