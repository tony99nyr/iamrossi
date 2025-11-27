'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '@styled-system/css';
import './animations.css';

interface LeaderboardEntry {
  name: string;
  score: number;
  timestamp: number;
  rank: number;
}

interface LeaderboardDisplayProps {
  highlightRank?: number; // Which rank to highlight (user's score)
  onScrollComplete?: () => void;
}

export default function LeaderboardDisplay({ highlightRank, onScrollComplete }: LeaderboardDisplayProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/game/leaderboard');
      const data = await response.json();

      if (data.success) {
        setLeaderboard(data.leaderboard);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToHighlight = useCallback(() => {
    if (!scrollContainerRef.current || !highlightRank) return;

    const container = scrollContainerRef.current;
    const highlightElement = container.querySelector(`[data-rank="${highlightRank}"]`);

    if (!highlightElement) return;

    // Scroll to highlighted entry first (instant)
    const elementTop = (highlightElement as HTMLElement).offsetTop;
    const containerHeight = container.clientHeight;
    const scrollToPosition = elementTop - containerHeight / 2 + 30; // Center it

    container.scrollTop = scrollToPosition;

    // After a delay, smoothly scroll to top
    setTimeout(() => {
      container.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      // Call callback when scroll is complete
      if (onScrollComplete) {
        setTimeout(onScrollComplete, 2000); // Approximate scroll duration
      }
    }, 2000); // Wait 2 seconds before scrolling up
  }, [highlightRank, onScrollComplete]);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  useEffect(() => {
    if (!highlightRank || leaderboard.length === 0 || !scrollContainerRef.current) return;

    const timeoutId = window.setTimeout(() => {
      scrollToHighlight();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [highlightRank, leaderboard, scrollToHighlight]);

  if (loading) {
    return (
      <div className={containerStyle}>
        <div className={loadingStyle}>Loading leaderboard...</div>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className={containerStyle}>
        <div className={emptyStyle}>No scores yet. Be the first!</div>
      </div>
    );
  }

  return (
    <div className={containerStyle} ref={scrollContainerRef}>
      <div className={headerStyle}>🏆 HIGH SCORES 🏆</div>
      <div className={listStyle}>
        {leaderboard.map((entry) => (
          <div
            key={`${entry.name}-${entry.timestamp}`}
            data-rank={entry.rank}
            className={entry.rank === highlightRank ? highlightedEntryStyle : entryStyle}
          >
            <div className={rankStyle}>
              {entry.rank === 1 && '🥇'}
              {entry.rank === 2 && '🥈'}
              {entry.rank === 3 && '🥉'}
              {entry.rank > 3 && `#${entry.rank}`}
            </div>
            <div className={nameStyle}>{entry.name}</div>
            <div className={scoreValueStyle}>{entry.score.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const containerStyle = css({
  position: 'relative',
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  border: '2px solid #FFD700',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
});

const headerStyle = css({
  fontSize: { base: '1.25rem', md: '1.5rem' },
  fontWeight: 'bold',
  color: '#FFD700',
  textAlign: 'center',
  padding: '0.75rem',
  backgroundColor: 'rgba(255, 215, 0, 0.1)',
  borderBottom: '2px solid #FFD700',
  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
});

const listStyle = css({
  padding: '0.5rem',
  overflowY: 'auto',
  height: 'calc(100% - 70px)',
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#FFD700',
    borderRadius: '4px',
  },
});

const entryStyle = css({
  display: 'flex',
  alignItems: 'center',
  padding: '0.5rem',
  marginBottom: '0.25rem',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '8px',
  transition: 'all 0.3s',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});

const highlightedEntryStyle = css({
  display: 'flex',
  alignItems: 'center',
  padding: '0.5rem',
  marginBottom: '0.25rem',
  backgroundColor: 'rgba(255, 215, 0, 0.3)',
  borderRadius: '8px',
  border: '2px solid #FFD700',
  animation: 'pulseHighlight 2s ease-in-out infinite',
});

const rankStyle = css({
  fontSize: '1.2rem',
  fontWeight: 'bold',
  color: '#FFD700',
  minWidth: '40px',
  textAlign: 'center',
});

const nameStyle = css({
  fontSize: '1.2rem',
  fontWeight: '600',
  color: '#fff',
  flex: 1,
  paddingLeft: '0.75rem',
});

const scoreValueStyle = css({
  fontSize: '1.2rem',
  fontWeight: 'bold',
  color: '#4CAF50',
  minWidth: '80px',
  textAlign: 'right',
});

const loadingStyle = css({
  fontSize: '1.5rem',
  color: '#fff',
  textAlign: 'center',
  padding: '3rem',
});

const emptyStyle = css({
  fontSize: '1.5rem',
  color: '#999',
  textAlign: 'center',
  padding: '3rem',
});
