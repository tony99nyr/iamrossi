'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface RiskManagementPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function RiskManagementPanel({ session }: RiskManagementPanelProps) {
  const { portfolio, lastSignal, lastPrice, regimeHistory, config, portfolioHistory } = session;

  const riskMetrics = useMemo(() => {
    // Calculate current volatility (20-period standard deviation of returns)
    let currentVolatility = 0;
    let volatilityStatus: 'safe' | 'warning' | 'blocked' = 'safe';
    const maxVolatility = config.maxVolatility || 0.05;

    if (portfolioHistory.length >= 20) {
      const prices = portfolioHistory.slice(-21).map(p => p.ethPrice);
      const returns: number[] = [];
      
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1]! > 0) {
          returns.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
        }
      }
      
      if (returns.length > 0) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        currentVolatility = Math.sqrt(variance);
        
        if (currentVolatility > maxVolatility) {
          volatilityStatus = 'blocked';
        } else if (currentVolatility > maxVolatility * 0.8) {
          volatilityStatus = 'warning';
        }
      }
    }

    // Check whipsaw detection
    let whipsawStatus: 'safe' | 'warning' | 'blocked' = 'safe';
    const whipsawMaxChanges = config.whipsawMaxChanges || 3;
    
    if (regimeHistory && regimeHistory.length >= 5) {
      const recent = regimeHistory.slice(-5);
      const currentRegime = lastSignal.regime.regime;
      const allRegimes = [...recent.map(r => r.regime), currentRegime];
      
      let changes = 0;
      for (let i = 1; i < allRegimes.length; i++) {
        if (allRegimes[i] !== allRegimes[i - 1]) {
          changes++;
        }
      }
      
      if (changes > whipsawMaxChanges) {
        whipsawStatus = 'blocked';
      } else if (changes >= whipsawMaxChanges - 1) {
        whipsawStatus = 'warning';
      }
    }

    // Check circuit breaker (win rate)
    let circuitBreakerStatus: 'safe' | 'warning' | 'blocked' = 'safe';
    const minWinRate = config.circuitBreakerWinRate || 0.2;
    const lookback = config.circuitBreakerLookback || 10;
    
    const sellTrades = session.trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
    if (sellTrades.length >= 5) {
      const recent = sellTrades.slice(-lookback);
      const wins = recent.filter(t => (t.pnl || 0) > 0).length;
      const winRate = wins / recent.length;
      
      if (winRate < minWinRate) {
        circuitBreakerStatus = 'blocked';
      } else if (winRate < minWinRate * 1.2) {
        circuitBreakerStatus = 'warning';
      }
    }

    // Position metrics
    const totalValue = portfolio.totalValue;
    const ethValue = portfolio.ethBalance * lastPrice;
    const usdcValue = portfolio.usdcBalance;
    
    const currentPositionPct = totalValue > 0 ? (ethValue / totalValue) * 100 : 0;
    
    const activeStrategy = lastSignal.activeStrategy;
    const maxPositionPct = activeStrategy?.maxPositionPct || 0.75;
    const positionSizeMultiplier = lastSignal.positionSizeMultiplier || 1.0;
    const adjustedPositionPct = Math.min(
      maxPositionPct * positionSizeMultiplier,
      config.maxBullishPosition || 0.95
    );
    
    const targetPositionPct = lastSignal.action === 'buy' && lastSignal.signal > 0
      ? adjustedPositionPct * 100
      : lastSignal.action === 'sell' && lastSignal.signal < 0
      ? (maxPositionPct * 0.5) * 100
      : currentPositionPct;
    
    const positionDeviation = Math.abs(currentPositionPct - targetPositionPct);
    
    const confidence = lastSignal.confidence || 0;
    const riskPerTrade = totalValue * confidence * (adjustedPositionPct / 100);
    const portfolioHeat = currentPositionPct;

    const isBlocked = volatilityStatus === 'blocked' || whipsawStatus === 'blocked' || circuitBreakerStatus === 'blocked';
    const hasWarning = volatilityStatus === 'warning' || whipsawStatus === 'warning' || circuitBreakerStatus === 'warning';

    return {
      currentVolatility,
      maxVolatility,
      volatilityStatus,
      whipsawStatus,
      circuitBreakerStatus,
      isBlocked,
      hasWarning,
      currentPositionPct,
      targetPositionPct,
      positionDeviation,
      positionMultiplier: positionSizeMultiplier,
      riskPerTrade,
      portfolioHeat,
      ethValue,
      usdcValue,
    };
  }, [lastSignal, regimeHistory, config, portfolioHistory, session.trades, portfolio, lastPrice]);

  const getStatusColor = (status: 'safe' | 'warning' | 'blocked'): string => {
    switch (status) {
      case 'blocked': return '#f85149';
      case 'warning': return '#eab308';
      default: return '#3fb950';
    }
  };

  const getStatusIcon = (status: 'safe' | 'warning' | 'blocked'): string => {
    switch (status) {
      case 'blocked': return '🚫';
      case 'warning': return '⚠️';
      default: return '✅';
    }
  };

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Risk Management & Position
      </h2>
      
      <div className={stack({ gap: '8px' })}>
        {/* Risk Filters */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
            <span>{getStatusIcon(riskMetrics.volatilityStatus)}</span>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Volatility Filter</span>
          </div>
          <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' })}>
            <span className={css({
              color: getStatusColor(riskMetrics.volatilityStatus),
              fontWeight: 'semibold',
              fontSize: 'sm',
            })}>
              {(riskMetrics.currentVolatility * 100).toFixed(2)}% / {(riskMetrics.maxVolatility * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
            <span>{getStatusIcon(riskMetrics.whipsawStatus)}</span>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Whipsaw Detection</span>
          </div>
          <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' })}>
            <span className={css({
              color: getStatusColor(riskMetrics.whipsawStatus),
              fontWeight: 'semibold',
              fontSize: 'sm',
            })}>
              {riskMetrics.whipsawStatus === 'safe' ? 'Stable' : riskMetrics.whipsawStatus === 'warning' ? 'Unstable' : 'Blocked'}
            </span>
          </div>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
            <span>{getStatusIcon(riskMetrics.circuitBreakerStatus)}</span>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Circuit Breaker</span>
          </div>
          <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' })}>
            <span className={css({
              color: getStatusColor(riskMetrics.circuitBreakerStatus),
              fontWeight: 'semibold',
              fontSize: 'sm',
            })}>
              {riskMetrics.circuitBreakerStatus === 'safe' ? 'Active' : riskMetrics.circuitBreakerStatus === 'warning' ? 'Warning' : 'Triggered'}
            </span>
          </div>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />

        {/* Position Metrics */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Current Position</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {riskMetrics.currentPositionPct.toFixed(1)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Target Position</span>
          <span className={css({ color: '#7d8590' })}>
            {riskMetrics.targetPositionPct.toFixed(1)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Position Deviation</span>
          <span className={css({
            color: riskMetrics.positionDeviation > 20 ? '#f85149' : riskMetrics.positionDeviation > 10 ? '#eab308' : '#3fb950',
            fontWeight: 'semibold',
          })}>
            {riskMetrics.positionDeviation.toFixed(1)}%
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />

        {/* Position Breakdown */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>ETH Value</span>
          <span className={css({ color: '#e6edf3' })}>
            ${riskMetrics.ethValue.toFixed(2)}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>USDC Balance</span>
          <span className={css({ color: '#e6edf3' })}>
            ${riskMetrics.usdcValue.toFixed(2)}
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />

        {/* Advanced Risk Management */}
        {session.config.kellyCriterion?.enabled && (
          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Kelly Multiplier</span>
            <span className={css({ 
              color: session.kellyMultiplier && session.kellyMultiplier > 1 ? '#3fb950' : '#7d8590',
              fontWeight: 'semibold',
            })}>
              {session.kellyMultiplier ? session.kellyMultiplier.toFixed(2) + 'x' : '1.00x'}
            </span>
          </div>
        )}

        {session.config.stopLoss?.enabled && (
          <>
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>ATR Stop Loss</span>
              <span className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
                {session.config.stopLoss.atrMultiplier.toFixed(1)}x ATR
              </span>
            </div>
            {session.currentATR && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Current ATR</span>
                <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>
                  ${session.currentATR.toFixed(2)}
                </span>
              </div>
            )}
            {session.openPositions && session.openPositions.length > 0 && (
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              })}>
                <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Open Positions</span>
                <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
                  {session.openPositions.length}
                </span>
              </div>
            )}
          </>
        )}

        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />

        {/* Risk Metrics */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Risk per Trade</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            ${riskMetrics.riskPerTrade.toFixed(2)}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Portfolio Heat</span>
          <span className={css({
            color: riskMetrics.portfolioHeat > 80 ? '#f85149' : riskMetrics.portfolioHeat > 60 ? '#eab308' : '#3fb950',
            fontWeight: 'semibold',
          })}>
            {riskMetrics.portfolioHeat.toFixed(1)}%
          </span>
        </div>

        {/* Overall Status */}
        {riskMetrics.isBlocked && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
            <div className={css({
              padding: '12px',
              bg: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.3)',
              borderRadius: '4px',
              color: '#f85149',
              fontSize: 'sm',
            })}>
              ⚠️ Trading is currently blocked by risk management filters
            </div>
          </>
        )}

        {!riskMetrics.isBlocked && riskMetrics.hasWarning && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
            <div className={css({
              padding: '12px',
              bg: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '4px',
              color: '#eab308',
              fontSize: 'sm',
            })}>
              ⚠️ Some risk metrics are approaching thresholds
            </div>
          </>
        )}
      </div>
    </div>
  );
}
