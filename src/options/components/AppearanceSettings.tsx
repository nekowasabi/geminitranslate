/**
 * AppearanceSettings Component
 * Dark mode and theme settings
 */

import React from 'react';

export interface AppearanceSettingsProps {
  darkMode: boolean;
  onChange: (key: 'darkMode', value: boolean) => void;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  darkMode,
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
