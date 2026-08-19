import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error | unknown, info: React.ErrorInfo) {
    let msg = 'Unknown error';
    try {
      if (typeof error === 'string') msg = error;
      else if (error && typeof (error as Error).message === 'string') msg = (error as Error).message;
      else if (error) msg = String(error);
    } catch {
      msg = 'Unstringifiable error';
    }
    console.warn('[ErrorBoundary] Caught an error:', msg, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      let errText = 'An unexpected error occurred.';
      try {
        if (this.state.error?.message) errText = String(this.state.error.message);
        else if (this.state.error) errText = String(this.state.error);
      } catch {
        errText = 'An unexpected error occurred.';
      }

      return (
        <div className="cs-error-boundary" style={{ padding: 24, textAlign: 'center' }}>
          <div className="cs-error-boundary__icon" style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h3 className="cs-error-boundary__title" style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</h3>
          <p className="cs-error-boundary__message" style={{ color: 'var(--text-secondary, #64748b)', margin: '0 0 16px' }}>
            {errText}
          </p>
          <button
            type="button"
            className="company-settings__btn company-settings__btn--primary"
            style={{ padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
