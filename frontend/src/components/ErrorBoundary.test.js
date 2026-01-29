import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, SectionErrorBoundary } from './ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Suppress console.error for cleaner test output
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  test('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  test('renders fallback UI when an error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  test('renders custom message when provided', () => {
    render(
      <ErrorBoundary message="Custom error message">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  test('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  test('calls onError callback when error occurs', () => {
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('recovers when Try Again is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click Try Again
    fireEvent.click(screen.getByText('Try Again'));

    // Rerender with non-throwing component
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });
});

describe('SectionErrorBoundary', () => {
  test('renders children when there is no error', () => {
    render(
      <SectionErrorBoundary section="test">
        <div>Section content</div>
      </SectionErrorBoundary>
    );

    expect(screen.getByText('Section content')).toBeInTheDocument();
  });

  test('renders inline error UI when an error occurs', () => {
    render(
      <SectionErrorBoundary section="chart">
        <ThrowError />
      </SectionErrorBoundary>
    );

    expect(screen.getByText('Failed to load chart')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  test('uses default section name when not provided', () => {
    render(
      <SectionErrorBoundary>
        <ThrowError />
      </SectionErrorBoundary>
    );

    expect(screen.getByText('Failed to load this section')).toBeInTheDocument();
  });
});
