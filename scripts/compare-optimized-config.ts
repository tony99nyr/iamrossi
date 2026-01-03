#!/usr/bin/env npx tsx
/**
 * Compare Optimized ML Config vs Default Config
 * 
 * Runs backfill tests on the same periods with both configs and compares results.
 * 
 * Usage:
 *   pnpm tsx scripts/compare-optimized-config.ts [optimized-config-path] [asset] [years]
 * 
 * Examples:
 *   pnpm tsx scripts/compare-optimized-config.ts
 *     → Uses latest optimized config, tests all periods
 *   
 *   pnpm tsx scripts/compare-optimized-config.ts data/optimized-configs/ml-optimized-eth-2026-01-01.json eth 2026
 *     → Uses specific config, tests 2026 periods only
 */

import * as fs from 'fs';
import * as path from 'path';
import { runBacktest } from './backfill-test';
// Import test period functions from ml-strategy-optimizer (they're defined there)
import { getAllTestPeriods, getTestPeriodsForYears } from './ml-strategy-optimizer';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingAsset } from '@/lib/asset-config';
import { getAssetConfig } from '@/lib/asset-config';
import { disconnectRedis } from '@/lib/kv';

interface ComparisonResult {
  period: { startDate: string; endDate: string; isSynthetic: boolean; name: string };
  default: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    totalTrades: number;
  };
  optimized: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    totalTrades: number;
  };
  winner: 'default' | 'optimized' | 'tie';
  improvement: number; // Percentage point improvement
}

/**
 * Load optimized config from file
 */
export function loadOptimizedConfig(filePath: string): EnhancedAdaptiveStrategyConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Optimized config file not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const config = JSON.parse(content) as EnhancedAdaptiveStrategyConfig;
  
  // Ensure all required fields are present
  if (!config.bullishStrategy || !config.bearishStrategy) {
    throw new Error('Invalid config: missing bullish or bearish strategy');
  }
  
  return config;
}

/**
 * Find latest optimized config file
 */
function findLatestOptimizedConfig(asset: TradingAsset): string | null {
  const configDir = path.join(process.cwd(), 'data', 'optimized-configs');
  
  if (!fs.existsSync(configDir)) {
    return null;
  }
  
  const files = fs.readdirSync(configDir)
    .filter(f => f.startsWith(`ml-optimized-${asset}-`) && f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(configDir, f),
      mtime: fs.statSync(path.join(configDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return files.length > 0 ? files[0]!.path : null;
}

/**
 * Get default config (from backfill-test.ts)
 */
function getDefaultConfig(asset: TradingAsset = 'eth'): EnhancedAdaptiveStrategyConfig {
  // Match the DEFAULT_CONFIG from backfill-test.ts
  const TIMEFRAME = '8h' as const;
  return {
    bullishStrategy: {
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
    bearishStrategy: {
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
    regimeConfidenceThreshold: 0.22,
    momentumConfirmationThreshold: 0.26,
    regimePersistencePeriods: 1,
    bullishPositionMultiplier: 1.0,
    dynamicPositionSizing: false,
    maxBullishPosition: 0.90,
    maxVolatility: 0.019,
    circuitBreakerWinRate: 0.18,
    circuitBreakerLookback: 12,
    whipsawDetectionPeriods: 5,
    whipsawMaxChanges: 3,
    // New ML-optimizable parameters (disabled by default to maintain baseline)
    bullMarketParticipation: {
      enabled: false,
      exitThresholdMultiplier: 1.0,
      positionSizeMultiplier: 1.0,
      trendStrengthThreshold: 0.6,
      useTrailingStops: false,
      trailingStopATRMultiplier: 2.0,
    },
    regimeTransitionFilter: {
      enabled: false,
      transitionPeriods: 3,
      positionSizeReduction: 0.5,
      minConfidenceDuringTransition: 0.3,
      stayOutDuringTransition: false,
    },
    adaptivePositionSizing: {
      enabled: false,
      highFrequencySwitchDetection: true,
      switchFrequencyPeriods: 5,
      maxSwitchesAllowed: 3,
      uncertainPeriodMultiplier: 0.5,
      lowConfidenceMultiplier: 0.7,
      confidenceThreshold: 0.4,
    },
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
}

/**
 * Compare two configs on a set of periods
 */
async function compareConfigs(
  defaultConfig: EnhancedAdaptiveStrategyConfig,
  optimizedConfig: EnhancedAdaptiveStrategyConfig,
  asset: TradingAsset,
  periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>
): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Comparing Configs: Default vs Optimized`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Asset: ${asset.toUpperCase()}`);
  console.log(`   Periods: ${periods.length}`);
  console.log(`\n`);
  
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]!;
    console.log(`[${i + 1}/${periods.length}] Testing: ${period.name}`);
    console.log(`   Period: ${period.startDate} to ${period.endDate}`);
    
    try {
      // Test default config
      const defaultResult = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        defaultConfig,
        defaultConfig.kellyCriterion?.fractionalMultiplier,
        defaultConfig.stopLoss?.atrMultiplier,
        asset,
        getAssetConfig(asset).defaultTimeframe,
        asset === 'btc' // useCorrelation
      );
      
      // Test optimized config
      const optimizedResult = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        optimizedConfig,
        optimizedConfig.kellyCriterion?.fractionalMultiplier,
        optimizedConfig.stopLoss?.atrMultiplier,
        asset,
        getAssetConfig(asset).defaultTimeframe,
        asset === 'btc' // useCorrelation
      );
      
      const defaultWinRate = defaultResult.totalTrades > 0 
        ? (defaultResult.winTrades / defaultResult.sellTrades) * 100 
        : 0;
      const optimizedWinRate = optimizedResult.totalTrades > 0 
        ? (optimizedResult.winTrades / optimizedResult.sellTrades) * 100 
        : 0;
      
      const comparison: ComparisonResult = {
        period,
        default: {
          totalReturnPct: defaultResult.totalReturnPct,
          sharpeRatio: defaultResult.sharpeRatio,
          maxDrawdownPct: defaultResult.maxDrawdownPct,
          winRate: defaultWinRate,
          totalTrades: defaultResult.totalTrades,
        },
        optimized: {
          totalReturnPct: optimizedResult.totalReturnPct,
          sharpeRatio: optimizedResult.sharpeRatio,
          maxDrawdownPct: optimizedResult.maxDrawdownPct,
          winRate: optimizedWinRate,
          totalTrades: optimizedResult.totalTrades,
        },
        winner: 'tie',
        improvement: 0,
      };
      
      // Determine winner based on return
      if (optimizedResult.totalReturnPct > defaultResult.totalReturnPct) {
        comparison.winner = 'optimized';
        comparison.improvement = optimizedResult.totalReturnPct - defaultResult.totalReturnPct;
      } else if (defaultResult.totalReturnPct > optimizedResult.totalReturnPct) {
        comparison.winner = 'default';
        comparison.improvement = defaultResult.totalReturnPct - optimizedResult.totalReturnPct;
      }
      
      results.push(comparison);
      
      const winnerEmoji = comparison.winner === 'optimized' ? '✅' : comparison.winner === 'default' ? '❌' : '🤝';
      console.log(`   ${winnerEmoji} Default: ${defaultResult.totalReturnPct.toFixed(2)}% | Optimized: ${optimizedResult.totalReturnPct.toFixed(2)}%`);
      if (comparison.winner !== 'tie') {
        console.log(`      ${comparison.winner === 'optimized' ? '+' : '-'}${Math.abs(comparison.improvement).toFixed(2)}% ${comparison.winner === 'optimized' ? 'improvement' : 'worse'}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error testing period ${period.name}:`, error instanceof Error ? error.message : error);
    }
  }
  
  return results;
}

/**
 * Generate comparison report
 */
function generateReport(results: ComparisonResult[]): string {
  const optimizedWins = results.filter(r => r.winner === 'optimized').length;
  const defaultWins = results.filter(r => r.winner === 'default').length;
  const ties = results.filter(r => r.winner === 'tie').length;
  
  const avgDefaultReturn = results.reduce((sum, r) => sum + r.default.totalReturnPct, 0) / results.length;
  const avgOptimizedReturn = results.reduce((sum, r) => sum + r.optimized.totalReturnPct, 0) / results.length;
  const avgDefaultSharpe = results.reduce((sum, r) => sum + r.default.sharpeRatio, 0) / results.length;
  const avgOptimizedSharpe = results.reduce((sum, r) => sum + r.optimized.sharpeRatio, 0) / results.length;
  const avgDefaultDrawdown = results.reduce((sum, r) => sum + r.default.maxDrawdownPct, 0) / results.length;
  const avgOptimizedDrawdown = results.reduce((sum, r) => sum + r.optimized.maxDrawdownPct, 0) / results.length;
  
  const totalImprovement = avgOptimizedReturn - avgDefaultReturn;
  const improvementPct = avgDefaultReturn !== 0 ? (totalImprovement / Math.abs(avgDefaultReturn)) * 100 : 0;
  
  let report = `# Config Comparison Report\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Total Periods Tested**: ${results.length}\n`;
  report += `- **Optimized Wins**: ${optimizedWins} periods\n`;
  report += `- **Default Wins**: ${defaultWins} periods\n`;
  report += `- **Ties**: ${ties} periods\n\n`;
  
  report += `## Average Performance\n\n`;
  report += `| Metric | Default | Optimized | Difference |\n`;
  report += `|--------|---------|-----------|------------|\n`;
  report += `| **Return** | ${avgDefaultReturn.toFixed(2)}% | ${avgOptimizedReturn.toFixed(2)}% | ${totalImprovement >= 0 ? '+' : ''}${totalImprovement.toFixed(2)}% (${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}%) |\n`;
  report += `| **Sharpe Ratio** | ${avgDefaultSharpe.toFixed(3)} | ${avgOptimizedSharpe.toFixed(3)} | ${(avgOptimizedSharpe - avgDefaultSharpe).toFixed(3)} |\n`;
  report += `| **Max Drawdown** | ${avgDefaultDrawdown.toFixed(2)}% | ${avgOptimizedDrawdown.toFixed(2)}% | ${(avgOptimizedDrawdown - avgDefaultDrawdown).toFixed(2)}% |\n\n`;
  
  report += `## Period-by-Period Results\n\n`;
  report += `| Period | Default Return | Optimized Return | Winner | Improvement |\n`;
  report += `|--------|----------------|------------------|--------|-------------|\n`;
  
  for (const result of results) {
    const winner = result.winner === 'optimized' ? '✅ Optimized' : result.winner === 'default' ? '❌ Default' : '🤝 Tie';
    const improvement = result.winner === 'tie' ? '0.00%' : `${result.winner === 'optimized' ? '+' : '-'}${Math.abs(result.improvement).toFixed(2)}%`;
    report += `| ${result.period.name} | ${result.default.totalReturnPct.toFixed(2)}% | ${result.optimized.totalReturnPct.toFixed(2)}% | ${winner} | ${improvement} |\n`;
  }
  
  report += `\n## Recommendation\n\n`;
  if (optimizedWins > defaultWins && totalImprovement > 0) {
    report += `✅ **Use Optimized Config** - Optimized config wins ${optimizedWins} out of ${results.length} periods with ${totalImprovement >= 0 ? '+' : ''}${totalImprovement.toFixed(2)}% average improvement.\n`;
  } else if (defaultWins > optimizedWins) {
    report += `❌ **Keep Default Config** - Default config performs better in ${defaultWins} out of ${results.length} periods.\n`;
  } else {
    report += `🤝 **Similar Performance** - Both configs perform similarly. Consider other factors (risk tolerance, trade frequency, etc.).\n`;
  }
  
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Smart argument parsing: if first arg is 'eth' or 'btc', treat it as asset
  // Otherwise, treat it as config path
  let configPath: string | undefined;
  let asset: TradingAsset = 'eth';
  let periodArg: string | undefined;
  
  if (args[0] === 'eth' || args[0] === 'btc') {
    // First arg is asset
    asset = args[0] as TradingAsset;
    periodArg = args[1];
  } else if (args[0] && (args[0].endsWith('.json') || args[0].includes('/'))) {
    // First arg looks like a file path
    configPath = args[0];
    asset = (args[1] as TradingAsset) || 'eth';
    periodArg = args[2];
  } else if (args[0]) {
    // First arg might be asset or config path - check if it's a valid asset
    if (args[0] === 'eth' || args[0] === 'btc') {
      asset = args[0] as TradingAsset;
      periodArg = args[1];
    } else {
      // Assume it's a config path
      configPath = args[0];
      asset = (args[1] as TradingAsset) || 'eth';
      periodArg = args[2];
    }
  }
  
  // Find optimized config
  let optimizedConfigPath: string;
  if (configPath) {
    optimizedConfigPath = configPath;
  } else {
    const latest = findLatestOptimizedConfig(asset);
    if (!latest) {
      console.error(`❌ No optimized config found for ${asset}. Run ML optimizer first:`);
      console.error(`   pnpm eth:ml-optimize ${asset}`);
      process.exit(1);
    }
    optimizedConfigPath = latest;
  }
  
  console.log(`📁 Loading optimized config: ${optimizedConfigPath}`);
  const optimizedConfig = loadOptimizedConfig(optimizedConfigPath);
  const defaultConfig = getDefaultConfig(asset);
  
  // Get test periods (filtered by asset availability)
  let periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>;
  if (periodArg) {
    const years = periodArg.split(',').map(y => parseInt(y.trim(), 10));
    periods = getTestPeriodsForYears(years, asset);
    console.log(`📅 Filtering to periods in years: ${years.join(', ')}`);
  } else {
    periods = getTestPeriodsForYears(undefined, asset);
    const skippedCount = getAllTestPeriods().length - periods.length;
    if (skippedCount > 0) {
      console.log(`📅 Using ${periods.length} test periods (skipped ${skippedCount} periods without data for ${asset.toUpperCase()})`);
    } else {
      console.log(`📅 Using ALL test periods for comprehensive comparison`);
    }
  }
  
  if (periods.length === 0) {
    console.error('❌ No test periods found');
    process.exit(1);
  }
  
  // Run comparison
  const results = await compareConfigs(defaultConfig, optimizedConfig, asset, periods);
  
  // Generate report
  const report = generateReport(results);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `config-comparison-${asset}-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');
  
  // Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Comparison Complete!`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Optimized Wins: ${results.filter(r => r.winner === 'optimized').length}/${results.length}`);
  console.log(`   Default Wins: ${results.filter(r => r.winner === 'default').length}/${results.length}`);
  console.log(`   Ties: ${results.filter(r => r.winner === 'tie').length}/${results.length}`);
  const avgDefault = results.reduce((sum, r) => sum + r.default.totalReturnPct, 0) / results.length;
  const avgOptimized = results.reduce((sum, r) => sum + r.optimized.totalReturnPct, 0) / results.length;
  console.log(`   Average Return - Default: ${avgDefault.toFixed(2)}% | Optimized: ${avgOptimized.toFixed(2)}%`);
  console.log(`   Improvement: ${avgOptimized >= avgDefault ? '+' : ''}${(avgOptimized - avgDefault).toFixed(2)}%`);
  console.log(`\n📄 Full report saved to: ${reportPath}`);
  console.log(`\n📋 Next Steps:`);
  console.log(`   Review the comparison report: ${reportPath}`);
  if (avgOptimized > avgDefault) {
    console.log(`   ✅ Optimized config shows improvement! Consider applying it:`);
    console.log(`   ${asset === 'eth' ? 'pnpm eth:switch-config' : 'pnpm btc:switch-config'} ${optimizedConfigPath}`);
  } else {
    console.log(`   ⚠️  Optimized config didn't improve performance. Review parameters and consider re-running optimization.`);
  }
  console.log(`\n   Or run another comparison:`);
  console.log(`   ${asset === 'eth' ? 'pnpm eth:compare-config' : 'pnpm btc:compare-config'} [config-path] [years]\n`);
}

main()
  .then(async () => {
    // Close Redis connection to allow script to exit
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

