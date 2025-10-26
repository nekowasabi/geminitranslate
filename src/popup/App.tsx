/**
 * Popup App Component
 * Main popup UI for the translation extension
 */

import React, { useState, useEffect, useMemo } from 'react';
import '../styles/popup.css';
import { QuickTranslate } from './components/QuickTranslate';
import { LanguageSelector } from './components/LanguageSelector';
import { StatusIndicator } from './components/StatusIndicator';
import { ApiKeyWarning } from './components/ApiKeyWarning';
import { useTranslation } from './hooks/useTranslation';
import StorageManager from '@shared/storage/StorageManager';

export const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const { status, error, progress } = useTranslation();
  const storageManager = useMemo(() => new StorageManager(), []);

  // Check for API key on mount
  useEffect(() => {
    const checkApiKey = async () => {
      const apiKey = await storageManager.getApiKey();
      setHasApiKey(!!apiKey);
    };

    checkApiKey();
  }, [storageManager]);

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>Quick Translate</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => chrome?.runtime?.openOptionsPage()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '4px 8px',
              opacity: 1,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            aria-label="Open Settings"
            title="Settings"
          >
            ⚙️
          </button>
          <div className="extension-version">
            {chrome?.runtime?.getManifest?.()?.version && (
              <span>v{chrome.runtime.getManifest().version}</span>
            )}
          </div>
        </div>
      </header>

      <main className="popup-main">
        <ApiKeyWarning hasApiKey={hasApiKey} />

        <div className="controls-section">
          <LanguageSelector />
          <QuickTranslate />
        </div>

        <StatusIndicator status={status} progress={progress} error={error} />
      </main>

      <footer className="popup-footer">
        <p className="footer-text">
          Powered by OpenRouter
        </p>
      </footer>
    </div>
  );
};

export default App;
