'use client';

import { useState, useEffect } from 'react';
import { css } from '@styled-system/css';
import { StatSession } from '@/types';

const containerStyle = css({
  minHeight: '100vh',
  width: '100vw',
  padding: '2rem',
  background: 'transparent',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
});

const statsFrameStyle = css({
  width: '100%',
  maxWidth: '1200px',
  background: '#ffffff',
  borderRadius: '12px',
  padding: '2rem',
  display: 'grid',
  gridTemplateColumns: 'auto 1fr 1fr',
  gridTemplateRows: 'auto auto',
  gap: '2rem 3rem',
  alignItems: 'center',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
});

const statLabelStyle = css({
  fontSize: '1.25rem',
  color: '#666666',
  textTransform: 'uppercase',
  fontWeight: '600',
  letterSpacing: '0.05em',
  fontFamily: 'sans-serif',
  textAlign: 'right',
  paddingRight: '1rem',
});

const statValueStyle = css({
  fontSize: '3.5rem',
  fontWeight: '800',
  color: '#000000',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
});

const canesValueStyle = css({
  fontSize: '3.5rem',
  fontWeight: '800',
  color: '#dc2626',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
});

const emptyStateStyle = css({
  textAlign: 'center',
  color: '#ffffff',
  fontSize: '1rem',
  padding: '1rem',
  marginTop: '1rem',
  opacity: 0.7,
});

export default function LivePage() {
  const [session, setSession] = useState<StatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/stats/live');
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          setError(null);
        } else {
          setSession(null);
          setError(null);
        }
      } else {
        setError('Failed to load session');
      }
    } catch (err) {
      console.error('Failed to fetch live session', err);
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    // Poll every 2 seconds for updates
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, []);

  // Use default values when no session
  const themShots = session?.themStats.shots ?? 0;
  const usShots = session?.usStats.shots ?? 0;
  const themChances = session?.themStats.chances ?? 0;
  const usChances = session?.usStats.chances ?? 0;

  return (
    <div className={containerStyle}>
      {/* Stats Frame - Shots and Chances Only */}
      <div className={statsFrameStyle}>
        {/* Shots Row */}
        <div className={statLabelStyle}>Shots</div>
        <div className={statValueStyle}>{themShots}</div>
        <div className={canesValueStyle}>{usShots}</div>

        {/* Chances Row */}
        <div className={statLabelStyle}>Chances</div>
        <div className={statValueStyle}>{themChances}</div>
        <div className={canesValueStyle}>{usChances}</div>
      </div>

      {/* Status message below the scoreboard */}
      {loading && (
        <div className={emptyStateStyle}>Loading...</div>
      )}
      {!loading && (!session || error) && (
        <div className={emptyStateStyle}>No live session active</div>
      )}
    </div>
  );
}

