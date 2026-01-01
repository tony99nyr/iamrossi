/**
 * Portfolio Calculation Utilities
 * Shared functions for portfolio value calculations and P&L tracking
 */

import type { Portfolio, PortfolioSnapshot, Trade } from '@/types';

/**
 * Calculate total portfolio value from balances and current price
 */
export function calculatePortfolioValue(
  usdcBalance: number,
  ethBalance: number,
  currentPrice: number
): number {
  return usdcBalance + ethBalance * currentPrice;
}

/**
 * Calculate portfolio return percentage
 */
export function calculatePortfolioReturn(
  totalValue: number,
  initialCapital: number
): number {
  if (initialCapital === 0) return 0;
  return ((totalValue - initialCapital) / initialCapital) * 100;
}

/**
 * Create a portfolio snapshot at a given timestamp
 */
export function createPortfolioSnapshot(
  portfolio: Portfolio,
  timestamp: number,
  currentPrice: number
): PortfolioSnapshot {
  return {
    timestamp,
    usdcBalance: portfolio.usdcBalance,
    ethBalance: portfolio.ethBalance,
    totalValue: calculatePortfolioValue(portfolio.usdcBalance, portfolio.ethBalance, currentPrice),
    ethPrice: currentPrice,
  };
}

/**
 * Calculate P&L for a sell trade using FIFO cost basis
 * Returns the P&L amount and updates buy trades with fullySold flag
 */
export function calculatePnLFIFO(
  sellAmount: number,
  sellPrice: number,
  buyTrades: Trade[]
): { pnl: number; costBasis: number } {
  let remainingToSell = sellAmount;
  let totalCostBasis = 0;
  
  // Find buy trades that haven't been fully sold yet (FIFO)
  for (const buyTrade of buyTrades.filter(t => t.type === 'buy' && !t.fullySold)) {
    if (remainingToSell <= 0) break;
    
    const buyAmount = buyTrade.ethAmount;
    const sellAmountForThisTrade = Math.min(remainingToSell, buyAmount);
    const costBasisRatio = sellAmountForThisTrade / buyAmount;
    const costBasis = (buyTrade.costBasis || buyTrade.usdcAmount) * costBasisRatio;
    
    totalCostBasis += costBasis;
    remainingToSell -= sellAmountForThisTrade;
    
    // Mark buy trade as fully or partially sold
    if (sellAmountForThisTrade >= buyAmount) {
      buyTrade.fullySold = true;
    } else {
      buyTrade.ethAmount -= sellAmountForThisTrade;
      buyTrade.costBasis = (buyTrade.costBasis || buyTrade.usdcAmount) - costBasis;
      buyTrade.usdcAmount = buyTrade.costBasis;
    }
  }
  
  // If we couldn't match to a buy (shouldn't happen in normal operation), use average cost
  if (totalCostBasis === 0 && buyTrades.filter(t => t.type === 'buy').length > 0) {
    const unsoldBuys = buyTrades.filter(t => t.type === 'buy' && !t.fullySold);
    if (unsoldBuys.length > 0) {
      const totalCost = unsoldBuys.reduce((sum, t) => sum + (t.costBasis || t.usdcAmount), 0);
      const totalAmount = unsoldBuys.reduce((sum, t) => sum + t.ethAmount, 0);
      const avgCost = totalAmount > 0 ? totalCost / totalAmount : sellPrice;
      totalCostBasis = sellAmount * avgCost;
    }
  }
  
  const saleValue = sellAmount * sellPrice;
  const pnl = saleValue - totalCostBasis;
  
  return { pnl, costBasis: totalCostBasis };
}

/**
 * Update portfolio after a trade
 * Updates balances, total value, and return percentage
 */
export function updatePortfolioAfterTrade(
  portfolio: Portfolio,
  currentPrice: number
): void {
  portfolio.totalValue = calculatePortfolioValue(
    portfolio.usdcBalance,
    portfolio.ethBalance,
    currentPrice
  );
  portfolio.totalReturn = calculatePortfolioReturn(
    portfolio.totalValue,
    portfolio.initialCapital
  );
}

