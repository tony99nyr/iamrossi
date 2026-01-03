#!/usr/bin/env npx tsx
/**
 * Walk-Forward Optimization
 * 
 * Optimizes strategy on rolling windows to prevent overfitting.
 * Tests out-of-sample performance and compares to current optimization approach.
 * 
 * Usage:
 *   pnpm tsx scripts/walk-forward-optimization.ts [asset] [window-months] [step-months]
 * 
 * Examples:
 *   pnpm tsx scripts/walk-forward-optimization.ts eth 6 3
 *     → 6-month optimization windows, stepping forward 3 months at a time
 *   
 *   pnpm tsx scripts/walk-forward-optimization.ts eth 12 6
 *     → 12-month optimization windows, stepping forward 6 months at a time
 */

import { runBacktest } from './backfill-test';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingAsset } from '@/lib/asset-config';
import { getAllTestPeriods } from './ml-strategy-optimizer';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import { disconnectRedis } from '@/lib/kv';
import * as fs from 'fs';
import * as path from 'path';

interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  windowIndex: number;
}

interface OptimizationResult {
  config: EnhancedAdaptiveStrategyConfig;
  metrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
}

interface WalkForwardResult {
  window: WalkForwardWindow;
  optimizedConfig: EnhancedAdaptiveStrategyConfig;
  trainMetrics: OptimizationResult['metrics'];
  testMetrics: OptimizationResult['metrics'];
  defaultTestMetrics: OptimizationResult['metrics'];
}

/**
 * Generate rolling windows for walk-forward optimization
 */
function generateWalkForwardWindows(
  startDate: string,
  endDate: string,
  windowMonths: number,
  stepMonths: number
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let currentTrainStart = new Date(start);
  
  while (currentTrainStart < end) {
    // Training window
    const trainEnd = new Date(currentTrainStart);
    trainEnd.setMonth(trainEnd.getMonth() + windowMonths);
    
    // Test window (next period after training)
    const testStart = new Date(trainEnd);
    const testEnd = new Date(testStart);
    testEnd.setMonth(testEnd.getMonth() + stepMonths);
    
    // Don't create windows that extend beyond available data
    if (trainEnd > end) break;
    if (testEnd > end) {
      testEnd.setTime(end.getTime());
    }
    
    windows.push({
      trainStart: currentTrainStart.toISOString().split('T')[0]!,
      trainEnd: trainEnd.toISOString().split('T')[0]!,
      testStart: testStart.toISOString().split('T')[0]!,
      testEnd: testEnd.toISOString().split('T')[0]!,
      windowIndex: windows.length,
    });
    
    // Step forward
    currentTrainStart.setMonth(currentTrainStart.getMonth() + stepMonths);
  }
  
  return windows;
}

/**
 * Generate a random config for optimization
 */
function generateRandomConfig(baseConfig: EnhancedAdaptiveStrategyConfig): EnhancedAdaptiveStrategyConfig {
  return {
    ...baseConfig,
    bullishStrategy: {
      ...baseConfig.bullishStrategy,
      buyThreshold: 0.2 + Math.random() * 0.4, // 0.2-0.6
      sellThreshold: -0.5 + Math.random() * 0.2, // -0.5 to -0.3
    },
    bearishStrategy: {
      ...baseConfig.bearishStrategy,
      buyThreshold: 0.5 + Math.random() * 0.3, // 0.5-0.8
      sellThreshold: -0.3 + Math.random() * 0.1, // -0.3 to -0.2
    },
    regimeConfidenceThreshold: 0.15 + Math.random() * 0.15, // 0.15-0.30
    momentumConfirmationThreshold: 0.2 + Math.random() * 0.15, // 0.2-0.35
    kellyCriterion: {
      enabled: true,
      fractionalMultiplier: 0.15 + Math.random() * 0.25, // 0.15-0.40
      minTrades: 10,
      lookbackPeriod: 50,
    },
    stopLoss: {
      enabled: true,
      atrMultiplier: 1.2 + Math.random() * 1.3, // 1.2-2.5 (tighter range, lower default)
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    },
  };
}

/**
 * Test a config on a period
 */
async function testConfigOnPeriod(
  config: EnhancedAdaptiveStrategyConfig,
  asset: TradingAsset,
  startDate: string,
  endDate: string,
  isSynthetic: boolean
): Promise<OptimizationResult['metrics']> {
  const result = await runBacktest(
    startDate,
    endDate,
    isSynthetic,
    config
  );
  
  return {
    totalReturn: result.totalReturnPct,
    sharpeRatio: result.sharpeRatio,
    maxDrawdown: result.maxDrawdownPct,
    winRate: result.winTrades / Math.max(1, result.totalTrades),
    totalTrades: result.totalTrades,
  };
}

/**
 * Optimize config on training window
 */
async function optimizeOnWindow(
  baseConfig: EnhancedAdaptiveStrategyConfig,
  asset: TradingAsset,
  trainStart: string,
  trainEnd: string,
  isSynthetic: boolean,
  numCandidates: number = 50
): Promise<EnhancedAdaptiveStrategyConfig> {
  // Generate candidate configs
  const candidates = Array.from({ length: numCandidates }, () => 
    generateRandomConfig(baseConfig)
  );
  
  // Test all candidates with improved scoring function
  const results = await Promise.all(
    candidates.map(async (config) => {
      const metrics = await testConfigOnPeriod(config, asset, trainStart, trainEnd, isSynthetic);
      
      // Improved scoring: prioritize risk-adjusted returns and penalize extreme drawdowns heavily
      // Components:
      // - Return: 40% weight (profitability)
      // - Sharpe Ratio: 25% weight (risk-adjusted returns)
      // - Win Rate: 20% weight (consistency)
      // - Drawdown: 15% weight (heavy penalty for extreme drawdowns)
      const returnScore = metrics.totalReturn * 0.40;
      const sharpeScore = metrics.sharpeRatio * 25 * 0.25; // Scale Sharpe (typically 0-2 range)
      const winRateScore = metrics.winRate * 100 * 0.20; // Win rate as percentage
      
      // Heavy penalty for extreme drawdowns (exponential penalty)
      let drawdownPenalty = 0;
      if (metrics.maxDrawdown > 0.5) {
        // Extreme drawdown (>50%): massive penalty
        drawdownPenalty = -metrics.maxDrawdown * 100 * 0.30;
      } else if (metrics.maxDrawdown > 0.25) {
        // High drawdown (25-50%): large penalty
        drawdownPenalty = -metrics.maxDrawdown * 100 * 0.20;
      } else {
        // Normal drawdown (<25%): moderate penalty
        drawdownPenalty = -metrics.maxDrawdown * 100 * 0.15;
      }
      
      // Bonus for reasonable trade frequency (not too few, not too many)
      const tradeFrequencyBonus = metrics.totalTrades >= 10 && metrics.totalTrades <= 200 
        ? 5 
        : -Math.abs(metrics.totalTrades - 50) * 0.1;
      
      const score = returnScore + sharpeScore + winRateScore + drawdownPenalty + tradeFrequencyBonus;
      return { config, metrics, score };
    })
  );
  
  // Return best config
  results.sort((a, b) => b.score - a.score);
  return results[0]!.config;
}

/**
 * Main walk-forward optimization
 */
async function runWalkForwardOptimization(
  asset: TradingAsset,
  startDate: string,
  endDate: string,
  windowMonths: number,
  stepMonths: number,
  isSynthetic: boolean = true
): Promise<WalkForwardResult[]> {
  console.log(`🚀 Starting Walk-Forward Optimization for ${asset.toUpperCase()}\n`);
  console.log(`   Date Range: ${startDate} to ${endDate}`);
  console.log(`   Window Size: ${windowMonths} months`);
  console.log(`   Step Size: ${stepMonths} months`);
  console.log(`   Data Type: ${isSynthetic ? 'Synthetic' : 'Historical'}\n`);
  
  // Generate windows
  const windows = generateWalkForwardWindows(startDate, endDate, windowMonths, stepMonths);
  console.log(`   Generated ${windows.length} walk-forward windows\n`);
  
  // Base config
  const baseConfig: EnhancedAdaptiveStrategyConfig = {
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
    kellyCriterion: {
      enabled: true,
      fractionalMultiplier: 0.25,
      minTrades: 10,
      lookbackPeriod: 50,
    },
    stopLoss: {
      enabled: true,
      atrMultiplier: 2.0, // Baseline configuration (2.0x ATR)
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    },
    entryThresholdMultiplier: 1.0, // No entry threshold increase (baseline)
    maxDrawdownThreshold: 0.20, // 20% pause threshold
    maxDrawdownExitThreshold: 0.25, // 25% force exit threshold
    maxPositionHoldPeriods: 50, // Max periods to hold losing positions
  };
  
  const results: WalkForwardResult[] = [];
  
  for (const window of windows) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Window ${window.windowIndex + 1}/${windows.length}`);
    console.log(`Training: ${window.trainStart} to ${window.trainEnd}`);
    console.log(`Testing:  ${window.testStart} to ${window.testEnd}`);
    console.log(`${'='.repeat(60)}`);
    
    // Optimize on training window
    console.log(`   Optimizing on training window...`);
    const optimizedConfig = await optimizeOnWindow(
      baseConfig,
      asset,
      window.trainStart,
      window.trainEnd,
      isSynthetic,
      50
    );
    
    // Test optimized config on training window
    console.log(`   Testing optimized config on training window...`);
    const trainMetrics = await testConfigOnPeriod(
      optimizedConfig,
      asset,
      window.trainStart,
      window.trainEnd,
      isSynthetic
    );
    
    // Test optimized config on test window (out-of-sample)
    console.log(`   Testing optimized config on test window (out-of-sample)...`);
    const testMetrics = await testConfigOnPeriod(
      optimizedConfig,
      asset,
      window.testStart,
      window.testEnd,
      isSynthetic
    );
    
    // Test default config on test window for comparison
    console.log(`   Testing default config on test window (baseline)...`);
    const defaultTestMetrics = await testConfigOnPeriod(
      baseConfig,
      asset,
      window.testStart,
      window.testEnd,
      isSynthetic
    );
    
    results.push({
      window,
      optimizedConfig,
      trainMetrics,
      testMetrics,
      defaultTestMetrics,
    });
    
    console.log(`\n   Results:`);
    console.log(`   Training Return: ${trainMetrics.totalReturn.toFixed(2)}%`);
    console.log(`   Test Return (Optimized): ${testMetrics.totalReturn.toFixed(2)}%`);
    console.log(`   Test Return (Default): ${defaultTestMetrics.totalReturn.toFixed(2)}%`);
    console.log(`   Out-of-Sample Improvement: ${(testMetrics.totalReturn - defaultTestMetrics.totalReturn).toFixed(2)}%`);
  }
  
  return results;
}

/**
 * Generate report
 */
function generateReport(results: WalkForwardResult[]): string {
  let report = '# Walk-Forward Optimization Results\n\n';
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Total Windows**: ${results.length}\n\n`;
  
  // Summary statistics
  const avgTrainReturn = results.reduce((sum, r) => sum + r.trainMetrics.totalReturn, 0) / results.length;
  const avgTestReturn = results.reduce((sum, r) => sum + r.testMetrics.totalReturn, 0) / results.length;
  const avgDefaultReturn = results.reduce((sum, r) => sum + r.defaultTestMetrics.totalReturn, 0) / results.length;
  const avgImprovement = avgTestReturn - avgDefaultReturn;
  
  report += `## Summary Statistics\n\n`;
  report += `- **Average Training Return**: ${avgTrainReturn.toFixed(2)}%\n`;
  report += `- **Average Test Return (Optimized)**: ${avgTestReturn.toFixed(2)}%\n`;
  report += `- **Average Test Return (Default)**: ${avgDefaultReturn.toFixed(2)}%\n`;
  report += `- **Average Out-of-Sample Improvement**: ${avgImprovement.toFixed(2)}%\n`;
  report += `- **Improvement Rate**: ${results.filter(r => r.testMetrics.totalReturn > r.defaultTestMetrics.totalReturn).length}/${results.length} (${(results.filter(r => r.testMetrics.totalReturn > r.defaultTestMetrics.totalReturn).length / results.length * 100).toFixed(1)}%)\n\n`;
  
  // Detailed results
  report += `## Detailed Results\n\n`;
  report += `| Window | Train Return | Test Return (Opt) | Test Return (Default) | Improvement |\n`;
  report += `|--------|--------------|-------------------|----------------------|-------------|\n`;
  
  for (const result of results) {
    const improvement = result.testMetrics.totalReturn - result.defaultTestMetrics.totalReturn;
    report += `| ${result.window.windowIndex + 1} | ${result.trainMetrics.totalReturn.toFixed(2)}% | ${result.testMetrics.totalReturn.toFixed(2)}% | ${result.defaultTestMetrics.totalReturn.toFixed(2)}% | ${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}% |\n`;
  }
  
  return report;
}

async function main() {
  const asset = (process.argv[2] as TradingAsset) || 'eth';
  const windowMonths = parseInt(process.argv[3] || '6', 10);
  const stepMonths = parseInt(process.argv[4] || '3', 10);
  
  // Use synthetic 2026 data for walk-forward optimization
  const startDate = '2026-01-01';
  const endDate = '2026-12-31';
  const isSynthetic = true;
  
  const results = await runWalkForwardOptimization(
    asset,
    startDate,
    endDate,
    windowMonths,
    stepMonths,
    isSynthetic
  );
  
  // Generate report
  const report = generateReport(results);
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL REPORT');
  console.log(`${'='.repeat(60)}\n`);
  console.log(report);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportFile = path.join(
    reportDir,
    `walk-forward-optimization-${asset}-${Date.now()}.md`
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
      // Force exit immediately - don't wait for any async operations
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

