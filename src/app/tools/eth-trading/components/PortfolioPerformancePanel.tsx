'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface PortfolioPerformancePanelProps {
  session: EnhancedPaperTradingSession;
}

/**
 * Consolidated Portfolio & Performance Panel
 * Combines: PortfolioDisplay + PerformanceMetricsPanel
 * Shows: Portfolio value, returns, drawdown, and key metrics
 */
export default function PortfolioPerformancePanel({ session }: PortfolioPerformancePanelProps) {
  const { portfolio, trades, portfolioHistory } = session;

  const metrics = useMemo(() => {
    // Calculate drawdown
    let maxValue = portfolio.initialCapital;
    let maxDrawdown = 0;
    let currentDrawdown = 0;

    for (const snapshot of portfolioHistory) {
      if (snapshot.totalValue > maxValue) {
        maxValue = snapshot.totalValue;
      } else if (snapshot.totalValue < maxValue) {
        const drawdown = ((maxValue - snapshot.totalValue) / maxValue) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        if (snapshot === portfolioHistory[portfolioHistory.length - 1]) {
          currentDrawdown = drawdown;
        }
      }
    }

    // Calculate win rate and profit factor
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
    const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0);
    const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;

    const totalWins = sellTrades.filter(t => (t.pnl || 0) > 0).reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(sellTrades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Calculate period returns
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in useMemo
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const findClosestSnapshot = (targetTime: number) => {
      return portfolioHistory.reduce((closest, snap) => {
        return Math.abs(snap.timestamp - targetTime) < Math.abs(closest.timestamp - targetTime)
          ? snap : closest;
      }, portfolioHistory[0] || { totalValue: portfolio.initialCapital, timestamp: session.startedAt });
    };

    const dayAgoValue = findClosestSnapshot(oneDayAgo).totalValue;
    const weekAgoValue = findClosestSnapshot(oneWeekAgo).totalValue;

    const dailyReturn = dayAgoValue > 0 ? ((portfolio.totalValue - dayAgoValue) / dayAgoValue) * 100 : 0;
    const weeklyReturn = weekAgoValue > 0 ? ((portfolio.totalValue - weekAgoValue) / weekAgoValue) * 100 : 0;

    // Sharpe ratio
    const returns = [];
    for (let i = 1; i < portfolioHistory.length; i++) {
      const prev = portfolioHistory[i - 1]!;
      const curr = portfolioHistory[i]!;
      if (prev.totalValue > 0) {
        returns.push((curr.totalValue - prev.totalValue) / prev.totalValue);
      }
    }
    const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return {
      maxDrawdown,
      currentDrawdown,
      winRate,
      profitFactor,
      dailyReturn,
      weeklyReturn,
      sharpeRatio,
    };
  }, [portfolio, trades, portfolioHistory, session.startedAt]);

  const returnColor = portfolio.totalReturn >= 0 ? '#3fb950' : '#f85149';
  const returnSign = portfolio.totalReturn >= 0 ? '+' : '';

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Portfolio & Performance
      </h2>
      
      <div className={stack({ gap: '8px' })}>
        {/* Portfolio Value */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Total Value</span>
          <span className={css({ fontSize: 'xl', fontWeight: 'bold', color: '#e6edf3' })}>
            ${portfolio.totalValue.toFixed(2)}
          </span>
        </div>
        
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Total Return</span>
          <span className={css({ fontSize: 'lg', fontWeight: 'semibold', color: returnColor })}>
            {returnSign}{portfolio.totalReturn.toFixed(2)}%
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Balances */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>USDC</span>
          <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>${portfolio.usdcBalance.toFixed(2)}</span>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>ETH</span>
          <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>{portfolio.ethBalance.toFixed(4)}</span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Period Returns */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Daily / Weekly</span>
          <div className={css({ display: 'flex', gap: '12px' })}>
            <span className={css({ color: metrics.dailyReturn >= 0 ? '#3fb950' : '#f85149', fontWeight: 'semibold', fontSize: 'sm' })}>
              {metrics.dailyReturn >= 0 ? '+' : ''}{metrics.dailyReturn.toFixed(2)}%
            </span>
            <span className={css({ color: metrics.weeklyReturn >= 0 ? '#3fb950' : '#f85149', fontWeight: 'semibold', fontSize: 'sm' })}>
              {metrics.weeklyReturn >= 0 ? '+' : ''}{metrics.weeklyReturn.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Key Metrics Row */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' })}>
          <div className={css({ textAlign: 'center', flex: '1', minWidth: '60px' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Win Rate</div>
            <div className={css({ 
              color: metrics.winRate >= 50 ? '#3fb950' : metrics.winRate >= 40 ? '#eab308' : '#f85149',
              fontWeight: 'semibold', fontSize: 'sm' 
            })}>
              {metrics.winRate.toFixed(0)}%
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1', minWidth: '60px' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Sharpe</div>
            <div className={css({ color: '#e6edf3', fontWeight: 'semibold', fontSize: 'sm' })}>
              {metrics.sharpeRatio.toFixed(2)}
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1', minWidth: '60px' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Max DD</div>
            <div className={css({ color: '#f85149', fontWeight: 'semibold', fontSize: 'sm' })}>
              {metrics.maxDrawdown.toFixed(1)}%
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1', minWidth: '60px' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Profit F.</div>
            <div className={css({ 
              color: metrics.profitFactor >= 1.5 ? '#3fb950' : metrics.profitFactor >= 1 ? '#eab308' : '#f85149',
              fontWeight: 'semibold', fontSize: 'sm' 
            })}>
              {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}





