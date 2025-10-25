/**
 * QuickTranslate Component
 * Provides quick translation controls (Translate and Reset buttons)
 */

import React from 'react';
import { useTranslation } from '@popup/hooks/useTranslation';

export const QuickTranslate: React.FC = () => {
  const { translate, reset, status } = useTranslation();

  const handleTranslate = async () => {
    await translate();
  };

  const handleReset = async () => {
    await reset();
  };

  const isTranslating = status === 'translating';
  const isSuccess = status === 'success';
  const canReset = isSuccess;

  return (
    <div className="quick-translate">
      <button
        onClick={handleTranslate}
        disabled={isTranslating}
        className="translate-button"
        aria-label={isTranslating ? 'Translating...' : 'Translate Page'}
      >
        {isTranslating ? 'Translating...' : 'Translate Page'}
      </button>

      <button
        onClick={handleReset}
        disabled={!canReset}
        className="reset-button"
        aria-label="Reset to Original"
      >
        Reset to Original
      </button>
    </div>
  );
};
