'use client';

import { css } from '@styled-system/css';

interface OuraScoreCompactProps {
  scores: {
    readinessScore?: number;
    sleepScore?: number;
    activityScore?: number;
  };
}

export default function OuraScoreCompact({ scores }: OuraScoreCompactProps) {
  const getScoreColor = (score?: number) => {
    if (!score) return '#666';
    if (score >= 85) return '#10b981'; // green
    if (score >= 70) return '#f59e0b'; // orange
    return '#ef4444'; // red
  };

  const scoreItems = [
    { label: 'Ready', value: scores.readinessScore },
    { label: 'Sleep', value: scores.sleepScore },
    { label: 'Activity', value: scores.activityScore },
  ];

  return (
    <div className={css({
      display: 'flex',
      gap: '12px',
      fontSize: '11px',
      alignItems: 'center',
    })}>
      {scoreItems.map((item) => (
        <div
          key={item.label}
          className={css({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          })}
        >
          <div className={css({
            fontSize: '13px',
            fontWeight: '600',
            color: getScoreColor(item.value),
          })}>
            {item.value ?? '—'}
          </div>
          <div className={css({
            fontSize: '9px',
            color: '#999',
            letterSpacing: '0.5px',
          })}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
