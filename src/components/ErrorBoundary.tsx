'use client';

import { Component, ReactNode } from 'react';
import { css } from '@styled-system/css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const containerStyle = css({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
  color: '#ffffff',
});

const cardStyle = css({
  maxWidth: '600px',
  width: '100%',
  padding: '2rem',
  background: 'rgba(25, 25, 30, 0.8)',
  backdropFilter: 'blur(20px)',
  borderRadius: '20px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
});

const titleStyle = css({
  fontSize: '2rem',
  fontWeight: '700',
  marginBottom: '1rem',
  color: '#ff6b6b',
});

const messageStyle = css({
  fontSize: '1rem',
  lineHeight: '1.6',
  color: 'rgba(255, 255, 255, 0.8)',
  marginBottom: '1.5rem',
});

const buttonStyle = css({
  padding: '0.75rem 1.5rem',
  background: 'linear-gradient(135deg, #7877c6 0%, #5e5da8 100%)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '12px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.3s',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 20px rgba(120, 119, 198, 0.4)',
  },
});

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={containerStyle}>
          <div className={cardStyle}>
            <h1 className={titleStyle}>Something went wrong</h1>
            <p className={messageStyle}>
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            {this.state.error && process.env.NODE_ENV === 'development' && (
              <details className={css({ marginBottom: '1rem' })}>
                <summary className={css({ cursor: 'pointer', marginBottom: '0.5rem' })}>
                  Error details
                </summary>
                <pre className={css({
                  fontSize: '0.875rem',
                  padding: '1rem',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  overflow: 'auto',
                  maxHeight: '300px',
                })}>
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className={buttonStyle}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
