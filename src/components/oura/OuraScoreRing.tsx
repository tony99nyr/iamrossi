'use client';

import { css } from '@styled-system/css';

interface OuraScoreRingProps {
  score?: number;
  label: string;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Circular Oura score display matching the Oura app design
 * Shows score 0-100 in a circular ring with color coding
 */
export default function OuraScoreRing({ score, label, size = 'medium' }: OuraScoreRingProps) {
  // Size configurations
  const sizes = {
    small: { diameter: 60, strokeWidth: 6, fontSize: '16px', labelSize: '10px' },
    medium: { diameter: 80, strokeWidth: 8, fontSize: '20px', labelSize: '11px' },
    large: { diameter: 100, strokeWidth: 10, fontSize: '24px', labelSize: '12px' },
  };

  const config = sizes[size];
  const radius = (config.diameter - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = config.diameter / 2;

  // Calculate stroke dash offset for progress
  const progress = score !== undefined ? score / 100 : 0;
  const strokeDashoffset = circumference * (1 - progress);

  // Color based on score ranges (matching Oura's color scheme)
  const getColor = (score?: number): string => {
    if (score === undefined) return '#4a4a4a'; // Gray for no data
    if (score >= 85) return '#6fd56f'; // Green - optimal
    if (score >= 70) return '#ffd966'; // Yellow - good
    if (score >= 60) return '#ff9f66'; // Orange - fair
    return '#ff6b6b'; // Red - pay attention
  };

  const color = getColor(score);

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      })}
    >
      {/* Circular ring */}
      <div className={css({ position: 'relative' })}>
        <svg
          width={config.diameter}
          height={config.diameter}
          className={css({ transform: 'rotate(-90deg)' })}
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth={config.strokeWidth}
          />
          
          {/* Progress circle */}
          {score !== undefined && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={config.strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className={css({
                transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
              })}
            />
          )}
        </svg>

        {/* Score text in center */}
        <div
          className={css({
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: config.fontSize,
            fontWeight: '600',
            color: score !== undefined ? color : '#666',
          })}
        >
          {score !== undefined ? score : '—'}
        </div>
      </div>

      {/* Label */}
      <div
        className={css({
          fontSize: config.labelSize,
          fontWeight: '500',
          color: '#999',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        })}
      >
        {label}
      </div>
    </div>
  );
}
