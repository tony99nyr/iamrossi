#!/usr/bin/env npx tsx
/**
 * Compare Optimized Config vs Optimized Config with Targeted Stops
 * 
 * Runs backfill tests on the same periods with both configs and compares results.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runBacktest } from './backfill-test';
import { getAllTestPeriods, getTestPeriodsForYears } from './ml-strategy-optimizer';
import { loadOptimizedConfig } from './compare-optimized-config';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingAsset } from '@/lib/asset-config';
import { getAssetConfig } from '@/lib/asset-config';
import { disconnectRedis } from '@/lib/kv';

interface ComparisonResult {
  period: { startDate: string; endDate: string; isSynthetic: boolean; name: string };
  withoutStops: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    totalTrades: number;
  };
  withStops: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    totalTrades: number;
  };
  winner: 'withoutStops' | 'withStops' | 'tie';
  improvement: number; // Percentage point improvement
}

function loadConfigFromFile(filePath: string): EnhancedAdaptiveStrategyConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as EnhancedAdaptiveStrategyConfig;
}

function generateReport(results: ComparisonResult[], asset: TradingAsset): string {
  const winsWithStops = results.filter(r => r.winner === 'withStops').length;
  const winsWithoutStops = results.filter(r => r.winner === 'withoutStops').length;
  const ties = results.filter(r => r.winner === 'tie').length;

  const avgWithoutStops = results.reduce((sum, r) => sum + r.withoutStops.totalReturnPct, 0) / results.length;
  const avgWithStops = results.reduce((sum, r) => sum + r.withStops.totalReturnPct, 0) / results.length;
  const avgImprovement = avgWithStops - avgWithoutStops;

  const avgDrawdownWithout = results.reduce((sum, r) => sum + r.withoutStops.maxDrawdownPct, 0) / results.length;
  const avgDrawdownWith = results.reduce((sum, r) => sum + r.withStops.maxDrawdownPct, 0) / results.length;

  // Focus on problematic periods
  const highFreqPeriods = results.filter(r => 
    r.period.name.toLowerCase().includes('high-frequency') || 
    r.period.name.toLowerCase().includes('switch')
  );
  const volatilitySqueezePeriods = results.filter(r => 
    r.period.name.toLowerCase().includes('volatility squeeze') ||
    r.period.name.toLowerCase().includes('squeeze')
  );

  let report = `# Targeted Stops Comparison Report\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Asset**: ${asset.toUpperCase()}\n`;
  report += `**Total Periods Tested**: ${results.length}\n\n`;

  report += `## Summary\n\n`;
  report += `- **With Stops Wins**: ${winsWithStops} periods\n`;
  report += `- **Without Stops Wins**: ${winsWithoutStops} periods\n`;
  report += `- **Ties**: ${ties} periods\n\n`;

  report += `## Average Performance\n\n`;
  report += `| Metric | Without Stops | With Stops | Difference |\n`;
  report += `|--------|---------------|------------|------------|\n`;
  report += `| **Return** | ${avgWithoutStops.toFixed(2)}% | ${avgWithStops.toFixed(2)}% | ${avgImprovement >= 0 ? '+' : ''}${avgImprovement.toFixed(2)}% |\n`;
  report += `| **Max Drawdown** | ${avgDrawdownWithout.toFixed(2)}% | ${avgDrawdownWith.toFixed(2)}% | ${(avgDrawdownWith - avgDrawdownWithout).toFixed(2)}% |\n\n`;

  if (highFreqPeriods.length > 0) {
    report += `## High-Frequency Switching Periods\n\n`;
    report += `| Period | Without Stops | With Stops | Improvement |\n`;
    report += `|--------|---------------|------------|-------------|\n`;
    for (const r of highFreqPeriods) {
      const emoji = r.winner === 'withStops' ? '✅' : r.winner === 'withoutStops' ? '❌' : '🤝';
      report += `| ${r.period.name} | ${r.withoutStops.totalReturnPct.toFixed(2)}% | ${r.withStops.totalReturnPct.toFixed(2)}% | ${emoji} ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(2)}% |\n`;
    }
    report += `\n`;
  }

  if (volatilitySqueezePeriods.length > 0) {
    report += `## Volatility Squeeze Periods\n\n`;
    report += `| Period | Without Stops | With Stops | Improvement |\n`;
    report += `|--------|---------------|------------|-------------|\n`;
    for (const r of volatilitySqueezePeriods) {
      const emoji = r.winner === 'withStops' ? '✅' : r.winner === 'withoutStops' ? '❌' : '🤝';
      report += `| ${r.period.name} | ${r.withoutStops.totalReturnPct.toFixed(2)}% | ${r.withStops.totalReturnPct.toFixed(2)}% | ${emoji} ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(2)}% |\n`;
    }
    report += `\n`;
  }

  report += `## Recommendation\n\n`;
  if (avgImprovement > 0) {
    report += `✅ **Use Config with Stops** - Shows ${avgImprovement >= 0 ? '+' : ''}${avgImprovement.toFixed(2)}% average improvement.\n`;
  } else if (avgImprovement < 0) {
    report += `❌ **Keep Config without Stops** - Stops reduce performance by ${Math.abs(avgImprovement).toFixed(2)}%.\n`;
  } else {
    report += `🤝 **Neutral** - Both configs perform similarly.\n`;
  }

  return report;
}

async function main() {
  const asset = (process.argv[2] as TradingAsset) || 'eth';
  const assetConfig = getAssetConfig(asset);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Comparing Configs: Optimized vs Optimized with Targeted Stops`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`   Asset: ${asset.toUpperCase()}\n`);

  // Load configs
  const configDir = path.join(process.cwd(), 'data', 'optimized-configs');
  const optimizedConfigPath = path.join(configDir, `ml-optimized-${asset}-2026-01-03.json`);
  const withStopsConfigPath = path.join(configDir, `ml-optimized-${asset}-2026-01-03-moderate-stops.json`);

  if (!fs.existsSync(optimizedConfigPath)) {
    console.error(`❌ Optimized config not found: ${optimizedConfigPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(withStopsConfigPath)) {
    console.error(`❌ Config with stops not found: ${withStopsConfigPath}`);
    process.exit(1);
  }

  const configWithoutStops = loadConfigFromFile(optimizedConfigPath);
  const configWithStops = loadConfigFromFile(withStopsConfigPath);

  const periods = getTestPeriodsForYears(undefined, asset); // Use all periods for comprehensive comparison
  const results: ComparisonResult[] = [];

  console.log(`📅 Testing ${periods.length} periods...\n`);

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]!;
    console.log(`[${i + 1}/${periods.length}] Testing: ${period.name}`);

    try {
      // Test without stops
      const resultWithoutStops = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        configWithoutStops,
        configWithoutStops.kellyCriterion?.fractionalMultiplier,
        configWithoutStops.stopLoss?.atrMultiplier,
        asset
      );

      // Test with stops
      const resultWithStops = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        configWithStops,
        configWithStops.kellyCriterion?.fractionalMultiplier,
        configWithStops.stopLoss?.atrMultiplier,
        asset
      );

      const improvement = resultWithStops.totalReturnPct - resultWithoutStops.totalReturnPct;
      let winner: 'withoutStops' | 'withStops' | 'tie';
      if (improvement > 0.01) {
        winner = 'withStops';
      } else if (improvement < -0.01) {
        winner = 'withoutStops';
      } else {
        winner = 'tie';
      }

      const emoji = winner === 'withStops' ? '✅' : winner === 'withoutStops' ? '❌' : '🤝';
      console.log(`   ${emoji} Without: ${resultWithoutStops.totalReturnPct.toFixed(2)}% | With: ${resultWithStops.totalReturnPct.toFixed(2)}% | ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}%`);

      results.push({
        period,
        withoutStops: {
          totalReturnPct: resultWithoutStops.totalReturnPct,
          sharpeRatio: resultWithoutStops.sharpeRatio,
          maxDrawdownPct: resultWithoutStops.maxDrawdownPct,
          winRate: resultWithoutStops.sellTrades > 0 ? (resultWithoutStops.winTrades / resultWithoutStops.sellTrades) * 100 : 0,
          totalTrades: resultWithoutStops.totalTrades,
        },
        withStops: {
          totalReturnPct: resultWithStops.totalReturnPct,
          sharpeRatio: resultWithStops.sharpeRatio,
          maxDrawdownPct: resultWithStops.maxDrawdownPct,
          winRate: resultWithStops.sellTrades > 0 ? (resultWithStops.winTrades / resultWithStops.sellTrades) * 100 : 0,
          totalTrades: resultWithStops.totalTrades,
        },
        winner,
        improvement,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Generate report
  const report = generateReport(results, asset);
  console.log(`\n${'='.repeat(80)}`);
  console.log(report);
  console.log(`${'='.repeat(80)}\n`);

  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportFile = path.join(
    reportDir,
    `targeted-stops-comparison-${asset}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  );
  fs.writeFileSync(reportFile, report);
  console.log(`📄 Full report saved to: ${reportFile}\n`);

  await disconnectRedis();
  
  // Explicitly exit to ensure script completes
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Script failed:', error);
    disconnectRedis().finally(() => {
      process.exit(1);
    });
  });
}

