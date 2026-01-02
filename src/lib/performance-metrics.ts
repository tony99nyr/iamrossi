/**
 * Performance Metrics Calculation
 * Shared utilities for calculating trading performance metrics
 */

import type { Trade, PortfolioSnapshot } from '@/types';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

export interface PerformanceMetrics {
  // Returns
  totalReturn: number; // Percentage
  totalReturnUsd: number; // USD amount
  dailyReturn: number; // Percentage
  weeklyReturn: number; // Percentage
  
  // Risk Metrics
  maxDrawdown: number; // Percentage
  currentDrawdown: number; // Percentage
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  
  // Trade Metrics
  tradeCount: number;
  winRate: number; // Percentage
  profitFactor: number;
  averageWin: number; // USD
  averageLoss: number; // USD
  averageTradePnl: number; // USD
  
  // Performance Attribution
  returnsByRegime?: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
}

/**
 * Calculate comprehensive performance metrics from a trading session
 */
export function calculatePerformanceMetrics(
  session: EnhancedPaperTradingSession
): PerformanceMetrics {
  const { portfolio, trades, portfolioHistory } = session;
  
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
  
  // Calculate returns
  const totalReturnUsd = portfolio.totalValue - portfolio.initialCapital;
  const totalReturn = (totalReturnUsd / portfolio.initialCapital) * 100;
  
  // Calculate period returns
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  const findClosestSnapshot = (targetTime: number): PortfolioSnapshot => {
    return portfolioHistory.reduce((closest: PortfolioSnapshot, snap: PortfolioSnapshot) => {
      return Math.abs(snap.timestamp - targetTime) < Math.abs(closest.timestamp - targetTime)
        ? snap : closest;
    }, portfolioHistory[0] || { 
      totalValue: portfolio.initialCapital, 
      timestamp: session.startedAt,
      usdcBalance: portfolio.initialCapital,
      ethBalance: 0,
      ethPrice: 0,
    });
  };
  
  const dayAgoValue = findClosestSnapshot(oneDayAgo).totalValue;
  const weekAgoValue = findClosestSnapshot(oneWeekAgo).totalValue;
  
  const dailyReturn = dayAgoValue > 0 ? ((portfolio.totalValue - dayAgoValue) / dayAgoValue) * 100 : 0;
  const weeklyReturn = weekAgoValue > 0 ? ((portfolio.totalValue - weekAgoValue) / weekAgoValue) * 100 : 0;
  
  // Calculate Sharpe ratio
  const returns: number[] = [];
  for (let i = 1; i < portfolioHistory.length; i++) {
    const prev = portfolioHistory[i - 1]!;
    const curr = portfolioHistory[i]!;
    if (prev.totalValue > 0) {
      returns.push((curr.totalValue - prev.totalValue) / prev.totalValue);
    }
  }
  const avgReturn = returns.length > 0 ? returns.reduce((sum: number, r: number) => sum + r, 0) / returns.length : 0;
  const variance = returns.length > 0 
    ? returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  // Calculate Sortino ratio (downside deviation only)
  const downsideReturns = returns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum: number, r: number) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideStdDev = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideStdDev > 0 ? (avgReturn / downsideStdDev) * Math.sqrt(252) : 0;
  
  // Calculate Calmar ratio (annual return / max drawdown)
  // Approximate annual return from total return and session duration
  const sessionDurationDays = (Date.now() - session.startedAt) / (1000 * 60 * 60 * 24);
  const annualizedReturn = sessionDurationDays > 0 ? (totalReturn / 100) * (365 / sessionDurationDays) : 0;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / (maxDrawdown / 100) : 0;
  
  // Calculate trade metrics
  const sellTrades = trades.filter((t: Trade) => t.type === 'sell' && t.pnl !== undefined);
  const winningTrades = sellTrades.filter((t: Trade) => (t.pnl || 0) > 0);
  const losingTrades = sellTrades.filter((t: Trade) => (t.pnl || 0) < 0);
  
  const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;
  
  const totalWins = winningTrades.reduce((sum: number, t: Trade) => sum + (t.pnl || 0), 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum: number, t: Trade) => sum + (t.pnl || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
  
  const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
  const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
  const averageTradePnl = sellTrades.length > 0 
    ? sellTrades.reduce((sum: number, t: Trade) => sum + (t.pnl || 0), 0) / sellTrades.length 
    : 0;
  
  // Calculate returns by regime (if regime history available)
  let returnsByRegime: { bullish: number; bearish: number; neutral: number } | undefined;
  if (session.regimeHistory && session.regimeHistory.length > 0) {
    const regimeReturns = { bullish: 0, bearish: 0, neutral: 0 };
    const regimeCounts = { bullish: 0, bearish: 0, neutral: 0 };
    
    for (let i = 1; i < portfolioHistory.length; i++) {
      const prev = portfolioHistory[i - 1]!;
      const curr = portfolioHistory[i]!;
      const regime = session.regimeHistory?.find(r => 
        r.timestamp >= prev.timestamp && r.timestamp < curr.timestamp
      )?.regime || 'neutral';
      
      if (prev.totalValue > 0) {
        const periodReturn = (curr.totalValue - prev.totalValue) / prev.totalValue;
        if (regime === 'bullish') {
          regimeReturns.bullish += periodReturn;
          regimeCounts.bullish++;
        } else if (regime === 'bearish') {
          regimeReturns.bearish += periodReturn;
          regimeCounts.bearish++;
        } else {
          regimeReturns.neutral += periodReturn;
          regimeCounts.neutral++;
        }
      }
    }
    
    returnsByRegime = {
      bullish: regimeCounts.bullish > 0 ? (regimeReturns.bullish / regimeCounts.bullish) * 100 : 0,
      bearish: regimeCounts.bearish > 0 ? (regimeReturns.bearish / regimeCounts.bearish) * 100 : 0,
      neutral: regimeCounts.neutral > 0 ? (regimeReturns.neutral / regimeCounts.neutral) * 100 : 0,
    };
  }
  
  return {
    totalReturn,
    totalReturnUsd,
    dailyReturn,
    weeklyReturn,
    maxDrawdown,
    currentDrawdown,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    tradeCount: trades.length,
    winRate,
    profitFactor,
    averageWin,
    averageLoss,
    averageTradePnl,
    returnsByRegime,
  };
}

