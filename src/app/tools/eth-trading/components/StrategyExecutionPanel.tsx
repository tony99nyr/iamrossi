'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface StrategyExecutionPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function StrategyExecutionPanel({ session }: StrategyExecutionPanelProps) {
  const { currentRegime, lastSignal, regimeHistory, strategySwitches } = session;

  const executionMetrics = useMemo(() => {
    // Calculate regime persistence status
    const recentRegimes = regimeHistory?.slice(-5) || [];
    const currentRegimeCount = recentRegimes.filter(r => r.regime === currentRegime.regime).length;
    const regimePersistenceStatus = `${currentRegimeCount}/5 periods`;

    // Count strategy switches in last 24h and 7d
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in useMemo
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const switches24h = strategySwitches?.filter(s => s.timestamp >= oneDayAgo).length || 0;
    const switches7d = strategySwitches?.filter(s => s.timestamp >= sevenDaysAgo).length || 0;

    // Calculate time in each regime
    const regimeTime: Record<string, number> = {};
    if (regimeHistory && regimeHistory.length > 1) {
      for (let i = 1; i < regimeHistory.length; i++) {
        const prev = regimeHistory[i - 1]!;
        const curr = regimeHistory[i]!;
        const duration = curr.timestamp - prev.timestamp;
        regimeTime[prev.regime] = (regimeTime[prev.regime] || 0) + duration;
      }
      // Add current regime duration
      const lastRegime = regimeHistory[regimeHistory.length - 1]!;
      const currentDuration = now - lastRegime.timestamp;
      regimeTime[lastRegime.regime] = (regimeTime[lastRegime.regime] || 0) + currentDuration;
    }

    return {
      regimePersistenceStatus,
      switches24h,
      switches7d,
      regimeTime,
    };
  }, [currentRegime, regimeHistory, strategySwitches]);

  return (
    <div className={css({
      padding: '24px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        Strategy Execution
      </h2>
      
      <div className={stack({ gap: '12px' })}>
        {/* Current Strategy */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Active Strategy</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {lastSignal.activeStrategy?.name || 'None'}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Signal Action</span>
          <span className={css({
            padding: '2px 8px',
            bg: lastSignal.action === 'buy' ? 'rgba(63, 185, 80, 0.1)' : 
                 lastSignal.action === 'sell' ? 'rgba(248, 81, 73, 0.1)' : 
                 'rgba(125, 133, 144, 0.1)',
            color: lastSignal.action === 'buy' ? '#3fb950' : 
                   lastSignal.action === 'sell' ? '#f85149' : '#7d8590',
            borderRadius: '4px',
            fontSize: 'sm',
            fontWeight: 'semibold',
            textTransform: 'uppercase',
          })}>
            {lastSignal.action}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Signal Strength</span>
          <span className={css({
            color: lastSignal.signal > 0.5 ? '#3fb950' : lastSignal.signal > 0 ? '#7d8590' : 
                   lastSignal.signal < -0.5 ? '#f85149' : '#7d8590',
            fontWeight: 'semibold',
          })}>
            {lastSignal.signal >= 0 ? '+' : ''}{(lastSignal.signal * 100).toFixed(1)}%
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />

        {/* Regime Info */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Regime Persistence</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {executionMetrics.regimePersistenceStatus}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Momentum Confirmed</span>
          <span className={css({
            color: lastSignal.momentumConfirmed ? '#3fb950' : '#7d8590',
            fontWeight: 'semibold',
          })}>
            {lastSignal.momentumConfirmed ? 'Yes' : 'No'}
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />

        {/* Strategy Switches */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Switches (24h)</span>
          <span className={css({
            color: executionMetrics.switches24h > 5 ? '#f85149' : executionMetrics.switches24h > 2 ? '#eab308' : '#3fb950',
            fontWeight: 'semibold',
          })}>
            {executionMetrics.switches24h}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Switches (7d)</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {executionMetrics.switches7d}
          </span>
        </div>

        {/* Regime Time Distribution */}
        {Object.keys(executionMetrics.regimeTime).length > 0 && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />
            <div className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
              Time in Regime
            </div>
            {Object.entries(executionMetrics.regimeTime).map(([regime, duration]) => {
              const hours = Math.floor(duration / (60 * 60 * 1000));
              const days = Math.floor(hours / 24);
              const displayHours = hours % 24;
              return (
                <div key={regime} className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm', textTransform: 'capitalize' })}>
                    {regime}
                  </span>
                  <span className={css({ color: '#e6edf3' })}>
                    {days > 0 ? `${days}d ` : ''}{displayHours}h
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

