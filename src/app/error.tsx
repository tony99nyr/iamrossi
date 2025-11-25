'use client';

import { useEffect } from 'react';
import { css } from '@styled-system/css';

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

const buttonGroupStyle = css({
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
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
  fontFamily: 'inherit',
  fontSize: '1rem',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 20px rgba(120, 119, 198, 0.4)',
  },
});

const secondaryButtonStyle = css({
  padding: '0.75rem 1.5rem',
  background: 'rgba(255, 255, 255, 0.1)',
  color: '#ffffff',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '12px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.3s',
  fontFamily: 'inherit',
  fontSize: '1rem',
  '&:hover': {
    background: 'rgba(255, 255, 255, 0.15)',
  },
});

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className={containerStyle}>
      <div className={cardStyle}>
        <h1 className={titleStyle}>Something went wrong</h1>
        <p className={messageStyle}>
          We encountered an unexpected error. Please try again or return to the home page.
        </p>
        {error && process.env.NODE_ENV === 'development' && (
          <details style={{ marginBottom: '1.5rem' }}>
            <summary style={{
              cursor: 'pointer',
              marginBottom: '0.5rem',
              color: 'rgba(255, 255, 255, 0.7)',
            }}>
              Error details (Development only)
            </summary>
            <pre style={{
              fontSize: '0.875rem',
              padding: '1rem',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              overflow: 'auto',
              maxHeight: '300px',
              color: '#ff6b6b',
            }}>
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
        <div className={buttonGroupStyle}>
          <button onClick={reset} className={buttonStyle}>
            Try Again
          </button>
          <button onClick={() => window.location.href = '/'} className={secondaryButtonStyle}>
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
