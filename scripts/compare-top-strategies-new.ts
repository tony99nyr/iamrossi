#!/usr/bin/env npx tsx
/**
 * Compare Top 5 Optimized Strategies + Current Config
 * Tests all configs across all periods to find the truly best one
 * NOW USES BACKFILL TEST DIRECTLY for reliable testing
 */

import { runBacktest } from './backfill-test';
import { disconnectRedis } from '@/lib/kv';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingConfig } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

const TIMEFRAME = '8h';

interface StrategyConfig {
  name: string;
  bullish: TradingConfig;
  bearish: TradingConfig;
  kellyMultiplier: number;
  atrMultiplier: number;
}

interface PeriodResult {
  returnPct: number;
  trades: number;
  completedTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  vsEthHold: number;
}

// Current config
const CURRENT_CONFIG: StrategyConfig = {
  name: 'Current',
  bullish: {
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
  bearish: {
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
  kellyMultiplier: 0.25,
  atrMultiplier: 2.0,
};

// Top 5 optimized configs (from previous optimization)
const TOP_STRATEGIES: StrategyConfig[] = [
  {
    name: 'Top 1',
    bullish: {
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
    bearish: {
      name: 'Bearish-Recovery-0.63',
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
    kellyMultiplier: 1.0,
    atrMultiplier: 2.0,
  },
  {
    name: 'Top 2',
    bullish: {
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
    bearish: {
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
    kellyMultiplier: 1.0,
    atrMultiplier: 2.0,
  },
  {
    name: 'Top 3',
    bullish: {
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
    bearish: {
      name: 'Bearish-Recovery-0.67',
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
    kellyMultiplier: 1.0,
    atrMultiplier: 2.0,
  },
  {
    name: 'Top 4',
    bullish: {
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
    bearish: {
      name: 'Bearish-Recovery-0.63',
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
    kellyMultiplier: 0.75,
    atrMultiplier: 2.0,
  },
  {
    name: 'Top 5',
    bullish: {
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
    bearish: {
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
    kellyMultiplier: 0.75,
    atrMultiplier: 2.0,
  },
];

// Test periods
const TEST_PERIODS = {
  historical2025: { start: '2025-01-01', end: '2025-12-27', synthetic: false },
  synthetic2026: { start: '2026-01-01', end: '2026-12-31', synthetic: true },
  synthetic2027: { start: '2027-01-01', end: '2027-12-31', synthetic: true },
  twoYear: { start: '2025-01-01', end: '2026-12-31', synthetic: false },
  threeYear: { start: '2025-01-01', end: '2027-12-31', synthetic: false },
};

async function testPeriod(
  strategy: StrategyConfig,
  startDate: string,
  endDate: string,
  isSynthetic: boolean
): Promise<PeriodResult> {
  // Build config from strategy
  const config: EnhancedAdaptiveStrategyConfig = {
    bullishStrategy: strategy.bullish,
    bearishStrategy: strategy.bearish,
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

  // Use backfill test directly - it handles everything correctly including synthetic periods
  const result = await runBacktest(startDate, endDate, isSynthetic, config);

  // Convert BacktestResult to PeriodResult
  return {
    returnPct: result.totalReturnPct,
    trades: result.totalTrades,
    completedTrades: result.sellTrades,
    winRate: result.sellTrades > 0 ? (result.winTrades / result.sellTrades) * 100 : 0,
    maxDrawdown: result.maxDrawdownPct,
    sharpeRatio: result.sharpeRatio,
    vsEthHold: result.totalReturnPct - result.ethHold.returnPct,
  };
}

async function compareStrategies() {
  console.log('🔬 Comparing Top 5 Optimized Strategies + Current Config\n');
  console.log('Testing 6 strategies across all periods...\n');

  const allStrategies = [CURRENT_CONFIG, ...TOP_STRATEGIES];
  const results: Array<{
    name: string;
    historical2025: PeriodResult;
    synthetic2026: PeriodResult;
    synthetic2027: PeriodResult;
    twoYear: PeriodResult;
    threeYear: PeriodResult;
    compositeScore: number;
  }> = [];

  for (const strategy of allStrategies) {
    console.log(`[${allStrategies.indexOf(strategy) + 1}/${allStrategies.length}] Testing: ${strategy.name} (${strategy.bullish.name} + ${strategy.bearish.name}, Kelly: ${strategy.kellyMultiplier}, ATR: ${strategy.atrMultiplier}x)`);

    const historical2025 = await testPeriod(strategy, TEST_PERIODS.historical2025.start, TEST_PERIODS.historical2025.end, TEST_PERIODS.historical2025.synthetic);
    const synthetic2026 = await testPeriod(strategy, TEST_PERIODS.synthetic2026.start, TEST_PERIODS.synthetic2026.end, TEST_PERIODS.synthetic2026.synthetic);
    const synthetic2027 = await testPeriod(strategy, TEST_PERIODS.synthetic2027.start, TEST_PERIODS.synthetic2027.end, TEST_PERIODS.synthetic2027.synthetic);
    const twoYear = await testPeriod(strategy, TEST_PERIODS.twoYear.start, TEST_PERIODS.twoYear.end, TEST_PERIODS.twoYear.synthetic);
    const threeYear = await testPeriod(strategy, TEST_PERIODS.threeYear.start, TEST_PERIODS.threeYear.end, TEST_PERIODS.threeYear.synthetic);

    console.log(`   Hist 2025: ${historical2025.returnPct >= 0 ? '+' : ''}${historical2025.returnPct.toFixed(2)}% (${historical2025.completedTrades} trades)`);
    console.log(`   Synth 2026: ${synthetic2026.returnPct >= 0 ? '+' : ''}${synthetic2026.returnPct.toFixed(2)}% (${synthetic2026.completedTrades} trades)`);
    console.log(`   Synth 2027: ${synthetic2027.returnPct >= 0 ? '+' : ''}${synthetic2027.returnPct.toFixed(2)}% (${synthetic2027.completedTrades} trades)`);
    console.log(`   3 Years: ${threeYear.returnPct >= 0 ? '+' : ''}${threeYear.returnPct.toFixed(2)}% (${threeYear.completedTrades} trades)`);

    // Calculate composite score (weighted average with penalties)
    let compositeScore = (
      historical2025.returnPct * 0.3 +
      synthetic2026.returnPct * 0.2 +
      synthetic2027.returnPct * 0.2 +
      threeYear.returnPct * 0.3
    );

    // Penalties
    if (synthetic2026.completedTrades < 10) compositeScore -= 50;
    if (synthetic2027.completedTrades < 10) compositeScore -= 50;
    if (historical2025.maxDrawdown > 60) compositeScore -= 20;
    if (threeYear.maxDrawdown > 70) compositeScore -= 30;

    console.log(`   Score: ${compositeScore.toFixed(2)}\n`);

    results.push({
      name: strategy.name,
      historical2025,
      synthetic2026,
      synthetic2027,
      twoYear,
      threeYear,
      compositeScore,
    });
  }

  // Sort by composite score
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  console.log('='.repeat(60));
  console.log('🏆 RANKING (by Composite Score)');
  console.log('='.repeat(60));

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    console.log(`${medal} ${r.name} (${allStrategies.find(s => s.name === r.name)?.bullish.name} + ${allStrategies.find(s => s.name === r.name)?.bearish.name}, Kelly: ${allStrategies.find(s => s.name === r.name)?.kellyMultiplier}, ATR: ${allStrategies.find(s => s.name === r.name)?.atrMultiplier}x)`);
    console.log(`   Score: ${r.compositeScore.toFixed(2)}`);
    console.log(`   Hist 2025: ${r.historical2025.returnPct >= 0 ? '+' : ''}${r.historical2025.returnPct.toFixed(2)}% (${r.historical2025.completedTrades} trades)`);
    console.log(`   Synth 2026: ${r.synthetic2026.returnPct >= 0 ? '+' : ''}${r.synthetic2026.returnPct.toFixed(2)}% (${r.synthetic2026.completedTrades} trades)`);
    console.log(`   Synth 2027: ${r.synthetic2027.returnPct >= 0 ? '+' : ''}${r.synthetic2027.returnPct.toFixed(2)}% (${r.synthetic2027.completedTrades} trades)`);
    console.log(`   3 Years: ${r.threeYear.returnPct >= 0 ? '+' : ''}${r.threeYear.returnPct.toFixed(2)}% (${r.threeYear.completedTrades} trades)`);
    if (r.synthetic2026.completedTrades < 10 || r.synthetic2027.completedTrades < 10) {
      console.log(`   ⚠️  WARNING: Insufficient trades on synthetic periods!`);
    }
    console.log('');
  }

  // Generate report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const report = `# Strategy Comparison: Top 5 Optimized + Current Config

**Generated**: ${new Date().toISOString()}
**Purpose**: Compare top optimized strategies against current config using reliable backfill test
**Method**: Uses backfill-test.ts directly for all testing (ensures synthetic periods work correctly)

## Test Periods

- **Historical 2025**: 2025-01-01 to 2025-12-27
- **Synthetic 2026**: 2026-01-01 to 2026-12-31
- **Synthetic 2027**: 2027-01-01 to 2027-12-31
- **2 Years**: 2025-01-01 to 2026-12-31
- **3 Years**: 2025-01-01 to 2027-12-31

## Results Summary

${results.map((r, i) => {
  const rank = i + 1;
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
  const strategy = allStrategies.find(s => s.name === r.name)!;
  return `
### ${medal} ${r.name}
**Composite Score**: ${r.compositeScore.toFixed(2)}
**Configuration**: ${strategy.bullish.name} + ${strategy.bearish.name} | Kelly: ${strategy.kellyMultiplier} | ATR: ${strategy.atrMultiplier}x

| Period | Return | Trades | Win Rate | Max DD | vs ETH Hold |
|--------|--------|--------|----------|--------|-------------|
| **Historical 2025** | ${r.historical2025.returnPct >= 0 ? '+' : ''}${r.historical2025.returnPct.toFixed(2)}% | ${r.historical2025.completedTrades} | ${r.historical2025.winRate.toFixed(1)}% | ${r.historical2025.maxDrawdown.toFixed(2)}% | ${r.historical2025.vsEthHold >= 0 ? '+' : ''}${r.historical2025.vsEthHold.toFixed(2)}% |
| **Synthetic 2026** | ${r.synthetic2026.returnPct >= 0 ? '+' : ''}${r.synthetic2026.returnPct.toFixed(2)}% | ${r.synthetic2026.completedTrades} | ${r.synthetic2026.winRate.toFixed(1)}% | ${r.synthetic2026.maxDrawdown.toFixed(2)}% | ${r.synthetic2026.vsEthHold >= 0 ? '+' : ''}${r.synthetic2026.vsEthHold.toFixed(2)}% |
| **Synthetic 2027** | ${r.synthetic2027.returnPct >= 0 ? '+' : ''}${r.synthetic2027.returnPct.toFixed(2)}% | ${r.synthetic2027.completedTrades} | ${r.synthetic2027.winRate.toFixed(1)}% | ${r.synthetic2027.maxDrawdown.toFixed(2)}% | ${r.synthetic2027.vsEthHold >= 0 ? '+' : ''}${r.synthetic2027.vsEthHold.toFixed(2)}% |
| **2 Years** | ${r.twoYear.returnPct >= 0 ? '+' : ''}${r.twoYear.returnPct.toFixed(2)}% | ${r.twoYear.completedTrades} | ${r.twoYear.winRate.toFixed(1)}% | ${r.twoYear.maxDrawdown.toFixed(2)}% | ${r.twoYear.vsEthHold >= 0 ? '+' : ''}${r.twoYear.vsEthHold.toFixed(2)}% |
| **3 Years** | ${r.threeYear.returnPct >= 0 ? '+' : ''}${r.threeYear.returnPct.toFixed(2)}% | ${r.threeYear.completedTrades} | ${r.threeYear.winRate.toFixed(1)}% | ${r.threeYear.maxDrawdown.toFixed(2)}% | ${r.threeYear.vsEthHold >= 0 ? '+' : ''}${r.threeYear.vsEthHold.toFixed(2)}% |

${r.synthetic2026.completedTrades < 10 || r.synthetic2027.completedTrades < 10 ? '⚠️ **WARNING**: Insufficient trades on synthetic periods!' : ''}
`;
}).join('\n')}

---

*Comparison uses backfill-test.ts directly for reliable testing across all periods*
`;

  const reportFilename = `strategy-comparison-${new Date().toISOString().replace(/:/g, '-')}.md`;
  const reportPath = path.join(reportDir, reportFilename);
  fs.writeFileSync(reportPath, report);

  console.log('✅ Comparison complete!');
  console.log(`📄 Full report saved to: ${reportPath}`);
}

async function main() {
  try {
    await compareStrategies();
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await disconnectRedis();
  }
}

main().catch(console.error);

