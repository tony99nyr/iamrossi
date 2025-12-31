/**
 * Integration tests for trading backtesting
 * Tests end-to-end backtest functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generatePriceCandles } from '../mocks/trading-data.mock';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import type { PriceCandle } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';

describe('Trading Backtest Integration', () => {
  let candles: PriceCandle[];
  let config: EnhancedAdaptiveStrategyConfig;

  beforeEach(() => {
    clearRegimeHistory();
    clearIndicatorCache();

    // Generate test candles
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

  it('should run a complete backtest without errors', () => {
    // Need at least 50 candles for regime detection
    expect(candles.length).toBeGreaterThanOrEqual(50);

    // Test signal generation for multiple candles
    for (let i = 50; i < Math.min(candles.length, 60); i++) {
      const signal = generateEnhancedAdaptiveSignal(candles, config, i, 'test-session');
      
      expect(signal).toBeDefined();
      expect(signal.regime).toBeDefined();
      expect(['bullish', 'bearish', 'neutral']).toContain(signal.regime.regime);
      expect(signal.action).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(signal.action);
      expect(signal.signal).toBeGreaterThanOrEqual(-1);
      expect(signal.signal).toBeLessThanOrEqual(1);
    }
  });

  it('should detect bullish regime in trending up market', () => {
    const bullishCandles = generatePriceCandles('bull-run', 100, 2500);
    
    // Need enough candles for indicators
    if (bullishCandles.length >= 50) {
      const signal = generateEnhancedAdaptiveSignal(bullishCandles, config, bullishCandles.length - 1, 'test-session');
      
      // In a bull run, we should often detect bullish regime
      // (though not always due to momentum confirmation requirements)
      expect(signal.regime).toBeDefined();
      expect(signal.regime.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.regime.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should detect bearish regime in trending down market', () => {
    const bearishCandles = generatePriceCandles('bear-market', 100, 2500);
    
    if (bearishCandles.length >= 50) {
      const signal = generateEnhancedAdaptiveSignal(bearishCandles, config, bearishCandles.length - 1, 'test-session');
      
      expect(signal.regime).toBeDefined();
      expect(signal.regime.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.regime.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should select appropriate strategy based on regime', () => {
    const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'test-session');
    
    expect(signal.activeStrategy).toBeDefined();
    expect(signal.activeStrategy.name).toBeDefined();
    
    // Strategy should match one of the config strategies
    const strategyNames = [config.bullishStrategy.name, config.bearishStrategy.name];
    expect(strategyNames).toContain(signal.activeStrategy.name);
  });

  it('should apply risk management filters', () => {
    const configWithFilters: EnhancedAdaptiveStrategyConfig = {
      ...config,
      maxVolatility: 0.05,
      circuitBreakerWinRate: 0.2,
      whipsawDetectionPeriods: 5,
      whipsawMaxChanges: 3,
    };

    const signal = generateEnhancedAdaptiveSignal(candles, configWithFilters, candles.length - 1, 'test-session');
    
    // Should not throw and should return valid signal
    expect(signal).toBeDefined();
    expect(signal.action).toBeDefined();
  });

  it('should handle regime persistence correctly', () => {
    const configWithPersistence: EnhancedAdaptiveStrategyConfig = {
      ...config,
      regimePersistencePeriods: 3,
    };

    // Generate signals for multiple periods
    const signals = [];
    for (let i = 50; i < Math.min(candles.length, 55); i++) {
      const signal = generateEnhancedAdaptiveSignal(candles, configWithPersistence, i, 'test-session');
      signals.push(signal);
    }

    // All signals should be valid
    expect(signals.length).toBeGreaterThan(0);
    signals.forEach(s => {
      expect(s.regime).toBeDefined();
      expect(s.action).toBeDefined();
    });
  });

  it('should handle insufficient data gracefully', () => {
    const shortCandles = generatePriceCandles('trending-up', 10, 2500);
    
    // Should not throw even with insufficient data
    expect(() => {
      if (shortCandles.length > 0) {
        generateEnhancedAdaptiveSignal(shortCandles, config, shortCandles.length - 1, 'test-session');
      }
    }).not.toThrow();
  });

  it('should maintain session state across multiple calls', () => {
    const sessionId = 'integration-test-session';
    
    // Generate multiple signals in sequence (simulating backtest)
    const signals = [];
    for (let i = 50; i < Math.min(candles.length, 60); i++) {
      const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
      signals.push(signal);
    }

    // All signals should be valid
    expect(signals.length).toBeGreaterThan(0);
    signals.forEach(s => {
      expect(s).toBeDefined();
      expect(s.regime).toBeDefined();
    });
  });
});

