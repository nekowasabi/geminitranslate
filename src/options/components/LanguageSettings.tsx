/**
 * LanguageSettings Component
 * Language selection, font size, and line height settings
 */

import React from 'react';
import { SUPPORTED_LANGUAGES } from '@shared/constants/languages';

export interface LanguageSettingsProps {
  targetLanguage: string;
  fontSize: number;
  lineHeight: number;
  onChange: <K extends 'targetLanguage' | 'fontSize' | 'lineHeight'>(
    key: K,
    value: K extends 'targetLanguage' ? string : number
  ) => void;
}

export const LanguageSettings: React.FC<LanguageSettingsProps> = ({
  targetLanguage,
  fontSize,
  lineHeight,
  onChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Target Language Selection */}
      <div>
        <label
          htmlFor="target-language"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Target Language
        </label>
        <select
          id="target-language"
          value={targetLanguage}
          onChange={(e) => onChange('targetLanguage', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     dark:bg-gray-800 dark:text-white"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name} ({lang.nameEn})
            </option>
          ))}
        </select>
      </div>

      {/* Font Size Setting */}
      <div>
        <label
          htmlFor="font-size"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Font Size: {fontSize}px
        </label>
        <input
          id="font-size"
          type="range"
          min="12"
          max="24"
          value={fontSize}
          onChange={(e) => onChange('fontSize', Number(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>12px</span>
          <span>24px</span>
        </div>

        {/* Font Size Preview */}
        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">Preview:</p>
          <p style={{ fontSize: `${fontSize}px` }} className="text-gray-800 dark:text-gray-200">
            The quick brown fox jumps over the lazy dog
          </p>
        </div>
      </div>

      {/* Line Height Setting */}
      <div>
        <label
          htmlFor="line-height"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Line Height: {lineHeight.toFixed(1)}
        </label>
        <input
          id="line-height"
          type="range"
          min="1.0"
          max="2.0"
          step="0.1"
          value={lineHeight}
          onChange={(e) => onChange('lineHeight', Number(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>1.0</span>
          <span>2.0</span>
        </div>

        {/* Line Height Preview */}
        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">Preview:</p>
          <p
            style={{ lineHeight: lineHeight, fontSize: '14px' }}
            className="text-gray-800 dark:text-gray-200"
          >
            This is a sample text to demonstrate line height.
            <br />
            Multiple lines help visualize the spacing between lines.
            <br />
            Adjust the slider to see the effect.
          </p>
        </div>
      </div>
    </div>
  );
};
