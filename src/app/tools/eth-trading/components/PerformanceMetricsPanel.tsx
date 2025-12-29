'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface PerformanceMetricsPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function PerformanceMetricsPanel({ session }: PerformanceMetricsPanelProps) {
  const { portfolio, trades, portfolioHistory } = session;

  // Calculate performance metrics
  const metrics = useMemo(() => {
    // Calculate drawdown
    let maxValue = portfolio.initialCapital;
    let maxDrawdown = 0;
    let currentDrawdown = 0;
    let inDrawdown = false;
    let drawdownStart = 0;

    for (const snapshot of portfolioHistory) {
      if (snapshot.totalValue > maxValue) {
        maxValue = snapshot.totalValue;
        inDrawdown = false;
      } else if (snapshot.totalValue < maxValue) {
        if (!inDrawdown) {
          inDrawdown = true;
          drawdownStart = snapshot.timestamp;
        }
        const drawdown = ((maxValue - snapshot.totalValue) / maxValue) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
        if (snapshot === portfolioHistory[portfolioHistory.length - 1]) {
          currentDrawdown = drawdown;
        }
      }
    }

    // Calculate win rate
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
    const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0);
    const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;

    // Calculate profit factor
    const totalWins = sellTrades
      .filter(t => (t.pnl || 0) > 0)
      .reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(sellTrades
      .filter(t => (t.pnl || 0) < 0)
      .reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Calculate average win/loss
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
      : 0;
    const losingTrades = sellTrades.filter(t => (t.pnl || 0) < 0);
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
      : 0;

    // Calculate daily/weekly/monthly returns
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const findClosestSnapshot = (targetTime: number) => {
      return portfolioHistory.reduce((closest, snap) => {
        return Math.abs(snap.timestamp - targetTime) < Math.abs(closest.timestamp - targetTime)
          ? snap : closest;
      }, portfolioHistory[0] || { totalValue: portfolio.initialCapital, timestamp: session.startedAt });
    };

    const dayAgoValue = findClosestSnapshot(oneDayAgo).totalValue;
    const weekAgoValue = findClosestSnapshot(oneWeekAgo).totalValue;
    const monthAgoValue = findClosestSnapshot(oneMonthAgo).totalValue;

    const dailyReturn = dayAgoValue > 0
      ? ((portfolio.totalValue - dayAgoValue) / dayAgoValue) * 100
      : 0;
    const weeklyReturn = weekAgoValue > 0
      ? ((portfolio.totalValue - weekAgoValue) / weekAgoValue) * 100
      : 0;
    const monthlyReturn = monthAgoValue > 0
      ? ((portfolio.totalValue - monthAgoValue) / monthAgoValue) * 100
      : 0;

    // Calculate Sharpe ratio (simplified - using daily returns)
    const returns = [];
    for (let i = 1; i < portfolioHistory.length; i++) {
      const prev = portfolioHistory[i - 1]!;
      const curr = portfolioHistory[i]!;
      if (prev.totalValue > 0) {
        returns.push((curr.totalValue - prev.totalValue) / prev.totalValue);
      }
    }
    const avgReturn = returns.length > 0
      ? returns.reduce((sum, r) => sum + r, 0) / returns.length
      : 0;
    const variance = returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    return {
      maxDrawdown,
      currentDrawdown,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      dailyReturn,
      weeklyReturn,
      monthlyReturn,
      sharpeRatio,
    };
  }, [portfolio, trades, portfolioHistory, session.startedAt]);

  return (
    <div className={css({
      padding: '24px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        Performance Metrics
      </h2>
      
      <div className={stack({ gap: '12px' })}>
        {/* Returns */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Daily Return</span>
          <span className={css({
            color: metrics.dailyReturn >= 0 ? '#3fb950' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {metrics.dailyReturn >= 0 ? '+' : ''}{metrics.dailyReturn.toFixed(2)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Weekly Return</span>
          <span className={css({
            color: metrics.weeklyReturn >= 0 ? '#3fb950' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {metrics.weeklyReturn >= 0 ? '+' : ''}{metrics.weeklyReturn.toFixed(2)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Monthly Return</span>
          <span className={css({
            color: metrics.monthlyReturn >= 0 ? '#3fb950' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {metrics.monthlyReturn >= 0 ? '+' : ''}{metrics.monthlyReturn.toFixed(2)}%
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />

        {/* Risk Metrics */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Sharpe Ratio</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {metrics.sharpeRatio.toFixed(2)}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Max Drawdown</span>
          <span className={css({ color: '#f85149', fontWeight: 'semibold' })}>
            {metrics.maxDrawdown.toFixed(2)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Current Drawdown</span>
          <span className={css({
            color: metrics.currentDrawdown > 5 ? '#f85149' : metrics.currentDrawdown > 2 ? '#eab308' : '#7d8590',
            fontWeight: 'semibold',
          })}>
            {metrics.currentDrawdown.toFixed(2)}%
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />

        {/* Trade Metrics */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Win Rate</span>
          <span className={css({
            color: metrics.winRate >= 50 ? '#3fb950' : metrics.winRate >= 40 ? '#eab308' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {metrics.winRate.toFixed(1)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Profit Factor</span>
          <span className={css({
            color: metrics.profitFactor >= 1.5 ? '#3fb950' : metrics.profitFactor >= 1 ? '#eab308' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
          </span>
        </div>

        {metrics.avgWin > 0 && (
          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Avg Win</span>
            <span className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
              ${metrics.avgWin.toFixed(2)}
            </span>
          </div>
        )}

        {metrics.avgLoss > 0 && (
          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Avg Loss</span>
            <span className={css({ color: '#f85149', fontWeight: 'semibold' })}>
              ${metrics.avgLoss.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

