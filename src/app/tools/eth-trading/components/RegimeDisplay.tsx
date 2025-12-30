'use client';

import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { MarketRegimeSignal } from '@/lib/market-regime-detector-cached';

interface RegimeDisplayProps {
  regime: MarketRegimeSignal;
  activeStrategy?: string;
  momentumConfirmed?: boolean;
}

export default function RegimeDisplay({ regime, activeStrategy, momentumConfirmed }: RegimeDisplayProps) {
  const regimeConfig = {
    bullish: { emoji: '🐂', color: '#3fb950', label: 'Bullish' },
    bearish: { emoji: '🐻', color: '#f85149', label: 'Bearish' },
    neutral: { emoji: '➡️', color: '#7d8590', label: 'Neutral' },
  };

  const config = regimeConfig[regime.regime];
  const confidencePercent = Math.round(regime.confidence * 100);

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Market Regime
      </h2>
      <div className={stack({ gap: '10px' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '12px' })}>
          <span className={css({ fontSize: '2xl' })}>{config.emoji}</span>
          <div>
            <div className={css({ fontSize: 'xl', fontWeight: 'bold', color: config.color })}>
              {config.label}
            </div>
            <div className={css({ fontSize: 'sm', color: '#7d8590' })}>
              {confidencePercent}% confidence
            </div>
          </div>
        </div>

        {activeStrategy && (
          <div className={css({ paddingTop: '12px', borderTop: '1px solid #30363d' })}>
            <div className={css({ fontSize: 'sm', color: '#7d8590', marginBottom: '4px' })}>Active Strategy</div>
            <div className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>{activeStrategy}</div>
            {momentumConfirmed !== undefined && (
              <div className={css({ fontSize: 'xs', color: momentumConfirmed ? '#3fb950' : '#7d8590', marginTop: '4px' })}>
                {momentumConfirmed ? '✓ Momentum Confirmed' : '⏳ Waiting for Momentum'}
              </div>
            )}
          </div>
        )}

        <div className={css({ paddingTop: '12px', borderTop: '1px solid #30363d' })}>
          <div className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '8px', color: '#e6edf3' })}>
            Indicators
          </div>
          <div className={stack({ gap: '8px' })}>
            <div className={css({ display: 'flex', justifyContent: 'space-between' })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trend</span>
              <span className={css({ color: regime.indicators.trend >= 0 ? '#3fb950' : '#f85149' })}>
                {regime.indicators.trend >= 0 ? '+' : ''}{regime.indicators.trend.toFixed(2)}
              </span>
            </div>
            <div className={css({ display: 'flex', justifyContent: 'space-between' })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Momentum</span>
              <span className={css({ color: regime.indicators.momentum >= 0 ? '#3fb950' : '#f85149' })}>
                {regime.indicators.momentum >= 0 ? '+' : ''}{regime.indicators.momentum.toFixed(2)}
              </span>
            </div>
            <div className={css({ display: 'flex', justifyContent: 'space-between' })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Volatility</span>
              <span className={css({ color: '#e6edf3' })}>
                {regime.indicators.volatility.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

