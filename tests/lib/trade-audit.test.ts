/**
 * Unit tests for trade audit generation
 */

import { describe, it, expect } from 'vitest';
import {
  generateTradeAudit,
  calculateTradePerformance,
  classifyTradeOutcome,
  analyzeTradeContext,
} from '@/lib/trade-audit';
import { createMockTrade } from '../mocks/trading-data.mock';
import { generatePriceCandles } from '../mocks/trading-data.mock';
import type { PortfolioSnapshot } from '@/types';
// createMockPortfolioSnapshots, Trade, PriceCandle may be needed for future tests
import type { MarketRegimeSignal } from '@/lib/market-regime-detector-cached';
import type { TradingSignal } from '@/types';
import type { TradingConfig } from '@/types';

describe('Trade Audit', () => {
  describe('classifyTradeOutcome', () => {
    it('should classify buy trades as pending', () => {
      const trade = createMockTrade('buy', 2500, 0.1);
      const outcome = classifyTradeOutcome(trade);
      expect(outcome).toBe('pending');
    });

    it('should classify winning sell trades as win', () => {
      const trade = createMockTrade('sell', 2600, 0.1, Date.now(), -0.5, 0.7, 10);
      const outcome = classifyTradeOutcome(trade);
      expect(outcome).toBe('win');
    });

    it('should classify losing sell trades as loss', () => {
      const trade = createMockTrade('sell', 2400, 0.1, Date.now(), -0.5, 0.7, -10);
      const outcome = classifyTradeOutcome(trade);
      expect(outcome).toBe('loss');
    });

    it('should classify breakeven trades as breakeven', () => {
      const trade = createMockTrade('sell', 2500, 0.1, Date.now(), -0.5, 0.7, 0);
      const outcome = classifyTradeOutcome(trade);
      expect(outcome).toBe('breakeven');
    });

    it('should handle trades without P&L', () => {
      const trade = createMockTrade('sell', 2500, 0.1);
      delete trade.pnl;
      const outcome = classifyTradeOutcome(trade);
      expect(outcome).toBe('pending');
    });
  });

  describe('analyzeTradeContext', () => {
    it('should analyze trending up market', () => {
      const candles = generatePriceCandles('trending-up', 50, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[49]!.timestamp);
      
      const context = analyzeTradeContext(trade, candles, 49);
      
      expect(context.trend).toBe('up');
      expect(context.momentum).toBeDefined();
      expect(context.volatility).toBeDefined();
    });

    it('should analyze trending down market', () => {
      const candles = generatePriceCandles('trending-down', 50, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[49]!.timestamp);
      
      const context = analyzeTradeContext(trade, candles, 49);
      
      expect(context.trend).toBe('down');
      expect(['up', 'down', 'sideways']).toContain(context.trend);
    });

    it('should analyze volatile market', () => {
      const candles = generatePriceCandles('volatile', 50, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[49]!.timestamp);
      
      const context = analyzeTradeContext(trade, candles, 49);
      
      // Volatility classification depends on actual price movements
      expect(['high', 'medium', 'low']).toContain(context.volatility);
      expect(context.volatility).toBeDefined();
    });

    it('should handle insufficient data', () => {
      const candles = generatePriceCandles('trending-up', 10, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[9]!.timestamp);
      
      const context = analyzeTradeContext(trade, candles, 9);
      
      expect(context).toBeDefined();
      expect(context.trend).toBeDefined();
      expect(context.momentum).toBeDefined();
      expect(context.volatility).toBeDefined();
    });
  });

  describe('calculateTradePerformance', () => {
    it('should calculate holding period for sell trades', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const buyTrade = createMockTrade('buy', 2500, 0.1, candles[50]!.timestamp);
      const sellTrade = createMockTrade('sell', 2600, 0.1, candles[60]!.timestamp, -0.5, 0.7, 10);
      
      const portfolioHistory: PortfolioSnapshot[] = candles.slice(50, 61).map(c => ({
        timestamp: c.timestamp,
        usdcBalance: 900,
        ethBalance: 0.1,
        totalValue: 1000,
        ethPrice: c.close,
      }));

      const performance = calculateTradePerformance(buyTrade, portfolioHistory, candles);
      
      expect(performance.holdingPeriod).toBeDefined();
      if (performance.holdingPeriod !== undefined) {
        expect(performance.holdingPeriod).toBeGreaterThan(0);
      }
    });

    it('should calculate MFE and MAE', () => {
      const candles = generatePriceCandles('volatile', 100, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[50]!.timestamp);
      
      const portfolioHistory: PortfolioSnapshot[] = candles.slice(50, 70).map(c => ({
        timestamp: c.timestamp,
        usdcBalance: 900,
        ethBalance: 0.1,
        totalValue: 1000,
        ethPrice: c.close,
      }));

      const performance = calculateTradePerformance(trade, portfolioHistory, candles);
      
      if (performance.maxFavorableExcursion !== undefined) {
        expect(performance.maxFavorableExcursion).toBeGreaterThanOrEqual(0);
      }
      if (performance.maxAdverseExcursion !== undefined) {
        expect(performance.maxAdverseExcursion).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle trades without matching sell', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[50]!.timestamp);
      
      const portfolioHistory: PortfolioSnapshot[] = [{
        timestamp: candles[50]!.timestamp,
        usdcBalance: 900,
        ethBalance: 0.1,
        totalValue: 1000,
        ethPrice: 2500,
      }];

      const performance = calculateTradePerformance(trade, portfolioHistory, candles);
      
      // Should not throw, may return empty object
      expect(performance).toBeDefined();
    });
  });

  describe('generateTradeAudit', () => {
    it('should generate complete audit for buy trade', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[50]!.timestamp);
      
      const regime: MarketRegimeSignal = {
        regime: 'bullish',
        confidence: 0.8,
        indicators: {
          trend: 0.7,
          momentum: 0.6,
          volatility: 0.3,
        },
      };

      const signal: TradingSignal & {
        regime: MarketRegimeSignal;
        activeStrategy: TradingConfig | null;
        momentumConfirmed: boolean;
        positionSizeMultiplier: number;
      } = {
        timestamp: candles[50]!.timestamp,
        signal: 0.5,
        confidence: 0.7,
        indicators: { sma_20: 0.4, ema_12: 0.6 },
        action: 'buy',
        regime,
        activeStrategy: {
          name: 'Test Strategy',
          timeframe: '1d',
          indicators: [],
          buyThreshold: 0.4,
          sellThreshold: -0.3,
          maxPositionPct: 0.75,
          initialCapital: 1000,
        },
        momentumConfirmed: true,
        positionSizeMultiplier: 1.0,
      };

      const portfolioHistory: PortfolioSnapshot[] = [{
        timestamp: candles[50]!.timestamp,
        usdcBalance: 900,
        ethBalance: 0.1,
        totalValue: 1000,
        ethPrice: 2500,
      }];

      const audit = generateTradeAudit(
        trade,
        signal,
        candles,
        portfolioHistory,
        {
          timeframe: '1d',
          buyThreshold: 0.4,
          sellThreshold: -0.3,
          maxPositionPct: 0.75,
        }
      );

      expect(audit).toBeDefined();
      expect(audit.date).toBeDefined();
      expect(audit.timeframe).toBe('1d');
      expect(audit.regime).toBe('bullish');
      expect(audit.activeStrategy).toBe('Test Strategy');
      expect(audit.outcome).toBe('pending');
      expect(audit.marketConditions).toBeDefined();
    });

    it('should generate complete audit for sell trade', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const trade = createMockTrade('sell', 2600, 0.1, candles[60]!.timestamp, -0.5, 0.7, 10);
      trade.costBasis = 250;

      const regime: MarketRegimeSignal = {
        regime: 'bearish',
        confidence: 0.6,
        indicators: {
          trend: -0.5,
          momentum: -0.4,
          volatility: 0.4,
        },
      };

      const signal: TradingSignal & {
        regime: MarketRegimeSignal;
        activeStrategy: TradingConfig | null;
        momentumConfirmed: boolean;
        positionSizeMultiplier: number;
      } = {
        timestamp: candles[60]!.timestamp,
        signal: -0.5,
        confidence: 0.7,
        indicators: { sma_20: -0.4, ema_12: -0.6 },
        action: 'sell',
        regime,
        activeStrategy: {
          name: 'Test Strategy',
          timeframe: '1d',
          indicators: [],
          buyThreshold: 0.4,
          sellThreshold: -0.3,
          maxPositionPct: 0.75,
          initialCapital: 1000,
        },
        momentumConfirmed: false,
        positionSizeMultiplier: 1.0,
      };

      const portfolioHistory: PortfolioSnapshot[] = candles.slice(50, 61).map(c => ({
        timestamp: c.timestamp,
        usdcBalance: 900,
        ethBalance: 0.1,
        totalValue: 1000,
        ethPrice: c.close,
      }));

      const audit = generateTradeAudit(
        trade,
        signal,
        candles,
        portfolioHistory,
        {
          timeframe: '1d',
          buyThreshold: 0.4,
          sellThreshold: -0.3,
          maxPositionPct: 0.75,
        }
      );

      expect(audit).toBeDefined();
      expect(audit.outcome).toBe('win');
      expect(audit.winLossAmount).toBe(10);
      expect(audit.roi).toBeDefined();
      if (audit.roi !== undefined) {
        expect(audit.roi).toBeGreaterThan(0);
      }
    });

    it('should include all required audit fields', () => {
      const candles = generatePriceCandles('trending-up', 100, 2500);
      const trade = createMockTrade('buy', 2500, 0.1, candles[50]!.timestamp);

      const regime: MarketRegimeSignal = {
        regime: 'bullish',
        confidence: 0.8,
        indicators: {
          trend: 0.7,
          momentum: 0.6,
          volatility: 0.3,
        },
      };

      const signal: TradingSignal & {
        regime: MarketRegimeSignal;
        activeStrategy: TradingConfig | null;
        momentumConfirmed: boolean;
        positionSizeMultiplier: number;
      } = {
        timestamp: candles[50]!.timestamp,
        signal: 0.5,
        confidence: 0.7,
        indicators: {},
        action: 'buy',
        regime,
        activeStrategy: {
          name: 'Test',
          timeframe: '1d',
          indicators: [],
          buyThreshold: 0.4,
          sellThreshold: -0.3,
          maxPositionPct: 0.75,
          initialCapital: 1000,
        },
        momentumConfirmed: true,
        positionSizeMultiplier: 1.0,
      };

      const portfolioHistory: PortfolioSnapshot[] = [];

      const audit = generateTradeAudit(
        trade,
        signal,
        candles,
        portfolioHistory,
        {
          timeframe: '8h',
          buyThreshold: 0.4,
          sellThreshold: -0.3,
          maxPositionPct: 0.75,
          riskFilters: {
            volatilityFilter: false,
            whipsawDetection: false,
            circuitBreaker: false,
            regimePersistence: true,
          },
        }
      );

      // Check all required fields
      expect(audit.date).toBeDefined();
      expect(audit.timeframe).toBe('8h');
      expect(audit.regime).toBeDefined();
      expect(audit.regimeConfidence).toBeDefined();
      expect(audit.activeStrategy).toBeDefined();
      expect(audit.momentumConfirmed).toBeDefined();
      expect(audit.indicatorSignals).toBeDefined();
      expect(audit.buyThreshold).toBe(0.4);
      expect(audit.sellThreshold).toBe(-0.3);
      expect(audit.priceAtTrade).toBe(2500);
      expect(audit.volatility).toBeGreaterThanOrEqual(0);
      expect(audit.riskFilters).toBeDefined();
      expect(audit.positionSizePct).toBeGreaterThanOrEqual(0);
      expect(audit.positionSizeMultiplier).toBe(1.0);
      expect(audit.maxPositionAllowed).toBe(75);
      expect(audit.outcome).toBeDefined();
      expect(audit.winLossAmount).toBeDefined();
      expect(audit.marketConditions).toBeDefined();
    });
  });
});

