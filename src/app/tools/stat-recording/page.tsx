'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '@styled-system/css';
import { Game, StatSession } from '@/types';
import GameSetup from '@/components/stats/GameSetup';
import SessionHistory from '@/components/stats/SessionHistory';

const containerStyle = css({
  minHeight: '100vh',
  padding: '2rem 1rem',
  background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
  color: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2rem',
});

const headerStyle = css({
  fontSize: '2.5rem',
  fontWeight: '800',
  background: 'linear-gradient(135deg, #ffffff 0%, #7877c6 50%, #ff8a65 100%)',
  backgroundClip: 'text',
  color: 'transparent',
  textAlign: 'center',
  marginBottom: '1rem',
});

export default function StatRecordingPage() {
  const [view, setView] = useState<'setup' | 'history'>('setup');
  const router = useRouter();

  const handleStartSession = async (session: StatSession) => {
    // Save initial session before redirecting
    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      router.push(`/tools/stat-recording/${session.id}`);
    } catch (error) {
      console.error('Failed to start session', error);
      alert('Failed to start session. Please try again.');
    }
  };

  return (
    <div className={containerStyle}>
      <h1 className={headerStyle}>Game Stat Tracker</h1>

      {view === 'setup' && (
        <>
          <GameSetup onStartSession={handleStartSession} />
          <div className={css({ width: '100%', maxWidth: '800px', marginTop: '2rem' })}>
            <h2 className={css({ fontSize: '1.5rem', marginBottom: '1rem', color: '#ccc' })}>Recent Sessions</h2>
            <SessionHistory />
          </div>
        </>
      )}

      {view === 'history' && (
        <div className={css({ width: '100%', maxWidth: '800px' })}>
          <button 
            onClick={() => setView('setup')}
            className={css({
              marginBottom: '1.5rem',
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              '&:hover': { background: 'rgba(255, 255, 255, 0.15)' }
            })}
          >
            ← Back to Setup
          </button>
          <SessionHistory />
        </div>
      )}
    </div>
  );
}
