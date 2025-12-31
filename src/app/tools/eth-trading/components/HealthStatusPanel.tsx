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

  const getDataQualityStatusColor = (isValid: boolean, hasWarnings: boolean) => {
    if (!isValid) return '#f85149';
    if (hasWarnings) return '#eab308';
    return '#3fb950';
  };

  const getDataQualityStatusText = (isValid: boolean, hasWarnings: boolean) => {
    if (!isValid) return 'Issues Detected';
    if (hasWarnings) return 'Warnings';
    return 'Good';
  };

  const formatAge = (ageMs: number) => {
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    const minutes = Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        System Health & Data Quality
      </h2>
      
      <div className={stack({ gap: '8px' })}>
        {/* System Status */}
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

        {/* Data Quality Section */}
        {dataQuality && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Data Quality</span>
              <span className={css({
                color: getDataQualityStatusColor(dataQuality.isValid, hasDataWarnings || false),
                fontWeight: 'semibold',
              })}>
                {getDataQualityStatusText(dataQuality.isValid, hasDataWarnings || false)}
              </span>
            </div>

            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Data Coverage</span>
              <span className={css({
                color: dataQuality.coverage >= 95 ? '#3fb950' : dataQuality.coverage >= 90 ? '#eab308' : '#f85149',
                fontWeight: 'semibold',
              })}>
                {dataQuality.coverage.toFixed(1)}%
              </span>
            </div>

            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Data Gaps</span>
              <span className={css({
                color: dataQuality.gapCount === 0 ? '#3fb950' : '#f85149',
                fontWeight: 'semibold',
              })}>
                {dataQuality.gapCount}
              </span>
            </div>

            {dataQuality.lastCandleAge > 0 && (
              <>
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>
                    Last Candle Age ({session.config.bullishStrategy.timeframe || '8h'})
                  </span>
                  <span className={css({
                    color: dataQuality.lastCandleAge < 24 * 60 * 60 * 1000 ? '#3fb950' : 
                           dataQuality.lastCandleAge < 48 * 60 * 60 * 1000 ? '#eab308' : '#f85149',
                    fontWeight: 'semibold',
                  })}>
                    {formatAge(dataQuality.lastCandleAge)}
                  </span>
                </div>
                
                {/* Calculate 5m candle age from portfolioHistory */}
                {(() => {
                  if (!session.portfolioHistory || session.portfolioHistory.length === 0) return null;
                  
                  // Find the most recent 5m candle (has timestamp that's not at start of day)
                  const recent5mCandles = session.portfolioHistory
                    .filter(snapshot => {
                      const snapshotDate = new Date(snapshot.timestamp);
                      const dayStart = new Date(snapshotDate);
                      dayStart.setUTCHours(0, 0, 0, 0);
                      // 5m candles have timestamps that are NOT at start of day (have minutes/seconds)
                      return snapshot.timestamp !== dayStart.getTime();
                    })
                    .sort((a, b) => b.timestamp - a.timestamp);
                  
                  if (recent5mCandles.length > 0) {
                    const last5mCandle = recent5mCandles[0]!;
                    const last5mAge = Math.max(0, now - last5mCandle.timestamp); // Ensure non-negative
                    const fiveMinuteInterval = 5 * 60 * 1000; // 5 minutes
                    const max5mAge = 10 * 60 * 1000; // 10 minutes (2 intervals)
                    
                    // Only show if age is reasonable (not too old, not negative)
                    if (last5mAge <= max5mAge * 2) {
                      return (
                        <div className={css({
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        })}>
                          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Last Candle Age (5m)</span>
                          <span className={css({
                            color: last5mAge < fiveMinuteInterval ? '#3fb950' : 
                                   last5mAge < max5mAge ? '#eab308' : '#f85149',
                            fontWeight: 'semibold',
                          })}>
                            {formatAge(last5mAge)}
                          </span>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </>
            )}

            {dataQuality.missingCandles.length > 0 && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Missing Candles</span>
                <span className={css({ color: '#f85149', fontWeight: 'semibold' })}>
                  {dataQuality.missingCandles.length}
                </span>
              </div>
            )}

            {/* Issues & Warnings */}
            {(hasDataIssues || hasDataWarnings) && (
              <>
                <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
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
          </>
        )}

        {!dataQuality && (
          <div className={css({ color: '#7d8590', fontSize: 'sm', fontStyle: 'italic' })}>
            No data quality report available
          </div>
        )}
      </div>
    </div>
  );
}
