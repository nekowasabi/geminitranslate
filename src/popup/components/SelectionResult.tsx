/**
 * SelectionResult Component
 * Displays the result of text selection translation in popup UI
 *
 * @example
 * ```tsx
 * <SelectionResult />
 * ```
 */

import React, { useState, useCallback } from 'react';
import { useSelectionTranslation } from '@popup/hooks/useSelectionTranslation';

/**
 * SelectionResult Component
 *
 * Displays selected text and its translation result.
 * Returns null when no translation data is available.
 */
export const SelectionResult: React.FC = React.memo(() => {
  const { data, clear } = useSelectionTranslation();
  const [copyFeedback, setCopyFeedback] = useState(false);

  /**
   * Handle copy button click
   */
  const handleCopy = useCallback(async () => {
    if (!data) return;

    try {
      await navigator.clipboard.writeText(data.translatedText);

      // Show success feedback
      setCopyFeedback(true);

      // Reset feedback after 2 seconds
      setTimeout(() => {
        setCopyFeedback(false);
      }, 2000);
    } catch (error) {
      // Silently handle clipboard errors
      console.error('Failed to copy to clipboard:', error);
    }
  }, [data]);

  // Don't render if no translation data
  if (!data) {
    return null;
  }

  return (
    <div
      className="selection-result-container"
      role="region"
      aria-label="Selection translation result"
    >
      <div className="selection-result-header">
        <h3>Selection Translation</h3>
        <span className="target-language">→ {data.targetLanguage}</span>
      </div>

      <div className="selection-result-content">
        <div className="text-section">
          <label className="text-label">Selected Text</label>
          <div className="original-text">{data.originalText}</div>
        </div>

        <div className="text-section">
          <label className="text-label">Translation</label>
          <div className="translated-text">{data.translatedText}</div>
        </div>
      </div>

      <div className="selection-actions">
        <button
          onClick={handleCopy}
          className="copy-button"
          aria-label={copyFeedback ? 'Copied' : 'Copy translation'}
        >
          {copyFeedback ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={clear}
          className="clear-button"
          aria-label="Clear translation result"
        >
          Clear
        </button>
      </div>
    </div>
  );
});

SelectionResult.displayName = 'SelectionResult';
