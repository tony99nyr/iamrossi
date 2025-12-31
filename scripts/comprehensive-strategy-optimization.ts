#!/usr/bin/env npx tsx
/**
 * Comprehensive Strategy Optimization
 * Tests multiple strategy configurations against historical and synthetic data
 * Finds optimal balance of profit and risk
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import type { PriceCandle, Portfolio, Trade } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import { v4 as uuidv4 } from 'uuid';

const TIMEFRAME = '8h';

interface OptimizationResult {
  configName: string;
  config: EnhancedAdaptiveStrategyConfig;
  historical: {
    bullish: PeriodMetrics;
    bearish: PeriodMetrics;
    fullYear: PeriodMetrics;
  };
  synthetic: {
    fullYear: PeriodMetrics;
    q1: PeriodMetrics;
    q2: PeriodMetrics;
    q3: PeriodMetrics;
    bullRun: PeriodMetrics;
    crash: PeriodMetrics;
    bearMarket: PeriodMetrics;
    whipsaw: PeriodMetrics;
  };
  overallScore: number;
}

interface PeriodMetrics {
  return: number;
  returnPct: number;
  vsEthHold: number;
  tradeCount: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

const HISTORICAL_PERIODS = [
  { name: 'bullish', start: '2025-04-01', end: '2025-08-23' },
  { name: 'bearish', start: '2025-01-01', end: '2025-06-01' },
  { name: 'fullYear', start: '2025-01-01', end: '2025-12-27' },
];

const SYNTHETIC_PERIODS = [
  { name: 'fullYear', start: '2026-01-01', end: '2026-12-31' },
  { name: 'q1', start: '2026-01-01', end: '2026-03-31' },
  { name: 'q2', start: '2026-04-01', end: '2026-06-30' },
  { name: 'q3', start: '2026-07-01', end: '2026-09-30' },
  { name: 'bullRun', start: '2026-03-01', end: '2026-04-30' },
  { name: 'crash', start: '2026-05-01', end: '2026-05-15' },
  { name: 'bearMarket', start: '2026-07-01', end: '2026-08-31' },
  { name: 'whipsaw', start: '2026-09-01', end: '2026-09-30' },
];

function loadSynthetic2026Data(): PriceCandle[] {
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const filepath = path.join(dataDir, 'ethusdt_8h_2026-01-01_2026-12-30.json.gz');
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Synthetic 8h data not found: ${filepath}`);
  }
  
  const compressed = fs.readFileSync(filepath);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString()) as PriceCandle[];
}

function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[]
): Trade | null {
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  const basePositionSize = portfolio.usdcBalance * (activeStrategy.maxPositionPct || 0.75);
  const positionSize = signal.positionSizeMultiplier * basePositionSize * confidence;

  if (isBuy && portfolio.usdcBalance >= positionSize) {
    const ethAmount = positionSize / currentPrice;
    portfolio.usdcBalance -= positionSize;
    portfolio.ethBalance += ethAmount;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;

    const trade: Trade = {
      id: uuidv4(),
      type: 'buy',
      timestamp: Date.now(),
      ethPrice: currentPrice,
      ethAmount,
      usdcAmount: positionSize,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
    };

    trades.push(trade);
    return trade;
  } else if (!isBuy && portfolio.ethBalance > 0) {
    const ethToSell = Math.min(portfolio.ethBalance, portfolio.ethBalance * (activeStrategy.maxPositionPct || 0.75));
    const saleValue = ethToSell * currentPrice;
    portfolio.ethBalance -= ethToSell;
    portfolio.usdcBalance += saleValue;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;

    const lastBuyTrade = [...trades].reverse().find(t => t.type === 'buy');
    if (lastBuyTrade) {
      const buyCost = lastBuyTrade.usdcAmount;
      const profit = saleValue - buyCost;
      if (profit > 0) portfolio.winCount++;
    }

    const trade: Trade = {
      id: uuidv4(),
      type: 'sell',
      timestamp: Date.now(),
      ethPrice: currentPrice,
      ethAmount: ethToSell,
      usdcAmount: saleValue,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
    };

    trades.push(trade);
    return trade;
  }

  return null;
}

async function testPeriod(
  config: EnhancedAdaptiveStrategyConfig,
  startDate: string,
  endDate: string,
  isSynthetic: boolean = false
): Promise<PeriodMetrics> {
  clearRegimeHistory();
  clearIndicatorCache();

  let candles: PriceCandle[];
  if (isSynthetic) {
    candles = loadSynthetic2026Data();
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
  } else {
    const historyStartDate = new Date(startDate);
    historyStartDate.setDate(historyStartDate.getDate() - 200);
    const historyStart = historyStartDate.toISOString().split('T')[0];
    const minHistoryDate = '2025-01-01';
    const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
    candles = await fetchPriceCandles('ETHUSDT', TIMEFRAME, actualHistoryStart, endDate);
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
    };
  }

  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  const minIndex = Math.max(50, Math.floor(candles.length * 0.1));
  if (startIndex < minIndex) startIndex = minIndex;

  const portfolio: Portfolio = {
    usdcBalance: config.bullishStrategy.initialCapital,
    ethBalance: 0,
    totalValue: config.bullishStrategy.initialCapital,
    initialCapital: config.bullishStrategy.initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };

  const trades: Trade[] = [];
  const sessionId = `optimize-${Date.now()}`;
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  const returns: number[] = [];

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;

    const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    executeTrade(signal, confidence, currentPrice, portfolio, trades);

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

  const sellTrades = trades.filter(t => t.type === 'sell').length;
  const winRate = sellTrades > 0 ? (portfolio.winCount / sellTrades) * 100 : 0;

  return {
    return: portfolio.totalReturn,
    returnPct,
    vsEthHold: returnPct - ethHoldReturnPct,
    tradeCount: trades.length,
    winRate,
    maxDrawdown: (maxDrawdown / portfolio.initialCapital) * 100,
    sharpeRatio,
  };
}

// Define optimization configurations
const OPTIMIZATION_CONFIGS: Array<{ name: string; config: EnhancedAdaptiveStrategyConfig }> = [
  // Config 1: Current Baseline
  {
    name: 'Baseline (Current)',
    config: {
      bullishStrategy: {
        name: 'Bullish-Conservative',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.3, params: { period: 20 } },
          { type: 'ema', weight: 0.3, params: { period: 12 } },
          { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
          { type: 'rsi', weight: 0.2, params: { period: 14 } },
        ],
        buyThreshold: 0.4,
        sellThreshold: -0.3,
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Strategy1',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.8,
        sellThreshold: -0.2,
        maxPositionPct: 0.2,
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.25,
      momentumConfirmationThreshold: 0.3,
      bullishPositionMultiplier: 1.0,
      regimePersistencePeriods: 2,
      dynamicPositionSizing: false,
      maxBullishPosition: 0.90,
      maxVolatility: 0.0167,
      circuitBreakerWinRate: 0.2,
      circuitBreakerLookback: 10,
      whipsawDetectionPeriods: 5,
      whipsawMaxChanges: 3,
    },
  },

  // Config 2: More Aggressive (Lower thresholds, more trades)
  {
    name: 'Aggressive',
    config: {
      bullishStrategy: {
        name: 'Bullish-Aggressive',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.3, params: { period: 20 } },
          { type: 'ema', weight: 0.3, params: { period: 12 } },
          { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
          { type: 'rsi', weight: 0.2, params: { period: 14 } },
        ],
        buyThreshold: 0.3,  // Lower - trade on weaker signals
        sellThreshold: -0.25,  // Less negative - exit sooner
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Bearish-Aggressive',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.6,  // Lower - more willing to buy in bearish
        sellThreshold: -0.15,  // Less negative - exit sooner
        maxPositionPct: 0.3,  // Larger positions in bearish
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.20,  // Lower - switch faster
      momentumConfirmationThreshold: 0.25,  // Lower - less strict
      bullishPositionMultiplier: 1.0,
      regimePersistencePeriods: 1,  // Less persistent - switch faster
      dynamicPositionSizing: false,
      maxBullishPosition: 0.90,
      maxVolatility: 0.02,  // Higher volatility tolerance
      circuitBreakerWinRate: 0.15,  // Lower threshold
      circuitBreakerLookback: 15,
      whipsawDetectionPeriods: 6,  // More lenient
      whipsawMaxChanges: 4,
    },
  },

  // Config 3: Balanced (Moderate thresholds, good risk/reward)
  {
    name: 'Balanced',
    config: {
      bullishStrategy: {
        name: 'Bullish-Balanced',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.3, params: { period: 20 } },
          { type: 'ema', weight: 0.3, params: { period: 12 } },
          { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
          { type: 'rsi', weight: 0.2, params: { period: 14 } },
        ],
        buyThreshold: 0.35,  // Slightly lower
        sellThreshold: -0.35,  // More negative - hold through dips
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Bearish-Balanced',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.7,  // Still high but not extreme
        sellThreshold: -0.25,  // Moderate
        maxPositionPct: 0.25,  // Slightly larger
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.22,  // Slightly lower
      momentumConfirmationThreshold: 0.28,  // Slightly lower
      bullishPositionMultiplier: 1.0,
      regimePersistencePeriods: 1,  // Less strict
      dynamicPositionSizing: false,
      maxBullishPosition: 0.90,
      maxVolatility: 0.018,  // Slightly higher
      circuitBreakerWinRate: 0.18,
      circuitBreakerLookback: 12,
      whipsawDetectionPeriods: 5,
      whipsawMaxChanges: 3,
    },
  },

  // Config 4: Trend Following (Hold longer, trade less)
  {
    name: 'Trend Following',
    config: {
      bullishStrategy: {
        name: 'Bullish-Trend',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.4, params: { period: 20 } },
          { type: 'ema', weight: 0.4, params: { period: 12 } },
          { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        ],
        buyThreshold: 0.45,  // Higher - only strong trends
        sellThreshold: -0.5,  // Very negative - hold through dips
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Bearish-Trend',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.75,  // Very high
        sellThreshold: -0.3,  // Moderate
        maxPositionPct: 0.2,
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.28,  // Higher confidence
      momentumConfirmationThreshold: 0.35,  // Higher momentum
      bullishPositionMultiplier: 1.0,
      regimePersistencePeriods: 2,  // Require persistence
      dynamicPositionSizing: false,
      maxBullishPosition: 0.90,
      maxVolatility: 0.0167,
      circuitBreakerWinRate: 0.2,
      circuitBreakerLookback: 10,
      whipsawDetectionPeriods: 5,
      whipsawMaxChanges: 3,
    },
  },

  // Config 5: Adaptive Thresholds (Lower confidence, more flexible)
  {
    name: 'Adaptive Flexible',
    config: {
      bullishStrategy: {
        name: 'Bullish-Flexible',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.3, params: { period: 20 } },
          { type: 'ema', weight: 0.3, params: { period: 12 } },
          { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
          { type: 'rsi', weight: 0.2, params: { period: 14 } },
        ],
        buyThreshold: 0.35,
        sellThreshold: -0.3,
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Bearish-Flexible',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.65,  // Lower than baseline
        sellThreshold: -0.2,
        maxPositionPct: 0.25,  // Larger positions
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.20,  // Lower - more flexible
      momentumConfirmationThreshold: 0.25,  // Lower
      bullishPositionMultiplier: 1.0,
      regimePersistencePeriods: 1,  // Less strict
      dynamicPositionSizing: false,
      maxBullishPosition: 0.90,
      maxVolatility: 0.02,  // Higher tolerance
      circuitBreakerWinRate: 0.15,
      circuitBreakerLookback: 15,
      whipsawDetectionPeriods: 6,
      whipsawMaxChanges: 4,
    },
  },

  // Config 6: Conservative Recovery (Better in bearish/recovery periods)
  {
    name: 'Conservative Recovery',
    config: {
      bullishStrategy: {
        name: 'Bullish-Recovery',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.3, params: { period: 20 } },
          { type: 'ema', weight: 0.3, params: { period: 12 } },
          { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
          { type: 'rsi', weight: 0.2, params: { period: 14 } },
        ],
        buyThreshold: 0.4,
        sellThreshold: -0.4,  // Hold through more dips
        maxPositionPct: 0.90,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Bearish-Recovery',
        timeframe: TIMEFRAME,
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.65,  // Lower - catch recovery signals
        sellThreshold: -0.25,  // Moderate
        maxPositionPct: 0.3,  // Larger positions for recovery
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.22,
      momentumConfirmationThreshold: 0.26,  // Slightly lower
      bullishPositionMultiplier: 1.0,
      regimePersistencePeriods: 1,  // Faster switching
      dynamicPositionSizing: false,
      maxBullishPosition: 0.90,
      maxVolatility: 0.019,  // Higher tolerance
      circuitBreakerWinRate: 0.18,
      circuitBreakerLookback: 12,
      whipsawDetectionPeriods: 5,
      whipsawMaxChanges: 3,
    },
  },
];

async function main() {
  console.log('🔬 Comprehensive Strategy Optimization\n');
  console.log(`Testing ${OPTIMIZATION_CONFIGS.length} configurations...\n`);

  const results: OptimizationResult[] = [];

  for (const { name, config } of OPTIMIZATION_CONFIGS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${name}`);
    console.log('='.repeat(60));

    // Test historical periods
    console.log('📊 Testing historical periods...');
    const bullish = await testPeriod(config, HISTORICAL_PERIODS[0]!.start, HISTORICAL_PERIODS[0]!.end, false);
    const bearish = await testPeriod(config, HISTORICAL_PERIODS[1]!.start, HISTORICAL_PERIODS[1]!.end, false);
    const fullYear = await testPeriod(config, HISTORICAL_PERIODS[2]!.start, HISTORICAL_PERIODS[2]!.end, false);

    console.log(`  Bullish: ${bullish.tradeCount} trades, ${bullish.returnPct >= 0 ? '+' : ''}${bullish.returnPct.toFixed(2)}%`);
    console.log(`  Bearish: ${bearish.tradeCount} trades, ${bearish.returnPct >= 0 ? '+' : ''}${bearish.returnPct.toFixed(2)}%`);
    console.log(`  Full Year: ${fullYear.tradeCount} trades, ${fullYear.returnPct >= 0 ? '+' : ''}${fullYear.returnPct.toFixed(2)}%`);

    // Test synthetic periods
    console.log('🧪 Testing synthetic periods...');
    const synthFullYear = await testPeriod(config, SYNTHETIC_PERIODS[0]!.start, SYNTHETIC_PERIODS[0]!.end, true);
    const synthQ1 = await testPeriod(config, SYNTHETIC_PERIODS[1]!.start, SYNTHETIC_PERIODS[1]!.end, true);
    const synthQ2 = await testPeriod(config, SYNTHETIC_PERIODS[2]!.start, SYNTHETIC_PERIODS[2]!.end, true);
    const synthQ3 = await testPeriod(config, SYNTHETIC_PERIODS[3]!.start, SYNTHETIC_PERIODS[3]!.end, true);
    const synthBullRun = await testPeriod(config, SYNTHETIC_PERIODS[4]!.start, SYNTHETIC_PERIODS[4]!.end, true);
    const synthCrash = await testPeriod(config, SYNTHETIC_PERIODS[5]!.start, SYNTHETIC_PERIODS[5]!.end, true);
    const synthBearMarket = await testPeriod(config, SYNTHETIC_PERIODS[6]!.start, SYNTHETIC_PERIODS[6]!.end, true);
    const synthWhipsaw = await testPeriod(config, SYNTHETIC_PERIODS[7]!.start, SYNTHETIC_PERIODS[7]!.end, true);

    // Calculate overall score (weighted)
    const score = 
      (fullYear.returnPct * 0.3) +  // Historical full year
      (synthFullYear.returnPct * 0.3) +  // Synthetic full year
      (bullish.returnPct * 0.1) +  // Historical bullish
      (synthBullRun.returnPct * 0.1) +  // Synthetic bull run
      (fullYear.vsEthHold * 0.1) +  // Outperformance
      (synthFullYear.vsEthHold * 0.1) -  // Synthetic outperformance
      (fullYear.maxDrawdown * 0.05) -  // Penalize drawdown
      (synthFullYear.maxDrawdown * 0.05);  // Penalize synthetic drawdown

    results.push({
      configName: name,
      config,
      historical: { bullish, bearish, fullYear },
      synthetic: {
        fullYear: synthFullYear,
        q1: synthQ1,
        q2: synthQ2,
        q3: synthQ3,
        bullRun: synthBullRun,
        crash: synthCrash,
        bearMarket: synthBearMarket,
        whipsaw: synthWhipsaw,
      },
      overallScore: score,
    });

    console.log(`  Overall Score: ${score.toFixed(2)}`);
  }

  // Sort by score
  results.sort((a, b) => b.overallScore - a.overallScore);

  // Generate report
  const report = generateReport(results);
  
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `strategy-optimization-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('🏆 TOP CONFIGURATIONS');
  console.log('='.repeat(60));
  
  for (let i = 0; i < Math.min(3, results.length); i++) {
    const r = results[i]!;
    console.log(`\n${i + 1}. ${r.configName} (Score: ${r.overallScore.toFixed(2)})`);
    console.log(`   Historical Full Year: ${r.historical.fullYear.returnPct >= 0 ? '+' : ''}${r.historical.fullYear.returnPct.toFixed(2)}% (${r.historical.fullYear.tradeCount} trades)`);
    console.log(`   Synthetic Full Year: ${r.synthetic.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic.fullYear.returnPct.toFixed(2)}% (${r.synthetic.fullYear.tradeCount} trades)`);
    console.log(`   Max Drawdown: ${r.historical.fullYear.maxDrawdown.toFixed(2)}%`);
  }

  console.log(`\n✅ Optimization complete!`);
  console.log(`📄 Full report saved to: ${reportPath}`);
}

function generateReport(results: OptimizationResult[]): string {
  return `# Comprehensive Strategy Optimization Results

**Generated**: ${new Date().toISOString()}
**Timeframe**: ${TIMEFRAME}

## Summary

| Rank | Config | Score | Hist Full Year | Synth Full Year | Hist Trades | Synth Trades | Max DD |
|------|--------|-------|----------------|-----------------|-------------|--------------|--------|
${results.map((r, i) => `| ${i + 1} | **${r.configName}** | ${r.overallScore.toFixed(2)} | ${r.historical.fullYear.returnPct >= 0 ? '+' : ''}${r.historical.fullYear.returnPct.toFixed(2)}% | ${r.synthetic.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic.fullYear.returnPct.toFixed(2)}% | ${r.historical.fullYear.tradeCount} | ${r.synthetic.fullYear.tradeCount} | ${r.historical.fullYear.maxDrawdown.toFixed(2)}% |`).join('\n')}

## Detailed Results

${results.map(r => `
### ${r.configName} (Score: ${r.overallScore.toFixed(2)})

**Configuration:**
- Bullish: buy=${r.config.bullishStrategy.buyThreshold}, sell=${r.config.bullishStrategy.sellThreshold}, position=${r.config.bullishStrategy.maxPositionPct}
- Bearish: buy=${r.config.bearishStrategy.buyThreshold}, sell=${r.config.bearishStrategy.sellThreshold}, position=${r.config.bearishStrategy.maxPositionPct}
- Regime Confidence: ${r.config.regimeConfidenceThreshold}
- Momentum Threshold: ${r.config.momentumConfirmationThreshold}
- Persistence: ${r.config.regimePersistencePeriods} periods
- Max Volatility: ${r.config.maxVolatility}

**Historical Results:**
- Bullish Period: ${r.historical.bullish.returnPct >= 0 ? '+' : ''}${r.historical.bullish.returnPct.toFixed(2)}% (${r.historical.bullish.tradeCount} trades, ${r.historical.bullish.winRate.toFixed(1)}% win rate)
- Bearish Period: ${r.historical.bearish.returnPct >= 0 ? '+' : ''}${r.historical.bearish.returnPct.toFixed(2)}% (${r.historical.bearish.tradeCount} trades, ${r.historical.bearish.winRate.toFixed(1)}% win rate)
- Full Year: ${r.historical.fullYear.returnPct >= 0 ? '+' : ''}${r.historical.fullYear.returnPct.toFixed(2)}% vs ETH ${r.historical.fullYear.vsEthHold >= 0 ? '+' : ''}${r.historical.fullYear.vsEthHold.toFixed(2)}% (${r.historical.fullYear.tradeCount} trades, ${r.historical.fullYear.winRate.toFixed(1)}% win rate, ${r.historical.fullYear.maxDrawdown.toFixed(2)}% max DD)

**Synthetic Results:**
- Full Year: ${r.synthetic.fullYear.returnPct >= 0 ? '+' : ''}${r.synthetic.fullYear.returnPct.toFixed(2)}% (${r.synthetic.fullYear.tradeCount} trades)
- Q1: ${r.synthetic.q1.returnPct >= 0 ? '+' : ''}${r.synthetic.q1.returnPct.toFixed(2)}% (${r.synthetic.q1.tradeCount} trades)
- Q2: ${r.synthetic.q2.returnPct >= 0 ? '+' : ''}${r.synthetic.q2.returnPct.toFixed(2)}% (${r.synthetic.q2.tradeCount} trades)
- Q3: ${r.synthetic.q3.returnPct >= 0 ? '+' : ''}${r.synthetic.q3.returnPct.toFixed(2)}% (${r.synthetic.q3.tradeCount} trades)
- Bull Run: ${r.synthetic.bullRun.returnPct >= 0 ? '+' : ''}${r.synthetic.bullRun.returnPct.toFixed(2)}% (${r.synthetic.bullRun.tradeCount} trades)
- Crash: ${r.synthetic.crash.returnPct >= 0 ? '+' : ''}${r.synthetic.crash.returnPct.toFixed(2)}% (${r.synthetic.crash.tradeCount} trades)
- Bear Market: ${r.synthetic.bearMarket.returnPct >= 0 ? '+' : ''}${r.synthetic.bearMarket.returnPct.toFixed(2)}% (${r.synthetic.bearMarket.tradeCount} trades)
- Whipsaw: ${r.synthetic.whipsaw.returnPct >= 0 ? '+' : ''}${r.synthetic.whipsaw.returnPct.toFixed(2)}% (${r.synthetic.whipsaw.tradeCount} trades)
`).join('\n---\n')}

## Recommendations

Based on the optimization results, the top configurations are ranked by overall score which considers:
- Historical and synthetic full year returns (weighted 30% each)
- Bullish period performance (10% each)
- Outperformance vs ETH hold (10% each)
- Max drawdown penalty (5% each)

---
*Optimization tested against both historical 2025 data and synthetic 2026 data*
`;
}

main().catch(console.error);

