'use client';

import { css, cx } from '@styled-system/css';
import type { StickAndPuckSession } from '@/types';
import SessionCard from './SessionCard';

interface SessionListProps {
  sessions: StickAndPuckSession[];
  selectedDate?: string | null;
  selectedRink?: string | null;
}

export default function SessionList({ sessions, selectedDate, selectedRink }: SessionListProps) {
  // Filter sessions
  let filtered = sessions;
  
  if (selectedDate) {
    // Ensure exact date string match (YYYY-MM-DD format)
    filtered = filtered.filter(s => {
      const match = s.date === selectedDate;
      if (!match && s.date) {
        // Debug: log mismatches to help identify issues
        console.log(`[SessionList] Date mismatch: session.date="${s.date}", selectedDate="${selectedDate}"`);
      }
      return match;
    });
  }
  
  if (selectedRink) {
    filtered = filtered.filter(s => s.rink === selectedRink);
  }

  if (filtered.length === 0) {
    return (
      <div className={css({
        textAlign: 'center',
        padding: '48px 24px',
        color: '#999',
        fontSize: '16px',
      })}>
        {selectedDate || selectedRink 
          ? 'No sessions found for the selected filters.'
          : 'No sessions available.'}
      </div>
    );
  }

  return (
    <div className={cx('session-list', css({
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '16px',
      md: {
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '20px',
      },
      lg: {
        gridTemplateColumns: 'repeat(3, 1fr)',
      }
    }))}>
      {filtered.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}

