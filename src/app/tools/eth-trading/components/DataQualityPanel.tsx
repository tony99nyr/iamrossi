'use client';

import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface DataQualityPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function DataQualityPanel({ session }: DataQualityPanelProps) {
  const dataQuality = session.dataQuality;

  if (!dataQuality) {
    return (
      <div className={css({
        padding: '24px',
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
      })}>
        <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
          Data Quality
        </h2>
        <div className={css({ color: '#7d8590', fontSize: 'sm' })}>
          No data quality report available
        </div>
      </div>
    );
  }

  const getStatusColor = (isValid: boolean, hasWarnings: boolean) => {
    if (!isValid) return '#f85149';
    if (hasWarnings) return '#eab308';
    return '#3fb950';
  };

  const getStatusText = (isValid: boolean, hasWarnings: boolean) => {
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
      padding: '24px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        Data Quality
      </h2>
      
      <div className={stack({ gap: '12px' })}>
        {/* Overall Status */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Status</span>
          <span className={css({
            color: getStatusColor(dataQuality.isValid, dataQuality.warnings.length > 0),
            fontWeight: 'semibold',
          })}>
            {getStatusText(dataQuality.isValid, dataQuality.warnings.length > 0)}
          </span>
        </div>

        {/* Coverage */}
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

        {/* Gaps */}
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

        {/* Last Candle Age */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Last Candle Age</span>
          <span className={css({
            color: dataQuality.lastCandleAge < 24 * 60 * 60 * 1000 ? '#3fb950' : 
                   dataQuality.lastCandleAge < 48 * 60 * 60 * 1000 ? '#eab308' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {formatAge(dataQuality.lastCandleAge)}
          </span>
        </div>

        {/* Missing Candles Count */}
        {dataQuality.missingCandles.length > 0 && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />
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
          </>
        )}

        {/* Issues */}
        {dataQuality.issues.length > 0 && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />
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
          </>
        )}

        {/* Warnings */}
        {dataQuality.warnings.length > 0 && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />
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
          </>
        )}
      </div>
    </div>
  );
}

