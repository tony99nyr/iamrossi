#!/usr/bin/env npx tsx
/**
 * Parameter Tuning Script
 * 
 * Tests different parameter combinations to find optimal balance:
 * - Win rate >50%
 * - High profits (close to baseline)
 * - Lower drawdown (<50% target)
 * 
 * Usage:
 *   pnpm tsx scripts/tune-risk-parameters.ts [asset]
 */

import { runBacktest } from './backfill-test';
import type { TradingAsset } from '@/lib/asset-config';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import { disconnectRedis } from '@/lib/kv';
import * as fs from 'fs';
import * as path from 'path';

interface TestConfig {
  name: string;
  entryThresholdIncrease: number; // Percentage increase for buy threshold (0.05 = 5%, 0.10 = 10%)
  atrMultiplier: number; // Stop loss multiplier (1.5, 1.75, 2.0)
  maxDrawdownExitThreshold: number; // Critical drawdown to force exit (0.25 = 25%)
  maxPositionHoldPeriods: number; // Max periods to hold losing positions
}

interface TestResult {
  config: TestConfig;
  metrics: {
    return: number;
    maxDrawdown: number;
    winRate: number;
    trades: number;
    sharpeRatio: number;
  };
  score: number; // Combined score (higher is better)
}

const TEST_PERIODS = [
  { name: 'Full Year 2025', startDate: '2025-01-01', endDate: '2025-12-27', isSynthetic: false },
  { name: '3 Years (2025-2027)', startDate: '2025-01-01', endDate: '2027-12-31', isSynthetic: false },
];

const TEST_CONFIGS: TestConfig[] = [
  // Test intermediate entry thresholds (between 5% and 10%)
  {
    name: '6% Entry, 1.5 ATR',
    entryThresholdIncrease: 0.06,
    atrMultiplier: 1.5,
    maxDrawdownExitThreshold: 0.25,
    maxPositionHoldPeriods: 50,
  },
  {
    name: '6% Entry, 1.75 ATR',
    entryThresholdIncrease: 0.06,
    atrMultiplier: 1.75,
    maxDrawdownExitThreshold: 0.25,
    maxPositionHoldPeriods: 50,
  },
  {
    name: '6% Entry, 1.5 ATR, 20% Exit',
    entryThresholdIncrease: 0.06,
    atrMultiplier: 1.5,
    maxDrawdownExitThreshold: 0.20,
    maxPositionHoldPeriods: 40,
  },
  {
    name: '6% Entry, 1.75 ATR, 20% Exit',
    entryThresholdIncrease: 0.06,
    atrMultiplier: 1.75,
    maxDrawdownExitThreshold: 0.20,
    maxPositionHoldPeriods: 40,
  },
  // Test 5% with tighter drawdown control
  {
    name: '5% Entry, 1.5 ATR, 20% Exit',
    entryThresholdIncrease: 0.05,
    atrMultiplier: 1.5,
    maxDrawdownExitThreshold: 0.20,
    maxPositionHoldPeriods: 40,
  },
  {
    name: '5% Entry, 1.75 ATR, 20% Exit',
    entryThresholdIncrease: 0.05,
    atrMultiplier: 1.75,
    maxDrawdownExitThreshold: 0.20,
    maxPositionHoldPeriods: 40,
  },
  // Test 7.5% with tighter drawdown control
  {
    name: '7.5% Entry, 1.5 ATR, 20% Exit',
    entryThresholdIncrease: 0.075,
    atrMultiplier: 1.5,
    maxDrawdownExitThreshold: 0.20,
    maxPositionHoldPeriods: 40,
  },
];

/**
 * Calculate score for a test result
 * Higher score = better balance of return, win rate, and drawdown control
 */
function calculateScore(result: TestResult): number {
  const { return: ret, maxDrawdown, winRate, sharpeRatio } = result.metrics;
  
  // Prioritize: Win rate >45%, returns >100%, drawdown <50%
  // Adjusted scoring to better reflect user priorities
  
  // Win rate: Heavy weight, bonus for >45%
  const winRateScore = winRate >= 0.45 
    ? 50 + (winRate - 0.45) * 100  // Bonus for >45%
    : winRate * 100; // Linear up to 45%
  
  // Returns: Weighted, target >100% (baseline was 118%)
  const returnScore = ret >= 100 
    ? 40 + Math.min(20, (ret - 100) * 0.2)  // Bonus for >100%
    : ret * 0.4; // Linear up to 100%
  
  // Drawdown: Heavy penalty for >50%, moderate for 30-50%, light for <30%
  const drawdownPenalty = maxDrawdown > 0.5 
    ? -maxDrawdown * 80  // Very heavy penalty for >50%
    : maxDrawdown > 0.3
    ? -maxDrawdown * 40  // Medium penalty for 30-50%
    : -maxDrawdown * 20; // Light penalty for <30%
  
  const sharpeBonus = sharpeRatio > 0 ? sharpeRatio * 5 : 0;
  
  // Bonus for reasonable trade count
  const tradeBonus = result.metrics.trades >= 30 && result.metrics.trades <= 150 ? 10 : 0;
  
  return winRateScore + returnScore + drawdownPenalty + sharpeBonus + tradeBonus;
}

/**
 * Test a configuration
 */
async function testConfig(
  config: TestConfig,
  asset: TradingAsset
): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${config.name}`);
  console.log(`${'='.repeat(60)}`);
  
  // We'll need to modify the strategy to use these parameters
  // For now, we'll test on the 3-year period as it's most comprehensive
  const testPeriod = TEST_PERIODS.find(p => p.name === '3 Years (2025-2027)')!;
  
  try {
    // Create custom config with tuning parameters
    const customConfig: EnhancedAdaptiveStrategyConfig = {
      bullishStrategy: {
        name: 'Bullish-Hybrid',
        timeframe: '8h',
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
      bearishStrategy: {
        name: 'Bearish-Recovery',
        timeframe: '8h',
        indicators: [
          { type: 'sma', weight: 0.5, params: { period: 20 } },
          { type: 'ema', weight: 0.5, params: { period: 12 } },
        ],
        buyThreshold: 0.65,
        sellThreshold: -0.25,
        maxPositionPct: 0.3,
        initialCapital: 1000,
      },
      regimeConfidenceThreshold: 0.22,
      momentumConfirmationThreshold: 0.26,
      regimePersistencePeriods: 1,
      bullishPositionMultiplier: 1.0,
      maxBullishPosition: 0.90,
      // Tuning parameters
      entryThresholdMultiplier: 1.0 + config.entryThresholdIncrease, // Convert percentage to multiplier
      maxDrawdownExitThreshold: config.maxDrawdownExitThreshold,
      maxPositionHoldPeriods: config.maxPositionHoldPeriods,
      stopLoss: {
        enabled: true,
        atrMultiplier: config.atrMultiplier,
        trailing: true,
        useEMA: true,
        atrPeriod: 14,
      },
    };
    
    const result = await runBacktest(
      testPeriod.startDate,
      testPeriod.endDate,
      testPeriod.isSynthetic,
      customConfig, // Use custom config
      undefined, // kellyMultiplier
      undefined, // atrMultiplier (already in config)
      asset
    );
    
    const metrics = {
      return: result.totalReturnPct,
      maxDrawdown: result.maxDrawdownPct,
      winRate: result.winTrades / Math.max(1, result.totalTrades),
      trades: result.totalTrades,
      sharpeRatio: result.sharpeRatio,
    };
    
    const testResult: TestResult = {
      config,
      metrics,
      score: 0, // Will calculate after
    };
    
    testResult.score = calculateScore(testResult);
    
    console.log(`   Return: ${metrics.return.toFixed(2)}%`);
    console.log(`   Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
    console.log(`   Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
    console.log(`   Trades: ${metrics.trades}`);
    console.log(`   Score: ${testResult.score.toFixed(2)}`);
    
    return testResult;
  } catch (error) {
    console.error(`   Error testing ${config.name}:`, error);
    return {
      config,
      metrics: {
        return: 0,
        maxDrawdown: 100,
        winRate: 0,
        trades: 0,
        sharpeRatio: 0,
      },
      score: -1000,
    };
  }
}

/**
 * Generate report
 */
function generateReport(results: TestResult[]): string {
  let report = '# Parameter Tuning Results\n\n';
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Test Period**: 3 Years (2025-2027)\n\n`;
  
  // Sort by score
  results.sort((a, b) => b.score - a.score);
  
  report += `## Results Summary\n\n`;
  report += `| Rank | Config | Return | Drawdown | Win Rate | Trades | Score |\n`;
  report += `|------|--------|--------|----------|----------|--------|-------|\n`;
  
  results.forEach((result, index) => {
    const { config, metrics, score } = result;
    report += `| ${index + 1} | ${config.name} | ${metrics.return.toFixed(2)}% | ${metrics.maxDrawdown.toFixed(2)}% | ${(metrics.winRate * 100).toFixed(1)}% | ${metrics.trades} | ${score.toFixed(2)} |\n`;
  });
  
  report += `\n## Best Configuration\n\n`;
  const best = results[0]!;
  report += `**${best.config.name}**\n\n`;
  report += `- **Return**: ${best.metrics.return.toFixed(2)}%\n`;
  report += `- **Max Drawdown**: ${best.metrics.maxDrawdown.toFixed(2)}%\n`;
  report += `- **Win Rate**: ${(best.metrics.winRate * 100).toFixed(1)}%\n`;
  report += `- **Trades**: ${best.metrics.trades}\n`;
  report += `- **Score**: ${best.score.toFixed(2)}\n\n`;
  
  report += `### Parameters:\n`;
  report += `- Entry Threshold Increase: ${(best.config.entryThresholdIncrease * 100).toFixed(1)}%\n`;
  report += `- ATR Multiplier: ${best.config.atrMultiplier}\n`;
  report += `- Max Drawdown Exit Threshold: ${(best.config.maxDrawdownExitThreshold * 100).toFixed(0)}%\n`;
  report += `- Max Position Hold Periods: ${best.config.maxPositionHoldPeriods}\n`;
  
  return report;
}

async function main() {
  const asset = (process.argv[2] as TradingAsset) || 'eth';
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Parameter Tuning for ${asset.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`Testing ${TEST_CONFIGS.length} configurations...\n`);
  
  const results: TestResult[] = [];
  
  for (const config of TEST_CONFIGS) {
    const result = await testConfig(config, asset);
    results.push(result);
  }
  
  // Generate report
  const report = generateReport(results);
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL RESULTS');
  console.log(`${'='.repeat(60)}\n`);
  console.log(report);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportFile = path.join(
    reportDir,
    `parameter-tuning-${asset}-${Date.now()}.md`
  );
  fs.writeFileSync(reportFile, report);
  console.log(`\n📄 Report saved to: ${reportFile}`);
}

if (require.main === module) {
  main()
    .then(async () => {
      try {
        await disconnectRedis();
      } catch (error) {
        // Ignore disconnect errors
      }
      setImmediate(() => process.exit(0));
    })
    .catch(async (error) => {
      console.error('Error:', error);
      try {
        await disconnectRedis();
      } catch {
        // Ignore disconnect errors
      }
      setImmediate(() => process.exit(1));
    });
}

