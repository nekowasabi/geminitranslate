/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiSettings } from '@options/components/ApiSettings';

describe('ApiSettings Component', () => {
  const mockOnChange = jest.fn();

  const defaultProps = {
    apiKey: '',
    onChange: mockOnChange,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Rendering', () => {
    it('should render API key input field', () => {
      render(<ApiSettings {...defaultProps} />);

      const input = screen.getByLabelText(/api key/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should render toggle visibility button', () => {
      render(<ApiSettings {...defaultProps} />);

      const toggleButton = screen.getByRole('button', { name: /show/i });
      expect(toggleButton).toBeInTheDocument();
    });

    it('should display security warning', () => {
      render(<ApiSettings {...defaultProps} />);

      const warning = screen.getByText(/your api key is stored locally/i);
      expect(warning).toBeInTheDocument();
    });

    it('should show provider label (OpenRouter)', () => {
      render(<ApiSettings {...defaultProps} />);

      const provider = screen.getAllByText(/openrouter/i);
      expect(provider.length).toBeGreaterThan(0);
    });
  });

  describe('API Key Input', () => {
    it('should display current API key value', () => {
      render(<ApiSettings {...defaultProps} apiKey="test-key-123" />);

      const input = screen.getByLabelText(/api key/i) as HTMLInputElement;
      expect(input.value).toBe('test-key-123');
    });

    it('should call onChange when API key is entered', async () => {
      render(<ApiSettings {...defaultProps} />);

      const input = screen.getByLabelText(/api key/i);
      fireEvent.change(input, { target: { value: 'new-api-key' } });

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('new-api-key');
      });
    });

    it('should show validation error for empty API key', () => {
      render(<ApiSettings {...defaultProps} apiKey="" />);

      const input = screen.getByLabelText(/api key/i);
      fireEvent.blur(input);

      const error = screen.getByText(/api key is required/i);
      expect(error).toBeInTheDocument();
    });

    it('should clear validation error when valid key is entered', async () => {
      render(<ApiSettings {...defaultProps} />);

      const input = screen.getByLabelText(/api key/i);

      // Trigger error
      fireEvent.blur(input);
      expect(screen.getByText(/api key is required/i)).toBeInTheDocument();

      // Fix error
      fireEvent.change(input, { target: { value: 'valid-key' } });

      await waitFor(() => {
        expect(screen.queryByText(/api key is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Visibility Toggle', () => {
    it('should toggle password visibility when button is clicked', () => {
      render(<ApiSettings {...defaultProps} apiKey="secret-key" />);

      const input = screen.getByLabelText(/api key/i);
      const toggleButton = screen.getByRole('button', { name: /show/i });

      expect(input).toHaveAttribute('type', 'password');

      fireEvent.click(toggleButton);
      expect(input).toHaveAttribute('type', 'text');

      fireEvent.click(toggleButton);
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should change button text when toggling visibility', () => {
      render(<ApiSettings {...defaultProps} />);

      const toggleButton = screen.getByRole('button', { name: /show/i });

      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveTextContent(/hide/i);

      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveTextContent(/show/i);
    });
  });

  describe('Security Warning', () => {
    it('should display security notice about local storage', () => {
      render(<ApiSettings {...defaultProps} />);

      expect(screen.getByText(/stored locally/i)).toBeInTheDocument();
      expect(screen.getByText(/never shared/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ApiSettings {...defaultProps} />);

      const input = screen.getByLabelText(/api key/i);
      expect(input).toHaveAccessibleName();
    });

    it('should associate error message with input', () => {
      render(<ApiSettings {...defaultProps} />);

      const input = screen.getByLabelText(/api key/i);
      fireEvent.blur(input);

      const error = screen.getByText(/api key is required/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', error.id);
    });
  });
});
