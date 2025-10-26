/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiKeyWarning } from '@popup/components/ApiKeyWarning';

describe('ApiKeyWarning Component', () => {
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

    it('should display message directing to settings gear icon', () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      expect(screen.getByText(/please configure your openrouter api key in settings/i)).toBeInTheDocument();
    });

    it('should NOT display open settings button', () => {
      render(<ApiKeyWarning hasApiKey={false} />);
      const button = screen.queryByRole('button', { name: /open settings/i });
      expect(button).not.toBeInTheDocument();
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
