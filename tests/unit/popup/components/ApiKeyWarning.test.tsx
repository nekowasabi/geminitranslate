/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiKeyWarning } from '@popup/components/ApiKeyWarning';

// Mock chrome.runtime.openOptionsPage
const mockOpenOptionsPage = jest.fn();
global.chrome = {
  runtime: {
    openOptionsPage: mockOpenOptionsPage,
  },
} as any;

describe('ApiKeyWarning Component', () => {
  beforeEach(() => {
    mockOpenOptionsPage.mockClear();
  });

  describe('Rendering', () => {
    it('should render warning banner when API key is missing', () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should not render when API key is present', () => {
      const { container } = render(<ApiKeyWarning hasApiKey={true} />);
      expect(container.firstChild).toBeNull();
    });

    it('should display warning message', () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      expect(screen.getByText('API Key Required')).toBeInTheDocument();
    });

    it('should display open settings button', () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument();
    });
  });

  describe('Open Settings Button', () => {
    it('should call chrome.runtime.openOptionsPage when clicked', async () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      const button = screen.getByRole('button', { name: /open settings/i });

      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOpenOptionsPage).toHaveBeenCalledTimes(1);
      });
    });

    it('should be accessible via keyboard', async () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      const button = screen.getByRole('button', { name: /open settings/i });

      button.focus();
      fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockOpenOptionsPage).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Warning Style', () => {
    it('should have warning/alert styling', () => {
      const { container } = render(<ApiKeyWarning hasApiKey={false} />);
      expect(container.firstChild).toHaveClass('warning');
    });

    it('should have proper role for accessibility', () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });

  describe('Conditional Rendering', () => {
    it('should toggle visibility based on hasApiKey prop', () => {
      const { rerender, container } = render(<ApiKeyWarning hasApiKey={false} />);

      // Should show warning
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Should hide warning when API key is present
      rerender(<ApiKeyWarning hasApiKey={true} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
