'use client';

import { useState, useEffect } from 'react';
import { css } from '@styled-system/css';
import { StatSession } from '@/types';

const listContainerStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

const sessionCardStyle = css({
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '12px',
  padding: '1.5rem',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  transition: 'all 0.2s',
  '&:hover': {
    background: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  }
});

const dateStyle = css({
  fontSize: '0.85rem',
  color: '#888',
  marginBottom: '0.5rem',
});

const matchupStyle = css({
  fontSize: '1.2rem',
  fontWeight: '700',
  color: 'white',
  marginBottom: '0.5rem',
});

const scoreStyle = css({
  fontSize: '1.1rem',
  color: '#ccc',
  marginBottom: '0.5rem',
});

const recorderStyle = css({
  fontSize: '0.85rem',
  color: '#666',
  fontStyle: 'italic',
});

export default function SessionHistory() {
  const [sessions, setSessions] = useState<StatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        // Sort by date desc
        const sorted = (Array.isArray(data) ? data : []).sort((a: StatSession, b: StatSession) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setSessions(sorted);
      })
      .catch(err => console.error('Failed to load sessions', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className={css({ color: '#888', textAlign: 'center' })}>Loading history...</div>;
  }

  if (sessions.length === 0) {
    return <div className={css({ color: '#666', textAlign: 'center', fontStyle: 'italic' })}>No sessions recorded yet.</div>;
  }

  return (
    <div className={listContainerStyle}>
      {sessions.map(session => (
        <div key={session.id} className={sessionCardStyle}>
          <div className={dateStyle}>
            {new Date(session.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            {' • '}
            {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className={matchupStyle}>
            Our Team vs {session.opponent}
          </div>
          <div className={scoreStyle}>
            {session.usStats.goals} - {session.themStats.goals}
          </div>
          <div className={recorderStyle}>
            Recorded by {session.recorderName}
          </div>
        </div>
      ))}
    </div>
  );
}
