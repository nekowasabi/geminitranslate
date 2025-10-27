/**
 * AppearanceSettings Component
 * Dark mode and theme settings
 */

import React from 'react';

export interface AppearanceSettingsProps {
  darkMode: boolean;
  selectionFontSize: number;
  onChange: <K extends 'darkMode' | 'selectionFontSize'>(
    key: K,
    value: K extends 'darkMode' ? boolean : number
  ) => void;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  darkMode,
  selectionFontSize,
  onChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Dark Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Dark Mode</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enable dark theme for the extension interface
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={(e) => onChange('darkMode', e.target.checked)}
            className="sr-only peer"
          />
          <div
            className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4
                       peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer
                       dark:bg-gray-700 peer-checked:after:translate-x-full
                       peer-checked:after:border-white after:content-[''] after:absolute
                       after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300
                       after:border after:rounded-full after:h-5 after:w-5 after:transition-all
                       dark:border-gray-600 peer-checked:bg-blue-600"
          ></div>
        </label>
      </div>

      {/* Selection Translation Font Size Setting */}
      <div>
        <label
          htmlFor="selection-font-size"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Selection Translation Font Size: {selectionFontSize}px
        </label>
        <input
          id="selection-font-size"
          type="range"
          min="10"
          max="24"
          step="2"
          value={selectionFontSize}
          onChange={(e) => onChange('selectionFontSize', Number(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>10px</span>
          <span>24px</span>
        </div>

        {/* Selection Font Size Preview */}
        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">Preview:</p>
          <p style={{ fontSize: `${selectionFontSize}px` }} className="text-gray-800 dark:text-gray-200">
            This is how the selected text translation will appear
          </p>
        </div>
      </div>

      {/* Theme Preview */}
      <div className="mt-6 p-4 border border-gray-300 dark:border-gray-700 rounded-md">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Theme Preview
        </p>
        <div
          className={`p-4 rounded-md ${
            darkMode
              ? 'bg-gray-900 text-white border border-gray-700'
              : 'bg-white text-gray-900 border border-gray-300'
          }`}
        >
          <h4 className="font-semibold mb-2">Sample Content</h4>
          <p className="text-sm">
            This is how the extension interface will look with the selected theme.
          </p>
        </div>
      </div>

      {/* Additional Theme Options (Placeholder for future) */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Note:</strong> More theme customization options coming soon!
        </p>
      </div>
    </div>
  );
};
