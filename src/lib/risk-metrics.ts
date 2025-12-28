import type { Trade, PortfolioSnapshot, StrategyResults, RiskMetrics } from '@/types';

/**
 * Calculate strategy results from trades and final portfolio value
 */
export function calculateStrategyResults(
  trades: Trade[],
  initialCapital: number,
  finalValue: number
): StrategyResults {
  const wins: number[] = [];
  const losses: number[] = [];

  // Calculate profit/loss for each trade
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const prevValue = i > 0 ? trades[i - 1].portfolioValue : initialCapital;
    const pnl = trade.portfolioValue - prevValue;

    if (pnl > 0) {
      wins.push(pnl);
    } else if (pnl < 0) {
      losses.push(Math.abs(pnl));
    }
  }

  const totalWins = wins.reduce((sum, w) => sum + w, 0);
  const totalLosses = losses.reduce((sum, l) => sum + l, 0);

  return {
    initialCapital,
    finalValue,
    totalReturn: ((finalValue - initialCapital) / initialCapital) * 100,
    totalReturnUsd: finalValue - initialCapital,
    tradeCount: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    avgWin: wins.length > 0 ? totalWins / wins.length : 0,
    avgLoss: losses.length > 0 ? totalLosses / losses.length : 0,
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
    largestWin: wins.length > 0 ? Math.max(...wins) : 0,
    largestLoss: losses.length > 0 ? Math.max(...losses) : 0,
  };
}

/**
 * Calculate comprehensive risk metrics from trades and portfolio history
 */
export function calculateRiskMetrics(
  trades: Trade[],
  portfolioHistory: PortfolioSnapshot[],
  initialCapital: number
): RiskMetrics {
  // Calculate returns series from portfolio history
  const returns = calculateReturns(portfolioHistory, initialCapital);

  // Calculate daily returns for volatility calculations
  const dailyReturns = calculateDailyReturns(portfolioHistory);

  // Calculate metrics
  const sharpeRatio = calculateSharpeRatio(dailyReturns);
  const sortinoRatio = calculateSortinoRatio(dailyReturns);
  const maxDrawdown = calculateMaxDrawdown(portfolioHistory);
  const maxDrawdownDuration = calculateMaxDrawdownDuration(portfolioHistory, maxDrawdown);
  const volatility = calculateVolatility(dailyReturns);
  const calmarRatio = calculateCalmarRatio(returns, maxDrawdown);
  const winLossRatio = calculateWinLossRatio(trades, initialCapital);
  const expectancy = calculateExpectancy(trades, initialCapital);

  return {
    sharpeRatio,
    maxDrawdown,
    maxDrawdownDuration,
    volatility,
    calmarRatio,
    sortinoRatio,
    winLossRatio,
    expectancy,
  };
}

/**
 * Calculate percentage returns from portfolio history
 */
function calculateReturns(
  portfolioHistory: PortfolioSnapshot[],
  initialCapital: number
): number[] {
  if (portfolioHistory.length === 0) return [];

  const returns: number[] = [];
  let prevValue = initialCapital;

  for (const snapshot of portfolioHistory) {
    if (prevValue > 0) {
      const returnPct = ((snapshot.totalValue - prevValue) / prevValue) * 100;
      returns.push(returnPct);
    }
    prevValue = snapshot.totalValue;
  }

  return returns;
}

/**
 * Calculate daily returns for volatility calculations
 */
function calculateDailyReturns(portfolioHistory: PortfolioSnapshot[]): number[] {
  if (portfolioHistory.length < 2) return [];

  const returns: number[] = [];
  for (let i = 1; i < portfolioHistory.length; i++) {
    const prev = portfolioHistory[i - 1];
    const curr = portfolioHistory[i];
    if (prev.totalValue > 0) {
      const returnPct = ((curr.totalValue - prev.totalValue) / prev.totalValue) * 100;
      returns.push(returnPct);
    }
  }

  return returns;
}

/**
 * Calculate Sharpe Ratio: (Mean Return - Risk Free Rate) / Standard Deviation
 * Using risk-free rate of 0 for crypto
 */
function calculateSharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;

  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Risk-free rate = 0 for crypto
  return mean / stdDev;
}

/**
 * Calculate Sortino Ratio: (Mean Return - Risk Free Rate) / Downside Deviation
 * Focuses only on negative volatility
 */
function calculateSortinoRatio(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;

  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const downsideReturns = dailyReturns.filter(r => r < 0);

  if (downsideReturns.length === 0) return mean > 0 ? Infinity : 0;

  const downsideVariance =
    downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);

  if (downsideDeviation === 0) return mean > 0 ? Infinity : 0;

  return mean / downsideDeviation;
}

/**
 * Calculate Maximum Drawdown: Largest peak-to-trough decline (as percentage)
 */
function calculateMaxDrawdown(portfolioHistory: PortfolioSnapshot[]): number {
  if (portfolioHistory.length === 0) return 0;

  let maxValue = portfolioHistory[0].totalValue;
  let maxDrawdown = 0;

  for (const snapshot of portfolioHistory) {
    if (snapshot.totalValue > maxValue) {
      maxValue = snapshot.totalValue;
    }

    const drawdown = ((maxValue - snapshot.totalValue) / maxValue) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * Calculate maximum drawdown duration in days
 */
function calculateMaxDrawdownDuration(
  portfolioHistory: PortfolioSnapshot[],
  maxDrawdown: number
): number {
  if (portfolioHistory.length === 0 || maxDrawdown === 0) return 0;

  let maxValue = portfolioHistory[0].totalValue;
  let maxValueTimestamp = portfolioHistory[0].timestamp;
  let maxDuration = 0;
  let currentDrawdownStart: number | null = null;

  for (const snapshot of portfolioHistory) {
    if (snapshot.totalValue > maxValue) {
      maxValue = snapshot.totalValue;
      maxValueTimestamp = snapshot.timestamp;
      currentDrawdownStart = null;
    }

    const drawdown = ((maxValue - snapshot.totalValue) / maxValue) * 100;

    if (drawdown >= maxDrawdown * 0.99) {
      // Within 1% of max drawdown
      if (currentDrawdownStart === null) {
        currentDrawdownStart = maxValueTimestamp;
      }

      const duration = (snapshot.timestamp - currentDrawdownStart) / (1000 * 60 * 60 * 24); // Convert to days
      if (duration > maxDuration) {
        maxDuration = duration;
      }
    } else {
      currentDrawdownStart = null;
    }
  }

  return Math.round(maxDuration);
}

/**
 * Calculate volatility as standard deviation of returns
 */
function calculateVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;

  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;

  return Math.sqrt(variance);
}

/**
 * Calculate Calmar Ratio: Annual Return / Max Drawdown
 */
function calculateCalmarRatio(returns: number[], maxDrawdown: number): number {
  if (returns.length === 0 || maxDrawdown === 0) return 0;

  // Approximate annual return (assuming returns are daily)
  const avgDailyReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const annualReturn = avgDailyReturn * 365; // Rough approximation

  return annualReturn / maxDrawdown;
}

/**
 * Calculate Win/Loss Ratio: Average Win / Average Loss
 */
function calculateWinLossRatio(trades: Trade[], initialCapital: number): number {
  const wins: number[] = [];
  const losses: number[] = [];

  let prevValue = initialCapital;

  for (const trade of trades) {
    const pnl = trade.portfolioValue - prevValue;
    if (pnl > 0) {
      wins.push(pnl);
    } else if (pnl < 0) {
      losses.push(Math.abs(pnl));
    }
    prevValue = trade.portfolioValue;
  }

  const avgWin = wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / losses.length : 0;

  if (avgLoss === 0) return avgWin > 0 ? Infinity : 0;

  return avgWin / avgLoss;
}

/**
 * Calculate Expectancy: Expected value per trade
 * Expectancy = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)
 */
function calculateExpectancy(trades: Trade[], initialCapital: number): number {
  if (trades.length === 0) return 0;

  const wins: number[] = [];
  const losses: number[] = [];

  let prevValue = initialCapital;

  for (const trade of trades) {
    const pnl = trade.portfolioValue - prevValue;
    if (pnl > 0) {
      wins.push(pnl);
    } else if (pnl < 0) {
      losses.push(Math.abs(pnl));
    }
    prevValue = trade.portfolioValue;
  }

  const winRate = wins.length / trades.length;
  const lossRate = losses.length / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / losses.length : 0;

  return winRate * avgWin - lossRate * avgLoss;
}

