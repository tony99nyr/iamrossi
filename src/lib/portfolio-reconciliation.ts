/**
 * Portfolio Reconciliation
 * Verifies portfolio state consistency
 */

import type { Portfolio, Trade } from '@/types';
import type { OpenPosition } from './atr-stop-loss';

export interface ReconciliationResult {
  isConsistent: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Reconcile portfolio state
 * Checks that balances, positions, and trades are consistent
 */
export function reconcilePortfolio(
  portfolio: Portfolio,
  trades: Trade[],
  openPositions: OpenPosition[],
  currentPrice: number
): ReconciliationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Calculate expected balances from trades
  let expectedUsdc = portfolio.initialCapital;
  let expectedEth = 0;
  let expectedTradeCount = 0;
  let expectedWinCount = 0;

  for (const trade of trades) {
    if (trade.type === 'buy') {
      expectedUsdc -= (trade.usdcAmount || 0);
      expectedEth += (trade.ethAmount || 0);
      expectedTradeCount++;
    } else if (trade.type === 'sell') {
      expectedUsdc += (trade.usdcAmount || 0);
      expectedEth -= (trade.ethAmount || 0);
      expectedTradeCount++;
      if (trade.pnl !== undefined && trade.pnl > 0) {
        expectedWinCount++;
      }
    }
  }

  // Check USDC balance consistency (allow small floating point differences)
  const usdcDiff = Math.abs(portfolio.usdcBalance - expectedUsdc);
  if (usdcDiff > 0.01) {
    issues.push(`USDC balance mismatch: expected ${expectedUsdc.toFixed(2)}, got ${portfolio.usdcBalance.toFixed(2)} (diff: ${usdcDiff.toFixed(2)})`);
  }

  // Check ETH balance consistency (allow small floating point differences)
  const ethDiff = Math.abs(portfolio.ethBalance - expectedEth);
  if (ethDiff > 0.0001) {
    issues.push(`ETH balance mismatch: expected ${expectedEth.toFixed(6)}, got ${portfolio.ethBalance.toFixed(6)} (diff: ${ethDiff.toFixed(6)})`);
  }

  // Check total value calculation
  const expectedTotalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
  const totalValueDiff = Math.abs(portfolio.totalValue - expectedTotalValue);
  if (totalValueDiff > 0.01) {
    issues.push(`Total value mismatch: expected ${expectedTotalValue.toFixed(2)}, got ${portfolio.totalValue.toFixed(2)} (diff: ${totalValueDiff.toFixed(2)})`);
  }

  // Check trade count
  if (portfolio.tradeCount !== expectedTradeCount) {
    issues.push(`Trade count mismatch: expected ${expectedTradeCount}, got ${portfolio.tradeCount}`);
  }

  // Check win count
  if (portfolio.winCount !== expectedWinCount) {
    warnings.push(`Win count mismatch: expected ${expectedWinCount}, got ${portfolio.winCount} (may be due to stop loss trades)`);
  }

  // Check open positions consistency
  let totalOpenPositionEth = 0;
  for (const position of openPositions) {
    totalOpenPositionEth += position.buyTrade.ethAmount;
  }

  // Open positions should match ETH balance (if no partial sells)
  // Note: This is a warning, not an error, because partial sells are allowed
  if (Math.abs(portfolio.ethBalance - totalOpenPositionEth) > 0.0001 && portfolio.ethBalance > 0) {
    warnings.push(`Open positions ETH (${totalOpenPositionEth.toFixed(6)}) doesn't match portfolio ETH (${portfolio.ethBalance.toFixed(6)}) - may have partial sells`);
  }

  // Check for negative balances
  if (portfolio.usdcBalance < 0) {
    issues.push(`Negative USDC balance: ${portfolio.usdcBalance}`);
  }

  if (portfolio.ethBalance < 0) {
    issues.push(`Negative ETH balance: ${portfolio.ethBalance}`);
  }

  // Check for unrealistic values
  if (portfolio.totalValue < 0) {
    issues.push(`Negative total value: ${portfolio.totalValue}`);
  }

  if (portfolio.totalValue > portfolio.initialCapital * 10) {
    warnings.push(`Total value is very high (${portfolio.totalValue.toFixed(2)} vs initial ${portfolio.initialCapital}) - verify this is correct)`);
  }

  return {
    isConsistent: issues.length === 0,
    issues,
    warnings,
  };
}

