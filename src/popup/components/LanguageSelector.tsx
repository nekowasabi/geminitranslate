/**
 * LanguageSelector Component
 * Dropdown selector for target language
 */

import React, { useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES } from '@shared/constants/languages';
import StorageManager from '@shared/storage/StorageManager';

export const LanguageSelector: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const storageManager = new StorageManager();

  // Load saved language on mount
  useEffect(() => {
    const loadLanguage = async () => {
      const lang = await storageManager.getTargetLanguage();
      setSelectedLanguage(lang);
    };

    loadLanguage();
  }, []);

  const handleLanguageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = event.target.value;
    setSelectedLanguage(newLanguage);

    // Save to storage
    await storageManager.setTargetLanguage(newLanguage);
  };

  return (
    <div className="language-selector">
      <label htmlFor="target-language">Target Language:</label>
      <select
        id="target-language"
        value={selectedLanguage}
        onChange={handleLanguageChange}
        aria-label="Select target language"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
};
