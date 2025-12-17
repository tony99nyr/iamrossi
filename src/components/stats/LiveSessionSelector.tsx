'use client';

import { useState, useEffect } from 'react';
import { css } from '@styled-system/css';
import { StatSession } from '@/types';

const containerStyle = css({
  width: '100%',
  maxWidth: '800px',
  background: 'rgba(25, 25, 30, 0.6)',
  backdropFilter: 'blur(10px)',
  padding: '1.5rem',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  marginTop: '2rem',
});

const titleStyle = css({
  fontSize: '1.25rem',
  fontWeight: '600',
  color: '#fff',
  marginBottom: '1rem',
});

const selectStyle = css({
  width: '100%',
  padding: '0.75rem',
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '1rem',
  cursor: 'pointer',
  '&:hover': { background: 'rgba(255, 255, 255, 0.15)' },
  '& option': { background: '#1a1a1a', color: '#fff' },
});

const loadingStyle = css({
  color: '#888',
  textAlign: 'center',
  padding: '1rem',
});

interface LiveSessionSelectorProps {
  onSessionChange?: (sessionId: string | null) => void;
}

export default function LiveSessionSelector({ onSessionChange }: LiveSessionSelectorProps) {
  const [liveSessions, setLiveSessions] = useState<StatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/stats/selected-live');
      if (res.ok) {
        const data = await res.json();
        setLiveSessions(data.liveSessions || []);
        setSelectedSessionId(data.selectedSessionId || null);
      }
    } catch (err) {
      console.error('Failed to fetch live sessions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 5 seconds to check for new live sessions
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = async (sessionId: string) => {
    const newSelectedId = sessionId === '' ? null : sessionId;
    setSaving(true);
    
    try {
      // Get auth token from sessionStorage
      const token = sessionStorage.getItem('admin_token');
      if (!token) {
        alert('Authentication required. Please log in.');
        return;
      }

      const res = await fetch('/api/stats/selected-live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: newSelectedId }),
      });

      if (res.ok) {
        setSelectedSessionId(newSelectedId);
        if (onSessionChange) {
          onSessionChange(newSelectedId);
        }
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update selected session');
      }
    } catch (err) {
      console.error('Failed to update selected session', err);
      alert('Failed to update selected session');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={containerStyle}>
        <div className={loadingStyle}>Loading live sessions...</div>
      </div>
    );
  }

  if (liveSessions.length === 0) {
    return null; // Don't show the component if there are no live sessions
  }

  return (
    <div className={containerStyle}>
      <div className={titleStyle}>Select Live Session for OBS</div>
      <select
        value={selectedSessionId || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={selectStyle}
      >
        <option value="">Auto-select (first live session)</option>
        {liveSessions.map(session => (
          <option key={session.id} value={session.id}>
            {session.ourTeamName || 'Our Team'} vs {session.opponent} - {new Date(session.startTime).toLocaleString()}
          </option>
        ))}
      </select>
    </div>
  );
}

