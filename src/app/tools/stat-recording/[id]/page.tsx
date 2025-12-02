'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { css } from '@styled-system/css';
import { StatSession, Player } from '@/types';
import StatTracker from '@/components/stats/StatTracker';

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

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<StatSession | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/roster')
      .then(res => res.json())
      .then(data => setRoster(data))
      .catch(err => console.error('Failed to load roster', err));
  }, []);

  useEffect(() => {
    if (params?.id) {
      fetchSession(params.id as string);
    }
  }, [params?.id]);

  const fetchSession = async (id: string) => {
    try {
      const res = await fetch(`/api/stats?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      } else {
        setError('Session not found');
      }
    } catch (err) {
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    router.push('/tools/stat-recording');
  };

  if (loading) {
    return (
      <div className={containerStyle}>
        <div className={css({ color: '#888' })}>Loading session...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className={containerStyle}>
        <div className={css({ color: '#ff6b6b', marginBottom: '1rem' })}>{error || 'Session not found'}</div>
        <button 
          onClick={() => router.push('/tools/stat-recording')}
          className={css({
            padding: '0.75rem 1.5rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer'
          })}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className={containerStyle}>
      <StatTracker 
        session={session} 
        initialRoster={roster}
        onFinish={handleFinish}
        onExit={() => router.push('/tools/stat-recording')}
      />
    </div>
  );
}
