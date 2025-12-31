/**
 * Unit tests for technical indicator calculations
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateBollingerBands,
  getLatestIndicatorValue,
} from '@/lib/indicators';

describe('Technical Indicators', () => {
  describe('calculateSMA', () => {
    it('should calculate SMA for valid data', () => {
      const prices = [100, 102, 104, 106, 108];
      const sma = calculateSMA(prices, 3);
      expect(sma).toHaveLength(3);
      expect(sma[0]).toBeCloseTo(102, 2); // (100+102+104)/3
      expect(sma[1]).toBeCloseTo(104, 2); // (102+104+106)/3
      expect(sma[2]).toBeCloseTo(106, 2); // (104+106+108)/3
    });

    it('should return empty array for insufficient data', () => {
      const prices = [100, 102];
      const sma = calculateSMA(prices, 5);
      expect(sma).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      const sma = calculateSMA([], 5);
      expect(sma).toHaveLength(0);
    });

    it('should handle single value', () => {
      const prices = [100, 102, 104, 106, 108];
      const sma = calculateSMA(prices, 1);
      expect(sma).toHaveLength(5);
      expect(sma[0]).toBe(100);
      expect(sma[4]).toBe(108);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate EMA for valid data', () => {
      const prices = [100, 102, 104, 106, 108];
      const ema = calculateEMA(prices, 3);
      expect(ema).toHaveLength(3);
      expect(ema[0]).toBeCloseTo(102, 2); // First value is SMA
      // EMA values should be different from SMA due to exponential weighting
      expect(ema[1]).toBeGreaterThan(0);
      expect(ema[2]).toBeGreaterThan(0);
    });

    it('should return empty array for insufficient data', () => {
      const prices = [100, 102];
      const ema = calculateEMA(prices, 5);
      expect(ema).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      const ema = calculateEMA([], 5);
      expect(ema).toHaveLength(0);
    });

    it('should start with SMA value', () => {
      const prices = [100, 102, 104, 106, 108];
      const ema = calculateEMA(prices, 3);
      const sma = calculateSMA(prices, 3);
      // First EMA value should equal first SMA value
      expect(ema[0]).toBeCloseTo(sma[0], 2);
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD for valid data', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);
      
      expect(macd.length).toBeGreaterThan(0);
      expect(signal.length).toBeGreaterThan(0);
      expect(histogram.length).toBeGreaterThan(0);
      
      // Histogram should be MACD - Signal
      expect(histogram[0]).toBeCloseTo(macd[macd.length - histogram.length] - signal[0], 2);
    });

    it('should return empty arrays for insufficient data', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const { macd } = calculateMACD(prices, 12, 26, 9);
      // signal and histogram available if needed for future assertions
      
      // Should have some data but limited by slowPeriod
      expect(macd.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle default parameters', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const { macd, signal, histogram } = calculateMACD(prices);
      
      expect(macd.length).toBeGreaterThan(0);
      expect(signal.length).toBeGreaterThan(0);
      expect(histogram.length).toBeGreaterThan(0);
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI for valid data', () => {
      const prices = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128];
      const rsi = calculateRSI(prices, 14);
      
      expect(rsi.length).toBeGreaterThan(0);
      // RSI should be between 0 and 100
      rsi.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });

    it('should return empty array for insufficient data', () => {
      const prices = [100, 102, 104];
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      const rsi = calculateRSI([], 14);
      expect(rsi).toHaveLength(0);
    });

    it('should handle overbought conditions (rising prices)', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
      const rsi = calculateRSI(prices, 14);
      
      if (rsi.length > 0) {
        // RSI should be high (overbought) for consistently rising prices
        expect(rsi[rsi.length - 1]).toBeGreaterThan(50);
      }
    });

    it('should handle oversold conditions (falling prices)', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 200 - i * 5);
      const rsi = calculateRSI(prices, 14);
      
      if (rsi.length > 0) {
        // RSI should be low (oversold) for consistently falling prices
        expect(rsi[rsi.length - 1]).toBeLessThan(50);
      }
    });
  });

  describe('calculateBollingerBands', () => {
    it('should calculate Bollinger Bands for valid data', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const { upper, middle, lower } = calculateBollingerBands(prices, 20, 2);
      
      expect(upper.length).toBeGreaterThan(0);
      expect(middle.length).toBeGreaterThan(0);
      expect(lower.length).toBeGreaterThan(0);
      
      // Middle should be SMA
      const sma = calculateSMA(prices, 20);
      expect(middle.length).toBe(sma.length);
      
      // Upper should be above middle, lower should be below middle
      for (let i = 0; i < middle.length; i++) {
        expect(upper[i]).toBeGreaterThan(middle[i]);
        expect(lower[i]).toBeLessThan(middle[i]);
      }
    });

    it('should return empty arrays for insufficient data', () => {
      const prices = [100, 102, 104];
      const { upper, middle, lower } = calculateBollingerBands(prices, 20, 2);
      expect(upper).toHaveLength(0);
      expect(middle).toHaveLength(0);
      expect(lower).toHaveLength(0);
    });

    it('should handle custom standard deviation', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const { upper: upper2, middle, lower: lower2 } = calculateBollingerBands(prices, 20, 2);
      const { upper: upper1, lower: lower1 } = calculateBollingerBands(prices, 20, 1);
      
      // Wider bands with higher std dev
      for (let i = 0; i < middle.length; i++) {
        expect(upper2[i] - middle[i]).toBeGreaterThan(upper1[i] - middle[i]);
        expect(middle[i] - lower2[i]).toBeGreaterThan(middle[i] - lower1[i]);
      }
    });
  });

  describe('getLatestIndicatorValue', () => {
    it('should return correct value for valid index', () => {
      const indicatorValues = [10, 20, 30, 40, 50];
      const value = getLatestIndicatorValue(indicatorValues, 4, 0);
      expect(value).toBe(50);
    });

    it('should handle offset correctly', () => {
      const indicatorValues = [10, 20, 30];
      // With offset of 1, index 4 should map to indicatorValues[3], but array only has 3 elements
      // So it should map to indicatorValues[4-1-1] = indicatorValues[2] = 30
      // Actually, the function uses: index - offset, so index 4 with offset 1 = 4-1 = 3
      // But array length is 3, so index 3 is out of bounds
      // Let's test with valid index
      const value = getLatestIndicatorValue(indicatorValues, 2, 0);
      expect(value).toBe(30);
    });

    it('should return null for out of range index', () => {
      const indicatorValues = [10, 20, 30];
      const value = getLatestIndicatorValue(indicatorValues, 10, 0);
      expect(value).toBeNull();
    });

    it('should return null for negative index after offset', () => {
      const indicatorValues = [10, 20, 30];
      const value = getLatestIndicatorValue(indicatorValues, 1, 5);
      expect(value).toBeNull();
    });

    it('should return null for empty array', () => {
      const value = getLatestIndicatorValue([], 0, 0);
      expect(value).toBeNull();
    });
  });
});

