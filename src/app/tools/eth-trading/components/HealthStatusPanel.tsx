'use client';

import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface HealthStatusPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function HealthStatusPanel({ session }: HealthStatusPanelProps) {
  // eslint-disable-next-line react-hooks/purity -- Date.now() is safe for display purposes
  const now = Date.now();
  const lastUpdateAge = now - session.lastUpdate;
  const sessionUptime = now - session.startedAt;
  
  const lastUpdateMinutes = Math.floor(lastUpdateAge / (60 * 1000));
  const lastUpdateHours = Math.floor(lastUpdateAge / (60 * 60 * 1000));
  const lastUpdateDays = Math.floor(lastUpdateAge / (24 * 60 * 60 * 1000));
  
  const uptimeDays = Math.floor(sessionUptime / (24 * 60 * 60 * 1000));
  const uptimeHours = Math.floor((sessionUptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  
  const formatTimeAgo = () => {
    if (lastUpdateDays > 0) return `${lastUpdateDays}d ${Math.floor((lastUpdateAge % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))}h ago`;
    if (lastUpdateHours > 0) return `${lastUpdateHours}h ${lastUpdateMinutes % 60}m ago`;
    if (lastUpdateMinutes > 0) return `${lastUpdateMinutes}m ago`;
    return 'Just now';
  };

  const getStatusColor = (ageMinutes: number) => {
    if (ageMinutes < 10) return '#3fb950'; // Green - healthy
    if (ageMinutes < 30) return '#eab308'; // Yellow - warning
    return '#f85149'; // Red - critical
  };

  const getStatusText = (ageMinutes: number) => {
    if (ageMinutes < 10) return 'Healthy';
    if (ageMinutes < 30) return 'Warning';
    return 'Critical';
  };

  const dataQuality = session.dataQuality;
  const hasDataIssues = dataQuality && !dataQuality.isValid;
  const hasDataWarnings = dataQuality && dataQuality.warnings.length > 0;

  return (
    <div className={css({
      padding: '24px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        System Health
      </h2>
      
      <div className={stack({ gap: '16px' })}>
        {/* Last Update */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Last Update</span>
          <div className={flex({ gap: '8px', alignItems: 'center' })}>
            <span className={css({ 
              color: getStatusColor(lastUpdateMinutes),
              fontWeight: 'semibold',
            })}>
              {formatTimeAgo()}
            </span>
            <span className={css({
              padding: '2px 6px',
              bg: getStatusColor(lastUpdateMinutes) + '20',
              color: getStatusColor(lastUpdateMinutes),
              borderRadius: '4px',
              fontSize: 'xs',
            })}>
              {getStatusText(lastUpdateMinutes)}
            </span>
          </div>
        </div>

        {/* Session Uptime */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Session Uptime</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {uptimeDays > 0 ? `${uptimeDays}d ` : ''}{uptimeHours}h
          </span>
        </div>

        {/* Data Quality */}
        {dataQuality && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Data Quality</span>
              <span className={css({
                color: hasDataIssues ? '#f85149' : hasDataWarnings ? '#eab308' : '#3fb950',
                fontWeight: 'semibold',
              })}>
                {hasDataIssues ? 'Issues' : hasDataWarnings ? 'Warnings' : 'Good'}
              </span>
            </div>

            {dataQuality.coverage < 100 && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Data Coverage</span>
                <span className={css({ color: '#e6edf3' })}>
                  {dataQuality.coverage.toFixed(1)}%
                </span>
              </div>
            )}

            {dataQuality.gapCount > 0 && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Data Gaps</span>
                <span className={css({ color: '#f85149' })}>
                  {dataQuality.gapCount}
                </span>
              </div>
            )}

            {dataQuality.lastCandleAge > 0 && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Last Candle Age</span>
                <span className={css({ color: '#e6edf3' })}>
                  {Math.floor(dataQuality.lastCandleAge / (60 * 60 * 1000))}h
                </span>
              </div>
            )}
          </>
        )}

        {/* Issues & Warnings */}
        {dataQuality && (hasDataIssues || hasDataWarnings) && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />
            {dataQuality.issues.length > 0 && (
              <div className={stack({ gap: '4px' })}>
                <span className={css({ color: '#f85149', fontSize: 'sm', fontWeight: 'semibold' })}>
                  Issues:
                </span>
                {dataQuality.issues.map((issue, i) => (
                  <span key={i} className={css({ color: '#f85149', fontSize: 'xs' })}>
                    • {issue}
                  </span>
                ))}
              </div>
            )}
            {dataQuality.warnings.length > 0 && (
              <div className={stack({ gap: '4px' })}>
                <span className={css({ color: '#eab308', fontSize: 'sm', fontWeight: 'semibold' })}>
                  Warnings:
                </span>
                {dataQuality.warnings.map((warning, i) => (
                  <span key={i} className={css({ color: '#eab308', fontSize: 'xs' })}>
                    • {warning}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

