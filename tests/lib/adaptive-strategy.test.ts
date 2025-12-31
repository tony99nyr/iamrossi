/**
 * Unit tests for adaptive strategy logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { generatePriceCandles } from '../mocks/trading-data.mock';
import type { PriceCandle } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';

describe('Adaptive Strategy', () => {
  let candles: PriceCandle[];
  let config: EnhancedAdaptiveStrategyConfig;

  beforeEach(() => {
    clearRegimeHistory();
    clearIndicatorCache();

    candles = generatePriceCandles('trending-up', 100, 2500);

    config = {
      bullishStrategy: {
        name: 'Test Bullish',
        timeframe: '1d',
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.3,
        sellThreshold: -0.3,
        maxPositionPct: 0.75,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Test Bearish',
        timeframe: '1d',
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.8,
        sellThreshold: -0.2,
        maxPositionPct: 0.2,
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.2,
      momentumConfirmationThreshold: 0.25,
      regimePersistencePeriods: 2,
      dynamicPositionSizing: false,
      maxBullishPosition: 0.75,
    };
  });

  describe('generateEnhancedAdaptiveSignal', () => {
    it('should generate signal with regime information', () => {
      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'test-session');
        
        expect(signal).toBeDefined();
        expect(signal.regime).toBeDefined();
        expect(signal.regime.regime).toBeDefined();
        expect(['bullish', 'bearish', 'neutral']).toContain(signal.regime.regime);
        expect(signal.regime.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.regime.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should select appropriate strategy based on regime', () => {
      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'test-session');
        
        expect(signal.activeStrategy).toBeDefined();
        expect(signal.activeStrategy.name).toBeDefined();
        
        // Strategy should match one of the config strategies
        const strategyNames = [config.bullishStrategy.name, config.bearishStrategy.name];
        expect(strategyNames).toContain(signal.activeStrategy.name);
      }
    });

    it('should apply regime persistence filter', () => {
      const configWithPersistence: EnhancedAdaptiveStrategyConfig = {
        ...config,
        regimePersistencePeriods: 3,
      };

      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, configWithPersistence, candles.length - 1, 'test-session');
        
        expect(signal).toBeDefined();
        expect(signal.regime).toBeDefined();
      }
    });

    it('should check momentum confirmation for bullish regimes', () => {
      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'test-session');
        
        expect(signal.momentumConfirmed).toBeDefined();
        expect(typeof signal.momentumConfirmed).toBe('boolean');
      }
    });

    it('should calculate position size multiplier', () => {
      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'test-session');
        
        expect(signal.positionSizeMultiplier).toBeDefined();
        expect(signal.positionSizeMultiplier).toBeGreaterThanOrEqual(0);
        expect(signal.positionSizeMultiplier).toBeLessThanOrEqual(2);
      }
    });

    it('should handle risk management filters', () => {
      const configWithFilters: EnhancedAdaptiveStrategyConfig = {
        ...config,
        maxVolatility: 0.05,
        circuitBreakerWinRate: 0.2,
        whipsawDetectionPeriods: 5,
        whipsawMaxChanges: 3,
      };

      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, configWithFilters, candles.length - 1, 'test-session');
        
        expect(signal).toBeDefined();
        expect(signal.action).toBeDefined();
      }
    });

    it('should use fixed position sizing when dynamicPositionSizing is false', () => {
      const configFixed: EnhancedAdaptiveStrategyConfig = {
        ...config,
        dynamicPositionSizing: false,
        maxBullishPosition: 0.75,
      };

      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, configFixed, candles.length - 1, 'test-session');
        
        expect(signal.positionSizeMultiplier).toBeDefined();
        // With fixed sizing, multiplier should be 1.0
        expect(signal.positionSizeMultiplier).toBe(1.0);
      }
    });

    it('should handle different regime confidence thresholds', () => {
      const configHighConfidence: EnhancedAdaptiveStrategyConfig = {
        ...config,
        regimeConfidenceThreshold: 0.5,
      };

      if (candles.length >= 50) {
        const signal = generateEnhancedAdaptiveSignal(candles, configHighConfidence, candles.length - 1, 'test-session');
        
        expect(signal).toBeDefined();
        // With high threshold, may fall back to bearish/neutral more often
        expect(signal.activeStrategy).toBeDefined();
      }
    });

    it('should maintain session state across calls', () => {
      const sessionId = 'test-session-state';
      
      if (candles.length >= 60) {
        // Generate multiple signals in sequence
        const signals = [];
        for (let i = 50; i < 60; i++) {
          const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
          signals.push(signal);
        }

        // All signals should be valid
        expect(signals.length).toBe(10);
        signals.forEach(s => {
          expect(s).toBeDefined();
          expect(s.regime).toBeDefined();
          expect(s.activeStrategy).toBeDefined();
        });
      }
    });

    it('should handle insufficient data gracefully', () => {
      const shortCandles = generatePriceCandles('trending-up', 10, 2500);
      
      expect(() => {
        if (shortCandles.length > 0) {
          generateEnhancedAdaptiveSignal(shortCandles, config, shortCandles.length - 1, 'test-session');
        }
      }).not.toThrow();
    });
  });
});

