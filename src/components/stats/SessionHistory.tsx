'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '@styled-system/css';
import { StatSession } from '@/types';
import PinEntryModal from '@/components/rehab/PinEntryModal';

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
  position: 'relative',
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



const recorderStyle = css({
  fontSize: '0.85rem',
  color: '#666',
  fontStyle: 'italic',
});

const deleteBtnStyle = css({
  // position: 'absolute',
  // top: '1rem',
  // right: '1rem',
  background: 'rgba(255, 0, 0, 0.1)',
  color: '#ff4444',
  border: 'none',
  borderRadius: '50%',
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s',
  '&:hover': {
    background: 'rgba(255, 0, 0, 0.2)',
    transform: 'scale(1.1)',
  },
});

export default function SessionHistory({ showTitle = false }: { showTitle?: boolean }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<StatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

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

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this session?')) {
      setSessionToDelete(id);
      setShowPinModal(true);
    }
  };

  const handlePinSuccess = async () => {
    if (!sessionToDelete) return;

    try {
      const res = await fetch('/api/stats', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionToDelete }),
      });

      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
        setShowPinModal(false);
        setSessionToDelete(null);
      } else {
        alert('Failed to delete session');
      }
    } catch (e) {
      console.error('Delete failed', e);
      alert('Error deleting session');
    }
  };

  const handleCardClick = (id: string) => {
    router.push(`/tools/stat-recording/${id}`);
  };

  if (loading) {
    return <div className={css({ color: '#888', textAlign: 'center' })}>Loading history...</div>;
  }

  if (sessions.length === 0) {
    return <div className={css({ color: '#666', textAlign: 'center', fontStyle: 'italic' })}>No sessions recorded yet.</div>;
  }

  return (
    <>
      {showTitle && sessions.length > 0 && (
        <h2 className={css({ fontSize: '1.5rem', marginBottom: '1rem', color: '#ccc' })}>Recent Sessions</h2>
      )}
      <div className={listContainerStyle}>
      {sessions.map(session => (
        <div 
          key={session.id} 
          className={sessionCardStyle}
          onClick={() => handleCardClick(session.id)}
          style={{ cursor: 'pointer' }}
        >

          <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' })}>
            <div className={dateStyle} style={{ marginBottom: 0 }}>
              {new Date(session.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              {' • '}
              {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '0.75rem' })}>
              <div className={css({ 
                  fontSize: '0.75rem', 
                  fontWeight: 'bold', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: '4px',
                  background: session.endTime ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 193, 7, 0.2)',
                  color: session.endTime ? '#81c784' : '#ffb74d',
                  border: `1px solid ${session.endTime ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 193, 7, 0.3)'}`
              })}>
                  {session.endTime ? 'FINAL' : 'LIVE'}
              </div>
              <button 
                className={deleteBtnStyle}
                onClick={(e) => handleDeleteClick(session.id, e)}
                title="Delete Session"
              >
                ✕
              </button>
            </div>
          </div>
          <div className={matchupStyle}>
            {session.ourTeamName || 'Our Team'} vs {session.opponent}
          </div>
          
          <div className={css({ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' })}>
            <div className={css({
                fontSize: '1.25rem',
                fontWeight: '800',
                color: session.usStats.goals > session.themStats.goals ? '#4caf50' : 
                       session.usStats.goals < session.themStats.goals ? '#ff6b6b' : '#ccc',
                background: session.usStats.goals > session.themStats.goals ? 'rgba(76, 175, 80, 0.15)' : 
                            session.usStats.goals < session.themStats.goals ? 'rgba(244, 67, 54, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: `1px solid ${session.usStats.goals > session.themStats.goals ? 'rgba(76, 175, 80, 0.3)' : 
                                     session.usStats.goals < session.themStats.goals ? 'rgba(244, 67, 54, 0.3)' : 'rgba(255, 255, 255, 0.2)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontVariantNumeric: 'tabular-nums'
            })}>
                <span>
                    {session.usStats.goals > session.themStats.goals ? 'W' : 
                     session.usStats.goals < session.themStats.goals ? 'L' : 'T'}
                </span>
                <span>
                    {session.usStats.goals}-{session.themStats.goals}
                </span>
            </div>
          </div>

          <div className={css({ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem', display: 'flex', gap: '1rem' })}>
            <div>
                <span className={css({ color: '#888', marginRight: '0.25rem' })}>Shots:</span>
                <span className={css({ color: '#fff', fontWeight: 'bold' })}>{session.usStats.shots}</span>
                <span className={css({ fontSize: '0.75rem', color: '#666', marginLeft: '0.25rem' })}>(Us)</span>
            </div>
            <div>
                <span className={css({ color: '#fff', fontWeight: 'bold' })}>{session.themStats.shots}</span>
                <span className={css({ fontSize: '0.75rem', color: '#666', marginLeft: '0.25rem' })}>(Them)</span>
            </div>
          </div>
          <div className={recorderStyle}>
            Recorded by {session.recorderName}
          </div>
        </div>
      ))}
      
      {showPinModal && (
        <PinEntryModal 
          onSuccess={handlePinSuccess}
          onCancel={() => {
            setShowPinModal(false);
            setSessionToDelete(null);
          }}
        />
      )}
    </div>
    </>
  );
}
