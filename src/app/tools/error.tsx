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
  color: '#ffffff',
});

const titleStyle = css({
  fontSize: '2rem',
  fontWeight: '700',
  marginBottom: '1rem',
  color: '#ff6b6b',
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
  marginTop: '1rem',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 20px rgba(120, 119, 198, 0.4)',
  },
});

export default function ToolsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Tools error:', error);
  }, [error]);

  return (
    <div className={containerStyle}>
      <div className={cardStyle}>
        <h1 className={titleStyle}>Tool Error</h1>
        <p style={{ marginBottom: '1rem', lineHeight: '1.6' }}>
          This tool encountered an error. Please try refreshing the page.
        </p>
        <button onClick={reset} className={buttonStyle}>
          Try Again
        </button>
      </div>
    </div>
  );
}
