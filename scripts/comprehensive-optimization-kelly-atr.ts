#!/usr/bin/env npx tsx
/**
 * Comprehensive Strategy Optimization with Kelly Criterion and ATR Stop Losses
 * Tests various combinations of:
 * - Bullish/bearish strategy pairs
 * - Kelly fractional multipliers (0.25, 0.5, 0.75, 1.0)
 * - ATR multipliers (1.5, 2.0, 2.5, 3.0)
 * 
 * Runs against all periods: 2025 historical, 2026/2027 synthetic, and multi-year
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { calculateKellyCriterion, getKellyMultiplier } from '@/lib/kelly-criterion';
import { getATRValue } from '@/lib/indicators';
import { createOpenPosition, updateStopLoss, checkStopLosses, type StopLossConfig, type OpenPosition } from '@/lib/atr-stop-loss';
import { disconnectRedis } from '@/lib/kv';
import type { PriceCandle, Portfolio, Trade, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import { v4 as uuidv4 } from 'uuid';

const TIMEFRAME = '8h';

interface PeriodMetrics {
  return: number;
  returnPct: number;
  vsEthHold: number;
  tradeCount: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  completedTrades: number;
}

interface OptimizationResult {
  bullishName: string;
  bearishName: string;
  kellyMultiplier: number;
  atrMultiplier: number;
  historical: {
    bullish: PeriodMetrics;
    bearish: PeriodMetrics;
    fullYear: PeriodMetrics;
  };
  synthetic2026: {
    fullYear: PeriodMetrics;
    bullRun: PeriodMetrics;
  };
  synthetic2027: {
    fullYear: PeriodMetrics;
    q4: PeriodMetrics;
  };
  multiYear: {
    twoYear: PeriodMetrics;
    threeYear: PeriodMetrics;
  };
  score: number;
}

// Historical periods
const HISTORICAL_PERIODS = [
  { name: 'bullish', start: '2025-04-01', end: '2025-08-23' },
  { name: 'bearish', start: '2025-01-01', end: '2025-06-01' },
  { name: 'fullYear', start: '2025-01-01', end: '2025-12-27' },
];

// Synthetic 2026 periods
const SYNTHETIC_2026_PERIODS = [
  { name: 'fullYear', start: '2026-01-01', end: '2026-12-31' },
  { name: 'bullRun', start: '2026-03-01', end: '2026-04-30' },
];

// Synthetic 2027 periods
const SYNTHETIC_2027_PERIODS = [
  { name: 'fullYear', start: '2027-01-01', end: '2027-12-31' },
  { name: 'q4', start: '2027-10-01', end: '2027-12-31' },
];

// Multi-year periods
const MULTI_YEAR_PERIODS = [
  { name: 'twoYear', start: '2025-01-01', end: '2026-12-31' },
  { name: 'threeYear', start: '2025-01-01', end: '2027-12-31' },
];

// Bullish strategies to test
const BULLISH_STRATEGIES: Array<{ name: string; config: TradingConfig }> = [
  {
    name: 'Hybrid-0.41',
    config: {
      name: 'Bullish-Hybrid',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.35, params: { period: 20 } },
        { type: 'ema', weight: 0.35, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.1, params: { period: 14 } },
      ],
      buyThreshold: 0.41,
      sellThreshold: -0.45,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Hybrid-0.39',
    config: {
      name: 'Bullish-Hybrid',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.35, params: { period: 20 } },
        { type: 'ema', weight: 0.35, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.1, params: { period: 14 } },
      ],
      buyThreshold: 0.39,
      sellThreshold: -0.45,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Hybrid-0.43',
    config: {
      name: 'Bullish-Hybrid',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.35, params: { period: 20 } },
        { type: 'ema', weight: 0.35, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.1, params: { period: 14 } },
      ],
      buyThreshold: 0.43,
      sellThreshold: -0.45,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Conservative-0.38',
    config: {
      name: 'Bullish-Conservative',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.4, params: { period: 20 } },
        { type: 'ema', weight: 0.4, params: { period: 12 } },
        { type: 'rsi', weight: 0.2, params: { period: 14 } },
      ],
      buyThreshold: 0.38,
      sellThreshold: -0.40,
      maxPositionPct: 0.85,
      initialCapital: 1000,
    },
  },
];

// Bearish strategies to test
const BEARISH_STRATEGIES: Array<{ name: string; config: TradingConfig }> = [
  {
    name: 'Recovery-0.65',
    config: {
      name: 'Bearish-Recovery',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.65,
      sellThreshold: -0.25,
      maxPositionPct: 0.3,
      initialCapital: 1000,
    },
  },
  {
    name: 'Recovery-0.63',
    config: {
      name: 'Bearish-Recovery',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.63,
      sellThreshold: -0.25,
      maxPositionPct: 0.3,
      initialCapital: 1000,
    },
  },
  {
    name: 'Recovery-0.67',
    config: {
      name: 'Bearish-Recovery',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.67,
      sellThreshold: -0.25,
      maxPositionPct: 0.3,
      initialCapital: 1000,
    },
  },
];

// Kelly fractional multipliers to test
const KELLY_MULTIPLIERS = [0.25, 0.5, 0.75, 1.0];

// ATR multipliers to test
const ATR_MULTIPLIERS = [1.5, 2.0, 2.5, 3.0];

function loadSyntheticData(year: number): PriceCandle[] | null {
  // Only 2026+ have synthetic data
  if (year < 2026) {
    return null;
  }
  
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  
  // Try multiple filename patterns
  const possibleFilenames = [
    `ethusdt_8h_${year}-01-01_${year}-12-31.json.gz`,
    `ethusdt_8h_${year}-01-01_${year}-12-30.json.gz`,
  ];
  
  let filepath: string | null = null;
  for (const filename of possibleFilenames) {
    const testPath = path.join(dataDir, filename);
    if (fs.existsSync(testPath)) {
      filepath = testPath;
      break;
    }
  }
  
  if (!filepath) {
    // Try to find any file matching the year
    try {
      const files = fs.readdirSync(dataDir);
      const matchingFile = files.find(f => f.includes(`${year}`) && f.endsWith('.json.gz'));
      if (matchingFile) {
        filepath = path.join(dataDir, matchingFile);
      }
    } catch (error) {
      return null;
    }
  }
  
  if (!filepath || !fs.existsSync(filepath)) {
    return null;
  }
  
  try {
    const compressed = fs.readFileSync(filepath);
    const decompressed = gunzipSync(compressed);
    const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
    return candles;
  } catch (error) {
    return null;
  }
}

function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[],
  candles: PriceCandle[],
  candleIndex: number,
  config: EnhancedAdaptiveStrategyConfig,
  openPositions: OpenPosition[],
  kellyFractionalMultiplier: number,
  stopLossConfig: StopLossConfig
): Trade | null {
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  // Check stop losses first (before new trades)
  if (stopLossConfig.enabled && openPositions.length > 0) {
    const currentATR = getATRValue(candles, candleIndex, stopLossConfig.atrPeriod, stopLossConfig.useEMA);
    const stopLossResults = checkStopLosses(openPositions, currentPrice, currentATR, stopLossConfig);
    
    for (const { position, result } of stopLossResults) {
      if (result.shouldExit) {
        // Exit position due to stop loss
        const ethToSell = position.buyTrade.ethAmount;
        const saleValue = ethToSell * currentPrice;
        
        portfolio.ethBalance -= ethToSell;
        portfolio.usdcBalance += saleValue;
        portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
        portfolio.tradeCount++;

        // Calculate P&L
        const buyCost = position.buyTrade.usdcAmount;
        const pnl = saleValue - buyCost;
        if (pnl > 0) portfolio.winCount++;

        const trade: Trade = {
          id: uuidv4(),
          type: 'sell',
          timestamp: candles[candleIndex]?.timestamp || Date.now(),
          ethPrice: currentPrice,
          ethAmount: ethToSell,
          usdcAmount: saleValue,
          signal: signal.signal,
          confidence,
          portfolioValue: portfolio.totalValue,
          pnl,
        };

        trades.push(trade);
        
        // Remove position from open positions
        const index = openPositions.indexOf(position);
        if (index > -1) {
          openPositions.splice(index, 1);
        }

        return trade;
      }
    }
  }

  // Calculate Kelly multiplier if enabled
  let kellyMultiplier = 1.0;
  if (kellyFractionalMultiplier > 0) {
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined && t.pnl !== null);
    
    if (sellTrades.length >= 10) {
      const tradesWithPnl = sellTrades.map(t => ({ ...t, pnl: t.pnl! })) as Array<Trade & { pnl: number }>;

      const kellyResult = calculateKellyCriterion(tradesWithPnl, {
        minTrades: 10,
        lookbackPeriod: Math.min(50, sellTrades.length),
        fractionalMultiplier: kellyFractionalMultiplier,
      });

      if (kellyResult) {
        kellyMultiplier = getKellyMultiplier(kellyResult, activeStrategy.maxPositionPct || 0.9);
      }
    }
  }

  const basePositionSize = portfolio.usdcBalance * (activeStrategy.maxPositionPct || 0.75);
  const positionSize = signal.positionSizeMultiplier * basePositionSize * confidence * kellyMultiplier;

  if (isBuy && portfolio.usdcBalance >= positionSize) {
    const ethAmount = positionSize / currentPrice;
    portfolio.usdcBalance -= positionSize;
    portfolio.ethBalance += ethAmount;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;

    const trade: Trade = {
      id: uuidv4(),
      type: 'buy',
      timestamp: candles[candleIndex]?.timestamp || Date.now(),
      ethPrice: currentPrice,
      ethAmount,
      usdcAmount: positionSize,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
    };

    trades.push(trade);

    // Create open position with stop loss if enabled
    if (stopLossConfig.enabled) {
      const atrAtEntry = getATRValue(candles, candleIndex, stopLossConfig.atrPeriod, stopLossConfig.useEMA);
      if (atrAtEntry) {
        const position = createOpenPosition(trade, currentPrice, atrAtEntry, stopLossConfig);
        if (position) {
          openPositions.push(position);
        }
      }
    }

    return trade;
  } else if (!isBuy && portfolio.ethBalance > 0) {
    const baseSellSize = portfolio.ethBalance * activeStrategy.maxPositionPct;
    const ethToSell = Math.min(portfolio.ethBalance, baseSellSize * kellyMultiplier);
    const saleValue = ethToSell * currentPrice;
    
    portfolio.ethBalance -= ethToSell;
    portfolio.usdcBalance += saleValue;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;

    // Calculate P&L
    const lastBuyTrade = [...trades].reverse().find(t => t.type === 'buy');
    let pnl = 0;
    if (lastBuyTrade) {
      const buyCost = lastBuyTrade.usdcAmount;
      pnl = saleValue - buyCost;
      if (pnl > 0) portfolio.winCount++;
    }

    const trade: Trade = {
      id: uuidv4(),
      type: 'sell',
      timestamp: candles[candleIndex]?.timestamp || Date.now(),
      ethPrice: currentPrice,
      ethAmount: ethToSell,
      usdcAmount: saleValue,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
      pnl,
    };

    trades.push(trade);

    // Remove matching open position
    if (stopLossConfig.enabled && lastBuyTrade) {
      const positionIndex = openPositions.findIndex(p => p.buyTrade.id === lastBuyTrade.id);
      if (positionIndex > -1) {
        openPositions.splice(positionIndex, 1);
      }
    }

    return trade;
  }

  return null;
}

// Cache for loaded candles to avoid repeated API calls
const candlesCache = new Map<string, PriceCandle[]>();

async function testPeriod(
  bullishConfig: TradingConfig,
  bearishConfig: TradingConfig,
  baseConfig: Partial<EnhancedAdaptiveStrategyConfig>,
  startDate: string,
  endDate: string,
  isSynthetic: boolean,
  kellyFractionalMultiplier: number,
  atrMultiplier: number
): Promise<PeriodMetrics> {
  clearRegimeHistory();
  clearIndicatorCache();

  // Create cache key
  const cacheKey = `${startDate}-${endDate}-${isSynthetic}`;
  
  let candles: PriceCandle[];
  
  // Check cache first
  if (candlesCache.has(cacheKey)) {
    candles = candlesCache.get(cacheKey)!;
  } else {
    if (isSynthetic) {
      const year = new Date(startDate).getFullYear();
      const loadedCandles = loadSyntheticData(year);
      if (!loadedCandles) {
        return {
          return: 0,
          returnPct: 0,
          vsEthHold: 0,
          tradeCount: 0,
          winRate: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          completedTrades: 0,
        };
      }
      candles = loadedCandles;
      
      // Filter to requested date range
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate).getTime();
      candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
    } else {
      // For multi-year, combine historical + synthetic
      const startYear = new Date(startDate).getFullYear();
      const endYear = new Date(endDate).getFullYear();
      
      candles = [];
      
      // Load 2025 historical (cache this separately)
      const history2025Key = '2025-01-01-2025-12-31-historical';
      let history2025: PriceCandle[];
      if (candlesCache.has(history2025Key)) {
        history2025 = candlesCache.get(history2025Key)!;
      } else {
        history2025 = await fetchPriceCandles('ETHUSDT', TIMEFRAME, '2025-01-01', '2025-12-31');
        candlesCache.set(history2025Key, history2025);
      }
      
      if (startYear <= 2025 && endYear >= 2025) {
        candles.push(...history2025);
      }
      
      // Load synthetic years (only 2026+)
      for (let year = Math.max(2026, startYear); year <= endYear; year++) {
        const yearCandles = loadSyntheticData(year);
        if (yearCandles) {
          candles.push(...yearCandles);
        }
      }
      
      // Sort and filter
      candles.sort((a, b) => a.timestamp - b.timestamp);
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate).getTime();
      candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
    }
    
    // Cache the result
    candlesCache.set(cacheKey, candles);
  }

  if (candles.length < 50) {
    return {
      return: 0,
      returnPct: 0,
      vsEthHold: 0,
      tradeCount: 0,
      winRate: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      completedTrades: 0,
    };
  }

  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  const minIndex = Math.max(50, Math.floor(candles.length * 0.1));
  if (startIndex < minIndex) startIndex = minIndex;

  const config: EnhancedAdaptiveStrategyConfig = {
    bullishStrategy: bullishConfig,
    bearishStrategy: bearishConfig,
    ...baseConfig,
  };

  const portfolio: Portfolio = {
    usdcBalance: bullishConfig.initialCapital,
    ethBalance: 0,
    totalValue: bullishConfig.initialCapital,
    initialCapital: bullishConfig.initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };

  const trades: Trade[] = [];
  const openPositions: OpenPosition[] = [];
  const sessionId = `optimize-${Date.now()}`;
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  const returns: number[] = [];

  // Stop loss config
  const stopLossConfig: StopLossConfig = {
    enabled: true,
    atrMultiplier,
    trailing: true,
    useEMA: true,
    atrPeriod: 14,
  };

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;

    // Update open positions (for trailing stops)
    if (stopLossConfig.enabled && openPositions.length > 0) {
      const currentATR = getATRValue(candles, i, stopLossConfig.atrPeriod, stopLossConfig.useEMA);
      for (const position of openPositions) {
        updateStopLoss(position, currentPrice, currentATR, stopLossConfig);
      }
    }

    const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    executeTrade(
      signal,
      confidence,
      currentPrice,
      portfolio,
      trades,
      candles,
      i,
      config,
      openPositions,
      kellyFractionalMultiplier,
      stopLossConfig
    );

    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;

    if (portfolio.totalValue > maxValue) maxValue = portfolio.totalValue;
    const drawdown = maxValue - portfolio.totalValue;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (i > startIndex) {
      const prevValue = i === startIndex + 1 ? portfolio.initialCapital : portfolio.totalValue;
      const periodReturn = (portfolio.totalValue - prevValue) / prevValue;
      returns.push(periodReturn);
    }
  }

  const startPrice = candles[startIndex]!.close;
  const endPrice = candles[candles.length - 1]!.close;
  const ethHoldReturnPct = ((endPrice - startPrice) / startPrice) * 100;
  const returnPct = (portfolio.totalReturn / portfolio.initialCapital) * 100;

  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const sellTrades = trades.filter(t => t.type === 'sell');
  const completedTrades = sellTrades.length;
  const winRate = completedTrades > 0 ? (portfolio.winCount / completedTrades) * 100 : 0;

  return {
    return: portfolio.totalReturn,
    returnPct,
    vsEthHold: returnPct - ethHoldReturnPct,
    tradeCount: trades.length,
    winRate,
    maxDrawdown: (maxDrawdown / portfolio.initialCapital) * 100,
    sharpeRatio,
    completedTrades,
  };
}

async function testStrategy(
  bullish: typeof BULLISH_STRATEGIES[0],
  bearish: typeof BEARISH_STRATEGIES[0],
  kellyMultiplier: number,
  atrMultiplier: number
): Promise<OptimizationResult> {
  const baseConfig: Partial<EnhancedAdaptiveStrategyConfig> = {
    regimeConfidenceThreshold: 0.22,
    momentumConfirmationThreshold: 0.26,
    bullishPositionMultiplier: 1.0,
    regimePersistencePeriods: 1,
    dynamicPositionSizing: false,
    maxBullishPosition: 0.90,
    maxVolatility: 0.019,
    circuitBreakerWinRate: 0.18,
    circuitBreakerLookback: 12,
    whipsawDetectionPeriods: 5,
    whipsawMaxChanges: 3,
  };

  // Test historical periods
  const historicalBullish = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    HISTORICAL_PERIODS[0]!.start,
    HISTORICAL_PERIODS[0]!.end,
    false,
    kellyMultiplier,
    atrMultiplier
  );
  
  const historicalBearish = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    HISTORICAL_PERIODS[1]!.start,
    HISTORICAL_PERIODS[1]!.end,
    false,
    kellyMultiplier,
    atrMultiplier
  );
  
  const historicalFullYear = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    HISTORICAL_PERIODS[2]!.start,
    HISTORICAL_PERIODS[2]!.end,
    false,
    kellyMultiplier,
    atrMultiplier
  );

  // Test synthetic 2026
  const synth2026FullYear = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    SYNTHETIC_2026_PERIODS[0]!.start,
    SYNTHETIC_2026_PERIODS[0]!.end,
    true,
    kellyMultiplier,
    atrMultiplier
  );
  
  const synth2026BullRun = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    SYNTHETIC_2026_PERIODS[1]!.start,
    SYNTHETIC_2026_PERIODS[1]!.end,
    true,
    kellyMultiplier,
    atrMultiplier
  );

  // Test synthetic 2027
  const synth2027FullYear = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    SYNTHETIC_2027_PERIODS[0]!.start,
    SYNTHETIC_2027_PERIODS[0]!.end,
    true,
    kellyMultiplier,
    atrMultiplier
  );
  
  const synth2027Q4 = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    SYNTHETIC_2027_PERIODS[1]!.start,
    SYNTHETIC_2027_PERIODS[1]!.end,
    true,
    kellyMultiplier,
    atrMultiplier
  );

  // Test multi-year
  const twoYear = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    MULTI_YEAR_PERIODS[0]!.start,
    MULTI_YEAR_PERIODS[0]!.end,
    false, // Mix historical + synthetic
    kellyMultiplier,
    atrMultiplier
  );
  
  const threeYear = await testPeriod(
    bullish.config,
    bearish.config,
    baseConfig,
    MULTI_YEAR_PERIODS[1]!.start,
    MULTI_YEAR_PERIODS[1]!.end,
    false, // Mix historical + synthetic
    kellyMultiplier,
    atrMultiplier
  );

  // CRITICAL: Disqualify strategies that don't trade on full-year periods
  // A strategy must work across ALL market conditions to be viable
  const MIN_TRADES_FULL_YEAR = 10;
  
  if (synth2026FullYear.completedTrades < MIN_TRADES_FULL_YEAR) {
    // Large penalty for not trading on synthetic 2026
    return {
      bullishName: bullish.name,
      bearishName: bearish.name,
      kellyMultiplier,
      atrMultiplier,
      historical: {
        bullish: historicalBullish,
        bearish: historicalBearish,
        fullYear: historicalFullYear,
      },
      synthetic2026: {
        fullYear: synth2026FullYear,
        bullRun: synth2026BullRun,
      },
      synthetic2027: {
        fullYear: synth2027FullYear,
        q4: synth2027Q4,
      },
      multiYear: {
        twoYear,
        threeYear,
      },
      score: -1000, // Disqualify - doesn't work on all market conditions
    };
  }
  
  if (synth2027FullYear.completedTrades < MIN_TRADES_FULL_YEAR) {
    // Large penalty for not trading on synthetic 2027
    return {
      bullishName: bullish.name,
      bearishName: bearish.name,
      kellyMultiplier,
      atrMultiplier,
      historical: {
        bullish: historicalBullish,
        bearish: historicalBearish,
        fullYear: historicalFullYear,
      },
      synthetic2026: {
        fullYear: synth2026FullYear,
        bullRun: synth2026BullRun,
      },
      synthetic2027: {
        fullYear: synth2027FullYear,
        q4: synth2027Q4,
      },
      multiYear: {
        twoYear,
        threeYear,
      },
      score: -1000, // Disqualify - doesn't work on all market conditions
    };
  }

  // Calculate composite score
  // Weight: Historical 30%, Synthetic 2026 25%, Synthetic 2027 25%, Multi-year 20%
  // Increased synthetic weights to ensure strategies work across all conditions
  let score = 
    (historicalFullYear.returnPct * 0.20) +  // Reduced from 0.25
    (historicalBullish.returnPct * 0.08) +   // Reduced from 0.10
    (historicalBearish.returnPct * 0.02) +   // Reduced from 0.05
    (synth2026FullYear.returnPct * 0.20) +   // Increased from 0.15
    (synth2026BullRun.returnPct * 0.05) +
    (synth2027FullYear.returnPct * 0.20) +   // Increased from 0.15
    (synth2027Q4.returnPct * 0.05) +
    (twoYear.returnPct * 0.10) +
    (threeYear.returnPct * 0.10) +
    (historicalFullYear.vsEthHold * 0.03) +  // Reduced
    (synth2026FullYear.vsEthHold * 0.03) +   // Increased
    (synth2027FullYear.vsEthHold * 0.03) +   // Increased
    (twoYear.vsEthHold * 0.01) +
    (threeYear.vsEthHold * 0.01) -
    (historicalFullYear.maxDrawdown * 0.01) -
    (synth2026FullYear.maxDrawdown * 0.01) -  // Increased penalty
    (synth2027FullYear.maxDrawdown * 0.01) -  // Increased penalty
    (twoYear.maxDrawdown * 0.005) -
    (threeYear.maxDrawdown * 0.005);
  
  // Additional penalty for low trade counts (want active strategies)
  if (synth2026FullYear.completedTrades < 20) {
    score -= 5; // Penalty for very few trades
  }
  if (synth2027FullYear.completedTrades < 20) {
    score -= 5; // Penalty for very few trades
  }

  return {
    bullishName: bullish.name,
    bearishName: bearish.name,
    kellyMultiplier,
    atrMultiplier,
    historical: {
      bullish: historicalBullish,
      bearish: historicalBearish,
      fullYear: historicalFullYear,
    },
    synthetic2026: {
      fullYear: synth2026FullYear,
      bullRun: synth2026BullRun,
    },
    synthetic2027: {
      fullYear: synth2027FullYear,
      q4: synth2027Q4,
    },
    multiYear: {
      twoYear,
      threeYear,
    },
    score,
  };
}

async function main() {
  console.log('🔬 Comprehensive Strategy Optimization with Kelly & ATR\n');
  console.log(`Testing ${BULLISH_STRATEGIES.length} bullish × ${BEARISH_STRATEGIES.length} bearish × ${KELLY_MULTIPLIERS.length} Kelly × ${ATR_MULTIPLIERS.length} ATR = ${BULLISH_STRATEGIES.length * BEARISH_STRATEGIES.length * KELLY_MULTIPLIERS.length * ATR_MULTIPLIERS.length} combinations\n`);

  const results: OptimizationResult[] = [];
  let testCount = 0;
  const totalTests = BULLISH_STRATEGIES.length * BEARISH_STRATEGIES.length * KELLY_MULTIPLIERS.length * ATR_MULTIPLIERS.length;

  for (const bullish of BULLISH_STRATEGIES) {
    for (const bearish of BEARISH_STRATEGIES) {
      for (const kellyMult of KELLY_MULTIPLIERS) {
        for (const atrMult of ATR_MULTIPLIERS) {
          testCount++;
          console.log(`\n[${testCount}/${totalTests}] Testing: ${bullish.name} + ${bearish.name} | Kelly: ${kellyMult} | ATR: ${atrMult}x`);
          
          const result = await testStrategy(bullish, bearish, kellyMult, atrMult);
          results.push(result);
          
          console.log(`   Score: ${result.score.toFixed(2)} | Hist: ${result.historical.fullYear.returnPct.toFixed(2)}%, Synth2026: ${result.synthetic2026.fullYear.returnPct.toFixed(2)}%, Synth2027: ${result.synthetic2027.fullYear.returnPct.toFixed(2)}%`);
        }
      }
    }
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  // Generate report
  const report = `# Comprehensive Strategy Optimization - Kelly & ATR

**Generated**: ${new Date().toISOString()}
**Configuration**: Testing bullish/bearish combinations with Kelly Criterion and ATR stop losses
**Timeframe**: ${TIMEFRAME}

## Test Parameters

- **Bullish Strategies**: ${BULLISH_STRATEGIES.map(s => s.name).join(', ')}
- **Bearish Strategies**: ${BEARISH_STRATEGIES.map(s => s.name).join(', ')}
- **Kelly Multipliers**: ${KELLY_MULTIPLIERS.join(', ')}
- **ATR Multipliers**: ${ATR_MULTIPLIERS.join('x, ')}x
- **Total Combinations**: ${totalTests}

## Top 10 Configurations

${results.slice(0, 10).map((r, i) => {
  return `
### ${i + 1}. ${r.bullishName} + ${r.bearishName} | Kelly: ${r.kellyMultiplier} | ATR: ${r.atrMultiplier}x
**Score**: ${r.score.toFixed(2)}

**Historical 2025**:
- Full Year: ${r.historical.fullYear.returnPct >= 0 ? '+' : ''}${r.historical.fullYear.returnPct.toFixed(2)}% (${r.historical.fullYear.completedTrades} trades)
- Bullish: ${r.historical.bullish.returnPct >= 0 ? '+' : ''}${r.historical.bullish.returnPct.toFixed(2)}%
- Bearish: ${r.historical.bearish.returnPct >= 0 ? '+' : ''}${r.historical.bearish.returnPct.toFixed(2)}%

**Synthetic 2026**:
- Full Year: ${r.synthetic2026.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic2026.fullYear.returnPct.toFixed(2)}% (${r.synthetic2026.fullYear.completedTrades} trades)
- Bull Run: ${r.synthetic2026.bullRun.returnPct >= 0 ? '+' : ''}${r.synthetic2026.bullRun.returnPct.toFixed(2)}%

**Synthetic 2027**:
- Full Year: ${r.synthetic2027.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic2027.fullYear.returnPct.toFixed(2)}% (${r.synthetic2027.fullYear.completedTrades} trades)
- Q4: ${r.synthetic2027.q4.returnPct >= 0 ? '+' : ''}${r.synthetic2027.q4.returnPct.toFixed(2)}%

**Multi-Year**:
- 2 Years: ${r.multiYear.twoYear.returnPct >= 0 ? '+' : ''}${r.multiYear.twoYear.returnPct.toFixed(2)}%
- 3 Years: ${r.multiYear.threeYear.returnPct >= 0 ? '+' : ''}${r.multiYear.threeYear.returnPct.toFixed(2)}%

**Risk Metrics**:
- Max Drawdown: ${r.historical.fullYear.maxDrawdown.toFixed(2)}% (hist), ${r.synthetic2026.fullYear.maxDrawdown.toFixed(2)}% (2026), ${r.synthetic2027.fullYear.maxDrawdown.toFixed(2)}% (2027)
- Win Rate: ${r.historical.fullYear.winRate.toFixed(1)}% (hist), ${r.synthetic2026.fullYear.winRate.toFixed(1)}% (2026), ${r.synthetic2027.fullYear.winRate.toFixed(1)}% (2027)
`;
}).join('\n---\n')}

## Best Configuration

**${results[0]!.bullishName} + ${results[0]!.bearishName} | Kelly: ${results[0]!.kellyMultiplier} | ATR: ${results[0]!.atrMultiplier}x**

**Score**: ${results[0]!.score.toFixed(2)}

### Performance Summary

| Period | Return | Trades | Win Rate | Max DD |
|--------|--------|--------|----------|--------|
| Historical Full Year | ${results[0]!.historical.fullYear.returnPct >= 0 ? '+' : ''}${results[0]!.historical.fullYear.returnPct.toFixed(2)}% | ${results[0]!.historical.fullYear.completedTrades} | ${results[0]!.historical.fullYear.winRate.toFixed(1)}% | ${results[0]!.historical.fullYear.maxDrawdown.toFixed(2)}% |
| Synthetic 2026 Full Year | ${results[0]!.synthetic2026.fullYear.returnPct >= 0 ? '+' : ''}${results[0]!.synthetic2026.fullYear.returnPct.toFixed(2)}% | ${results[0]!.synthetic2026.fullYear.completedTrades} | ${results[0]!.synthetic2026.fullYear.winRate.toFixed(1)}% | ${results[0]!.synthetic2026.fullYear.maxDrawdown.toFixed(2)}% |
| Synthetic 2027 Full Year | ${results[0]!.synthetic2027.fullYear.returnPct >= 0 ? '+' : ''}${results[0]!.synthetic2027.fullYear.returnPct.toFixed(2)}% | ${results[0]!.synthetic2027.fullYear.completedTrades} | ${results[0]!.synthetic2027.fullYear.winRate.toFixed(1)}% | ${results[0]!.synthetic2027.fullYear.maxDrawdown.toFixed(2)}% |
| 2 Years (2025-2026) | ${results[0]!.multiYear.twoYear.returnPct >= 0 ? '+' : ''}${results[0]!.multiYear.twoYear.returnPct.toFixed(2)}% | ${results[0]!.multiYear.twoYear.completedTrades} | ${results[0]!.multiYear.twoYear.winRate.toFixed(1)}% | ${results[0]!.multiYear.twoYear.maxDrawdown.toFixed(2)}% |
| 3 Years (2025-2027) | ${results[0]!.multiYear.threeYear.returnPct >= 0 ? '+' : ''}${results[0]!.multiYear.threeYear.returnPct.toFixed(2)}% | ${results[0]!.multiYear.threeYear.completedTrades} | ${results[0]!.multiYear.threeYear.winRate.toFixed(1)}% | ${results[0]!.multiYear.threeYear.maxDrawdown.toFixed(2)}% |

---
*Optimization tested against historical 2025, synthetic 2026/2027, and multi-year periods*
`;

  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `comprehensive-optimization-kelly-atr-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('🏆 TOP 5 CONFIGURATIONS');
  console.log('='.repeat(60));
  
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i]!;
    console.log(`\n${i + 1}. ${r.bullishName} + ${r.bearishName} | Kelly: ${r.kellyMultiplier} | ATR: ${r.atrMultiplier}x (Score: ${r.score.toFixed(2)})`);
    console.log(`   Hist: ${r.historical.fullYear.returnPct >= 0 ? '+' : ''}${r.historical.fullYear.returnPct.toFixed(2)}%, Synth2026: ${r.synthetic2026.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic2026.fullYear.returnPct.toFixed(2)}%, Synth2027: ${r.synthetic2027.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic2027.fullYear.returnPct.toFixed(2)}%`);
    console.log(`   3 Years: ${r.multiYear.threeYear.returnPct >= 0 ? '+' : ''}${r.multiYear.threeYear.returnPct.toFixed(2)}% (${r.multiYear.threeYear.completedTrades} trades)`);
  }

  console.log(`\n✅ Optimization complete!`);
  console.log(`📄 Full report saved to: ${reportPath}`);
}

main()
  .then(async () => {
    await disconnectRedis();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Error:', error);
    await disconnectRedis();
    process.exit(1);
  });

