/**
 * Unit tests for trading signal generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateSignal } from '@/lib/trading-signals';
import type { PriceCandle, TradingConfig } from '@/types';
import { generatePriceCandles } from '../mocks/trading-data.mock';

describe('Trading Signals', () => {
  let candles: PriceCandle[];
  let config: TradingConfig;

  beforeEach(() => {
    // Generate test candles
    candles = generatePriceCandles('trending-up', 50, 2500);
    config = {
      name: 'Test Strategy',
      timeframe: '1d',
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.4,
      sellThreshold: -0.3,
      maxPositionPct: 0.75,
      initialCapital: 1000,
    };
  });

  describe('generateSignal', () => {
    it('should generate buy signal when signal exceeds buy threshold', () => {
      // Create config with very low buy threshold to trigger buy
      const buyConfig: TradingConfig = {
        ...config,
        buyThreshold: 0.1,
        indicators: [
          { type: 'sma', weight: 1.0, params: { period: 5 } }, // Short period for faster signal
        ],
      };

      const signal = generateSignal(candles, buyConfig, candles.length - 1);
      expect(signal.action).toBe('buy');
      expect(signal.signal).toBeGreaterThan(buyConfig.buyThreshold);
      expect(signal.confidence).toBeGreaterThan(0);
    });

    it('should generate sell signal when signal below sell threshold', () => {
      // Create falling price candles
      const fallingCandles = generatePriceCandles('trending-down', 50, 2500);
      const sellConfig: TradingConfig = {
        ...config,
        sellThreshold: -0.1,
        indicators: [
          { type: 'sma', weight: 1.0, params: { period: 5 } },
        ],
      };

      const signal = generateSignal(fallingCandles, sellConfig, fallingCandles.length - 1);
      expect(signal.action).toBe('sell');
      expect(signal.signal).toBeLessThan(sellConfig.sellThreshold);
    });

    it('should generate hold signal when signal between thresholds', () => {
      // Create sideways candles
      const sidewaysCandles = generatePriceCandles('sideways', 50, 2500);
      const holdConfig: TradingConfig = {
        ...config,
        buyThreshold: 0.5,
        sellThreshold: -0.5,
      };

      const signal = generateSignal(sidewaysCandles, holdConfig, sidewaysCandles.length - 1);
      expect(signal.action).toBe('hold');
      expect(signal.signal).toBeGreaterThan(holdConfig.sellThreshold);
      expect(signal.signal).toBeLessThan(holdConfig.buyThreshold);
    });

    it('should calculate weighted signal from multiple indicators', () => {
      const multiIndicatorConfig: TradingConfig = {
        ...config,
        indicators: [
          { type: 'sma', weight: 0.3, params: { period: 20 } },
          { type: 'ema', weight: 0.3, params: { period: 12 } },
          { type: 'rsi', weight: 0.4, params: { period: 14 } },
        ],
      };

      const signal = generateSignal(candles, multiIndicatorConfig, candles.length - 1);
      expect(signal.indicators).toBeDefined();
      expect(Object.keys(signal.indicators).length).toBe(3);
    });

    it('should handle empty indicators array', () => {
      const emptyConfig: TradingConfig = {
        ...config,
        indicators: [],
      };

      const signal = generateSignal(candles, emptyConfig, candles.length - 1);
      expect(signal.signal).toBe(0);
      expect(signal.action).toBe('hold');
    });

    it('should handle insufficient data gracefully', () => {
      const shortCandles = generatePriceCandles('trending-up', 5, 2500);
      const signal = generateSignal(shortCandles, config, shortCandles.length - 1);
      // Should not throw, but may return neutral signal
      expect(signal).toBeDefined();
    });

    it('should include all indicator signals in output', () => {
      const signal = generateSignal(candles, config, candles.length - 1);
      expect(signal.indicators).toBeDefined();
      expect(typeof signal.indicators).toBe('object');
    });

    it('should calculate confidence as absolute signal value', () => {
      const signal = generateSignal(candles, config, candles.length - 1);
      expect(signal.confidence).toBe(Math.abs(signal.signal));
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle different indicator types', () => {
      const macdConfig: TradingConfig = {
        ...config,
        indicators: [
          { type: 'macd', weight: 1.0, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
        ],
      };

      const signal = generateSignal(candles, macdConfig, candles.length - 1);
      expect(signal).toBeDefined();
      expect(signal.action).toBeDefined();
    });

    it('should handle RSI indicator', () => {
      const rsiConfig: TradingConfig = {
        ...config,
        indicators: [
          { type: 'rsi', weight: 1.0, params: { period: 14 } },
        ],
      };

      const signal = generateSignal(candles, rsiConfig, candles.length - 1);
      expect(signal).toBeDefined();
      expect(signal.action).toBeDefined();
    });
  });
});

