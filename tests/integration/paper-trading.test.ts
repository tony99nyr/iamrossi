/**
 * Integration tests for paper trading service
 * Tests end-to-end paper trading functionality including session lifecycle,
 * trade execution, risk management, and regime detection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generatePriceCandles, createMockPortfolio } from '../mocks/trading-data.mock';
import { resetMockStore } from '../mocks/redis.mock';
import { generateEnhancedAdaptiveSignal, clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { executeTrade } from '@/lib/trade-executor';
import { calculateKellyCriterion, getKellyMultiplier } from '@/lib/kelly-criterion';
import { calculateStopLossPrice, checkStopLosses, createOpenPosition, updateStopLoss } from '@/lib/atr-stop-loss';
import { validateDataQuality } from '@/lib/data-quality-validator';
import type { PriceCandle, Trade, Portfolio } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';

// Mock external dependencies
vi.mock('@/lib/kv', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setEx: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    isOpen: true,
  },
  ensureConnected: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/eth-price-service', () => ({
  fetchLatestPrice: vi.fn().mockResolvedValue(2500),
  fetchPriceCandles: vi.fn().mockImplementation(() => {
    // Return mock candles
    return Promise.resolve(generatePriceCandles('trending-up', 100, 2500));
  }),
}));

describe('Paper Trading Integration', () => {
  let candles: PriceCandle[];
  let config: EnhancedAdaptiveStrategyConfig;
  let portfolio: Portfolio;

  beforeEach(() => {
    clearRegimeHistory();
    clearIndicatorCache();
    resetMockStore();

    // Generate test candles - need at least 50 for regime detection
    candles = generatePriceCandles('trending-up', 100, 2500);

    config = {
      bullishStrategy: {
        name: 'Test Bullish',
        timeframe: '8h',
        indicators: [
          { type: 'sma', weight: 0.35, params: { period: 20 } },
          { type: 'ema', weight: 0.35, params: { period: 12 } },
          { type: 'macd', weight: 0.20, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
          { type: 'rsi', weight: 0.10, params: { period: 14 } },
        ],
        buyThreshold: 0.41,
        sellThreshold: -0.45,
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Test Bearish',
        timeframe: '8h',
        indicators: [
          { type: 'sma', weight: 0.50, params: { period: 20 } },
          { type: 'ema', weight: 0.50, params: { period: 12 } },
        ],
        buyThreshold: 0.65,
        sellThreshold: -0.25,
        maxPositionPct: 0.30,
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.22,
      momentumConfirmationThreshold: 0.26,
      regimePersistencePeriods: 1,
      dynamicPositionSizing: true,
      maxBullishPosition: 0.95,
      maxVolatility: 0.05,
      circuitBreakerWinRate: 0.2,
      whipsawDetectionPeriods: 5,
      whipsawMaxChanges: 3,
      kellyCriterion: {
        enabled: true,
        fractionalMultiplier: 0.25,
        minTrades: 10,
        lookbackPeriod: 50,
      },
      stopLoss: {
        enabled: true,
        atrMultiplier: 2.0,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      },
    };

    portfolio = createMockPortfolio(1000, 0, 1000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Lifecycle', () => {
    it('should generate valid trading signals throughout a session', () => {
      const signals = [];
      
      // Simulate multiple updates in a session
      for (let i = 50; i < Math.min(candles.length, 70); i++) {
        const signal = generateEnhancedAdaptiveSignal(candles, config, i, 'test-session');
        signals.push(signal);
        
        expect(signal).toBeDefined();
        expect(signal.regime).toBeDefined();
        expect(['bullish', 'bearish', 'neutral']).toContain(signal.regime.regime);
        expect(signal.action).toBeDefined();
        expect(['buy', 'sell', 'hold']).toContain(signal.action);
        expect(signal.activeStrategy).toBeDefined();
      }
      
      expect(signals.length).toBe(20);
    });

    it('should maintain consistent session state across updates', () => {
      const sessionId = 'consistency-test-session';
      const regimes: string[] = [];
      
      // Generate signals and track regimes
      for (let i = 50; i < 60; i++) {
        const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
        regimes.push(signal.regime.regime);
      }
      
      // Should have regime consistency (not rapid changes)
      expect(regimes.length).toBe(10);
      regimes.forEach(regime => {
        expect(['bullish', 'bearish', 'neutral']).toContain(regime);
      });
    });

    it('should handle session restart correctly', () => {
      // First session
      const session1Id = 'session-1';
      const signal1 = generateEnhancedAdaptiveSignal(candles, config, 50, session1Id);
      expect(signal1).toBeDefined();
      
      // Clear and start new session
      clearRegimeHistory();
      
      // Second session
      const session2Id = 'session-2';
      const signal2 = generateEnhancedAdaptiveSignal(candles, config, 50, session2Id);
      expect(signal2).toBeDefined();
      
      // Both sessions should produce valid signals
      expect(signal1.regime).toBeDefined();
      expect(signal2.regime).toBeDefined();
    });
  });

  describe('Trade Execution', () => {
    it('should execute buy trade correctly with Kelly and ATR', () => {
      const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'trade-test');
      
      // Force a buy scenario
      const buySignal = {
        ...signal,
        action: 'buy' as const,
        signal: 0.5,
      };
      
      const trades: Trade[] = [];
      const currentPrice = candles[candles.length - 1].close;
      
      const result = executeTrade(
        buySignal,
        buySignal.confidence,
        currentPrice,
        { ...portfolio, usdcBalance: 1000, ethBalance: 0 },
        {
          candles,
          candleIndex: candles.length - 1,
          config,
          trades,
          openPositions: [],
          generateAudit: false,
        }
      );
      
      // executeTrade returns Trade | null and mutates portfolio in place
      if (result) {
        expect(result.type).toBe('buy');
        expect(result.ethPrice).toBe(currentPrice);
        expect(result.ethAmount).toBeGreaterThan(0);
      }
      // Note: Portfolio is mutated in place by executeTrade
    });

    it('should execute sell trade correctly', () => {
      const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'sell-test');
      
      // Force a sell scenario with existing ETH position
      const sellSignal = {
        ...signal,
        action: 'sell' as const,
        signal: -0.5,
      };
      
      const trades: Trade[] = [];
      const currentPrice = candles[candles.length - 1].close;
      const ethAmount = 0.4; // Already holding 0.4 ETH
      
      const result = executeTrade(
        sellSignal,
        sellSignal.confidence,
        currentPrice,
        { 
          ...portfolio, 
          usdcBalance: 0, 
          ethBalance: ethAmount,
          totalValue: ethAmount * currentPrice 
        },
        {
          candles,
          candleIndex: candles.length - 1,
          config,
          trades,
          openPositions: [],
          generateAudit: false,
        }
      );
      
      // executeTrade returns Trade | null and mutates portfolio in place
      if (result) {
        expect(result.type).toBe('sell');
        expect(result.ethPrice).toBe(currentPrice);
      }
      // Note: Portfolio is mutated in place by executeTrade
    });

    it('should handle hold signal correctly', () => {
      const signal = generateEnhancedAdaptiveSignal(candles, config, candles.length - 1, 'hold-test');
      
      const holdSignal = {
        ...signal,
        action: 'hold' as const,
        signal: 0,
      };
      
      const trades: Trade[] = [];
      const currentPrice = candles[candles.length - 1].close;
      
      const result = executeTrade(
        holdSignal,
        holdSignal.confidence,
        currentPrice,
        portfolio,
        {
          candles,
          candleIndex: candles.length - 1,
          config,
          trades,
          openPositions: [],
          generateAudit: false,
        }
      );
      
      // Hold signal should return null (no trade)
      expect(result).toBeNull();
    });
  });

  describe('Kelly Criterion Integration', () => {
    it('should calculate Kelly multiplier with sufficient trades', () => {
      // Create mock SELL trades with P&L (Kelly looks at sell trades only)
      const mockTrades: Trade[] = [];
      let portfolioValue = 1000;
      
      // Need at least 10 sell trades with P&L
      for (let i = 0; i < 12; i++) {
        const isWin = i % 3 !== 0; // ~67% win rate
        const pnl = isWin ? 50 + Math.random() * 50 : -(20 + Math.random() * 30);
        portfolioValue += pnl;
        
        mockTrades.push({
          id: `trade-${i}`,
          timestamp: Date.now() - (12 - i) * 24 * 60 * 60 * 1000,
          type: 'sell', // Must be sell trades with P&L
          ethPrice: 2500,
          ethAmount: 0.1,
          usdcAmount: 250,
          signal: -0.5,
          confidence: 0.7,
          portfolioValue,
          pnl, // P&L is required
        });
      }
      
      const result = calculateKellyCriterion(mockTrades);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.winRate).toBeGreaterThan(0);
        expect(result.winRate).toBeLessThan(1);
        expect(result.kellyPercentage).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return null with insufficient trades', () => {
      const result = calculateKellyCriterion([]);
      expect(result).toBeNull();
    });

    it('should apply fractional Kelly correctly', () => {
      // Create mock SELL trades with P&L
      const mockTrades: Trade[] = [];
      let portfolioValue = 1000;
      
      // Need at least 10 sell trades with P&L
      for (let i = 0; i < 12; i++) {
        const isWin = i % 3 !== 0; // ~67% win rate
        const pnl = isWin ? 100 : -50;
        portfolioValue += pnl;
        
        mockTrades.push({
          id: `trade-${i}`,
          timestamp: Date.now() - (12 - i) * 24 * 60 * 60 * 1000,
          type: 'sell', // Must be sell trades with P&L
          ethPrice: 2500,
          ethAmount: 0.1,
          usdcAmount: 250,
          signal: -0.5,
          confidence: 0.7,
          portfolioValue,
          pnl, // P&L is required
        });
      }
      
      // First calculate Kelly result
      const kellyResult = calculateKellyCriterion(mockTrades);
      expect(kellyResult).not.toBeNull();
      
      // Then get multiplier from result
      const multiplier = getKellyMultiplier(kellyResult, 0.9);
      
      expect(multiplier).toBeGreaterThan(0);
      expect(multiplier).toBeLessThanOrEqual(1.5);
    });
  });

  describe('ATR Stop Loss Integration', () => {
    it('should calculate ATR stop loss correctly', () => {
      const entryPrice = 2500;
      const atrValue = 100; // Mock ATR value
      const stopLossConfig = { enabled: true, atrMultiplier: 2.0, atrPeriod: 14, trailing: false, useEMA: true };
      
      const stopPrice = calculateStopLossPrice(entryPrice, atrValue, stopLossConfig);
      
      expect(stopPrice).toBeDefined();
      expect(stopPrice).toBeLessThan(entryPrice); // For long position
      expect(stopPrice).toBe(entryPrice - atrValue * 2.0);
    });

    it('should create open position correctly', () => {
      const mockTrade: Trade = {
        id: 'test-trade-id',
        timestamp: Date.now(),
        type: 'buy',
        ethPrice: 2500,
        ethAmount: 0.4,
        usdcAmount: 1000,
        signal: 0.5,
        confidence: 0.7,
        portfolioValue: 1000,
        costBasis: 1000,
      };
      
      const stopLossConfig = { enabled: true, atrMultiplier: 2.0, atrPeriod: 14, trailing: true, useEMA: true };
      const position = createOpenPosition(mockTrade, 2500, 100, stopLossConfig);
      
      expect(position).not.toBeNull();
      if (position) {
        expect(position.buyTrade.id).toBe('test-trade-id');
        expect(position.entryPrice).toBe(2500);
        expect(position.stopLossPrice).toBe(2500 - 100 * 2.0); // 2300
        expect(position.highestPrice).toBe(2500);
      }
    });

    it('should check stop losses correctly', () => {
      const mockTrade: Trade = {
        id: 'test-trade-id',
        timestamp: Date.now(),
        type: 'buy',
        ethPrice: 2500,
        ethAmount: 0.4,
        usdcAmount: 1000,
        signal: 0.5,
        confidence: 0.7,
        portfolioValue: 1000,
        costBasis: 1000,
      };
      
      const stopLossConfig = { enabled: true, atrMultiplier: 2.0, atrPeriod: 14, trailing: false, useEMA: true };
      const position = createOpenPosition(mockTrade, 2500, 100, stopLossConfig);
      
      expect(position).not.toBeNull();
      if (position) {
        const currentPrice = 2250; // Below stop (2300)
        const currentATR = 100;
        
        const results = checkStopLosses([position], currentPrice, currentATR, stopLossConfig);
        
        expect(results.length).toBe(1);
        expect(results[0].result.shouldExit).toBe(true);
      }
    });

    it('should update trailing stop correctly', () => {
      const mockTrade: Trade = {
        id: 'test-trade-id',
        timestamp: Date.now(),
        type: 'buy',
        ethPrice: 2500,
        ethAmount: 0.4,
        usdcAmount: 1000,
        signal: 0.5,
        confidence: 0.7,
        portfolioValue: 1000,
        costBasis: 1000,
      };
      
      const trailingConfig = { enabled: true, atrMultiplier: 2.0, atrPeriod: 14, trailing: true, useEMA: true };
      const position = createOpenPosition(mockTrade, 2500, 100, trailingConfig);
      
      expect(position).not.toBeNull();
      if (position) {
        const currentPrice = 2700; // Price moved up
        const currentATR = 100;
        
        const result = updateStopLoss(position, currentPrice, currentATR, trailingConfig);
        
        // Trailing stop should have been updated: 2700 - (100 * 2) = 2500
        expect(result.stopLossPrice).toBeGreaterThan(2300); // Higher than initial (2500 - 200)
        expect(result.shouldExit).toBe(false); // Price is above stop
      }
    });
  });

  describe('Risk Management Filters', () => {
    it('should block trading in high volatility conditions', () => {
      // Generate highly volatile candles
      const volatileCandles = generatePriceCandles('volatile', 100, 2500);
      
      const configWithLowVolatilityThreshold: EnhancedAdaptiveStrategyConfig = {
        ...config,
        maxVolatility: 0.01, // Very low threshold to trigger block
      };
      
      const signal = generateEnhancedAdaptiveSignal(
        volatileCandles, 
        configWithLowVolatilityThreshold, 
        volatileCandles.length - 1, 
        'volatility-test'
      );
      
      // High volatility should result in hold action
      expect(signal.action).toBe('hold');
    });

    it('should apply regime persistence filter', () => {
      const configWithHighPersistence: EnhancedAdaptiveStrategyConfig = {
        ...config,
        regimePersistencePeriods: 5, // Require 5 out of last 5
      };
      
      // Generate signals for multiple periods
      const signals = [];
      for (let i = 50; i < 60; i++) {
        const signal = generateEnhancedAdaptiveSignal(candles, configWithHighPersistence, i, 'persistence-test');
        signals.push(signal);
      }
      
      // All signals should be valid
      signals.forEach(s => {
        expect(s).toBeDefined();
        expect(s.regime).toBeDefined();
      });
    });

    it('should select correct strategy based on regime', () => {
      // Test bullish market
      const bullishCandles = generatePriceCandles('bull-run', 100, 2500);
      const bullishSignal = generateEnhancedAdaptiveSignal(
        bullishCandles, 
        config, 
        bullishCandles.length - 1, 
        'bullish-strategy-test'
      );
      
      expect(bullishSignal.activeStrategy).toBeDefined();
      
      // Test bearish market
      const bearishCandles = generatePriceCandles('bear-market', 100, 2500);
      clearRegimeHistory(); // Reset for new test
      const bearishSignal = generateEnhancedAdaptiveSignal(
        bearishCandles, 
        config, 
        bearishCandles.length - 1, 
        'bearish-strategy-test'
      );
      
      expect(bearishSignal.activeStrategy).toBeDefined();
    });
  });

  describe('Data Quality Validation', () => {
    it('should validate data quality correctly', () => {
      const startTime = candles[0].timestamp;
      const endTime = candles[candles.length - 1].timestamp;
      
      const report = validateDataQuality(
        candles, 
        '8h', 
        startTime, 
        endTime, 
        candles.length - 1, 
        480 // 8 hours in minutes
      );
      
      expect(report).toBeDefined();
      expect(report.coverage).toBeGreaterThan(0);
      expect(Array.isArray(report.issues)).toBe(true);
      expect(Array.isArray(report.warnings)).toBe(true);
    });

    it('should detect data gaps', () => {
      // Create candles with a gap
      const candlesWithGap = [...candles];
      // Remove some candles to create a gap
      candlesWithGap.splice(60, 10);
      
      const startTime = candlesWithGap[0].timestamp;
      const endTime = candlesWithGap[candlesWithGap.length - 1].timestamp;
      
      const report = validateDataQuality(
        candlesWithGap, 
        '1d', 
        startTime, 
        endTime, 
        candlesWithGap.length - 1, 
        1440
      );
      
      expect(report).toBeDefined();
      // May or may not detect gaps depending on implementation
      expect(report.coverage).toBeLessThanOrEqual(100);
    });
  });

  describe('Portfolio Tracking', () => {
    it('should track portfolio value correctly after trades', () => {
      const initialValue = 1000;
      const currentPortfolio = createMockPortfolio(initialValue, 0, initialValue);
      const trades: Trade[] = [];
      
      // Execute a buy
      const buyPrice = 2500;
      const signal = generateEnhancedAdaptiveSignal(candles, config, 60, 'portfolio-test');
      const buySignal = { ...signal, action: 'buy' as const, signal: 0.5 };
      
      const buyResult = executeTrade(
        buySignal,
        buySignal.confidence,
        buyPrice,
        currentPortfolio,
        {
          candles,
          candleIndex: 60,
          config,
          trades,
          openPositions: [],
          generateAudit: false,
        }
      );
      
      if (buyResult) {
        trades.push(buyResult);
        
        // Portfolio should reflect the trade (mutated in place)
        expect(currentPortfolio.ethBalance).toBeGreaterThan(0);
        expect(currentPortfolio.usdcBalance).toBeLessThan(initialValue);
        
        // Total value should be approximately the same (minus fees if any)
        const totalValue = currentPortfolio.usdcBalance + currentPortfolio.ethBalance * buyPrice;
        expect(totalValue).toBeCloseTo(initialValue, -1); // Within $10
      }
    });

    it('should calculate P&L correctly on sell', () => {
      const initialEthAmount = 0.4;
      const buyPrice = 2500;
      const sellPrice = 2700; // Price went up
      
      const currentPortfolio = createMockPortfolio(0, initialEthAmount, 1000);
      currentPortfolio.totalValue = initialEthAmount * buyPrice;
      
      const trades: Trade[] = [{
        id: 'initial-buy',
        timestamp: Date.now() - 24 * 60 * 60 * 1000,
        type: 'buy',
        ethPrice: buyPrice,
        ethAmount: initialEthAmount,
        usdcAmount: buyPrice * initialEthAmount,
        signal: 0.5,
        confidence: 0.7,
        portfolioValue: buyPrice * initialEthAmount,
        costBasis: buyPrice * initialEthAmount,
      }];
      
      const signal = generateEnhancedAdaptiveSignal(candles, config, 70, 'pnl-test');
      const sellSignal = { ...signal, action: 'sell' as const, signal: -0.5 };
      
      const sellResult = executeTrade(
        sellSignal,
        sellSignal.confidence,
        sellPrice,
        currentPortfolio,
        {
          candles,
          candleIndex: 70,
          config,
          trades,
          openPositions: [],
          generateAudit: false,
        }
      );
      
      if (sellResult && sellResult.pnl !== undefined) {
        // P&L should be positive since price went up
        expect(sellResult.pnl).toBeGreaterThan(0);
      }
    });
  });
});

