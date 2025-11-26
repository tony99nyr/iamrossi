'use client';

import { useEffect, useRef, useState } from 'react';
import { css } from '@styled-system/css';

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

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  useEffect(() => {
    if (highlightRank && leaderboard.length > 0 && scrollContainerRef.current) {
      // Wait a bit for render, then start scroll animation
      setTimeout(() => {
        scrollToHighlight();
      }, 500);
    }
  }, [highlightRank, leaderboard]);

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

  const scrollToHighlight = () => {
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
  };

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
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '90%',
  maxWidth: '600px',
  height: '80vh',
  maxHeight: '700px',
  backgroundColor: 'rgba(0, 0, 0, 0.95)',
  border: '4px solid #FFD700',
  borderRadius: '16px',
  overflow: 'hidden',
  zIndex: 200,
  boxShadow: '0 0 40px rgba(255, 215, 0, 0.5)',
});

const headerStyle = css({
  fontSize: '2.5rem',
  fontWeight: 'bold',
  color: '#FFD700',
  textAlign: 'center',
  padding: '1.5rem',
  backgroundColor: 'rgba(255, 215, 0, 0.1)',
  borderBottom: '2px solid #FFD700',
  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
});

const listStyle = css({
  padding: '1rem',
  overflowY: 'auto',
  height: 'calc(100% - 100px)',
  '&::-webkit-scrollbar': {
    width: '10px',
  },
  '&::-webkit-scrollbar-track': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#FFD700',
    borderRadius: '5px',
  },
});

const entryStyle = css({
  display: 'flex',
  alignItems: 'center',
  padding: '1rem',
  marginBottom: '0.5rem',
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
  padding: '1rem',
  marginBottom: '0.5rem',
  backgroundColor: 'rgba(255, 215, 0, 0.3)',
  borderRadius: '8px',
  border: '2px solid #FFD700',
  animation: 'pulse 2s ease-in-out infinite',
  '@keyframes pulse': {
    '0%, 100%': {
      boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
    },
    '50%': {
      boxShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
    },
  },
});

const rankStyle = css({
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#FFD700',
  minWidth: '60px',
  textAlign: 'center',
});

const nameStyle = css({
  fontSize: '1.5rem',
  fontWeight: '600',
  color: '#fff',
  flex: 1,
  paddingLeft: '1rem',
});

const scoreValueStyle = css({
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#4CAF50',
  minWidth: '120px',
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
