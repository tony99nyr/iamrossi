'use client';

import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { MarketRegimeSignal } from '@/lib/market-regime-detector-cached';

interface RegimeDisplayProps {
  regime: MarketRegimeSignal;
  activeStrategy?: string;
  momentumConfirmed?: boolean;
}

/**
 * Market Regime Display
 * Shows: Current regime, confidence, and underlying indicators
 * Note: Active strategy and momentum are shown in StrategySignalPanel
 */
export default function RegimeDisplay({ regime }: RegimeDisplayProps) {
  const regimeConfig = {
    bullish: { emoji: '🐂', color: '#3fb950', label: 'Bullish', bg: 'rgba(63, 185, 80, 0.1)' },
    bearish: { emoji: '🐻', color: '#f85149', label: 'Bearish', bg: 'rgba(248, 81, 73, 0.1)' },
    neutral: { emoji: '➡️', color: '#7d8590', label: 'Neutral', bg: 'rgba(125, 133, 144, 0.1)' },
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
        {/* Regime Header */}
        <div className={css({ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          padding: '12px',
          bg: config.bg,
          borderRadius: '6px',
          border: `1px solid ${config.color}30`,
        })}>
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

        {/* Indicators */}
        <div className={stack({ gap: '6px' })}>
          <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '2px' })}>
            Underlying Indicators
          </div>
          <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trend</span>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
              <div className={css({
                width: '60px',
                height: '6px',
                bg: '#21262d',
                borderRadius: '3px',
                overflow: 'hidden',
                position: 'relative',
              })}>
                <div 
                  className={css({ 
                    position: 'absolute',
                    height: '100%',
                    bg: regime.indicators.trend >= 0 ? '#3fb950' : '#f85149',
                  })}
                  style={{ 
                    width: `${Math.min(100, Math.abs(regime.indicators.trend) * 500)}%`,
                    left: regime.indicators.trend >= 0 ? '50%' : 'auto',
                    right: regime.indicators.trend < 0 ? '50%' : 'auto',
                  }}
                />
                <div className={css({
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  bg: '#7d8590',
                })} />
              </div>
              <span className={css({ 
                color: regime.indicators.trend >= 0 ? '#3fb950' : '#f85149',
                fontSize: 'xs',
                fontWeight: 'semibold',
                width: '40px',
                textAlign: 'right',
              })}>
                {regime.indicators.trend >= 0 ? '+' : ''}{regime.indicators.trend.toFixed(3)}
              </span>
            </div>
          </div>
          <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Momentum</span>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
              <div className={css({
                width: '60px',
                height: '6px',
                bg: '#21262d',
                borderRadius: '3px',
                overflow: 'hidden',
                position: 'relative',
              })}>
                <div 
                  className={css({ 
                    position: 'absolute',
                    height: '100%',
                    bg: regime.indicators.momentum >= 0 ? '#3fb950' : '#f85149',
                  })}
                  style={{ 
                    width: `${Math.min(100, Math.abs(regime.indicators.momentum) * 500)}%`,
                    left: regime.indicators.momentum >= 0 ? '50%' : 'auto',
                    right: regime.indicators.momentum < 0 ? '50%' : 'auto',
                  }}
                />
                <div className={css({
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  bg: '#7d8590',
                })} />
              </div>
              <span className={css({ 
                color: regime.indicators.momentum >= 0 ? '#3fb950' : '#f85149',
                fontSize: 'xs',
                fontWeight: 'semibold',
                width: '40px',
                textAlign: 'right',
              })}>
                {regime.indicators.momentum >= 0 ? '+' : ''}{regime.indicators.momentum.toFixed(3)}
              </span>
            </div>
          </div>
          <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Volatility</span>
            <span className={css({ color: '#e6edf3', fontSize: 'xs', fontWeight: 'semibold' })}>
              {(regime.indicators.volatility * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}







