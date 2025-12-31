#!/usr/bin/env npx tsx
/**
 * Advanced Strategy Optimization
 * Tests more granular variations and combinations to beat Conservative + Recovery Focused
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import type { PriceCandle, Portfolio, Trade, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import { v4 as uuidv4 } from 'uuid';

const TIMEFRAME = '8h';

interface StrategyResult {
  bullishName: string;
  bearishName: string;
  bullish: PeriodMetrics;
  bearish: PeriodMetrics;
  fullYear: PeriodMetrics;
  synthFullYear: PeriodMetrics;
  synthBullRun: PeriodMetrics;
  score: number;
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
  { name: 'bullRun', start: '2026-03-01', end: '2026-04-30' },
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

async function testStrategy(
  bullishConfig: TradingConfig,
  bearishConfig: TradingConfig,
  baseConfig: Partial<EnhancedAdaptiveStrategyConfig>,
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

// Expanded bullish strategy variations with more granular thresholds
const BULLISH_STRATEGIES: Array<{ name: string; config: TradingConfig }> = [
  // Conservative variations
  {
    name: 'Conservative-0.4',
    config: {
      name: 'Bullish-Conservative',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.3, params: { period: 20 } },
        { type: 'ema', weight: 0.3, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.2, params: { period: 14 } },
      ],
      buyThreshold: 0.4,
      sellThreshold: -0.4,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Conservative-0.38',
    config: {
      name: 'Bullish-Conservative-38',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.3, params: { period: 20 } },
        { type: 'ema', weight: 0.3, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.2, params: { period: 14 } },
      ],
      buyThreshold: 0.38,
      sellThreshold: -0.42,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Conservative-0.42',
    config: {
      name: 'Bullish-Conservative-42',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.3, params: { period: 20 } },
        { type: 'ema', weight: 0.3, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.2, params: { period: 14 } },
      ],
      buyThreshold: 0.42,
      sellThreshold: -0.38,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  // Trend Following variations
  {
    name: 'Trend-0.45',
    config: {
      name: 'Bullish-Trend',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.4, params: { period: 20 } },
        { type: 'ema', weight: 0.4, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      ],
      buyThreshold: 0.45,
      sellThreshold: -0.5,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Trend-0.43',
    config: {
      name: 'Bullish-Trend-43',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.4, params: { period: 20 } },
        { type: 'ema', weight: 0.4, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      ],
      buyThreshold: 0.43,
      sellThreshold: -0.48,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Trend-0.47',
    config: {
      name: 'Bullish-Trend-47',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.4, params: { period: 20 } },
        { type: 'ema', weight: 0.4, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      ],
      buyThreshold: 0.47,
      sellThreshold: -0.52,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  // Hybrid - between conservative and trend
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
];

// Expanded bearish strategy variations
const BEARISH_STRATEGIES: Array<{ name: string; config: TradingConfig }> = [
  // Recovery Focused variations
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
      name: 'Bearish-Recovery-63',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.63,
      sellThreshold: -0.27,
      maxPositionPct: 0.32,
      initialCapital: 1000,
    },
  },
  {
    name: 'Recovery-0.67',
    config: {
      name: 'Bearish-Recovery-67',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.67,
      sellThreshold: -0.23,
      maxPositionPct: 0.28,
      initialCapital: 1000,
    },
  },
  // Moderate variations
  {
    name: 'Moderate-0.7',
    config: {
      name: 'Bearish-Moderate',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.7,
      sellThreshold: -0.25,
      maxPositionPct: 0.25,
      initialCapital: 1000,
    },
  },
  {
    name: 'Moderate-0.68',
    config: {
      name: 'Bearish-Moderate-68',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.68,
      sellThreshold: -0.26,
      maxPositionPct: 0.27,
      initialCapital: 1000,
    },
  },
  // More aggressive recovery
  {
    name: 'Recovery-Aggressive-0.6',
    config: {
      name: 'Bearish-Recovery-Agg',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.6,
      sellThreshold: -0.22,
      maxPositionPct: 0.35,
      initialCapital: 1000,
    },
  },
];

// Base config (shared settings)
const BASE_CONFIG: Partial<EnhancedAdaptiveStrategyConfig> = {
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

async function main() {
  console.log('🔬 Advanced Strategy Optimization\n');
  console.log(`Testing ${BULLISH_STRATEGIES.length} bullish × ${BEARISH_STRATEGIES.length} bearish = ${BULLISH_STRATEGIES.length * BEARISH_STRATEGIES.length} combinations\n`);

  const results: StrategyResult[] = [];
  const bestKnown = { score: 50.46, name: 'Conservative-0.4 + Recovery-0.65' }; // Current best

  let combination = 0;
  const total = BULLISH_STRATEGIES.length * BEARISH_STRATEGIES.length;

  for (const bullish of BULLISH_STRATEGIES) {
    for (const bearish of BEARISH_STRATEGIES) {
      combination++;
      console.log(`\n[${combination}/${total}] Testing: ${bullish.name} + ${bearish.name}`);

      const bullishResult = await testStrategy(
        bullish.config,
        bearish.config,
        BASE_CONFIG,
        HISTORICAL_PERIODS[0]!.start,
        HISTORICAL_PERIODS[0]!.end,
        false
      );

      const bearishResult = await testStrategy(
        bullish.config,
        bearish.config,
        BASE_CONFIG,
        HISTORICAL_PERIODS[1]!.start,
        HISTORICAL_PERIODS[1]!.end,
        false
      );

      const fullYearResult = await testStrategy(
        bullish.config,
        bearish.config,
        BASE_CONFIG,
        HISTORICAL_PERIODS[2]!.start,
        HISTORICAL_PERIODS[2]!.end,
        false
      );

      const synthFullYear = await testStrategy(
        bullish.config,
        bearish.config,
        BASE_CONFIG,
        SYNTHETIC_PERIODS[0]!.start,
        SYNTHETIC_PERIODS[0]!.end,
        true
      );

      const synthBullRun = await testStrategy(
        bullish.config,
        bearish.config,
        BASE_CONFIG,
        SYNTHETIC_PERIODS[1]!.start,
        SYNTHETIC_PERIODS[1]!.end,
        true
      );

      const score = 
        (fullYearResult.returnPct * 0.3) +
        (synthFullYear.returnPct * 0.3) +
        (bullishResult.returnPct * 0.1) +
        (synthBullRun.returnPct * 0.1) +
        (bearishResult.returnPct * 0.05) +
        (fullYearResult.vsEthHold * 0.05) +
        (synthFullYear.vsEthHold * 0.05) -
        (fullYearResult.maxDrawdown * 0.025) -
        (synthFullYear.maxDrawdown * 0.025);

      results.push({
        bullishName: bullish.name,
        bearishName: bearish.name,
        bullish: bullishResult,
        bearish: bearishResult,
        fullYear: fullYearResult,
        synthFullYear,
        synthBullRun,
        score,
      });

      const improvement = score - bestKnown.score;
      const status = improvement > 0 ? '✅ BEATS BEST' : improvement > -1 ? '⚠️ Close' : '';
      console.log(`  Score: ${score.toFixed(2)} (${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)} vs best) ${status}`);
      console.log(`  Hist: ${fullYearResult.returnPct.toFixed(2)}%, Synth: ${synthFullYear.returnPct.toFixed(2)}%`);
    }
  }

  results.sort((a, b) => b.score - a.score);

  const report = generateReport(results, bestKnown);
  
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `advanced-strategy-optimization-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('🏆 TOP 5 COMBINATIONS');
  console.log('='.repeat(60));
  
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i]!;
    const improvement = r.score - bestKnown.score;
    console.log(`\n${i + 1}. ${r.bullishName} + ${r.bearishName} (Score: ${r.score.toFixed(2)}) ${improvement > 0 ? '✅ NEW BEST!' : ''}`);
    console.log(`   Hist Full Year: ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% (${r.fullYear.tradeCount} trades)`);
    console.log(`   Synth Full Year: ${r.synthFullYear.returnPct >= 0 ? '+' : ''}${r.synthFullYear.returnPct.toFixed(2)}% (${r.synthFullYear.tradeCount} trades)`);
    console.log(`   Improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)} vs best known`);
  }

  console.log(`\n✅ Optimization complete!`);
  console.log(`📄 Full report saved to: ${reportPath}`);
}

function generateReport(results: StrategyResult[], bestKnown: { score: number; name: string }): string {
  return `# Advanced Strategy Optimization Results

**Generated**: ${new Date().toISOString()}
**Timeframe**: ${TIMEFRAME}
**Tested**: ${BULLISH_STRATEGIES.length} bullish strategies × ${BEARISH_STRATEGIES.length} bearish strategies = ${results.length} combinations
**Best Known**: ${bestKnown.name} (Score: ${bestKnown.score.toFixed(2)})

## Summary

| Rank | Bullish | Bearish | Score | vs Best | Hist Full Year | Synth Full Year | Trades | Win Rate | Max DD |
|------|---------|---------|-------|---------|----------------|----------------|--------|----------|--------|
${results.map((r, i) => {
  const improvement = r.score - bestKnown.score;
  return `| ${i + 1} | ${r.bullishName} | ${r.bearishName} | ${r.score.toFixed(2)} | ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)} | ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% | ${r.synthFullYear.returnPct >= 0 ? '+' : ''}${r.synthFullYear.returnPct.toFixed(2)}% | ${r.fullYear.tradeCount} | ${r.fullYear.winRate.toFixed(1)}% | ${r.fullYear.maxDrawdown.toFixed(2)}% |`;
}).join('\n')}

## Top Performers

${results.slice(0, 10).map(r => {
  const improvement = r.score - bestKnown.score;
  return `
### ${r.bullishName} + ${r.bearishName} (Score: ${r.score.toFixed(2)}) ${improvement > 0 ? '✅ NEW BEST!' : ''}

**Improvement**: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)} vs best known

**Historical Full Year**:
- Return: ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}%
- Trades: ${r.fullYear.tradeCount}
- Win Rate: ${r.fullYear.winRate.toFixed(1)}%
- Max Drawdown: ${r.fullYear.maxDrawdown.toFixed(2)}%

**Synthetic Full Year**:
- Return: ${r.synthFullYear.returnPct >= 0 ? '+' : ''}${r.synthFullYear.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.synthFullYear.vsEthHold >= 0 ? '+' : ''}${r.synthFullYear.vsEthHold.toFixed(2)}%
- Trades: ${r.synthFullYear.tradeCount}
- Win Rate: ${r.synthFullYear.winRate.toFixed(1)}%

**Bullish Period**: ${r.bullish.returnPct >= 0 ? '+' : ''}${r.bullish.returnPct.toFixed(2)}% (${r.bullish.tradeCount} trades)
**Bearish Period**: ${r.bearish.returnPct >= 0 ? '+' : ''}${r.bearish.returnPct.toFixed(2)}% (${r.bearish.tradeCount} trades)
**Synthetic Bull Run**: ${r.synthBullRun.returnPct >= 0 ? '+' : ''}${r.synthBullRun.returnPct.toFixed(2)}% (${r.synthBullRun.tradeCount} trades)
`;
}).join('\n---\n')}

---
*Optimization tested against both historical 2025 and synthetic 2026 data*
`;
}

main().catch(console.error);

