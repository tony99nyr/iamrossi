'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface StrategyExecutionPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function StrategyExecutionPanel({ session }: StrategyExecutionPanelProps) {
  const { currentRegime, lastSignal, regimeHistory, config, portfolio } = session;

  const executionMetrics = useMemo(() => {
    // Calculate regime persistence status
    const recentRegimes = regimeHistory?.slice(-5) || [];
    const currentRegimeCount = recentRegimes.filter(r => r.regime === currentRegime.regime).length;
    const requiredPeriods = config.regimePersistencePeriods || 2;
    const persistenceProgress = requiredPeriods > 0 ? Math.min(100, (currentRegimeCount / requiredPeriods) * 100) : 0;
    const regimePersistenceStatus = `${currentRegimeCount}/5 periods (need ${requiredPeriods}, ${persistenceProgress.toFixed(0)}%)`;

    // Count strategy switches in last 24h and 7d
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in useMemo
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const switches24h = session.strategySwitches?.filter(s => s.timestamp >= oneDayAgo).length || 0;
    const switches7d = session.strategySwitches?.filter(s => s.timestamp >= sevenDaysAgo).length || 0;

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

    // Calculate combined signal (same as regime detection)
    const trend = currentRegime.indicators.trend;
    const momentum = currentRegime.indicators.momentum;
    const combinedSignal = (trend * 0.5 + momentum * 0.5);
    
    // Calculate signal strength
    const signalStrength = (Math.abs(trend) + Math.abs(momentum)) / 2;
    
    // Thresholds
    const bullishThreshold = 0.05;
    const bearishThreshold = -0.05;
    const minStrength = 0.1;
    
    // Calculate distance to regime thresholds
    const minSignal = -0.1;
    const maxSignal = 0.1;
    
    let progressToBullish = 0;
    let progressToBearish = 0;
    
    if (currentRegime.regime === 'neutral') {
      if (combinedSignal <= bullishThreshold) {
        progressToBullish = Math.max(0, Math.min(100, ((combinedSignal - minSignal) / (bullishThreshold - minSignal)) * 100));
      } else {
        progressToBullish = 100;
      }
      
      if (combinedSignal >= bearishThreshold) {
        progressToBearish = Math.max(0, Math.min(100, ((maxSignal - combinedSignal) / (maxSignal - bearishThreshold)) * 100));
      } else {
        progressToBearish = 100;
      }
    } else if (currentRegime.regime === 'bullish') {
      progressToBullish = 100;
      // Calculate how far along the path from maxSignal (0.1) to bearishThreshold (-0.05) we are
      // If combinedSignal is close to maxSignal, progress is low (far from bearish)
      // If combinedSignal is close to bearishThreshold, progress is high (close to bearish)
      progressToBearish = Math.max(0, Math.min(100, ((maxSignal - combinedSignal) / (maxSignal - bearishThreshold)) * 100));
    } else {
      progressToBearish = 100;
      progressToBullish = Math.max(0, Math.min(100, ((combinedSignal - minSignal) / (bullishThreshold - minSignal)) * 100));
    }
    
    const strengthMet = signalStrength > minStrength;
    const strengthProgress = Math.min(100, (signalStrength / minStrength) * 100);
    
    // For bullish: need N out of 5 periods to be bullish
    const bullishCount = recentRegimes.filter(r => r.regime === 'bullish').length;
    const bullishPersistenceMet = bullishCount >= requiredPeriods;
    const bullishPersistenceProgress = (bullishCount / requiredPeriods) * 100;
    
    // For bearish: need N out of 5 periods to be bearish
    const bearishCount = recentRegimes.filter(r => r.regime === 'bearish').length;
    const bearishPersistenceMet = bearishCount >= requiredPeriods;
    const bearishPersistenceProgress = (bearishCount / requiredPeriods) * 100;
    
    // Trade readiness conditions
    const buyConditions = {
      regimeBullish: currentRegime.regime === 'bullish',
      momentumConfirmed: lastSignal.momentumConfirmed,
      persistenceMet: bullishPersistenceMet,
      signalPositive: lastSignal.signal > 0,
      hasBalance: portfolio.usdcBalance > 0,
    };
    
    const buyReady = Object.values(buyConditions).every(v => v);
    const buyProgress = (Object.values(buyConditions).filter(v => v).length / Object.keys(buyConditions).length) * 100;
    
    const sellConditions = {
      regimeBearish: currentRegime.regime === 'bearish',
      persistenceMet: bearishPersistenceMet,
      signalNegative: lastSignal.signal < 0,
      hasBalance: portfolio.ethBalance > 0,
    };
    
    const sellReady = Object.values(sellConditions).every(v => v);
    const sellProgress = (Object.values(sellConditions).filter(v => v).length / Object.keys(sellConditions).length) * 100;

    return {
      regimePersistenceStatus,
      switches24h,
      switches7d,
      regimeTime,
      combinedSignal,
      signalStrength,
      strengthMet,
      strengthProgress,
      progressToBullish,
      progressToBearish,
      bullishPersistenceMet,
      bullishPersistenceProgress,
      bullishCount,
      bearishPersistenceMet,
      bearishPersistenceProgress,
      bearishCount,
      buyConditions,
      buyReady,
      buyProgress,
      sellConditions,
      sellReady,
      sellProgress,
    };
  }, [currentRegime, lastSignal, regimeHistory, config, portfolio, session.strategySwitches]);

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Trade Readiness
      </h2>
      
      <div className={stack({ gap: '8px' })}>

        {/* Regime Proximity */}
        <div>
          <div className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '6px', color: '#e6edf3' })}>
            Distance to Regime Change
          </div>
          <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '8px' })}>
            Progress toward threshold (100% = threshold reached)
          </div>
          
          <div className={css({ marginBottom: '6px' })}>
            <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' })}>
              <span className={css({ color: '#7d8590', fontSize: 'xs' })}>To Bullish</span>
              <span className={css({ color: '#3fb950', fontSize: 'xs', fontWeight: 'semibold' })}>
                {executionMetrics.progressToBullish.toFixed(0)}%
              </span>
            </div>
            <div className={css({
              height: '6px',
              bg: '#21262d',
              borderRadius: '3px',
              overflow: 'hidden',
              position: 'relative',
            })}>
              <div 
                className={css({
                  height: '100%',
                  bg: '#3fb950',
                  transition: 'width 0.3s ease',
                })}
                style={{ width: `${Math.min(100, Math.max(0, executionMetrics.progressToBullish))}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' })}>
              <span className={css({ color: '#7d8590', fontSize: 'xs' })}>To Bearish</span>
              <span className={css({ color: '#f85149', fontSize: 'xs', fontWeight: 'semibold' })}>
                {executionMetrics.progressToBearish.toFixed(0)}%
              </span>
            </div>
            <div className={css({
              height: '6px',
              bg: '#21262d',
              borderRadius: '3px',
              overflow: 'hidden',
              position: 'relative',
            })}>
              <div 
                className={css({
                  height: '100%',
                  bg: '#f85149',
                  transition: 'width 0.3s ease',
                })}
                style={{ width: `${Math.min(100, Math.max(0, executionMetrics.progressToBearish))}%` }}
              />
            </div>
          </div>
        </div>


        {/* Trade Readiness */}
        <div>
          <div className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '6px', color: '#e6edf3' })}>
            Trade Conditions
          </div>
          
          <div className={css({ marginBottom: '8px' })}>
            <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' })}>
              <span className={css({ color: '#7d8590', fontSize: 'xs', fontWeight: 'semibold' })}>BUY Ready</span>
              <span className={css({
                color: executionMetrics.buyReady ? '#3fb950' : '#7d8590',
                fontSize: 'xs',
                fontWeight: 'semibold',
              })}>
                {executionMetrics.buyReady ? '✓ Ready' : `${executionMetrics.buyProgress.toFixed(0)}%`}
              </span>
            </div>
            <div className={stack({ gap: '2px', fontSize: 'xs' })}>
              <div className={css({
                color: executionMetrics.buyConditions.regimeBullish ? '#3fb950' : '#7d8590',
              })}>
                {executionMetrics.buyConditions.regimeBullish ? '✓' : '○'} Regime: Bullish
              </div>
              <div className={css({
                color: executionMetrics.buyConditions.momentumConfirmed ? '#3fb950' : '#7d8590',
              })}>
                {executionMetrics.buyConditions.momentumConfirmed ? '✓' : '○'} Momentum: Confirmed
              </div>
              <div className={css({
                color: executionMetrics.buyConditions.persistenceMet ? '#3fb950' : '#7d8590',
              })}>
                {executionMetrics.buyConditions.persistenceMet ? '✓' : '○'} Persistence: {executionMetrics.bullishCount}/5
              </div>
            </div>
          </div>
          
          <div>
            <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' })}>
              <span className={css({ color: '#7d8590', fontSize: 'xs', fontWeight: 'semibold' })}>SELL Ready</span>
              <span className={css({
                color: executionMetrics.sellReady ? '#f85149' : '#7d8590',
                fontSize: 'xs',
                fontWeight: 'semibold',
              })}>
                {executionMetrics.sellReady ? '✓ Ready' : `${executionMetrics.sellProgress.toFixed(0)}%`}
              </span>
            </div>
            <div className={stack({ gap: '2px', fontSize: 'xs' })}>
              <div className={css({
                color: executionMetrics.sellConditions.regimeBearish ? '#f85149' : '#7d8590',
              })}>
                {executionMetrics.sellConditions.regimeBearish ? '✓' : '○'} Regime: Bearish
              </div>
              <div className={css({
                color: executionMetrics.sellConditions.persistenceMet ? '#f85149' : '#7d8590',
              })}>
                {executionMetrics.sellConditions.persistenceMet ? '✓' : '○'} Persistence: {executionMetrics.bearishCount}/5
              </div>
            </div>
          </div>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />

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
      </div>
    </div>
  );
}
