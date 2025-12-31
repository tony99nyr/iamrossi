/**
 * Kelly Criterion Position Sizing
 * 
 * The Kelly Criterion is a mathematical formula for optimal position sizing
 * based on win rate and average win/loss ratio.
 * 
 * Formula: Kelly% = (W * R - L) / R
 * Where:
 *   W = Win rate (probability of winning)
 *   L = Loss rate (probability of losing) = 1 - W
 *   R = Win/loss ratio (average win / average loss)
 * 
 * For safety, we use fractional Kelly (typically 0.25 to 0.5 of full Kelly)
 */

import type { Trade } from '@/types';

export interface KellyCriterionResult {
  kellyPercentage: number; // Full Kelly percentage (0 to 1)
  fractionalKelly: number; // Fractional Kelly (safer, typically 0.25-0.5 of full)
  winRate: number; // Win rate (0 to 1)
  winLossRatio: number; // Average win / average loss
  averageWin: number; // Average winning trade P&L
  averageLoss: number; // Average losing trade P&L
  tradeCount: number; // Number of trades analyzed
}

export interface KellyCriterionOptions {
  fractionalMultiplier?: number; // Fraction of Kelly to use (default: 0.25 = 25% of full Kelly)
  minTrades?: number; // Minimum trades required for calculation (default: 10)
  lookbackPeriod?: number; // Number of recent trades to analyze (default: all trades)
}

/**
 * Calculate Kelly Criterion position sizing based on trade history
 * 
 * @param trades Array of completed trades (must have buy and sell pairs)
 * @param options Configuration options
 * @returns Kelly Criterion result or null if insufficient data
 */
export function calculateKellyCriterion(
  trades: Trade[],
  options: KellyCriterionOptions = {}
): KellyCriterionResult | null {
  const {
    fractionalMultiplier = 0.25, // Use 25% of full Kelly for safety
    minTrades = 10,
    lookbackPeriod,
  } = options;

  // If trades already have P&L (from backtest), use them directly
  // Otherwise, try to match buy/sell pairs
  let analyzedTrades: Array<Trade & { pnl: number }>;
  
  if (trades.length > 0 && 'pnl' in trades[0]! && trades[0]!.pnl !== undefined) {
    // Trades already have P&L - use them directly
    analyzedTrades = trades.filter((t): t is Trade & { pnl: number } => 
      t.type === 'sell' && t.pnl !== undefined && t.pnl !== null
    );
    
    // Apply lookback if specified
    if (lookbackPeriod) {
      analyzedTrades = analyzedTrades.slice(-lookbackPeriod);
    }
  } else {
    // Try to match buy/sell pairs
    const completedTrades = getCompletedTrades(trades);
    
    // Apply lookback if specified
    analyzedTrades = lookbackPeriod 
      ? completedTrades.slice(-lookbackPeriod)
      : completedTrades;
  }

  if (analyzedTrades.length < minTrades) {
    return null; // Insufficient data
  }

  // Calculate win rate and win/loss statistics
  const wins: number[] = [];
  const losses: number[] = [];

  for (const trade of analyzedTrades) {
    if (trade.pnl === undefined) continue;
    
    if (trade.pnl > 0) {
      wins.push(trade.pnl);
    } else if (trade.pnl < 0) {
      losses.push(Math.abs(trade.pnl)); // Store as positive for calculation
    }
    // Breakeven trades (pnl === 0) are ignored
  }

  if (wins.length === 0 && losses.length === 0) {
    return null; // No valid trades
  }

  // Calculate win rate
  const totalTrades = wins.length + losses.length;
  const winRate = wins.length / totalTrades;
  const lossRate = 1 - winRate;

  // Calculate average win and loss
  const averageWin = wins.length > 0 
    ? wins.reduce((sum, w) => sum + w, 0) / wins.length 
    : 0;
  const averageLoss = losses.length > 0 
    ? losses.reduce((sum, l) => sum + l, 0) / losses.length 
    : 0;

  // Calculate win/loss ratio
  const winLossRatio = averageLoss > 0 ? averageWin / averageLoss : 0;

  // Calculate Kelly percentage
  // Kelly% = (W * R - L) / R
  // Where W = win rate, L = loss rate, R = win/loss ratio
  let kellyPercentage = 0;
  
  if (winLossRatio > 0) {
    kellyPercentage = (winRate * winLossRatio - lossRate) / winLossRatio;
  } else if (winRate > 0.5 && averageLoss === 0) {
    // Edge case: all wins (or no losses), use win rate as Kelly
    kellyPercentage = winRate;
  }

  // Clamp Kelly percentage to reasonable bounds (0 to 1)
  kellyPercentage = Math.max(0, Math.min(1, kellyPercentage));

  // Calculate fractional Kelly (safer approach)
  const fractionalKelly = kellyPercentage * fractionalMultiplier;

  return {
    kellyPercentage,
    fractionalKelly,
    winRate,
    winLossRatio,
    averageWin,
    averageLoss,
    tradeCount: totalTrades,
  };
}

/**
 * Get completed trades (buy-sell pairs) from trade history
 * 
 * @param trades Array of all trades
 * @returns Array of completed trade pairs with P&L calculated
 */
function getCompletedTrades(trades: Trade[]): Array<Trade & { pnl: number }> {
  const completed: Array<Trade & { pnl: number }> = [];
  const openPositions: Map<string, Trade> = new Map(); // Track open positions by ID or timestamp

  // Sort trades by timestamp
  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  for (const trade of sortedTrades) {
    if (trade.type === 'buy') {
      // Store buy trade as open position
      // Use a simple key based on timestamp (could be improved with position tracking)
      openPositions.set(trade.id, trade);
    } else if (trade.type === 'sell') {
      // Find matching buy trade (simplified: use most recent buy)
      // In a real system, you'd track positions more carefully
      const buyTrades = Array.from(openPositions.values());
      if (buyTrades.length > 0) {
        // Use most recent buy trade
        const buyTrade = buyTrades[buyTrades.length - 1];
        openPositions.delete(buyTrade.id);

        // Calculate P&L
        const costBasis = buyTrade.usdcAmount;
        const saleValue = trade.usdcAmount;
        const pnl = saleValue - costBasis;

        // Create completed trade with P&L
        completed.push({
          ...trade,
          pnl,
        });
      }
    }
  }

  return completed;
}

/**
 * Calculate optimal position size using Kelly Criterion
 * 
 * @param availableCapital Capital available for trading
 * @param kellyResult Kelly Criterion calculation result
 * @param maxPositionPct Maximum position size allowed (e.g., 0.9 for 90%)
 * @returns Optimal position size in currency units
 */
export function calculateOptimalPositionSize(
  availableCapital: number,
  kellyResult: KellyCriterionResult | null,
  maxPositionPct: number = 0.9
): number {
  if (!kellyResult) {
    // Fallback to fixed percentage if no Kelly data
    return availableCapital * maxPositionPct;
  }

  // Use fractional Kelly, but cap at maxPositionPct
  const kellyPositionPct = Math.min(kellyResult.fractionalKelly, maxPositionPct);
  
  return availableCapital * kellyPositionPct;
}

/**
 * Get Kelly Criterion multiplier for position sizing
 * 
 * This can be used to adjust existing position sizing calculations
 * 
 * @param kellyResult Kelly Criterion calculation result
 * @param basePositionPct Base position percentage (e.g., 0.9 for 90%)
 * @returns Multiplier to apply to base position (0 to 1)
 */
export function getKellyMultiplier(
  kellyResult: KellyCriterionResult | null,
  basePositionPct: number = 0.9
): number {
  if (!kellyResult) {
    return 1.0; // No adjustment if no Kelly data
  }

  // Calculate what percentage Kelly suggests vs base
  const kellySuggestedPct = kellyResult.fractionalKelly;
  
  // Return multiplier (Kelly / Base)
  // Clamp to reasonable range (0.1 to 1.5)
  return Math.max(0.1, Math.min(1.5, kellySuggestedPct / basePositionPct));
}

