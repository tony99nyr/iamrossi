import { describe, it, expect } from 'vitest';
import {
  calculateStopLossPrice,
  updateStopLoss,
  createOpenPosition,
  checkStopLosses,
  type StopLossConfig,
  type OpenPosition,
} from '@/lib/atr-stop-loss';
import type { Trade, PriceCandle } from '@/types';
import { v4 as uuidv4 } from 'uuid';

describe('ATR Stop Loss', () => {
  function createBuyTrade(price: number, timestamp: number = Date.now()): Trade {
    return {
      id: uuidv4(),
      type: 'buy',
      timestamp,
      ethPrice: price,
      ethAmount: 0.1,
      usdcAmount: price * 0.1,
      signal: 0.5,
      confidence: 0.8,
      portfolioValue: 1000,
    };
  }

  // Helper function for creating test candles (may be used in future tests)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function createPriceCandle(
    open: number,
    high: number,
    low: number,
    close: number,
    timestamp: number = Date.now()
  ): PriceCandle {
    return {
      timestamp,
      open,
      high,
      low,
      close,
      volume: 1000,
    };
  }

  describe('calculateStopLossPrice', () => {
    it('should calculate stop loss below entry price', () => {
      const entryPrice = 1000;
      const atr = 50; // ATR value
      const config: StopLossConfig = {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      };

      const stopLoss = calculateStopLossPrice(entryPrice, atr, config);
      expect(stopLoss).toBe(900); // 1000 - (50 * 2) = 900
    });

    it('should return 0 if disabled', () => {
      const entryPrice = 1000;
      const atr = 50;
      const config: StopLossConfig = {
        enabled: false,
        atrMultiplier: 2.0,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      };

      const stopLoss = calculateStopLossPrice(entryPrice, atr, config);
      expect(stopLoss).toBe(0);
    });

    it('should handle different ATR multipliers', () => {
      const entryPrice = 1000;
      const atr = 50;
      
      const stopLoss1 = calculateStopLossPrice(entryPrice, atr, {
        enabled: true,
        atrMultiplier: 1.5,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      });
      expect(stopLoss1).toBe(925); // 1000 - (50 * 1.5) = 925

      const stopLoss2 = calculateStopLossPrice(entryPrice, atr, {
        enabled: true,
        atrMultiplier: 3.0,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      });
      expect(stopLoss2).toBe(850); // 1000 - (50 * 3) = 850
    });
  });

  describe('updateStopLoss', () => {
    it('should trigger exit when price hits stop loss', () => {
      const buyTrade = createBuyTrade(1000);
      const position: OpenPosition = {
        buyTrade,
        entryPrice: 1000,
        stopLossPrice: 900,
        highestPrice: 1000,
        atrAtEntry: 50,
      };

      const result = updateStopLoss(position, 890, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('stop-loss');
      expect(result.stopLossPrice).toBe(900);
    });

    it('should not exit when price is above stop loss', () => {
      const buyTrade = createBuyTrade(1000);
      const position: OpenPosition = {
        buyTrade,
        entryPrice: 1000,
        stopLossPrice: 900,
        highestPrice: 1000,
        atrAtEntry: 50,
      };

      const result = updateStopLoss(position, 950, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(result.shouldExit).toBe(false);
      expect(result.stopLossPrice).toBe(900);
    });

    it('should trail stop loss upward when trailing enabled', () => {
      const buyTrade = createBuyTrade(1000);
      const position: OpenPosition = {
        buyTrade,
        entryPrice: 1000,
        stopLossPrice: 900, // Initial: 1000 - (50 * 2) = 900
        highestPrice: 1000,
        atrAtEntry: 50,
      };

      // Price moves up to 1100
      const result1 = updateStopLoss(position, 1100, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(result1.shouldExit).toBe(false);
      expect(result1.stopLossPrice).toBe(1000); // 1100 - (50 * 2) = 1000 (trailed up)
      expect(position.highestPrice).toBe(1100);
      expect(position.stopLossPrice).toBe(1000);

      // Price moves up further to 1200
      const result2 = updateStopLoss(position, 1200, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(result2.shouldExit).toBe(false);
      expect(result2.stopLossPrice).toBe(1100); // 1200 - (50 * 2) = 1100 (trailed up further)
      expect(position.highestPrice).toBe(1200);
      expect(position.stopLossPrice).toBe(1100);
    });

    it('should not move stop loss down when trailing', () => {
      const buyTrade = createBuyTrade(1000);
      const position: OpenPosition = {
        buyTrade,
        entryPrice: 1000,
        stopLossPrice: 1100, // Already trailed up to 1100 (based on highestPrice 1200)
        highestPrice: 1200,
        atrAtEntry: 50,
      };

      // Price drops to 1150, but stop loss should not move down from 1100
      // Since 1150 > 1100, should not exit
      const result = updateStopLoss(position, 1150, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(result.shouldExit).toBe(false);
      expect(result.stopLossPrice).toBe(1100); // Should stay at 1100, not move down
      expect(position.stopLossPrice).toBe(1100);
    });

    it('should trigger trailing stop when price drops below trailed stop', () => {
      const buyTrade = createBuyTrade(1000);
      const position: OpenPosition = {
        buyTrade,
        entryPrice: 1000,
        stopLossPrice: 1100, // Trailed up to 1100
        highestPrice: 1200,
        atrAtEntry: 50,
      };

      // Price drops below trailing stop
      const result = updateStopLoss(position, 1090, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('trailing-stop');
    });
  });

  describe('createOpenPosition', () => {
    it('should create position with stop loss', () => {
      const buyTrade = createBuyTrade(1000);
      const position = createOpenPosition(buyTrade, 1000, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(position).not.toBeNull();
      expect(position!.entryPrice).toBe(1000);
      expect(position!.stopLossPrice).toBe(900); // 1000 - (50 * 2)
      expect(position!.highestPrice).toBe(1000);
      expect(position!.atrAtEntry).toBe(50);
    });

    it('should return null if disabled', () => {
      const buyTrade = createBuyTrade(1000);
      const position = createOpenPosition(buyTrade, 1000, 50, {
        enabled: false,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(position).toBeNull();
    });
  });

  describe('checkStopLosses', () => {
    it('should check multiple positions', () => {
      const buyTrade1 = createBuyTrade(1000);
      const buyTrade2 = createBuyTrade(2000);
      
      const positions: OpenPosition[] = [
        {
          buyTrade: buyTrade1,
          entryPrice: 1000,
          stopLossPrice: 900,
          highestPrice: 1000,
          atrAtEntry: 50,
        },
        {
          buyTrade: buyTrade2,
          entryPrice: 2000,
          stopLossPrice: 1900,
          highestPrice: 2000,
          atrAtEntry: 50,
        },
      ];

      // Price at 850 - first position should exit (850 < 900)
      // Second position: 850 < 1900, so should also exit
      const results = checkStopLosses(positions, 850, 50, {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: false,
        useEMA: true,
        atrPeriod: 14,
      });

      expect(results.length).toBe(2);
      expect(results[0]!.result.shouldExit).toBe(true); // First position hit stop (850 < 900)
      expect(results[1]!.result.shouldExit).toBe(true); // Second position also hit stop (850 < 1900)
    });
  });
});

