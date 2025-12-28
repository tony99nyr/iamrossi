'use client';

import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface StrategyIndicatorsProps {
  session: EnhancedPaperTradingSession;
}

export default function StrategyIndicators({ session }: StrategyIndicatorsProps) {
  const { lastSignal, currentIndicators } = session;
  const signalStrength = lastSignal.signal;
  const signalAction = lastSignal.action;
  const signalConfidence = lastSignal.confidence;
  const positionMultiplier = lastSignal.positionSizeMultiplier || 1.0;

  // Extract MACD and RSI from indicators if available
  const getIndicatorValue = (key: string): number | null => {
    // Try to find indicator by key pattern
    for (const [indicatorKey, value] of Object.entries(lastSignal.indicators)) {
      if (indicatorKey.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    return null;
  };

  const macdSignal = getIndicatorValue('macd');
  const rsiSignal = getIndicatorValue('rsi');
  
  // Calculate RSI value from currentIndicators if available
  const rsiValue = currentIndicators['rsi'] || null;
  const macdValue = currentIndicators['macd'] || null;

  const getSignalColor = (value: number): string => {
    if (value > 0.5) return '#3fb950'; // Strong buy
    if (value > 0) return '#7d8590'; // Weak buy
    if (value > -0.5) return '#7d8590'; // Weak sell
    return '#f85149'; // Strong sell
  };

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'buy': return '#3fb950';
      case 'sell': return '#f85149';
      default: return '#7d8590';
    }
  };

  const formatSignalStrength = (strength: number): string => {
    const percent = Math.abs(strength * 100);
    const sign = strength >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(1)}%`;
  };

  return (
    <div className={css({
      padding: { base: '16px', md: '24px' },
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ 
        fontSize: { base: 'md', md: 'lg' }, 
        fontWeight: 'semibold', 
        marginBottom: { base: '12px', md: '16px' }, 
        color: '#e6edf3' 
      })}>
        Trading Signal
      </h2>
      
      <div className={stack({ gap: '16px' })}>
        {/* Signal Strength and Action */}
        <div className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        })}>
          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Signal Strength</span>
            <span className={css({ 
              color: getSignalColor(signalStrength),
              fontWeight: 'bold',
              fontSize: 'lg',
            })}>
              {formatSignalStrength(signalStrength)}
            </span>
          </div>
          
          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Action</span>
            <span className={css({
              padding: '2px 8px',
              bg: signalAction === 'buy' ? 'rgba(63, 185, 80, 0.1)' : 
                   signalAction === 'sell' ? 'rgba(248, 81, 73, 0.1)' : 
                   'rgba(125, 133, 144, 0.1)',
              color: getActionColor(signalAction),
              borderRadius: '4px',
              fontSize: 'sm',
              fontWeight: 'semibold',
              textTransform: 'uppercase',
            })}>
              {signalAction}
            </span>
          </div>

          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Confidence</span>
            <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
              {Math.round(signalConfidence * 100)}%
            </span>
          </div>

          {positionMultiplier !== 1.0 && (
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px solid #30363d',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Position Multiplier</span>
              <span className={css({ 
                color: positionMultiplier > 1 ? '#3fb950' : '#7d8590',
                fontWeight: 'semibold',
              })}>
                {positionMultiplier.toFixed(2)}x
              </span>
            </div>
          )}
        </div>

        {/* Technical Indicators */}
        <div className={css({
          paddingTop: '12px',
          borderTop: '1px solid #30363d',
        })}>
          <div className={css({ 
            fontSize: 'sm', 
            fontWeight: 'semibold', 
            marginBottom: '8px', 
            color: '#e6edf3' 
          })}>
            Technical Indicators
          </div>
          
          <div className={stack({ gap: '8px' })}>
            {/* RSI */}
            {rsiValue !== null && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>RSI (14)</span>
                <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                  <span className={css({ 
                    color: rsiValue > 70 ? '#f85149' : rsiValue < 30 ? '#3fb950' : '#e6edf3',
                    fontWeight: 'semibold',
                  })}>
                    {rsiValue.toFixed(1)}
                  </span>
                  {rsiSignal !== null && (
                    <span className={css({
                      fontSize: 'xs',
                      color: getSignalColor(rsiSignal),
                      opacity: 0.7,
                    })}>
                      ({formatSignalStrength(rsiSignal)})
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* MACD */}
            {macdValue !== null && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>MACD</span>
                <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                  <span className={css({ 
                    color: macdValue > 0 ? '#3fb950' : '#f85149',
                    fontWeight: 'semibold',
                  })}>
                    {macdValue > 0 ? '+' : ''}{macdValue.toFixed(4)}
                  </span>
                  {macdSignal !== null && (
                    <span className={css({
                      fontSize: 'xs',
                      color: getSignalColor(macdSignal),
                      opacity: 0.7,
                    })}>
                      ({formatSignalStrength(macdSignal)})
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Individual Indicator Signals */}
            {Object.entries(lastSignal.indicators).length > 0 && (
              <div className={css({
                paddingTop: '8px',
                borderTop: '1px solid #30363d',
                marginTop: '4px',
              })}>
                <div className={css({ 
                  fontSize: 'xs', 
                  color: '#7d8590', 
                  marginBottom: '6px' 
                })}>
                  Indicator Signals
                </div>
                <div className={stack({ gap: '4px' })}>
                  {Object.entries(lastSignal.indicators)
                    .filter(([key]) => !key.toLowerCase().includes('macd') && !key.toLowerCase().includes('rsi'))
                    .slice(0, 3) // Show first 3 non-MACD/RSI indicators
                    .map(([key, value]) => {
                      const displayKey = key
                        .replace(/[{}"]/g, '')
                        .replace(/:/g, ' ')
                        .replace(/_/g, ' ')
                        .substring(0, 20);
                      return (
                        <div
                          key={key}
                          className={css({
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 'xs',
                          })}
                        >
                          <span className={css({ color: '#7d8590' })}>{displayKey}</span>
                          <span className={css({ 
                            color: getSignalColor(value),
                            fontWeight: 'medium',
                          })}>
                            {formatSignalStrength(value)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

