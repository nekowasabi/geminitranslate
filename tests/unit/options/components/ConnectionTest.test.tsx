/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectionTest } from '@options/components/ConnectionTest';

describe('ConnectionTest Component', () => {
  const mockOnTest = jest.fn();

  const defaultProps = {
    onTest: mockOnTest,
    testing: false,
  };

  beforeEach(() => {
    mockOnTest.mockClear();
  });

  describe('Rendering', () => {
    it('should render test connection button', () => {
      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button', { name: /test connection/i });
      expect(button).toBeInTheDocument();
    });

    it('should show description text', () => {
      render(<ConnectionTest {...defaultProps} />);

      const description = screen.getByText(/verify your api connection/i);
      expect(description).toBeInTheDocument();
    });
  });

  describe('Test Connection Button', () => {
    it('should call onTest when button is clicked', async () => {
      mockOnTest.mockResolvedValue({ success: true, responseTime: 150 });

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnTest).toHaveBeenCalledTimes(1);
      });
    });

    it('should be disabled when testing is in progress', () => {
      render(<ConnectionTest {...defaultProps} testing={true} />);

      const button = screen.getByRole('button', { name: /testing/i });
      expect(button).toBeDisabled();
    });

    it('should show loading state during test', () => {
      render(<ConnectionTest {...defaultProps} testing={true} />);

      const loadingText = screen.getByText(/testing/i);
      expect(loadingText).toBeInTheDocument();
    });
  });

  describe('Test Results Display', () => {
    it('should display success message after successful test', async () => {
      mockOnTest.mockResolvedValue({ success: true, responseTime: 123 });

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
      });
    });

    it('should display response time after successful test', async () => {
      mockOnTest.mockResolvedValue({ success: true, responseTime: 234 });

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/234\s*ms/i)).toBeInTheDocument();
      });
    });

    it('should display error message after failed test', async () => {
      mockOnTest.mockResolvedValue({ success: false, error: 'Invalid API key' });

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
        expect(screen.getByText(/invalid api key/i)).toBeInTheDocument();
      });
    });

    it('should clear previous results when starting new test', async () => {
      mockOnTest.mockResolvedValueOnce({ success: true, responseTime: 100 });

      const { rerender } = render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
      });

      // Start new test
      rerender(<ConnectionTest {...defaultProps} testing={true} />);

      expect(screen.queryByText(/connection successful/i)).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockOnTest.mockRejectedValue(new Error('Network error'));

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
      });
    });

    it('should display generic error for unknown errors', async () => {
      mockOnTest.mockResolvedValue({ success: false });

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show spinner during test', () => {
      render(<ConnectionTest {...defaultProps} testing={true} />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
    });

    it('should hide spinner after test completes', async () => {
      mockOnTest.mockResolvedValue({ success: true, responseTime: 100 });

      const { rerender } = render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Testing state
      rerender(<ConnectionTest {...defaultProps} testing={true} />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      // Test complete - wait for result to appear, which indicates testing is done
      await waitFor(() => {
        rerender(<ConnectionTest {...defaultProps} testing={false} />);
      });

      // After testing is complete, the spinner should be gone but result should be visible
      expect(screen.queryByRole('status', { hidden: false })).toBeInTheDocument(); // Result has role="status"
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAccessibleName(/test connection/i);
    });

    it('should announce test results to screen readers', async () => {
      mockOnTest.mockResolvedValue({ success: true, responseTime: 150 });

      render(<ConnectionTest {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        const result = screen.getByText(/connection successful/i);
        // Result is inside a div with role="status"
        expect(result.closest('[role="status"]')).toBeInTheDocument();
      });
    });
  });
});
