/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModelSelector } from '@options/components/ModelSelector';
import { SUPPORTED_MODELS } from '@shared/constants/models';

describe('ModelSelector Component', () => {
  const mockOnChange = jest.fn();

  const defaultProps = {
    selectedModel: 'google/gemini-2.0-flash-exp:free',
    onChange: mockOnChange,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Rendering', () => {
    it('should render model selector dropdown', () => {
      render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /select model/i });
      expect(select).toBeInTheDocument();
    });

    it('should display current selected model', () => {
      render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('should render all supported models as options', () => {
      render(<ModelSelector {...defaultProps} />);

      const options = screen.getAllByRole('option');
      expect(options.length).toBe(SUPPORTED_MODELS.length);
    });
  });

  describe('Model Options', () => {
    it('should show FREE badge for free models in option text', () => {
      render(<ModelSelector {...defaultProps} />);

      const options = screen.getAllByRole('option');
      const freeOption = options.find((opt) => opt.textContent?.includes('[FREE]'));

      expect(freeOption).toBeInTheDocument();
      expect(freeOption?.textContent).toContain('[FREE]');
    });

    it('should not show FREE badge for paid models', () => {
      render(<ModelSelector {...defaultProps} />);

      const options = screen.getAllByRole('option');
      const gpt4Option = options.find((opt) => opt.textContent?.includes('GPT-4 Turbo'));

      expect(gpt4Option).toBeInTheDocument();
      expect(gpt4Option?.textContent).not.toContain('[FREE]');
    });

    it('should group models by provider', () => {
      render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox');
      const optgroups = select.querySelectorAll('optgroup');

      expect(optgroups.length).toBeGreaterThan(0);
      expect(Array.from(optgroups).some(og => og.label === 'Google')).toBe(true);
      expect(Array.from(optgroups).some(og => og.label === 'OpenAI')).toBe(true);
    });

    it('should display model descriptions on hover', () => {
      render(<ModelSelector {...defaultProps} />);

      const options = screen.getAllByRole('option');
      const geminiOption = options.find((opt) =>
        opt.textContent?.includes('Gemini 2.0 Flash')
      );

      expect(geminiOption).toHaveAttribute(
        'title',
        expect.stringContaining('Latest Gemini model')
      );
    });
  });

  describe('Model Selection', () => {
    it('should call onChange when a model is selected', () => {
      render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'openai/gpt-4-turbo' } });

      expect(mockOnChange).toHaveBeenCalledWith('openai/gpt-4-turbo');
    });

    it('should update selected value when model changes', () => {
      const { rerender } = render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('google/gemini-2.0-flash-exp:free');

      rerender(
        <ModelSelector selectedModel="anthropic/claude-3-opus" onChange={mockOnChange} />
      );

      expect(select.value).toBe('anthropic/claude-3-opus');
    });
  });

  describe('Default Model', () => {
    it('should highlight default model (google/gemini-2.0-flash-exp:free)', () => {
      render(<ModelSelector {...defaultProps} />);

      const defaultOption = screen.getByRole('option', {
        name: /gemini 2.0 flash.*free/i,
      });

      expect(defaultOption).toHaveAttribute('data-default', 'true');
    });

    it('should show recommended badge for default model', () => {
      render(<ModelSelector {...defaultProps} />);

      const recommendedBadges = screen.getAllByText(/recommended/i);
      expect(recommendedBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Model Information Display', () => {
    it('should show context window size in option text', () => {
      render(<ModelSelector {...defaultProps} />);

      const options = screen.getAllByRole('option');
      const geminiOption = options.find((opt) => opt.textContent?.includes('Gemini 2.0'));

      expect(geminiOption?.textContent).toMatch(/1M.*context/i);
    });

    it('should display provider name in model info section for selected model', () => {
      render(<ModelSelector {...defaultProps} selectedModel="google/gemini-2.0-flash-exp:free" />);

      // Selected model info is displayed below the select
      const providerInfo = screen.getByText(/provider:/i);
      expect(providerInfo).toBeInTheDocument();
      expect(screen.getByText('Google')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveAccessibleName(/select model/i);
    });

    it('should be keyboard navigable', () => {
      render(<ModelSelector {...defaultProps} />);

      const select = screen.getByRole('combobox');
      select.focus();

      expect(select).toHaveFocus();

      // Simulate keyboard navigation
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      expect(select).toHaveFocus();
    });
  });
});
