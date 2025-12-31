#!/usr/bin/env npx tsx
/**
 * Independent Strategy Optimization
 * Tests bullish and bearish strategies independently to find the best combination
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

// Define bullish strategy variations
const BULLISH_STRATEGIES: Array<{ name: string; config: TradingConfig }> = [
  {
    name: 'Conservative',
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
    name: 'Moderate',
    config: {
      name: 'Bullish-Moderate',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.3, params: { period: 20 } },
        { type: 'ema', weight: 0.3, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.2, params: { period: 14 } },
      ],
      buyThreshold: 0.35,
      sellThreshold: -0.35,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Aggressive',
    config: {
      name: 'Bullish-Aggressive',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.3, params: { period: 20 } },
        { type: 'ema', weight: 0.3, params: { period: 12 } },
        { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
        { type: 'rsi', weight: 0.2, params: { period: 14 } },
      ],
      buyThreshold: 0.3,
      sellThreshold: -0.3,
      maxPositionPct: 0.90,
      initialCapital: 1000,
    },
  },
  {
    name: 'Trend Following',
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
];

// Define bearish strategy variations
const BEARISH_STRATEGIES: Array<{ name: string; config: TradingConfig }> = [
  {
    name: 'Very Conservative',
    config: {
      name: 'Bearish-VeryConservative',
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
  },
  {
    name: 'Recovery Focused',
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
    name: 'Moderate',
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
    name: 'Flexible',
    config: {
      name: 'Bearish-Flexible',
      timeframe: TIMEFRAME,
      indicators: [
        { type: 'sma', weight: 0.5, params: { period: 20 } },
        { type: 'ema', weight: 0.5, params: { period: 12 } },
      ],
      buyThreshold: 0.6,
      sellThreshold: -0.2,
      maxPositionPct: 0.3,
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
  console.log('🔬 Independent Strategy Optimization\n');
  console.log(`Testing ${BULLISH_STRATEGIES.length} bullish × ${BEARISH_STRATEGIES.length} bearish = ${BULLISH_STRATEGIES.length * BEARISH_STRATEGIES.length} combinations\n`);

  const results: Array<{
    bullishName: string;
    bearishName: string;
    bullish: PeriodMetrics;
    bearish: PeriodMetrics;
    fullYear: PeriodMetrics;
    score: number;
  }> = [];

  let combination = 0;
  const total = BULLISH_STRATEGIES.length * BEARISH_STRATEGIES.length;

  for (const bullish of BULLISH_STRATEGIES) {
    for (const bearish of BEARISH_STRATEGIES) {
      combination++;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing Combination ${combination}/${total}: ${bullish.name} + ${bearish.name}`);
      console.log('='.repeat(60));

      // Test historical periods
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

      // Test synthetic periods
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
        SYNTHETIC_PERIODS[4]!.start,
        SYNTHETIC_PERIODS[4]!.end,
        true
      );

      // Calculate score (weighted - includes both historical and synthetic)
      const score = 
        (fullYearResult.returnPct * 0.3) +  // Historical full year 30%
        (synthFullYear.returnPct * 0.3) +  // Synthetic full year 30%
        (bullishResult.returnPct * 0.1) +  // Historical bullish 10%
        (synthBullRun.returnPct * 0.1) +  // Synthetic bull run 10%
        (bearishResult.returnPct * 0.05) +  // Historical bearish 5%
        (fullYearResult.vsEthHold * 0.05) +  // Historical outperformance 5%
        (synthFullYear.vsEthHold * 0.05) -  // Synthetic outperformance 5%
        (fullYearResult.maxDrawdown * 0.025) -  // Historical drawdown penalty 2.5%
        (synthFullYear.maxDrawdown * 0.025);  // Synthetic drawdown penalty 2.5%

  results.push({
    bullishName: bullish.name,
    bearishName: bearish.name,
    bullish: bullishResult,
    bearish: bearishResult,
    fullYear: fullYearResult,
    synthFullYear: synthFullYear,
    synthBullRun: synthBullRun,
    score,
  });

      console.log(`  Hist Bullish: ${bullishResult.tradeCount} trades, ${bullishResult.returnPct >= 0 ? '+' : ''}${bullishResult.returnPct.toFixed(2)}%`);
      console.log(`  Hist Bearish: ${bearishResult.tradeCount} trades, ${bearishResult.returnPct >= 0 ? '+' : ''}${bearishResult.returnPct.toFixed(2)}%`);
      console.log(`  Hist Full Year: ${fullYearResult.tradeCount} trades, ${fullYearResult.returnPct >= 0 ? '+' : ''}${fullYearResult.returnPct.toFixed(2)}%`);
      console.log(`  Synth Full Year: ${synthFullYear.tradeCount} trades, ${synthFullYear.returnPct >= 0 ? '+' : ''}${synthFullYear.returnPct.toFixed(2)}%`);
      console.log(`  Synth Bull Run: ${synthBullRun.tradeCount} trades, ${synthBullRun.returnPct >= 0 ? '+' : ''}${synthBullRun.returnPct.toFixed(2)}%`);
      console.log(`  Score: ${score.toFixed(2)}`);
    }
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  // Generate report
  const report = generateReport(results as StrategyResult[]);
  
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `independent-strategy-optimization-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('🏆 TOP 5 COMBINATIONS');
  console.log('='.repeat(60));
  
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i]!;
    console.log(`\n${i + 1}. ${r.bullishName} + ${r.bearishName} (Score: ${r.score.toFixed(2)})`);
    console.log(`   Hist Full Year: ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% (${r.fullYear.tradeCount} trades, ${r.fullYear.winRate.toFixed(1)}% win rate)`);
    console.log(`   Synth Full Year: ${r.synthFullYear.returnPct >= 0 ? '+' : ''}${r.synthFullYear.returnPct.toFixed(2)}% (${r.synthFullYear.tradeCount} trades)`);
    console.log(`   Hist Bullish: ${r.bullish.returnPct >= 0 ? '+' : ''}${r.bullish.returnPct.toFixed(2)}% (${r.bullish.tradeCount} trades)`);
    console.log(`   Hist Bearish: ${r.bearish.returnPct >= 0 ? '+' : ''}${r.bearish.returnPct.toFixed(2)}% (${r.bearish.tradeCount} trades)`);
    console.log(`   Max DD: ${r.fullYear.maxDrawdown.toFixed(2)}%`);
  }

  console.log(`\n✅ Optimization complete!`);
  console.log(`📄 Full report saved to: ${reportPath}`);
}

function generateReport(results: StrategyResult[]): string {
  return `# Independent Strategy Optimization Results

**Generated**: ${new Date().toISOString()}
**Timeframe**: ${TIMEFRAME}
**Tested**: ${BULLISH_STRATEGIES.length} bullish strategies × ${BEARISH_STRATEGIES.length} bearish strategies = ${results.length} combinations

## Summary

| Rank | Bullish | Bearish | Score | Hist Full Year | Synth Full Year | Hist Bullish | Hist Bearish | Trades | Win Rate | Max DD |
|------|---------|---------|-------|----------------|----------------|--------------|--------------|--------|----------|--------|
${results.map((r, i) => `| ${i + 1} | ${r.bullishName} | ${r.bearishName} | ${r.score.toFixed(2)} | ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% | ${r.synthFullYear.returnPct >= 0 ? '+' : ''}${r.synthFullYear.returnPct.toFixed(2)}% | ${r.bullish.returnPct >= 0 ? '+' : ''}${r.bullish.returnPct.toFixed(2)}% | ${r.bearish.returnPct >= 0 ? '+' : ''}${r.bearish.returnPct.toFixed(2)}% | ${r.fullYear.tradeCount} | ${r.fullYear.winRate.toFixed(1)}% | ${r.fullYear.maxDrawdown.toFixed(2)}% |`).join('\n')}

## Detailed Results

${results.map(r => `
### ${r.bullishName} + ${r.bearishName} (Score: ${r.score.toFixed(2)})

**Bullish Strategy**: ${r.bullishName}
**Bearish Strategy**: ${r.bearishName}

**Historical Full Year Performance**:
- Return: ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}%
- Trades: ${r.fullYear.tradeCount}
- Win Rate: ${r.fullYear.winRate.toFixed(1)}%
- Max Drawdown: ${r.fullYear.maxDrawdown.toFixed(2)}%
- Sharpe Ratio: ${r.fullYear.sharpeRatio.toFixed(3)}

**Synthetic Full Year Performance**:
- Return: ${r.synthFullYear.returnPct >= 0 ? '+' : ''}${r.synthFullYear.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.synthFullYear.vsEthHold >= 0 ? '+' : ''}${r.synthFullYear.vsEthHold.toFixed(2)}%
- Trades: ${r.synthFullYear.tradeCount}
- Win Rate: ${r.synthFullYear.winRate.toFixed(1)}%
- Max Drawdown: ${r.synthFullYear.maxDrawdown.toFixed(2)}%

**Synthetic Bull Run Performance**:
- Return: ${r.synthBullRun.returnPct >= 0 ? '+' : ''}${r.synthBullRun.returnPct.toFixed(2)}%
- Trades: ${r.synthBullRun.tradeCount}
- Win Rate: ${r.synthBullRun.winRate.toFixed(1)}%

**Bullish Period Performance**:
- Return: ${r.bullish.returnPct >= 0 ? '+' : ''}${r.bullish.returnPct.toFixed(2)}%
- Trades: ${r.bullish.tradeCount}
- Win Rate: ${r.bullish.winRate.toFixed(1)}%

**Bearish Period Performance**:
- Return: ${r.bearish.returnPct >= 0 ? '+' : ''}${r.bearish.returnPct.toFixed(2)}%
- Trades: ${r.bearish.tradeCount}
- Win Rate: ${r.bearish.winRate.toFixed(1)}%
`).join('\n---\n')}

## Recommendations

Based on independent optimization, the best combination should:
1. Maximize full year returns
2. Perform well in both bullish and bearish periods
3. Have reasonable trade frequency
4. Maintain good win rate
5. Control drawdown

---
*Optimization tested against historical 2025 data*
`;
}

main().catch(console.error);

