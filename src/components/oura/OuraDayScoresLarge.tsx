import { css, cx } from '@styled-system/css';

interface OuraDayScoresLargeProps {
  scores: {
    readinessScore?: number;
    sleepScore?: number;
    activityScore?: number;
  };
}

export default function OuraDayScoresLarge({ scores }: OuraDayScoresLargeProps) {
  const getScoreColor = (score?: number) => {
    if (!score) return '#666';
    if (score >= 85) return '#10b981'; // green
    if (score >= 70) return '#f59e0b'; // orange
    return '#ef4444'; // red
  };

  const getScoreEmoji = (type: 'readiness' | 'sleep' | 'activity') => {
    switch (type) {
      case 'readiness':
        return '⚡';
      case 'sleep':
        return '😴';
      case 'activity':
        return '🏃';
    }
  };

  const scoreItems = [
    { label: 'Ready', value: scores.readinessScore, type: 'readiness' as const },
    { label: 'Sleep', value: scores.sleepScore, type: 'sleep' as const },
    { label: 'Activity', value: scores.activityScore, type: 'activity' as const },
  ].filter(item => item.value !== undefined);

  // If no scores, return null
  if (scoreItems.length === 0) return null;

  // Single score display
  if (scoreItems.length === 1) {
    const item = scoreItems[0];
    const color = getScoreColor(item.value);
    const percentage = item.value ? (item.value / 100) * 157 : 0;

    return (
      <div
        className={cx('oura-score-circle', css({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }))}
      >
        {/* Circular progress */}
        <div className={css({
          position: 'relative',
          width: '56px',
          height: '56px',
        })}>
          <svg
            width="56"
            height="56"
            viewBox="0 0 56 56"
            className={css({
              transform: 'rotate(-90deg)',
            })}
          >
            {/* Background circle */}
            <circle
              cx="28"
              cy="28"
              r="25"
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="4"
            />
            {/* Progress circle */}
            <circle
              cx="28"
              cy="28"
              r="25"
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeDasharray="157"
              strokeDashoffset={157 - percentage}
              strokeLinecap="round"
              className={css({
                transition: 'stroke-dashoffset 0.5s ease',
              })}
            />
          </svg>
          {/* Center content */}
          <div className={css({
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0px',
          })}>
            <span className={css({
              fontSize: '14px',
            })}>
              {getScoreEmoji(item.type)}
            </span>
            <span className={css({
              fontSize: '13px',
              fontWeight: '700',
              color: color,
              lineHeight: '1',
            })}>
              {item.value ?? '—'}
            </span>
          </div>
        </div>
        {/* Label */}
        <div className={css({
          fontSize: '9px',
          color: '#999',
          letterSpacing: '0.5px',
          textAlign: 'center',
        })}>
          {item.label}
        </div>
      </div>
    );
  }

  // Multiple scores display (original layout)
  return (
    <div className={css({
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
    })}>
      {scoreItems.map((item) => {
        const color = getScoreColor(item.value);
        const percentage = item.value ? (item.value / 100) * 157 : 0; // 157 is circumference of circle with r=25
        
        return (
          <div
            key={item.label}
            className={cx('oura-score-circle', css({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }))}
          >
            {/* Circular progress */}
            <div className={css({
              position: 'relative',
              width: '56px',
              height: '56px',
            })}>
              <svg
                width="56"
                height="56"
                viewBox="0 0 56 56"
                className={css({
                  transform: 'rotate(-90deg)',
                })}
              >
                {/* Background circle */}
                <circle
                  cx="28"
                  cy="28"
                  r="25"
                  fill="none"
                  stroke="#2a2a2a"
                  strokeWidth="4"
                />
                {/* Progress circle */}
                <circle
                  cx="28"
                  cy="28"
                  r="25"
                  fill="none"
                  stroke={color}
                  strokeWidth="4"
                  strokeDasharray="157"
                  strokeDashoffset={157 - percentage}
                  strokeLinecap="round"
                  className={css({
                    transition: 'stroke-dashoffset 0.5s ease',
                  })}
                />
              </svg>
              {/* Center content */}
              <div className={css({
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0px',
              })}>
                <span className={css({
                  fontSize: '14px',
                })}>
                  {getScoreEmoji(item.type)}
                </span>
                <span className={css({
                  fontSize: '13px',
                  fontWeight: '700',
                  color: color,
                  lineHeight: '1',
                })}>
                  {item.value ?? '—'}
                </span>
              </div>
            </div>
            {/* Label */}
            <div className={css({
              fontSize: '9px',
              color: '#999',
              letterSpacing: '0.5px',
              textAlign: 'center',
            })}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
