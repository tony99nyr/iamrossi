#!/usr/bin/env npx tsx
/**
 * Out-of-Sample Validation
 * 
 * Holds out 20% of data for final validation to ensure strategy generalizes
 * to unseen market conditions.
 * 
 * Usage:
 *   pnpm tsx scripts/out-of-sample-validation.ts [asset] [holdout-percent]
 * 
 * Examples:
 *   pnpm tsx scripts/out-of-sample-validation.ts eth
 *     → Uses 80% for training, 20% for validation (default)
 *   
 *   pnpm tsx scripts/out-of-sample-validation.ts eth 0.3
 *     → Uses 70% for training, 30% for validation
 */

import { runBacktest } from './backfill-test';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingAsset } from '@/lib/asset-config';
import { getAllTestPeriods } from './ml-strategy-optimizer';
import { disconnectRedis } from '@/lib/kv';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  trainPeriods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>;
  validationPeriods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>;
  trainMetrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
  validationMetrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
  overfittingScore: number; // Difference between train and validation performance
}

/**
 * Split periods into training and validation sets
 */
function splitPeriods(
  periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>,
  holdoutPercent: number = 0.2
): {
  train: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>;
  validation: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>;
} {
  // Shuffle periods for random split
  const shuffled = [...periods].sort(() => Math.random() - 0.5);
  
  const splitIndex = Math.floor(shuffled.length * (1 - holdoutPercent));
  return {
    train: shuffled.slice(0, splitIndex),
    validation: shuffled.slice(splitIndex),
  };
}

/**
 * Test config on multiple periods and aggregate results
 */
async function testConfigOnPeriods(
  config: EnhancedAdaptiveStrategyConfig,
  asset: TradingAsset,
  periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>
): Promise<{
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
}> {
  const results = await Promise.all(
    periods.map(async (period) => {
      const result = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        config,
        undefined,
        undefined,
        asset
      );
      
      return {
        return: result.totalReturnPct,
        sharpe: result.sharpeRatio,
        drawdown: result.maxDrawdownPct,
        winRate: result.winTrades / Math.max(1, result.totalTrades),
        trades: result.totalTrades,
      };
    })
  );
  
  // Aggregate metrics (weighted by number of trades)
  const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
  const weightedReturn = results.reduce((sum, r) => sum + r.return * r.trades, 0) / Math.max(1, totalTrades);
  const weightedSharpe = results.reduce((sum, r) => sum + r.sharpe * r.trades, 0) / Math.max(1, totalTrades);
  const maxDrawdown = Math.max(...results.map(r => r.drawdown));
  const weightedWinRate = results.reduce((sum, r) => sum + r.winRate * r.trades, 0) / Math.max(1, totalTrades);
  
  return {
    totalReturn: weightedReturn,
    sharpeRatio: weightedSharpe,
    maxDrawdown,
    winRate: weightedWinRate,
    totalTrades,
  };
}

/**
 * Run out-of-sample validation
 */
async function runOutOfSampleValidation(
  asset: TradingAsset,
  holdoutPercent: number = 0.2
): Promise<ValidationResult> {
  console.log(`🚀 Starting Out-of-Sample Validation for ${asset.toUpperCase()}\n`);
  console.log(`   Holdout Percentage: ${(holdoutPercent * 100).toFixed(0)}%`);
  console.log(`   Training Percentage: ${((1 - holdoutPercent) * 100).toFixed(0)}%\n`);
  
  // Get all test periods
  const allPeriods = getAllTestPeriods();
  console.log(`   Total Periods: ${allPeriods.length}`);
  
  // Split into training and validation
  // Use stratified split to ensure validation set has at least 10-15 periods
  const minValidationPeriods = 10;
  const actualHoldoutPercent = Math.max(holdoutPercent, minValidationPeriods / allPeriods.length);
  const { train: trainPeriods, validation: validationPeriods } = splitPeriods(allPeriods, actualHoldoutPercent);
  
  console.log(`   Training Periods: ${trainPeriods.length}`);
  console.log(`   Validation Periods: ${validationPeriods.length} (target: 10-15 for better overfitting detection)\n`);
  
  if (validationPeriods.length < minValidationPeriods) {
    console.log(`   ⚠️  Warning: Validation set has only ${validationPeriods.length} periods. Consider adding more synthetic data.\n`);
  }
  
  // Base config (current production config)
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
      atrMultiplier: 2.0,
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    },
  };
  
  // Test on training set
  console.log(`\n${'='.repeat(60)}`);
  console.log('Testing on Training Set');
  console.log(`${'='.repeat(60)}`);
  const trainMetrics = await testConfigOnPeriods(baseConfig, asset, trainPeriods);
  
  console.log(`   Training Metrics:`);
  console.log(`     Return: ${trainMetrics.totalReturn.toFixed(2)}%`);
  console.log(`     Sharpe: ${trainMetrics.sharpeRatio.toFixed(2)}`);
  console.log(`     Max Drawdown: ${trainMetrics.maxDrawdown.toFixed(2)}%`);
  console.log(`     Win Rate: ${(trainMetrics.winRate * 100).toFixed(1)}%`);
  console.log(`     Total Trades: ${trainMetrics.totalTrades}`);
  
  // Test on validation set (out-of-sample)
  console.log(`\n${'='.repeat(60)}`);
  console.log('Testing on Validation Set (Out-of-Sample)');
  console.log(`${'='.repeat(60)}`);
  const validationMetrics = await testConfigOnPeriods(baseConfig, asset, validationPeriods);
  
  console.log(`   Validation Metrics:`);
  console.log(`     Return: ${validationMetrics.totalReturn.toFixed(2)}%`);
  console.log(`     Sharpe: ${validationMetrics.sharpeRatio.toFixed(2)}`);
  console.log(`     Max Drawdown: ${validationMetrics.maxDrawdown.toFixed(2)}%`);
  console.log(`     Win Rate: ${(validationMetrics.winRate * 100).toFixed(1)}%`);
  console.log(`     Total Trades: ${validationMetrics.totalTrades}`);
  
  // Calculate overfitting score (difference between train and validation)
  const overfittingScore = trainMetrics.totalReturn - validationMetrics.totalReturn;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('Overfitting Analysis');
  console.log(`${'='.repeat(60)}`);
  console.log(`   Train Return: ${trainMetrics.totalReturn.toFixed(2)}%`);
  console.log(`   Validation Return: ${validationMetrics.totalReturn.toFixed(2)}%`);
  console.log(`   Overfitting Score: ${overfittingScore > 0 ? '+' : ''}${overfittingScore.toFixed(2)}%`);
  
  if (Math.abs(overfittingScore) < 5) {
    console.log(`   ✅ Strategy generalizes well (difference < 5%)`);
  } else if (overfittingScore > 10) {
    console.log(`   ⚠️  Potential overfitting detected (train >> validation)`);
  } else {
    console.log(`   ✅ Strategy shows reasonable generalization`);
  }
  
  return {
    trainPeriods,
    validationPeriods,
    trainMetrics,
    validationMetrics,
    overfittingScore,
  };
}

/**
 * Generate report
 */
function generateReport(result: ValidationResult): string {
  let report = '# Out-of-Sample Validation Results\n\n';
  report += `**Generated**: ${new Date().toISOString()}\n\n`;
  
  report += `## Summary\n\n`;
  report += `- **Training Periods**: ${result.trainPeriods.length}\n`;
  report += `- **Validation Periods**: ${result.validationPeriods.length}\n`;
  report += `- **Overfitting Score**: ${result.overfittingScore > 0 ? '+' : ''}${result.overfittingScore.toFixed(2)}%\n\n`;
  
  if (Math.abs(result.overfittingScore) < 5) {
    report += `✅ **Strategy generalizes well** - Difference between train and validation is < 5%\n\n`;
  } else if (result.overfittingScore > 10) {
    report += `⚠️  **Potential overfitting detected** - Training performance significantly exceeds validation\n\n`;
  } else {
    report += `✅ **Strategy shows reasonable generalization**\n\n`;
  }
  
  report += `## Training Set Performance\n\n`;
  report += `- **Return**: ${result.trainMetrics.totalReturn.toFixed(2)}%\n`;
  report += `- **Sharpe Ratio**: ${result.trainMetrics.sharpeRatio.toFixed(2)}\n`;
  report += `- **Max Drawdown**: ${result.trainMetrics.maxDrawdown.toFixed(2)}%\n`;
  report += `- **Win Rate**: ${(result.trainMetrics.winRate * 100).toFixed(1)}%\n`;
  report += `- **Total Trades**: ${result.trainMetrics.totalTrades}\n\n`;
  
  report += `## Validation Set Performance (Out-of-Sample)\n\n`;
  report += `- **Return**: ${result.validationMetrics.totalReturn.toFixed(2)}%\n`;
  report += `- **Sharpe Ratio**: ${result.validationMetrics.sharpeRatio.toFixed(2)}\n`;
  report += `- **Max Drawdown**: ${result.validationMetrics.maxDrawdown.toFixed(2)}%\n`;
  report += `- **Win Rate**: ${(result.validationMetrics.winRate * 100).toFixed(1)}%\n`;
  report += `- **Total Trades**: ${result.validationMetrics.totalTrades}\n\n`;
  
  report += `## Training Periods\n\n`;
  for (const period of result.trainPeriods) {
    report += `- ${period.name}: ${period.startDate} to ${period.endDate} (${period.isSynthetic ? 'Synthetic' : 'Historical'})\n`;
  }
  
  report += `\n## Validation Periods\n\n`;
  for (const period of result.validationPeriods) {
    report += `- ${period.name}: ${period.startDate} to ${period.endDate} (${period.isSynthetic ? 'Synthetic' : 'Historical'})\n`;
  }
  
  return report;
}

async function main() {
  const asset = (process.argv[2] as TradingAsset) || 'eth';
  const holdoutPercent = parseFloat(process.argv[3] || '0.2');
  
  const result = await runOutOfSampleValidation(asset, holdoutPercent);
  
  // Generate report
  const report = generateReport(result);
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
    `out-of-sample-validation-${asset}-${Date.now()}.md`
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

