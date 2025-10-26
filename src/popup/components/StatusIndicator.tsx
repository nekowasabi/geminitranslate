/**
 * StatusIndicator Component
 * Displays translation status with progress bar
 */

import React from 'react';
import type { TranslationStatus } from '@popup/hooks/useTranslation';

export interface StatusIndicatorProps {
  status: TranslationStatus;
  progress: number;
  error?: string | null;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = React.memo(({ status, progress, error }) => {
  if (status === 'idle') {
    return null;
  }

  return (
    <div
      className={`status-indicator ${status}`}
      aria-live="polite"
      role="status"
    >
      {status === 'translating' && (
        <div className="translating-state">
          <div className="status-message">Translating...</div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">{progress}%</div>
        </div>
      )}

      {status === 'success' && (
        <div className="success-state success">
          <img
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%234ade80' stroke-width='2'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E"
            alt="success"
            role="img"
            aria-label="success"
          />
          <span>Translation successful!</span>
        </div>
      )}

      {status === 'error' && (
        <div className="error-state error">
          <img
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23f87171' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M15 9l-6 6M9 9l6 6'/%3E%3C/svg%3E"
            alt="error"
            role="img"
            aria-label="error"
          />
          <span>{error || 'Translation error occurred'}</span>
        </div>
      )}
    </div>
  );
});
