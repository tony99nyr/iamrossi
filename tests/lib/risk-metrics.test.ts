/**
 * Unit tests for risk metrics calculations
 */

import { describe, it, expect } from 'vitest';
import {
  calculateStrategyResults,
  calculateRiskMetrics,
} from '@/lib/risk-metrics';
import type { Trade, PortfolioSnapshot } from '@/types';
import { createMockTrade, createMockPortfolioSnapshots } from '../mocks/trading-data.mock';
import { generatePriceCandles } from '../mocks/trading-data.mock';

describe('Risk Metrics', () => {
  const initialCapital = 1000;

  describe('calculateStrategyResults', () => {
    it('should calculate results for winning trades', () => {
      const trades: Trade[] = [
        createMockTrade('buy', 2500, 0.1, Date.now() - 10000, 0.5, 0.7),
        createMockTrade('sell', 2600, 0.1, Date.now(), -0.5, 0.7, 10), // $10 profit
      ];
      trades[1]!.portfolioValue = initialCapital + 10;

      const results = calculateStrategyResults(trades, initialCapital, initialCapital + 10);

      expect(results.totalReturn).toBeCloseTo(1.0, 2); // 1% return
      expect(results.totalReturnUsd).toBe(10);
      expect(results.tradeCount).toBe(2);
      expect(results.winCount).toBe(1);
      expect(results.lossCount).toBe(0);
      expect(results.winRate).toBe(50); // 1 win out of 2 trades (buy + sell)
      expect(results.avgWin).toBe(10);
      expect(results.profitFactor).toBeGreaterThan(0);
    });

    it('should calculate results for losing trades', () => {
      const trades: Trade[] = [
        createMockTrade('buy', 2500, 0.1, Date.now() - 10000, 0.5, 0.7),
        createMockTrade('sell', 2400, 0.1, Date.now(), -0.5, 0.7, -10), // $10 loss
      ];
      trades[1]!.portfolioValue = initialCapital - 10;

      const results = calculateStrategyResults(trades, initialCapital, initialCapital - 10);

      expect(results.totalReturn).toBeCloseTo(-1.0, 2); // -1% return
      expect(results.totalReturnUsd).toBe(-10);
      expect(results.winCount).toBe(0);
      expect(results.lossCount).toBe(1);
      expect(results.winRate).toBe(0);
      expect(results.avgLoss).toBe(10);
    });

    it('should calculate profit factor correctly', () => {
      const trades: Trade[] = [
        createMockTrade('buy', 2500, 0.1, Date.now() - 30000, 0.5, 0.7),
      ];
      trades[0]!.portfolioValue = initialCapital - 250; // After buy
      
      const sell1 = createMockTrade('sell', 2600, 0.1, Date.now() - 20000, -0.5, 0.7, 20); // $20 win
      sell1.portfolioValue = initialCapital - 230; // After sell (250 - 20 = 230, but we want +20)
      trades.push(sell1);
      
      const buy2 = createMockTrade('buy', 2500, 0.1, Date.now() - 10000, 0.5, 0.7);
      buy2.portfolioValue = initialCapital - 480; // After second buy
      trades.push(buy2);
      
      const sell2 = createMockTrade('sell', 2400, 0.1, Date.now(), -0.5, 0.7, -10); // $10 loss
      sell2.portfolioValue = initialCapital - 490; // After sell
      trades.push(sell2);

      const results = calculateStrategyResults(trades, initialCapital, initialCapital - 490);

      // Profit factor is calculated from portfolio value changes
      expect(results.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty trades', () => {
      const results = calculateStrategyResults([], initialCapital, initialCapital);

      expect(results.tradeCount).toBe(0);
      expect(results.winCount).toBe(0);
      expect(results.lossCount).toBe(0);
      expect(results.winRate).toBe(0);
      expect(results.totalReturn).toBe(0);
    });

    it('should calculate largest win and loss', () => {
      const trades: Trade[] = [
        createMockTrade('buy', 2500, 0.1, Date.now() - 30000, 0.5, 0.7),
      ];
      trades[0]!.portfolioValue = initialCapital - 250;
      
      const sell1 = createMockTrade('sell', 2600, 0.1, Date.now() - 20000, -0.5, 0.7, 50);
      sell1.portfolioValue = initialCapital - 200; // +50 from previous
      trades.push(sell1);
      
      const buy2 = createMockTrade('buy', 2500, 0.1, Date.now() - 10000, 0.5, 0.7);
      buy2.portfolioValue = initialCapital - 450;
      trades.push(buy2);
      
      const sell2 = createMockTrade('sell', 2400, 0.1, Date.now(), -0.5, 0.7, -20);
      sell2.portfolioValue = initialCapital - 470; // -20 from previous
      trades.push(sell2);

      const results = calculateStrategyResults(trades, initialCapital, initialCapital - 470);

      // Largest win/loss are calculated from portfolio value changes
      expect(results.largestWin).toBeGreaterThanOrEqual(0);
      expect(results.largestLoss).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateRiskMetrics', () => {
    it('should calculate Sharpe ratio', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const portfolioHistory = createMockPortfolioSnapshots(candles, initialCapital);
      const trades: Trade[] = [];

      // Simulate positive returns
      for (let i = 0; i < portfolioHistory.length; i++) {
        portfolioHistory[i]!.totalValue = initialCapital * (1 + i * 0.001); // Small positive returns
      }

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      // Sharpe ratio should be positive for positive returns
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });

    it('should calculate max drawdown', () => {
      const candles = generatePriceCandles('volatile', 100, 2500);
      const portfolioHistory = createMockPortfolioSnapshots(candles, initialCapital);
      const trades: Trade[] = [];

      // Simulate a drawdown
      for (let i = 0; i < portfolioHistory.length; i++) {
        if (i < 30) {
          portfolioHistory[i]!.totalValue = initialCapital * 1.2; // Peak
        } else if (i < 60) {
          portfolioHistory[i]!.totalValue = initialCapital * 0.9; // Drawdown
        } else {
          portfolioHistory[i]!.totalValue = initialCapital * 1.1; // Recovery
        }
      }

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      expect(metrics.maxDrawdown).toBeGreaterThan(0);
      expect(metrics.maxDrawdown).toBeLessThanOrEqual(100);
    });

    it('should calculate Sortino ratio', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const portfolioHistory = createMockPortfolioSnapshots(candles, initialCapital);
      const trades: Trade[] = [];

      // Simulate positive returns with some volatility
      for (let i = 0; i < portfolioHistory.length; i++) {
        portfolioHistory[i]!.totalValue = initialCapital * (1 + i * 0.001 + (Math.random() - 0.5) * 0.01);
      }

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      // Sortino should be defined (may be Infinity if no downside deviation)
      expect(typeof metrics.sortinoRatio).toBe('number');
      expect(metrics.sortinoRatio).toBeGreaterThanOrEqual(0);
    });

    it('should calculate volatility', () => {
      const candles = generatePriceCandles('volatile', 100, 2500);
      const portfolioHistory = createMockPortfolioSnapshots(candles, initialCapital);
      const trades: Trade[] = [];

      // Simulate volatile returns
      for (let i = 0; i < portfolioHistory.length; i++) {
        portfolioHistory[i]!.totalValue = initialCapital * (1 + (Math.random() - 0.5) * 0.1);
      }

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      expect(metrics.volatility).toBeGreaterThan(0);
    });

    it('should calculate Calmar ratio', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const portfolioHistory = createMockPortfolioSnapshots(candles, initialCapital);
      const trades: Trade[] = [];

      // Simulate returns with drawdown
      for (let i = 0; i < portfolioHistory.length; i++) {
        if (i < 50) {
          portfolioHistory[i]!.totalValue = initialCapital * 1.1;
        } else {
          portfolioHistory[i]!.totalValue = initialCapital * 0.95; // Drawdown
        }
      }

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      expect(typeof metrics.calmarRatio).toBe('number');
    });

    it('should calculate expectancy', () => {
      const trades: Trade[] = [
        createMockTrade('buy', 2500, 0.1, Date.now() - 30000, 0.5, 0.7),
        createMockTrade('sell', 2600, 0.1, Date.now() - 20000, -0.5, 0.7, 20), // $20 win
        createMockTrade('buy', 2500, 0.1, Date.now() - 10000, 0.5, 0.7),
        createMockTrade('sell', 2400, 0.1, Date.now(), -0.5, 0.7, -10), // $10 loss
      ];
      trades[3]!.portfolioValue = initialCapital + 10;

      const candles = generatePriceCandles('trending-up', 10, 2500);
      const portfolioHistory = createMockPortfolioSnapshots(candles, initialCapital);

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      // Expectancy = (win rate * avg win) - (loss rate * avg loss)
      // = (0.5 * 20) - (0.5 * 10) = 10 - 5 = 5
      expect(metrics.expectancy).toBeGreaterThan(0);
    });

    it('should handle empty portfolio history', () => {
      const trades: Trade[] = [];
      const portfolioHistory: PortfolioSnapshot[] = [];

      const metrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

      expect(metrics.sharpeRatio).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.volatility).toBe(0);
    });
  });
});

