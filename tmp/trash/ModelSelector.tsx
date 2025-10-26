/**
 * ModelSelector Component
 * Dropdown for selecting OpenRouter model
 */

import React from 'react';
import { SUPPORTED_MODELS, DEFAULT_MODEL, ModelConfig } from '@shared/constants/models';

export interface ModelSelectorProps {
  selectedModel: string;
  onChange: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  // Group models by provider
  const modelsByProvider = SUPPORTED_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, ModelConfig[]>
  );

  const formatContextWindow = (size: number): string => {
    if (size >= 1000000) {
      return `${(size / 1000000).toFixed(0)}M`;
    } else if (size >= 1000) {
      return `${(size / 1000).toFixed(0)}K`;
    }
    return size.toString();
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="model-select"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Select Model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     dark:bg-gray-800 dark:text-white"
        >
          {Object.entries(modelsByProvider).map(([provider, models]) => (
            <optgroup key={provider} label={provider}>
              {models.map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  title={model.description}
                  data-default={model.id === DEFAULT_MODEL ? 'true' : undefined}
                >
                  {model.name}
                  {model.isFree && ' [FREE]'}
                  {model.id === DEFAULT_MODEL && ' (Recommended)'}
                  {' - '}
                  {formatContextWindow(model.contextWindow)} context
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Model Information */}
        {selectedModel && (() => {
          const selectedModelConfig = SUPPORTED_MODELS.find((m) => m.id === selectedModel);
          return selectedModelConfig ? (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Provider:</strong> {selectedModelConfig.provider}
              </p>
              {selectedModelConfig.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedModelConfig.description}
                </p>
              )}
              {selectedModelConfig.isFree && (
                <span className="inline-block mt-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs font-semibold rounded">
                  FREE
                </span>
              )}
              {selectedModel === DEFAULT_MODEL && (
                <span className="inline-block mt-2 ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs font-semibold rounded">
                  Recommended
                </span>
              )}
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
};
