'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface StrategySignalPanelProps {
  session: EnhancedPaperTradingSession;
}

/**
 * Consolidated Strategy & Signal Panel
 * Combines: StrategyIndicators + StrategyExecutionPanel
 * Shows: Current signal, strategy, trade readiness, and next action
 */
export default function StrategySignalPanel({ session }: StrategySignalPanelProps) {
  const { currentRegime, lastSignal, regimeHistory, config, portfolio } = session;

  const execution = useMemo(() => {
    const recentRegimes = regimeHistory?.slice(-5) || [];
    const requiredPeriods = config.regimePersistencePeriods || 2;
    
    // Regime progression
    const trend = currentRegime.indicators.trend;
    const momentum = currentRegime.indicators.momentum;
    const combinedSignal = (trend * 0.5 + momentum * 0.5);
    
    const bullishThreshold = 0.05;
    const bearishThreshold = -0.05;
    const minSignal = -0.1;
    const maxSignal = 0.1;
    
    let progressToBullish = 0;
    let progressToBearish = 0;
    
    if (currentRegime.regime === 'neutral') {
      progressToBullish = Math.max(0, Math.min(100, ((combinedSignal - minSignal) / (bullishThreshold - minSignal)) * 100));
      progressToBearish = Math.max(0, Math.min(100, ((maxSignal - combinedSignal) / (maxSignal - bearishThreshold)) * 100));
    } else if (currentRegime.regime === 'bullish') {
      progressToBullish = 100;
      progressToBearish = Math.max(0, Math.min(100, ((maxSignal - combinedSignal) / (maxSignal - bearishThreshold)) * 100));
    } else {
      progressToBearish = 100;
      progressToBullish = Math.max(0, Math.min(100, ((combinedSignal - minSignal) / (bullishThreshold - minSignal)) * 100));
    }
    
    // Persistence check
    const bullishCount = recentRegimes.filter(r => r.regime === 'bullish').length;
    const bearishCount = recentRegimes.filter(r => r.regime === 'bearish').length;
    const bullishPersistenceMet = bullishCount >= requiredPeriods;
    const bearishPersistenceMet = bearishCount >= requiredPeriods;
    
    // Trade conditions
    const buyConditions = {
      regimeBullish: currentRegime.regime === 'bullish',
      momentumConfirmed: lastSignal.momentumConfirmed,
      persistenceMet: bullishPersistenceMet,
      signalPositive: lastSignal.signal > 0,
      hasBalance: portfolio.usdcBalance > 0,
    };
    
    const sellConditions = {
      regimeBearish: currentRegime.regime === 'bearish',
      persistenceMet: bearishPersistenceMet,
      signalNegative: lastSignal.signal < 0,
      hasBalance: portfolio.ethBalance > 0,
    };
    
    const buyReady = Object.values(buyConditions).every(v => v);
    const sellReady = Object.values(sellConditions).every(v => v);
    const buyProgress = (Object.values(buyConditions).filter(v => v).length / Object.keys(buyConditions).length) * 100;
    const sellProgress = (Object.values(sellConditions).filter(v => v).length / Object.keys(sellConditions).length) * 100;

    return {
      progressToBullish,
      progressToBearish,
      bullishCount,
      bearishCount,
      requiredPeriods,
      buyConditions,
      sellConditions,
      buyReady,
      sellReady,
      buyProgress,
      sellProgress,
    };
  }, [currentRegime, lastSignal, regimeHistory, config, portfolio]);

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'buy': return '#3fb950';
      case 'sell': return '#f85149';
      default: return '#7d8590';
    }
  };

  const getSignalColor = (value: number): string => {
    if (value > 0.5) return '#3fb950';
    if (value > 0) return '#7d8590';
    if (value > -0.5) return '#7d8590';
    return '#f85149';
  };

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Strategy & Signal
      </h2>
      
      <div className={stack({ gap: '10px' })}>
        {/* Current Signal */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Signal</span>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
            <span className={css({ 
              color: getSignalColor(lastSignal.signal),
              fontWeight: 'bold',
              fontSize: 'lg',
            })}>
              {lastSignal.signal >= 0 ? '+' : ''}{(lastSignal.signal * 100).toFixed(1)}%
            </span>
            <span className={css({
              padding: '2px 8px',
              bg: lastSignal.action === 'buy' ? 'rgba(63, 185, 80, 0.1)' : 
                   lastSignal.action === 'sell' ? 'rgba(248, 81, 73, 0.1)' : 
                   'rgba(125, 133, 144, 0.1)',
              color: getActionColor(lastSignal.action),
              borderRadius: '4px',
              fontSize: 'xs',
              fontWeight: 'semibold',
              textTransform: 'uppercase',
            })}>
              {lastSignal.action}
            </span>
          </div>
        </div>

        {/* Active Strategy */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Strategy</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold', fontSize: 'sm' })}>
            {lastSignal.activeStrategy?.name || 'None'}
          </span>
        </div>

        {/* Confidence & Momentum */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Confidence</span>
          <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>
            {Math.round(lastSignal.confidence * 100)}%
          </span>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Momentum</span>
          <span className={css({
            color: lastSignal.momentumConfirmed ? '#3fb950' : '#7d8590',
            fontSize: 'sm',
          })}>
            {lastSignal.momentumConfirmed ? '✓ Confirmed' : '○ Waiting'}
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Regime Progress Bars */}
        <div>
          <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '6px' })}>
            Distance to Regime Change
          </div>
          
          <div className={css({ marginBottom: '4px' })}>
            <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' })}>
              <span className={css({ color: '#7d8590', fontSize: 'xs' })}>→ Bullish</span>
              <span className={css({ color: '#3fb950', fontSize: 'xs' })}>{execution.progressToBullish.toFixed(0)}%</span>
            </div>
            <div className={css({ height: '4px', bg: '#21262d', borderRadius: '2px', overflow: 'hidden' })}>
              <div 
                className={css({ height: '100%', bg: '#3fb950', transition: 'width 0.3s ease' })}
                style={{ width: `${Math.min(100, execution.progressToBullish)}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' })}>
              <span className={css({ color: '#7d8590', fontSize: 'xs' })}>→ Bearish</span>
              <span className={css({ color: '#f85149', fontSize: 'xs' })}>{execution.progressToBearish.toFixed(0)}%</span>
            </div>
            <div className={css({ height: '4px', bg: '#21262d', borderRadius: '2px', overflow: 'hidden' })}>
              <div 
                className={css({ height: '100%', bg: '#f85149', transition: 'width 0.3s ease' })}
                style={{ width: `${Math.min(100, execution.progressToBearish)}%` }}
              />
            </div>
          </div>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Trade Readiness */}
        <div className={css({ display: 'flex', gap: '12px' })}>
          {/* BUY Conditions */}
          <div className={css({ flex: 1 })}>
            <div className={css({ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '4px',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#3fb950', fontSize: 'xs', fontWeight: 'semibold' })}>BUY</span>
              <span className={css({
                color: execution.buyReady ? '#3fb950' : '#7d8590',
                fontSize: 'xs',
              })}>
                {execution.buyReady ? '✓ Ready' : `${execution.buyProgress.toFixed(0)}%`}
              </span>
            </div>
            <div className={stack({ gap: '1px', fontSize: 'xs' })}>
              <span className={css({ color: execution.buyConditions.regimeBullish ? '#3fb950' : '#7d8590' })}>
                {execution.buyConditions.regimeBullish ? '✓' : '○'} Bullish regime
              </span>
              <span className={css({ color: execution.buyConditions.momentumConfirmed ? '#3fb950' : '#7d8590' })}>
                {execution.buyConditions.momentumConfirmed ? '✓' : '○'} Momentum
              </span>
              <span className={css({ color: execution.buyConditions.persistenceMet ? '#3fb950' : '#7d8590' })}>
                {execution.buyConditions.persistenceMet ? '✓' : '○'} Persist {execution.bullishCount}/5
              </span>
            </div>
          </div>

          {/* SELL Conditions */}
          <div className={css({ flex: 1 })}>
            <div className={css({ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '4px',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#f85149', fontSize: 'xs', fontWeight: 'semibold' })}>SELL</span>
              <span className={css({
                color: execution.sellReady ? '#f85149' : '#7d8590',
                fontSize: 'xs',
              })}>
                {execution.sellReady ? '✓ Ready' : `${execution.sellProgress.toFixed(0)}%`}
              </span>
            </div>
            <div className={stack({ gap: '1px', fontSize: 'xs' })}>
              <span className={css({ color: execution.sellConditions.regimeBearish ? '#f85149' : '#7d8590' })}>
                {execution.sellConditions.regimeBearish ? '✓' : '○'} Bearish regime
              </span>
              <span className={css({ color: execution.sellConditions.persistenceMet ? '#f85149' : '#7d8590' })}>
                {execution.sellConditions.persistenceMet ? '✓' : '○'} Persist {execution.bearishCount}/5
              </span>
            </div>
          </div>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Next Action */}
        <div className={css({
          padding: '8px',
          bg: execution.buyReady ? 'rgba(63, 185, 80, 0.1)' : 
               execution.sellReady ? 'rgba(248, 81, 73, 0.1)' : 
               'rgba(125, 133, 144, 0.05)',
          borderRadius: '4px',
          border: execution.buyReady ? '1px solid rgba(63, 185, 80, 0.2)' : 
                  execution.sellReady ? '1px solid rgba(248, 81, 73, 0.2)' : 
                  '1px solid rgba(125, 133, 144, 0.1)',
        })}>
          <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '2px' })}>Next Action</div>
          <div className={css({ 
            fontSize: 'sm', 
            fontWeight: 'semibold',
            color: execution.buyReady ? '#3fb950' : execution.sellReady ? '#f85149' : '#7d8590',
          })}>
            {execution.buyReady ? '→ BUY on next update' : 
             execution.sellReady ? '→ SELL on next update' : 
             `→ HOLD (${execution.buyProgress > execution.sellProgress ? 'buy' : 'sell'} ${Math.max(execution.buyProgress, execution.sellProgress).toFixed(0)}% ready)`}
          </div>
        </div>
      </div>
    </div>
  );
}

