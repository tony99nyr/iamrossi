import { describe, it, expect } from 'vitest';
import {
  calculateKellyCriterion,
  calculateOptimalPositionSize,
  getKellyMultiplier,
  type KellyCriterionResult,
} from '@/lib/kelly-criterion';
import type { Trade } from '@/types';
import { v4 as uuidv4 } from 'uuid';

describe('Kelly Criterion', () => {
  function createBuyTrade(price: number, amount: number, timestamp: number = Date.now()): Trade {
    return {
      id: uuidv4(),
      type: 'buy',
      timestamp,
      ethPrice: price,
      ethAmount: amount,
      usdcAmount: price * amount,
      signal: 0.5,
      confidence: 0.8,
      portfolioValue: 1000,
    };
  }

  function createSellTrade(
    price: number,
    amount: number,
    pnl: number,
    timestamp: number = Date.now()
  ): Trade & { pnl: number } {
    // buyPrice available if needed for future calculations
    // const buyPrice = price - (pnl / amount);
    return {
      id: uuidv4(),
      type: 'sell',
      timestamp: timestamp + 1000,
      ethPrice: price,
      ethAmount: amount,
      usdcAmount: price * amount,
      signal: -0.3,
      confidence: 0.7,
      portfolioValue: 1000 + pnl,
      pnl,
    };
  }

  describe('calculateKellyCriterion', () => {
    it('should return null for insufficient trades', () => {
      const trades: Trade[] = [];
      const result = calculateKellyCriterion(trades, { minTrades: 10 });
      expect(result).toBeNull();
    });

    it('should calculate Kelly for winning strategy', () => {
      const trades: Trade[] = [];
      
      // Create 10 winning trades
      for (let i = 0; i < 10; i++) {
        const buy = createBuyTrade(1000, 0.1, i * 1000);
        const sell = createSellTrade(1100, 0.1, 10, i * 1000);
        trades.push(buy, sell as Trade);
      }

      // Manually add P&L to sell trades
      const tradesWithPnl = trades.map((t, idx) => {
        if (t.type === 'sell' && idx % 2 === 1) {
          return { ...t, pnl: 10 };
        }
        return t;
      });

      const result = calculateKellyCriterion(tradesWithPnl as Trade[], { minTrades: 5 });
      
      expect(result).not.toBeNull();
      expect(result!.winRate).toBe(1.0);
      expect(result!.averageWin).toBeGreaterThan(0);
      expect(result!.kellyPercentage).toBeGreaterThan(0);
    });

    it('should calculate Kelly for mixed win/loss strategy', () => {
      const trades: Trade[] = [];
      
      // 6 wins of $10, 4 losses of $5
      // Win rate: 60%, Win/Loss ratio: 10/5 = 2.0
      // Kelly = (0.6 * 2.0 - 0.4) / 2.0 = (1.2 - 0.4) / 2.0 = 0.8 / 2.0 = 0.4
      
      for (let i = 0; i < 6; i++) {
        const buy = createBuyTrade(1000, 0.1, i * 1000);
        const sell = createSellTrade(1100, 0.1, 10, i * 1000);
        trades.push(buy, sell as Trade);
      }
      
      for (let i = 6; i < 10; i++) {
        const buy = createBuyTrade(1000, 0.1, i * 1000);
        const sell = createSellTrade(950, 0.1, -5, i * 1000);
        trades.push(buy, sell as Trade);
      }

      // Manually add P&L
      const tradesWithPnl = trades.map((t, idx) => {
        if (t.type === 'sell') {
          const isWin = idx < 12; // First 6 sells are wins
          return { ...t, pnl: isWin ? 10 : -5 };
        }
        return t;
      });

      const result = calculateKellyCriterion(tradesWithPnl as Trade[], { minTrades: 5 });
      
      expect(result).not.toBeNull();
      expect(result!.winRate).toBeCloseTo(0.6, 1);
      expect(result!.winLossRatio).toBeCloseTo(2.0, 1);
      expect(result!.kellyPercentage).toBeCloseTo(0.4, 1);
      expect(result!.fractionalKelly).toBeCloseTo(0.1, 1); // 0.4 * 0.25 = 0.1
    });

    it('should handle lookback period', () => {
      const trades: Trade[] = [];
      
      // Create 20 trades, but only analyze last 10
      for (let i = 0; i < 20; i++) {
        const buy = createBuyTrade(1000, 0.1, i * 1000);
        const sell = createSellTrade(1100, 0.1, 10, i * 1000);
        trades.push(buy, sell as Trade);
      }

      const tradesWithPnl = trades.map((t, idx) => {
        if (t.type === 'sell' && idx % 2 === 1) {
          return { ...t, pnl: 10 };
        }
        return t;
      });

      const result = calculateKellyCriterion(tradesWithPnl as Trade[], {
        minTrades: 5,
        lookbackPeriod: 10,
      });
      
      expect(result).not.toBeNull();
      expect(result!.tradeCount).toBe(10); // Only last 10 trades
    });

    it('should clamp Kelly percentage to 0-1 range', () => {
      const trades: Trade[] = [];
      
      // Create unrealistic scenario (all wins, huge profits)
      for (let i = 0; i < 10; i++) {
        const buy = createBuyTrade(1000, 0.1, i * 1000);
        const sell = createSellTrade(2000, 0.1, 100, i * 1000);
        trades.push(buy, sell as Trade);
      }

      const tradesWithPnl = trades.map((t, idx) => {
        if (t.type === 'sell' && idx % 2 === 1) {
          return { ...t, pnl: 100 };
        }
        return t;
      });

      const result = calculateKellyCriterion(tradesWithPnl as Trade[], { minTrades: 5 });
      
      expect(result).not.toBeNull();
      expect(result!.kellyPercentage).toBeLessThanOrEqual(1.0);
      expect(result!.kellyPercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateOptimalPositionSize', () => {
    it('should use Kelly result when available', () => {
      const kellyResult: KellyCriterionResult = {
        kellyPercentage: 0.4,
        fractionalKelly: 0.1, // 25% of 0.4
        winRate: 0.6,
        winLossRatio: 2.0,
        averageWin: 10,
        averageLoss: 5,
        tradeCount: 10,
      };

      const positionSize = calculateOptimalPositionSize(1000, kellyResult, 0.9);
      expect(positionSize).toBe(100); // 1000 * 0.1 = 100
    });

    it('should cap at max position percentage', () => {
      const kellyResult: KellyCriterionResult = {
        kellyPercentage: 1.0,
        fractionalKelly: 0.5, // Would suggest 50% of capital
        winRate: 0.8,
        winLossRatio: 5.0,
        averageWin: 50,
        averageLoss: 10,
        tradeCount: 20,
      };

      const positionSize = calculateOptimalPositionSize(1000, kellyResult, 0.3); // Max 30%
      expect(positionSize).toBe(300); // Capped at 30% = 300
    });

    it('should fallback to max position when no Kelly data', () => {
      const positionSize = calculateOptimalPositionSize(1000, null, 0.9);
      expect(positionSize).toBe(900); // 1000 * 0.9 = 900
    });
  });

  describe('getKellyMultiplier', () => {
    it('should return 1.0 when no Kelly data', () => {
      const multiplier = getKellyMultiplier(null, 0.9);
      expect(multiplier).toBe(1.0);
    });

    it('should calculate multiplier correctly', () => {
      const kellyResult: KellyCriterionResult = {
        kellyPercentage: 0.4,
        fractionalKelly: 0.2, // 25% of 0.4 = 0.1, but let's say 0.2
        winRate: 0.6,
        winLossRatio: 2.0,
        averageWin: 10,
        averageLoss: 5,
        tradeCount: 10,
      };

      const multiplier = getKellyMultiplier(kellyResult, 0.9);
      // Kelly suggests 0.2, base is 0.9, so multiplier = 0.2 / 0.9 ≈ 0.22
      expect(multiplier).toBeCloseTo(0.22, 2);
    });

    it('should clamp multiplier to reasonable range', () => {
      const kellyResult: KellyCriterionResult = {
        kellyPercentage: 2.0, // Unrealistic
        fractionalKelly: 1.5, // Would suggest 150% of base
        winRate: 0.9,
        winLossRatio: 10.0,
        averageWin: 100,
        averageLoss: 10,
        tradeCount: 20,
      };

      const multiplier = getKellyMultiplier(kellyResult, 0.9);
      expect(multiplier).toBeLessThanOrEqual(1.5); // Clamped to 1.5
      expect(multiplier).toBeGreaterThanOrEqual(0.1); // Clamped to 0.1
    });
  });
});

