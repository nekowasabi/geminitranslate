/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusIndicator } from '@popup/components/StatusIndicator';

describe('StatusIndicator Component', () => {
  describe('Idle State', () => {
    it('should not display anything when status is idle', () => {
      const { container } = render(<StatusIndicator status="idle" progress={0} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Translating State', () => {
    it('should display translating message', () => {
      render(<StatusIndicator status="translating" progress={50} />);
      expect(screen.getByText(/translating/i)).toBeInTheDocument();
    });

    it('should show progress bar when translating', () => {
      render(<StatusIndicator status="translating" progress={50} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
    });

    it('should display correct progress value', () => {
      render(<StatusIndicator status="translating" progress={75} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    });

    it('should show progress percentage', () => {
      render(<StatusIndicator status="translating" progress={60} />);
      expect(screen.getByText(/60%/)).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should display success message', () => {
      render(<StatusIndicator status="success" progress={100} />);
      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });

    it('should show checkmark icon', () => {
      render(<StatusIndicator status="success" progress={100} />);
      expect(screen.getByRole('img', { name: /success/i })).toBeInTheDocument();
    });

    it('should have success styling', () => {
      const { container } = render(<StatusIndicator status="success" progress={100} />);
      expect(container.firstChild).toHaveClass('success');
    });
  });

  describe('Error State', () => {
    it('should display error message when provided', () => {
      render(<StatusIndicator status="error" progress={0} error="Translation failed" />);
      expect(screen.getByText(/translation failed/i)).toBeInTheDocument();
    });

    it('should display generic error message when no error provided', () => {
      render(<StatusIndicator status="error" progress={0} />);
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });

    it('should show error icon', () => {
      render(<StatusIndicator status="error" progress={0} />);
      expect(screen.getByRole('img', { name: /error/i })).toBeInTheDocument();
    });

    it('should have error styling', () => {
      const { container } = render(<StatusIndicator status="error" progress={0} error="Failed" />);
      expect(container.firstChild).toHaveClass('error');
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-live for status updates', () => {
      const { container } = render(<StatusIndicator status="translating" progress={50} />);
      expect(container.querySelector('[aria-live]')).toBeInTheDocument();
    });

    it('should announce status changes to screen readers', () => {
      const { container } = render(<StatusIndicator status="success" progress={100} />);
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });
  });
});
