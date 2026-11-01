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
        const err = this.state.error as any;
        if (err?.message) {
          errText = typeof err.message === 'string' ? err.message : JSON.stringify(err.message);
        } else if (err) {
          errText = typeof err === 'string' ? err : typeof err === 'object' ? JSON.stringify(err) : String(err);
        }
      } catch {
        errText = 'An unexpected error occurred.';
      }

      const isChunkError =
        errText.includes('Failed to fetch dynamically imported module') ||
        errText.includes('error loading dynamically imported module') ||
        errText.includes('Importing a module script failed');

      return (
        <div className="cs-error-boundary" style={{ padding: 24, textAlign: 'center' }}>
          <div className="cs-error-boundary__icon" style={{ fontSize: 33, marginBottom: 12 }}>
            {isChunkError ? '🔄' : '⚠️'}
          </div>
          <h3 className="cs-error-boundary__title" style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>
            {isChunkError ? 'New Version Available' : 'Something went wrong'}
          </h3>
          <p className="cs-error-boundary__message" style={{ color: 'var(--text-secondary, #64748b)', margin: '0 0 16px' }}>
            {isChunkError
              ? 'A newer version of the application was deployed. Please reload the page to load the latest updates.'
              : errText}
          </p>
          <button
            type="button"
            className="company-settings__btn company-settings__btn--primary"
            style={{ padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => {
              if (isChunkError) {
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: null });
              }
            }}
          >
            {isChunkError ? 'Update & Reload' : 'Try Again'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
