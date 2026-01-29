import React from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle } from './icons';
import './ErrorBoundary.css';

/**
 * ErrorBoundary - Catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the entire app.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });

    // Optional: Send to error reporting service
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon"><AlertTriangle size={48} /></div>
            <h2 className="error-title">Something went wrong</h2>
            <p className="error-message">
              {this.props.message || 'An unexpected error occurred. Please try again.'}
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-details">
                <summary>Error Details</summary>
                <pre className="error-stack">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="error-actions">
              <button className="error-retry-btn" onClick={this.handleRetry}>
                Try Again
              </button>
              <button
                className="error-home-btn"
                onClick={() => window.location.href = '/'}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
  message: PropTypes.string,
  onError: PropTypes.func
};

ErrorBoundary.defaultProps = {
  fallback: null,
  message: null,
  onError: null
};

/**
 * Smaller error boundary for individual components/sections
 */
class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`Error in ${this.props.section || 'section'}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="section-error">
          <AlertTriangle size={14} className="section-error-icon" />
          <span className="section-error-text">
            Failed to load {this.props.section || 'this section'}
          </span>
          <button
            className="section-error-retry"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

SectionErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  section: PropTypes.string
};

SectionErrorBoundary.defaultProps = {
  section: null
};

export { ErrorBoundary, SectionErrorBoundary };
export default ErrorBoundary;
