#!/usr/bin/env npx tsx
/**
 * Test Kelly Criterion with Extended Periods (6mo, 9mo, 12mo)
 * Focus on longer periods to see Kelly Criterion impact
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { calculateKellyCriterion, getKellyMultiplier } from '@/lib/kelly-criterion';
import { disconnectRedis } from '@/lib/kv';
import type { PriceCandle, Portfolio, Trade, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const TIMEFRAME = '8h';

interface TestResult {
  period: string;
  duration: string;
  withKelly: PeriodMetrics & { kellyStats?: any };
  withoutKelly: PeriodMetrics;
  improvement: number;
}

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

// Extended test periods
const TEST_PERIODS = [
  { name: '6 Months Q1-Q2', start: '2025-01-01', end: '2025-06-30' },
  { name: '6 Months Q2-Q3', start: '2025-04-01', end: '2025-09-30' },
  { name: '9 Months Q1-Q3', start: '2025-01-01', end: '2025-09-30' },
  { name: 'Full Year', start: '2025-01-01', end: '2025-12-27' },
];

// Use the best known config
const BULLISH_CONFIG: TradingConfig = {
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
};

const BEARISH_CONFIG: TradingConfig = {
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
};

const BASE_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: BULLISH_CONFIG,
  bearishStrategy: BEARISH_CONFIG,
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

function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[],
  candles: PriceCandle[],
  candleIndex: number,
  config: EnhancedAdaptiveStrategyConfig,
  useKelly: boolean = true,
  kellyStats: { multiplier: number; winRate?: number; wlRatio?: number }[] = []
): Trade | null {
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  // Calculate Kelly multiplier if enabled
  let kellyMultiplier = 1.0;
  let kellyWinRate = 0;
  let kellyWLRatio = 0;
  
  if (useKelly) {
    // Get completed trades (sells with P&L)
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined && t.pnl !== null);
    
    if (sellTrades.length >= 10) {
      // Map to format expected by calculateKellyCriterion
      const tradesWithPnl = sellTrades.map(t => ({ 
        ...t, 
        pnl: t.pnl! 
      })) as Array<Trade & { pnl: number }>;

      // Debug: log first few trades
      if (trades.length < 30 && sellTrades.length > 0) {
        console.log(`    [Debug] Found ${sellTrades.length} sell trades with P&L`);
        console.log(`    [Debug] First trade P&L: ${sellTrades[0]?.pnl}`);
      }

      const kellyResult = calculateKellyCriterion(tradesWithPnl, {
        minTrades: 10,
        lookbackPeriod: Math.min(50, sellTrades.length),
        fractionalMultiplier: 0.25, // Start with 25%
      });

      if (kellyResult) {
        kellyMultiplier = getKellyMultiplier(kellyResult, activeStrategy.maxPositionPct || 0.9);
        kellyWinRate = kellyResult.winRate;
        kellyWLRatio = kellyResult.winLossRatio;
        
        // Track Kelly stats
        kellyStats.push({
          multiplier: kellyMultiplier,
          winRate: kellyResult.winRate,
          wlRatio: kellyResult.winLossRatio,
        });
        
        // Track Kelly stats (no verbose logging)
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
    return trade;
  }

  return null;
}

async function testPeriod(
  startDate: string,
  endDate: string,
  useKelly: boolean
): Promise<PeriodMetrics & { kellyStats?: any }> {
  clearRegimeHistory();
  clearIndicatorCache();

  const historyStartDate = new Date(startDate);
  historyStartDate.setDate(historyStartDate.getDate() - 200);
  const historyStart = historyStartDate.toISOString().split('T')[0];
  const minHistoryDate = '2025-01-01';
  const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
  
  const candles = await fetchPriceCandles('ETHUSDT', TIMEFRAME, actualHistoryStart, endDate);

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

  const portfolio: Portfolio = {
    usdcBalance: BULLISH_CONFIG.initialCapital,
    ethBalance: 0,
    totalValue: BULLISH_CONFIG.initialCapital,
    initialCapital: BULLISH_CONFIG.initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };

  const trades: Trade[] = [];
  const sessionId = `kelly-test-${Date.now()}`;
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  const returns: number[] = [];
  const kellyStats: { multiplier: number; winRate?: number; wlRatio?: number }[] = [];

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;

    const signal = generateEnhancedAdaptiveSignal(candles, BASE_CONFIG, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    executeTrade(signal, confidence, currentPrice, portfolio, trades, candles, i, BASE_CONFIG, useKelly, kellyStats);

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

  // Calculate average Kelly stats
  const avgKellyMultiplier = kellyStats.length > 0
    ? kellyStats.reduce((sum, s) => sum + s.multiplier, 0) / kellyStats.length
    : 1.0;
  const avgWinRate = kellyStats.length > 0 && kellyStats[0]?.winRate !== undefined
    ? kellyStats.reduce((sum, s) => sum + (s.winRate || 0), 0) / kellyStats.length
    : 0;
  const avgWLRatio = kellyStats.length > 0 && kellyStats[0]?.wlRatio !== undefined
    ? kellyStats.reduce((sum, s) => sum + (s.wlRatio || 0), 0) / kellyStats.length
    : 0;

  return {
    return: portfolio.totalReturn,
    returnPct,
    vsEthHold: returnPct - ethHoldReturnPct,
    tradeCount: trades.length,
    winRate,
    maxDrawdown: (maxDrawdown / portfolio.initialCapital) * 100,
    sharpeRatio,
    completedTrades,
    kellyStats: useKelly ? {
      avgMultiplier: avgKellyMultiplier,
      avgWinRate: avgWinRate,
      avgWLRatio: avgWLRatio,
      samples: kellyStats.length,
    } : undefined,
  };
}

async function main() {
  console.log('🔬 Testing Kelly Criterion with Extended Periods\n');
  console.log('Testing Hybrid-0.41 + Recovery-0.65 configuration\n');
  console.log('Each period tested with and without Kelly Criterion\n');

  const results: TestResult[] = [];

  for (const period of TEST_PERIODS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${period.name} (${period.start} to ${period.end})`);
    console.log('='.repeat(60));

    // Test without Kelly
    console.log('\n📊 Running WITHOUT Kelly Criterion...');
    const withoutKelly = await testPeriod(period.start, period.end, false);
    console.log(`   Return: ${withoutKelly.returnPct >= 0 ? '+' : ''}${withoutKelly.returnPct.toFixed(2)}%`);
    console.log(`   Trades: ${withoutKelly.tradeCount} (${withoutKelly.completedTrades} completed)`);
    console.log(`   Win Rate: ${withoutKelly.winRate.toFixed(1)}%`);

    // Test with Kelly
    console.log('\n📊 Running WITH Kelly Criterion...');
    const withKelly = await testPeriod(period.start, period.end, true);
    console.log(`   Return: ${withKelly.returnPct >= 0 ? '+' : ''}${withKelly.returnPct.toFixed(2)}%`);
    console.log(`   Trades: ${withKelly.tradeCount} (${withKelly.completedTrades} completed)`);
    console.log(`   Win Rate: ${withKelly.winRate.toFixed(1)}%`);
    
    if (withKelly.kellyStats) {
      console.log(`   Kelly Stats:`);
      console.log(`     - Avg Multiplier: ${withKelly.kellyStats.avgMultiplier.toFixed(3)}`);
      console.log(`     - Avg Win Rate: ${(withKelly.kellyStats.avgWinRate * 100).toFixed(1)}%`);
      console.log(`     - Avg W/L Ratio: ${withKelly.kellyStats.avgWLRatio.toFixed(2)}`);
      console.log(`     - Samples: ${withKelly.kellyStats.samples}`);
    }

    const improvement = withKelly.returnPct - withoutKelly.returnPct;
    const improvementPct = ((withKelly.returnPct - withoutKelly.returnPct) / Math.abs(withoutKelly.returnPct)) * 100;
    
    console.log(`\n   💡 Improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}% (${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}% relative)`);

    results.push({
      period: period.name,
      duration: `${period.start} to ${period.end}`,
      withKelly,
      withoutKelly,
      improvement,
    });
  }

  // Generate report
  const report = `# Kelly Criterion Testing - Extended Periods

**Generated**: ${new Date().toISOString()}
**Configuration**: Hybrid-0.41 + Recovery-0.65
**Timeframe**: ${TIMEFRAME}

## Results Summary

| Period | Duration | Without Kelly | With Kelly | Improvement | Trades | Win Rate |
|--------|----------|---------------|------------|-------------|--------|----------|
${results.map(r => {
  const improvementPct = ((r.withKelly.returnPct - r.withoutKelly.returnPct) / Math.abs(r.withoutKelly.returnPct)) * 100;
  return `| ${r.period} | ${r.duration} | ${r.withoutKelly.returnPct >= 0 ? '+' : ''}${r.withoutKelly.returnPct.toFixed(2)}% | ${r.withKelly.returnPct >= 0 ? '+' : ''}${r.withKelly.returnPct.toFixed(2)}% | ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(2)}% (${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}%) | ${r.withKelly.completedTrades} | ${r.withKelly.winRate.toFixed(1)}% |`;
}).join('\n')}

## Detailed Results

${results.map(r => {
  const improvementPct = ((r.withKelly.returnPct - r.withoutKelly.returnPct) / Math.abs(r.withoutKelly.returnPct)) * 100;
  return `
### ${r.period} (${r.duration})

**Without Kelly Criterion**:
- Return: ${r.withoutKelly.returnPct >= 0 ? '+' : ''}${r.withoutKelly.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.withoutKelly.vsEthHold >= 0 ? '+' : ''}${r.withoutKelly.vsEthHold.toFixed(2)}%
- Trades: ${r.withoutKelly.tradeCount} (${r.withoutKelly.completedTrades} completed)
- Win Rate: ${r.withoutKelly.winRate.toFixed(1)}%
- Max Drawdown: ${r.withoutKelly.maxDrawdown.toFixed(2)}%

**With Kelly Criterion**:
- Return: ${r.withKelly.returnPct >= 0 ? '+' : ''}${r.withKelly.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.withKelly.vsEthHold >= 0 ? '+' : ''}${r.withKelly.vsEthHold.toFixed(2)}%
- Trades: ${r.withKelly.tradeCount} (${r.withKelly.completedTrades} completed)
- Win Rate: ${r.withKelly.winRate.toFixed(1)}%
- Max Drawdown: ${r.withKelly.maxDrawdown.toFixed(2)}%
${r.withKelly.kellyStats ? `
- Kelly Stats:
  - Avg Multiplier: ${r.withKelly.kellyStats.avgMultiplier.toFixed(3)}
  - Avg Win Rate: ${(r.withKelly.kellyStats.avgWinRate * 100).toFixed(1)}%
  - Avg W/L Ratio: ${r.withKelly.kellyStats.avgWLRatio.toFixed(2)}
  - Samples: ${r.withKelly.kellyStats.samples}
` : ''}

**Improvement**: ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(2)}% (${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}% relative)
`;
}).join('\n---\n')}

---
*Kelly Criterion uses 25% fractional Kelly for safety*
`;

  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `kelly-extended-test-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  for (const r of results) {
    const improvementPct = ((r.withKelly.returnPct - r.withoutKelly.returnPct) / Math.abs(r.withoutKelly.returnPct)) * 100;
    console.log(`\n${r.period}:`);
    console.log(`  Without Kelly: ${r.withoutKelly.returnPct >= 0 ? '+' : ''}${r.withoutKelly.returnPct.toFixed(2)}%`);
    console.log(`  With Kelly:    ${r.withKelly.returnPct >= 0 ? '+' : ''}${r.withKelly.returnPct.toFixed(2)}%`);
    console.log(`  Improvement:   ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(2)}% (${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}%)`);
    if (r.withKelly.kellyStats) {
      console.log(`  Kelly Multiplier: ${r.withKelly.kellyStats.avgMultiplier.toFixed(3)} (${r.withKelly.kellyStats.samples} samples)`);
    }
  }

  console.log(`\n✅ Test complete!`);
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

