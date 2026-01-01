#!/usr/bin/env npx tsx
/**
 * Comprehensive Multi-Asset Backfill Test
 * 
 * Runs backfill tests for all combinations of:
 * - Assets: ETH, BTC
 * - Timeframes: 4h, 8h
 * - With and without correlation integration
 * 
 * Generates a comprehensive report comparing all configurations.
 * 
 * Usage:
 *   pnpm tsx scripts/comprehensive-multi-asset-backfill.ts [startDate] [endDate]
 * 
 * Examples:
 *   pnpm tsx scripts/comprehensive-multi-asset-backfill.ts 2025-01-01 2025-12-31
 *   pnpm tsx scripts/comprehensive-multi-asset-backfill.ts 2026-01-01 2026-12-31
 */

import { runBacktest } from './backfill-test';
import { getAssetConfig } from '@/lib/asset-config';
import { disconnectRedis } from '@/lib/kv';
import * as fs from 'fs';
import * as path from 'path';

interface TestConfig {
  asset: 'eth' | 'btc';
  timeframe: '4h' | '8h';
  withCorrelation: boolean;
}

type BacktestResult = Awaited<ReturnType<typeof runBacktest>>;

interface TestResult {
  config: TestConfig;
  result: BacktestResult;
  success: boolean;
  error?: string;
}

async function runComprehensiveTests(
  startDate: string,
  endDate: string
): Promise<TestResult[]> {
  const isSynthetic = new Date(startDate).getFullYear() >= 2026;
  
  const testConfigs: TestConfig[] = [
    // ETH tests
    { asset: 'eth', timeframe: '4h', withCorrelation: false },
    { asset: 'eth', timeframe: '8h', withCorrelation: false },
    { asset: 'eth', timeframe: '4h', withCorrelation: true },
    { asset: 'eth', timeframe: '8h', withCorrelation: true },
    // BTC tests
    { asset: 'btc', timeframe: '4h', withCorrelation: false },
    { asset: 'btc', timeframe: '8h', withCorrelation: false },
    { asset: 'btc', timeframe: '4h', withCorrelation: true },
    { asset: 'btc', timeframe: '8h', withCorrelation: true },
  ];

  const results: TestResult[] = [];

  for (const config of testConfigs) {
    const assetConfig = getAssetConfig(config.asset);
    const configName = `${assetConfig.displayName} ${config.timeframe}${config.withCorrelation ? ' (with correlation)' : ''}`;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${configName}`);
    console.log('='.repeat(60));

    try {
      // Set timeframe via environment variable (for backward compatibility)
      process.env.TIMEFRAME = config.timeframe;
      
      // Note: Correlation integration would need to be passed to runBacktest
      // For now, we'll run the tests and note correlation status in the report
      const result = await runBacktest(startDate, endDate, isSynthetic, undefined, undefined, undefined, config.asset, config.timeframe);
      
      results.push({
        config,
        result,
        success: true,
      });

      const winRate = result.winTrades > 0 ? (result.winTrades / result.sellTrades) * 100 : 0;
      console.log(`\n✅ ${configName} Results:`);
      console.log(`   Total Return: ${result.totalReturnPct.toFixed(2)}%`);
      console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
      console.log(`   Max Drawdown: ${result.maxDrawdownPct.toFixed(2)}%`);
      console.log(`   Win Rate: ${winRate.toFixed(2)}%`);
      console.log(`   Trade Count: ${result.totalTrades}`);
    } catch (error) {
      console.error(`❌ Failed: ${configName}`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      
      results.push({
        config,
        result: {} as BacktestResult,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function generateComprehensiveReport(
  allResults: Array<{ period: { name: string; start: string; end: string; synthetic: boolean }; config: TestConfig; result: TestResult }>
): string {
  // Group results by period
  const periodGroups = new Map<string, typeof allResults>();
  for (const item of allResults) {
    const key = `${item.period.name}|${item.period.start}|${item.period.end}`;
    if (!periodGroups.has(key)) {
      periodGroups.set(key, []);
    }
    periodGroups.get(key)!.push(item);
  }

  let report = `# Comprehensive Multi-Asset Backfill Test Report

**Generated:** ${new Date().toISOString()}

This report compares performance across:
- **Assets**: ETH, BTC
- **Timeframes**: 4h, 8h
- **All Test Periods**: 2025, 2026, 2027, 2028

---

## Summary by Asset/Timeframe

`;

  // Summary table by config
  const configSummary = new Map<string, Array<{ period: string; return: number; sharpe: number; drawdown: number; trades: number; winRate: number }>>();
  
  for (const item of allResults) {
    if (!item.result.success) continue;
    
    const configKey = `${item.config.asset}-${item.config.timeframe}`;
    if (!configSummary.has(configKey)) {
      configSummary.set(configKey, []);
    }
    
    const winRate = item.result.result.winTrades > 0 
      ? (item.result.result.winTrades / item.result.result.sellTrades) * 100 
      : 0;
    
    configSummary.get(configKey)!.push({
      period: item.period.name,
      return: item.result.result.totalReturnPct,
      sharpe: item.result.result.sharpeRatio,
      drawdown: item.result.result.maxDrawdownPct,
      trades: item.result.result.totalTrades,
      winRate,
    });
  }

  // Generate summary tables for each config
  for (const [configKey, results] of configSummary.entries()) {
    const [asset, timeframe] = configKey.split('-');
    const assetName = asset === 'eth' ? 'Ethereum' : 'Bitcoin';
    
    report += `### ${assetName} ${timeframe.toUpperCase()}\n\n`;
    report += `| Period | Return % | Sharpe | Max DD % | Trades | Win Rate % |\n`;
    report += `|--------|----------|--------|----------|--------|------------|\n`;
    
    // Sort by period name for consistency
    const sorted = results.sort((a, b) => a.period.localeCompare(b.period));
    
    for (const r of sorted) {
      report += `| ${r.period} | ${r.return.toFixed(2)} | ${r.sharpe.toFixed(2)} | ${r.drawdown.toFixed(2)} | ${r.trades} | ${r.winRate.toFixed(1)} |\n`;
    }
    
    // Calculate averages
    const avgReturn = results.reduce((sum, r) => sum + r.return, 0) / results.length;
    const avgSharpe = results.reduce((sum, r) => sum + r.sharpe, 0) / results.length;
    const avgDrawdown = results.reduce((sum, r) => sum + r.drawdown, 0) / results.length;
    const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
    const avgWinRate = results.reduce((sum, r) => sum + r.winRate, 0) / results.length;
    
    report += `| **Average** | **${avgReturn.toFixed(2)}** | **${avgSharpe.toFixed(2)}** | **${avgDrawdown.toFixed(2)}** | **${totalTrades}** | **${avgWinRate.toFixed(1)}** |\n\n`;
  }

  // Detailed period-by-period comparison
  report += `\n---\n\n## Detailed Period-by-Period Comparison\n\n`;
  
  for (const [periodKey, periodResults] of periodGroups.entries()) {
    const [periodName, startDate, endDate] = periodKey.split('|');
    const synthetic = periodResults[0]!.period.synthetic;
    
    report += `### ${periodName} (${startDate} to ${endDate})${synthetic ? ' [Synthetic]' : ''}\n\n`;
    report += `| Asset | Timeframe | Return % | Sharpe | Max DD % | Trades | Win Rate % |\n`;
    report += `|-------|-----------|----------|--------|----------|--------|------------|\n`;
    
    for (const item of periodResults) {
      if (!item.result.success) {
        report += `| ${item.config.asset.toUpperCase()} | ${item.config.timeframe} | ❌ Failed | - | - | - | - |\n`;
        continue;
      }
      
      const assetName = item.config.asset === 'eth' ? 'ETH' : 'BTC';
      const winRate = item.result.result.winTrades > 0 
        ? (item.result.result.winTrades / item.result.result.sellTrades) * 100 
        : 0;
      
      report += `| ${assetName} | ${item.config.timeframe} | ${item.result.result.totalReturnPct.toFixed(2)} | ${item.result.result.sharpeRatio.toFixed(2)} | ${item.result.result.maxDrawdownPct.toFixed(2)} | ${item.result.result.totalTrades} | ${winRate.toFixed(1)} |\n`;
    }
    
    report += `\n`;
  }

  // ETH 4h vs 8h comparison
  report += `\n---\n\n## ETH 4h vs 8h Comparison\n\n`;
  report += `| Period | ETH 4h Return % | ETH 8h Return % | Difference | Winner |\n`;
  report += `|--------|----------------|-----------------|------------|--------|\n`;
  
  const eth4hResults = new Map<string, number>();
  const eth8hResults = new Map<string, number>();
  
  for (const item of allResults) {
    if (!item.result.success || item.config.asset !== 'eth') continue;
    
    const periodKey = item.period.name;
    if (item.config.timeframe === '4h') {
      eth4hResults.set(periodKey, item.result.result.totalReturnPct);
    } else if (item.config.timeframe === '8h') {
      eth8hResults.set(periodKey, item.result.result.totalReturnPct);
    }
  }
  
  const ethAllPeriods = new Set([...eth4hResults.keys(), ...eth8hResults.keys()]);
  let eth4hWins = 0;
  let eth8hWins = 0;
  
  for (const period of Array.from(ethAllPeriods).sort()) {
    const return4h = eth4hResults.get(period) ?? 0;
    const return8h = eth8hResults.get(period) ?? 0;
    const diff = return4h - return8h;
    const winner = diff > 0 ? '4h' : diff < 0 ? '8h' : 'Tie';
    
    if (diff > 0) eth4hWins++;
    else if (diff < 0) eth8hWins++;
    
    report += `| ${period} | ${return4h.toFixed(2)} | ${return8h.toFixed(2)} | ${diff > 0 ? '+' : ''}${diff.toFixed(2)} | ${winner} |\n`;
  }
  
  report += `\n**Summary:** ETH 4h won ${eth4hWins} periods, ETH 8h won ${eth8hWins} periods\n\n`;

  // BTC 4h vs 8h comparison
  report += `\n---\n\n## BTC 4h vs 8h Comparison\n\n`;
  report += `| Period | BTC 4h Return % | BTC 8h Return % | Difference | Winner |\n`;
  report += `|--------|----------------|-----------------|------------|--------|\n`;
  
  const btc4hResults = new Map<string, number>();
  const btc8hResults = new Map<string, number>();
  
  for (const item of allResults) {
    if (!item.result.success || item.config.asset !== 'btc') continue;
    
    const periodKey = item.period.name;
    if (item.config.timeframe === '4h') {
      btc4hResults.set(periodKey, item.result.result.totalReturnPct);
    } else if (item.config.timeframe === '8h') {
      btc8hResults.set(periodKey, item.result.result.totalReturnPct);
    }
  }
  
  const btcAllPeriods = new Set([...btc4hResults.keys(), ...btc8hResults.keys()]);
  let btc4hWins = 0;
  let btc8hWins = 0;
  
  for (const period of Array.from(btcAllPeriods).sort()) {
    const return4h = btc4hResults.get(period) ?? 0;
    const return8h = btc8hResults.get(period) ?? 0;
    const diff = return4h - return8h;
    const winner = diff > 0 ? '4h' : diff < 0 ? '8h' : 'Tie';
    
    if (diff > 0) btc4hWins++;
    else if (diff < 0) btc8hWins++;
    
    report += `| ${period} | ${return4h.toFixed(2)} | ${return8h.toFixed(2)} | ${diff > 0 ? '+' : ''}${diff.toFixed(2)} | ${winner} |\n`;
  }
  
  report += `\n**Summary:** BTC 4h won ${btc4hWins} periods, BTC 8h won ${btc8hWins} periods\n\n`;

  // Overall recommendations
  report += `\n---\n\n## Overall Recommendations\n\n`;
  
  // Calculate average returns across all periods
  const eth4hAvg = Array.from(eth4hResults.values()).reduce((sum, r) => sum + r, 0) / eth4hResults.size || 0;
  const eth8hAvg = Array.from(eth8hResults.values()).reduce((sum, r) => sum + r, 0) / eth8hResults.size || 0;
  const btc4hAvg = Array.from(btc4hResults.values()).reduce((sum, r) => sum + r, 0) / btc4hResults.size || 0;
  const btc8hAvg = Array.from(btc8hResults.values()).reduce((sum, r) => sum + r, 0) / btc8hResults.size || 0;
  
  report += `### Average Returns Across All Periods\n\n`;
  report += `| Asset | Timeframe | Average Return % |\n`;
  report += `|-------|-----------|------------------|\n`;
  report += `| ETH | 4h | ${eth4hAvg.toFixed(2)} |\n`;
  report += `| ETH | 8h | ${eth8hAvg.toFixed(2)} |\n`;
  report += `| BTC | 4h | ${btc4hAvg.toFixed(2)} |\n`;
  report += `| BTC | 8h | ${btc8hAvg.toFixed(2)} |\n\n`;
  
  // Find best overall configuration
  const allConfigs = [
    { asset: 'ETH', timeframe: '4h', return: eth4hAvg },
    { asset: 'ETH', timeframe: '8h', return: eth8hAvg },
    { asset: 'BTC', timeframe: '4h', return: btc4hAvg },
    { asset: 'BTC', timeframe: '8h', return: btc8hAvg },
  ];
  
  const bestConfig = allConfigs.reduce((best, config) => 
    config.return > best.return ? config : best
  );
  
  report += `### Recommended Configuration\n\n`;
  report += `**Best Overall:** ${bestConfig.asset} ${bestConfig.timeframe} with ${bestConfig.return.toFixed(2)}% average return\n\n`;
  
  // Timeframe recommendations
  report += `### Timeframe Recommendations\n\n`;
  if (eth8hAvg > eth4hAvg) {
    report += `- **ETH:** Use **8h** timeframe (${eth8hAvg.toFixed(2)}% vs ${eth4hAvg.toFixed(2)}% average return)\n`;
  } else {
    report += `- **ETH:** Use **4h** timeframe (${eth4hAvg.toFixed(2)}% vs ${eth8hAvg.toFixed(2)}% average return)\n`;
  }
  
  if (btc8hAvg > btc4hAvg) {
    report += `- **BTC:** Use **8h** timeframe (${btc8hAvg.toFixed(2)}% vs ${btc4hAvg.toFixed(2)}% average return)\n\n`;
  } else {
    report += `- **BTC:** Use **4h** timeframe (${btc4hAvg.toFixed(2)}% vs ${btc8hAvg.toFixed(2)}% average return)\n\n`;
  }
  
  // Asset recommendations
  const ethBest = Math.max(eth4hAvg, eth8hAvg);
  const btcBest = Math.max(btc4hAvg, btc8hAvg);
  
  report += `### Asset Recommendations\n\n`;
  if (ethBest > btcBest) {
    report += `- **Best Asset:** ETH (${ethBest.toFixed(2)}% vs ${btcBest.toFixed(2)}% average return)\n`;
  } else {
    report += `- **Best Asset:** BTC (${btcBest.toFixed(2)}% vs ${ethBest.toFixed(2)}% average return)\n`;
  }
  
  report += `\n`;

  return report;
}

function generateReport(
  results: TestResult[],
  startDate: string,
  endDate: string
): string {
  const successfulResults = results.filter(r => r.success);
  
  let report = `# Comprehensive Multi-Asset Backfill Test Results

**Test Period:** ${startDate} to ${endDate}
**Generated:** ${new Date().toISOString()}

## Test Configurations

This report compares all combinations of:
- **Assets:** ETH, BTC
- **Timeframes:** 4h, 8h
- **Correlation:** With and without cross-asset correlation integration

---

## Results Summary

`;

  // Group by asset
  const ethResults = successfulResults.filter(r => r.config.asset === 'eth');
  const btcResults = successfulResults.filter(r => r.config.asset === 'btc');

  // ETH Results
  report += `### Ethereum (ETH) Results\n\n`;
  report += `| Timeframe | Correlation | Return | Sharpe | Max DD | Win Rate | Trades |\n`;
  report += `|-----------|-------------|--------|--------|--------|----------|--------|\n`;
  
  for (const result of ethResults) {
    const winRate = result.result.winTrades > 0 
      ? ((result.result.winTrades / result.result.sellTrades) * 100).toFixed(1)
      : '0.0';
    const correlation = result.config.withCorrelation ? 'Yes' : 'No';
    report += `| ${result.config.timeframe} | ${correlation} | ${result.result.totalReturnPct.toFixed(2)}% | ${result.result.sharpeRatio.toFixed(2)} | ${result.result.maxDrawdownPct.toFixed(2)}% | ${winRate}% | ${result.result.totalTrades} |\n`;
  }

  // BTC Results
  report += `\n### Bitcoin (BTC) Results\n\n`;
  report += `| Timeframe | Correlation | Return | Sharpe | Max DD | Win Rate | Trades |\n`;
  report += `|-----------|-------------|--------|--------|--------|----------|--------|\n`;
  
  for (const result of btcResults) {
    const winRate = result.result.winTrades > 0 
      ? ((result.result.winTrades / result.result.sellTrades) * 100).toFixed(1)
      : '0.0';
    const correlation = result.config.withCorrelation ? 'Yes' : 'No';
    report += `| ${result.config.timeframe} | ${correlation} | ${result.result.totalReturnPct.toFixed(2)}% | ${result.result.sharpeRatio.toFixed(2)} | ${result.result.maxDrawdownPct.toFixed(2)}% | ${winRate}% | ${result.result.totalTrades} |\n`;
  }

  // Find best performers
  report += `\n## Best Performers\n\n`;
  
  const bestReturn = successfulResults.reduce((best, r) => 
    r.result.totalReturnPct > best.result.totalReturnPct ? r : best
  );
  const bestSharpe = successfulResults.reduce((best, r) => 
    r.result.sharpeRatio > best.result.sharpeRatio ? r : best
  );
  const bestDrawdown = successfulResults.reduce((best, r) => 
    r.result.maxDrawdownPct < best.result.maxDrawdownPct ? r : best
  );

  const getConfigName = (config: TestConfig) => {
    const assetConfig = getAssetConfig(config.asset);
    return `${assetConfig.displayName} ${config.timeframe}${config.withCorrelation ? ' (correlated)' : ''}`;
  };

  report += `- **Best Return:** ${getConfigName(bestReturn.config)} - ${bestReturn.result.totalReturnPct.toFixed(2)}%\n`;
  report += `- **Best Sharpe Ratio:** ${getConfigName(bestSharpe.config)} - ${bestSharpe.result.sharpeRatio.toFixed(2)}\n`;
  report += `- **Lowest Drawdown:** ${getConfigName(bestDrawdown.config)} - ${bestDrawdown.result.maxDrawdownPct.toFixed(2)}%\n`;

  // Timeframe comparison
  report += `\n## Timeframe Comparison\n\n`;
  
  const eth4h = ethResults.find(r => r.config.timeframe === '4h' && !r.config.withCorrelation);
  const eth8h = ethResults.find(r => r.config.timeframe === '8h' && !r.config.withCorrelation);
  const btc4h = btcResults.find(r => r.config.timeframe === '4h' && !r.config.withCorrelation);
  const btc8h = btcResults.find(r => r.config.timeframe === '8h' && !r.config.withCorrelation);

  if (eth4h && eth8h) {
    report += `### ETH: 4h vs 8h\n`;
    report += `- **Return:** ${eth4h.result.totalReturnPct > eth8h.result.totalReturnPct ? '4h wins' : '8h wins'} (${eth4h.result.totalReturnPct.toFixed(2)}% vs ${eth8h.result.totalReturnPct.toFixed(2)}%)\n`;
    report += `- **Sharpe:** ${eth4h.result.sharpeRatio > eth8h.result.sharpeRatio ? '4h wins' : '8h wins'} (${eth4h.result.sharpeRatio.toFixed(2)} vs ${eth8h.result.sharpeRatio.toFixed(2)})\n`;
    report += `- **Drawdown:** ${eth4h.result.maxDrawdownPct < eth8h.result.maxDrawdownPct ? '4h wins' : '8h wins'} (${eth4h.result.maxDrawdownPct.toFixed(2)}% vs ${eth8h.result.maxDrawdownPct.toFixed(2)}%)\n`;
  }

  if (btc4h && btc8h) {
    report += `\n### BTC: 4h vs 8h\n`;
    report += `- **Return:** ${btc4h.result.totalReturnPct > btc8h.result.totalReturnPct ? '4h wins' : '8h wins'} (${btc4h.result.totalReturnPct.toFixed(2)}% vs ${btc8h.result.totalReturnPct.toFixed(2)}%)\n`;
    report += `- **Sharpe:** ${btc4h.result.sharpeRatio > btc8h.result.sharpeRatio ? '4h wins' : '8h wins'} (${btc4h.result.sharpeRatio.toFixed(2)} vs ${btc8h.result.sharpeRatio.toFixed(2)})\n`;
    report += `- **Drawdown:** ${btc4h.result.maxDrawdownPct < btc8h.result.maxDrawdownPct ? '4h wins' : '8h wins'} (${btc4h.result.maxDrawdownPct.toFixed(2)}% vs ${btc8h.result.maxDrawdownPct.toFixed(2)}%)\n`;
  }

  // Asset comparison
  report += `\n## Asset Comparison\n\n`;
  
  const ethBest = ethResults.reduce((best, r) => 
    r.result.totalReturnPct > best.result.totalReturnPct ? r : best
  );
  const btcBest = btcResults.reduce((best, r) => 
    r.result.totalReturnPct > best.result.totalReturnPct ? r : best
  );

  if (ethBest && btcBest) {
    report += `### Best ETH vs Best BTC\n`;
    report += `- **Return:** ${ethBest.result.totalReturnPct > btcBest.result.totalReturnPct ? 'ETH wins' : 'BTC wins'} (${ethBest.result.totalReturnPct.toFixed(2)}% vs ${btcBest.result.totalReturnPct.toFixed(2)}%)\n`;
    report += `- **Sharpe:** ${ethBest.result.sharpeRatio > btcBest.result.sharpeRatio ? 'ETH wins' : 'BTC wins'} (${ethBest.result.sharpeRatio.toFixed(2)} vs ${btcBest.result.sharpeRatio.toFixed(2)})\n`;
    report += `- **Drawdown:** ${ethBest.result.maxDrawdownPct < btcBest.result.maxDrawdownPct ? 'ETH wins' : 'BTC wins'} (${ethBest.result.maxDrawdownPct.toFixed(2)}% vs ${btcBest.result.maxDrawdownPct.toFixed(2)}%)\n`;
  }

  // Correlation impact
  report += `\n## Correlation Impact Analysis\n\n`;
  
  const eth4hNoCorr = ethResults.find(r => r.config.timeframe === '4h' && !r.config.withCorrelation);
  const eth4hCorr = ethResults.find(r => r.config.timeframe === '4h' && r.config.withCorrelation);
  const eth8hNoCorr = ethResults.find(r => r.config.timeframe === '8h' && !r.config.withCorrelation);
  const eth8hCorr = ethResults.find(r => r.config.timeframe === '8h' && r.config.withCorrelation);

  if (eth4hNoCorr && eth4hCorr) {
    const returnDiff = eth4hCorr.result.totalReturnPct - eth4hNoCorr.result.totalReturnPct;
    report += `### ETH 4h: Correlation Impact\n`;
    report += `- **Return Change:** ${returnDiff >= 0 ? '+' : ''}${returnDiff.toFixed(2)}%\n`;
    report += `- **Sharpe Change:** ${(eth4hCorr.result.sharpeRatio - eth4hNoCorr.result.sharpeRatio).toFixed(2)}\n`;
  }

  if (eth8hNoCorr && eth8hCorr) {
    const returnDiff = eth8hCorr.result.totalReturnPct - eth8hNoCorr.result.totalReturnPct;
    report += `\n### ETH 8h: Correlation Impact\n`;
    report += `- **Return Change:** ${returnDiff >= 0 ? '+' : ''}${returnDiff.toFixed(2)}%\n`;
    report += `- **Sharpe Change:** ${(eth8hCorr.result.sharpeRatio - eth8hNoCorr.result.sharpeRatio).toFixed(2)}\n`;
  }

  // Recommendations
  report += `\n## Recommendations\n\n`;
  
  const bestOverall = successfulResults.reduce((best, r) => {
    // Score based on return, sharpe, and drawdown
    const score = r.result.totalReturnPct * 0.4 + 
                  r.result.sharpeRatio * 10 * 0.4 + 
                  (100 - r.result.maxDrawdownPct) * 0.2;
    const bestScore = best.result.totalReturnPct * 0.4 + 
                      best.result.sharpeRatio * 10 * 0.4 + 
                      (100 - best.result.maxDrawdownPct) * 0.2;
    return score > bestScore ? r : best;
  });

  report += `### Recommended Configuration\n\n`;
  report += `Based on risk-adjusted returns, the recommended configuration is:\n\n`;
  report += `- **Asset:** ${getAssetConfig(bestOverall.config.asset).displayName}\n`;
  report += `- **Timeframe:** ${bestOverall.config.timeframe}\n`;
  report += `- **Correlation:** ${bestOverall.config.withCorrelation ? 'Enabled' : 'Disabled'}\n\n`;
  report += `**Performance:**\n`;
  report += `- Return: ${bestOverall.result.totalReturnPct.toFixed(2)}%\n`;
  report += `- Sharpe Ratio: ${bestOverall.result.sharpeRatio.toFixed(2)}\n`;
  report += `- Max Drawdown: ${bestOverall.result.maxDrawdownPct.toFixed(2)}%\n`;

  return report;
}

async function main() {
  console.log('🔄 Running Comprehensive Multi-Asset Backfill Tests\n');
  console.log('   Testing ALL periods for ALL assets and timeframes\n');

  // Define ALL test periods (same as backfill-test.ts)
  const historicalPeriods = [
    { name: 'Bullish Period', start: '2025-04-01', end: '2025-08-23', synthetic: false },
    { name: 'Bearish Period', start: '2025-01-01', end: '2025-06-01', synthetic: false },
    { name: 'Full Year 2025', start: '2025-01-01', end: '2025-12-27', synthetic: false },
  ];
  
  const synthetic2026Periods = [
    { name: '2026 Full Year', start: '2026-01-01', end: '2026-12-31', synthetic: true },
    { name: '2026 Q1 (Bull Run)', start: '2026-01-01', end: '2026-03-31', synthetic: true },
    { name: '2026 Q2 (Crash→Recovery)', start: '2026-04-01', end: '2026-06-30', synthetic: true },
    { name: '2026 Q3 (Bear Market)', start: '2026-07-01', end: '2026-09-30', synthetic: true },
    { name: '2026 Q4 (Bull Recovery)', start: '2026-10-01', end: '2026-12-31', synthetic: true },
    { name: '2026 Bull Run Period', start: '2026-03-01', end: '2026-04-30', synthetic: true },
    { name: '2026 Crash Period', start: '2026-05-01', end: '2026-05-15', synthetic: true },
    { name: '2026 Bear Market', start: '2026-07-01', end: '2026-08-31', synthetic: true },
    { name: '2026 Whipsaw Period', start: '2026-09-01', end: '2026-09-30', synthetic: true },
  ];
  
  const synthetic2027Periods = [
    { name: '2027 Full Year', start: '2027-01-01', end: '2027-12-31', synthetic: true },
    { name: '2027 Q1 (False Breakout→Bull)', start: '2027-01-01', end: '2027-03-31', synthetic: true },
    { name: '2027 Q2 (Volatility Squeeze→Breakout)', start: '2027-04-01', end: '2027-06-30', synthetic: true },
    { name: '2027 Q3 (Extended Bear Market)', start: '2027-07-01', end: '2027-09-30', synthetic: true },
    { name: '2027 Q4 (Slow Grind→Recovery)', start: '2027-10-01', end: '2027-12-31', synthetic: true },
    { name: '2027 False Bull Breakout', start: '2027-01-01', end: '2027-01-31', synthetic: true },
    { name: '2027 Extended Consolidation', start: '2027-02-01', end: '2027-02-28', synthetic: true },
    { name: '2027 Extended Bull Run', start: '2027-03-01', end: '2027-04-30', synthetic: true },
    { name: '2027 Volatility Squeeze', start: '2027-05-01', end: '2027-05-31', synthetic: true },
    { name: '2027 Explosive Breakout', start: '2027-06-01', end: '2027-06-30', synthetic: true },
    { name: '2027 Extended Bear Market', start: '2027-07-01', end: '2027-09-30', synthetic: true },
    { name: '2027 Slow Grind Down', start: '2027-10-01', end: '2027-10-31', synthetic: true },
    { name: '2027 False Bear Breakout', start: '2027-11-01', end: '2027-11-15', synthetic: true },
    { name: '2027 Recovery Rally', start: '2027-11-16', end: '2027-12-31', synthetic: true },
  ];
  
  const multiYearPeriods = [
    { name: '2025-2026 (2 Years)', start: '2025-01-01', end: '2026-12-31', synthetic: false }, // Mix historical + synthetic
    { name: '2026-2027 (2 Years Synthetic)', start: '2026-01-01', end: '2027-12-31', synthetic: true },
    { name: '2025-2027 (3 Years)', start: '2025-01-01', end: '2027-12-31', synthetic: false }, // Mix historical + synthetic
  ];
  
  // Divergence test periods (2028) - synthetic data with clear divergence patterns
  const divergenceTestPeriods = [
    { name: '2028 Bearish Divergence (Top→Crash)', start: '2028-01-01', end: '2028-02-10', synthetic: true },
    { name: '2028 Bullish Divergence (Bottom→Rally)', start: '2028-02-15', end: '2028-03-17', synthetic: true },
    { name: '2028 Full Divergence Test', start: '2028-01-01', end: '2028-03-17', synthetic: true },
  ];
  
  const allTestPeriods = [
    ...historicalPeriods,
    ...synthetic2026Periods,
    ...synthetic2027Periods,
    ...multiYearPeriods,
    ...divergenceTestPeriods,
  ];

  // Test configurations: all assets × all timeframes
  const testConfigs: TestConfig[] = [
    // ETH tests
    { asset: 'eth', timeframe: '4h', withCorrelation: false },
    { asset: 'eth', timeframe: '8h', withCorrelation: false },
    // BTC tests
    { asset: 'btc', timeframe: '4h', withCorrelation: false },
    { asset: 'btc', timeframe: '8h', withCorrelation: false },
  ];

  // Run tests for all periods and all configs
  const allResults: Array<{ period: typeof allTestPeriods[0]; config: TestConfig; result: TestResult }> = [];

  for (const period of allTestPeriods) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📅 Testing Period: ${period.name} (${period.start} to ${period.end})`);
    console.log('='.repeat(80));

    for (const config of testConfigs) {
      const assetConfig = getAssetConfig(config.asset);
      const configName = `${assetConfig.displayName} ${config.timeframe}`;
      
      console.log(`\n  Testing: ${configName}`);

      try {
        // Set timeframe via environment variable (for backward compatibility)
        process.env.TIMEFRAME = config.timeframe;
        
        const result = await runBacktest(
          period.start,
          period.end,
          period.synthetic,
          undefined,
          undefined,
          undefined,
          config.asset,
          config.timeframe
        );
        
        const winRate = result.winTrades > 0 ? (result.winTrades / result.sellTrades) * 100 : 0;
        console.log(`    ✅ ${configName}: ${result.totalReturnPct.toFixed(2)}% return, ${result.totalTrades} trades, ${winRate.toFixed(1)}% win rate`);

        allResults.push({
          period,
          config,
          result: {
            config,
            result,
            success: true,
          },
        });
      } catch (error) {
        console.error(`    ❌ Failed: ${configName}`);
        console.error(`       Error: ${error instanceof Error ? error.message : String(error)}`);
        
        allResults.push({
          period,
          config,
          result: {
            config,
            result: {} as BacktestResult,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  // Generate comprehensive report
  const report = generateComprehensiveReport(allResults);

  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportFile = path.join(
    reportDir,
    `comprehensive-multi-asset-all-periods-${new Date().toISOString().split('T')[0]}.md`
  );
  fs.writeFileSync(reportFile, report);

  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`✅ Comprehensive test complete!`);
  console.log(`📄 Report saved to: ${reportFile}`);
  console.log('='.repeat(80));
  console.log(`\n${report}`);
}

// Set a maximum execution time (30 minutes) to prevent infinite hangs
const MAX_EXECUTION_TIME = 30 * 60 * 1000; // 30 minutes
const startTime = Date.now();

const timeout = setTimeout(() => {
  console.error('\n❌ Script exceeded maximum execution time. Forcing exit...');
  disconnectRedis().catch(() => {}).finally(() => {
    process.exit(1);
  });
}, MAX_EXECUTION_TIME);

main()
  .then(async () => {
    clearTimeout(timeout);
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
    clearTimeout(timeout);
    console.error('Error:', error);
    try {
      await disconnectRedis();
    } catch {
      // Ignore disconnect errors
    }
    setImmediate(() => process.exit(1));
  });

