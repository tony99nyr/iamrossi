#!/usr/bin/env npx tsx
/**
 * BTC Strategy Scorecard
 * 
 * Runs comprehensive backtest for BTC strategy and compares to BTC hold
 * to generate a detailed scorecard.
 */

import { runBacktest } from './backfill-test';
import { loadOptimizedConfig as loadOptimizedConfigFromCompare } from './compare-optimized-config';
import { getAllTestPeriods } from './ml-strategy-optimizer';
import type { TradingAsset } from '@/lib/asset-config';
import { getAssetConfig } from '@/lib/asset-config';
import { disconnectRedis } from '@/lib/kv';
import * as fs from 'fs';
import * as path from 'path';

interface PeriodScorecard {
  period: { startDate: string; endDate: string; isSynthetic: boolean; name: string };
  strategy: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
  };
  btcHold: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
  };
  outperformance: number; // Strategy return - BTC hold return
  outperformancePct: number; // (Strategy return - BTC hold return) / BTC hold return * 100
}

async function generateScorecard(
  configPath: string,
  asset: TradingAsset = 'btc',
  periodFilter?: string[]
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 BTC Strategy Scorecard`);
  console.log(`${'='.repeat(80)}\n`);
  
  const assetConfig = getAssetConfig(asset);
  console.log(`Asset: ${assetConfig.displayName}`);
  console.log(`Config: ${configPath}\n`);
  
  // Load optimized config
  const optimizedConfig = loadOptimizedConfigLocal(configPath);
  
  // Get test periods
  let periods = getAllTestPeriods();
  
  // Filter by years if specified
  if (periodFilter && periodFilter.length > 0) {
    const filterYears = periodFilter.map(y => parseInt(y, 10));
    periods = periods.filter(p => {
      const startYear = new Date(p.startDate).getFullYear();
      return filterYears.includes(startYear);
    });
  }
  
  console.log(`Testing ${periods.length} periods...\n`);
  
  const scorecards: PeriodScorecard[] = [];
  
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]!;
    console.log(`[${i + 1}/${periods.length}] ${period.name}`);
    
    try {
      const result = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        optimizedConfig,
        optimizedConfig.kellyCriterion?.fractionalMultiplier,
        optimizedConfig.stopLoss?.atrMultiplier,
        asset,
        assetConfig.defaultTimeframe,
        asset === 'btc' // useCorrelation
      );
      
      const winRate = result.sellTrades > 0 
        ? (result.winTrades / result.sellTrades) * 100 
        : 0;
      
      const btcHoldReturn = result.ethHold?.returnPct ?? 0; // Note: ethHold is actually asset hold
      const outperformance = result.totalReturnPct - btcHoldReturn;
      const outperformancePct = btcHoldReturn !== 0
        ? (outperformance / Math.abs(btcHoldReturn)) * 100
        : 0;
      
      scorecards.push({
        period,
        strategy: {
          totalReturnPct: result.totalReturnPct,
          sharpeRatio: result.sharpeRatio,
          maxDrawdownPct: result.maxDrawdownPct,
          winRate,
          totalTrades: result.totalTrades,
          buyTrades: result.buyTrades,
          sellTrades: result.sellTrades,
        },
        btcHold: {
          totalReturnPct: btcHoldReturn,
          sharpeRatio: result.ethHold?.sharpeRatio ?? 0,
          maxDrawdownPct: result.ethHold?.maxDrawdownPct ?? 0,
        },
        outperformance,
        outperformancePct,
      });
      
      const outperformanceEmoji = outperformance > 0 ? '✅' : outperformance < 0 ? '❌' : '🤝';
      console.log(`   ${outperformanceEmoji} Strategy: ${result.totalReturnPct.toFixed(2)}% | BTC Hold: ${result.ethHold.returnPct.toFixed(2)}% | Outperformance: ${outperformance >= 0 ? '+' : ''}${outperformance.toFixed(2)}%`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  // Generate summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Scorecard Summary`);
  console.log(`${'='.repeat(80)}\n`);
  
  const avgStrategyReturn = scorecards.reduce((sum, s) => sum + s.strategy.totalReturnPct, 0) / scorecards.length;
  const avgBTCHoldReturn = scorecards.reduce((sum, s) => sum + s.btcHold.totalReturnPct, 0) / scorecards.length;
  const avgOutperformance = scorecards.reduce((sum, s) => sum + s.outperformance, 0) / scorecards.length;
  const avgStrategySharpe = scorecards.reduce((sum, s) => sum + s.strategy.sharpeRatio, 0) / scorecards.length;
  const avgBTCHoldSharpe = scorecards.reduce((sum, s) => sum + s.btcHold.sharpeRatio, 0) / scorecards.length;
  const avgStrategyDrawdown = scorecards.reduce((sum, s) => sum + s.strategy.maxDrawdownPct, 0) / scorecards.length;
  const avgBTCHoldDrawdown = scorecards.reduce((sum, s) => sum + s.btcHold.maxDrawdownPct, 0) / scorecards.length;
  const avgWinRate = scorecards.reduce((sum, s) => sum + s.strategy.winRate, 0) / scorecards.length;
  const totalTrades = scorecards.reduce((sum, s) => sum + s.strategy.totalTrades, 0);
  
  const outperformancePeriods = scorecards.filter(s => s.outperformance > 0).length;
  const underperformancePeriods = scorecards.filter(s => s.outperformance < 0).length;
  const tiePeriods = scorecards.filter(s => s.outperformance === 0).length;
  
  console.log(`📈 Average Returns:`);
  console.log(`   Strategy: ${avgStrategyReturn.toFixed(2)}%`);
  console.log(`   BTC Hold: ${avgBTCHoldReturn.toFixed(2)}%`);
  console.log(`   Outperformance: ${avgOutperformance >= 0 ? '+' : ''}${avgOutperformance.toFixed(2)}%`);
  console.log(`   Outperformance Rate: ${((outperformancePeriods / scorecards.length) * 100).toFixed(1)}% of periods\n`);
  
  console.log(`📊 Risk Metrics:`);
  console.log(`   Strategy Sharpe: ${avgStrategySharpe.toFixed(3)}`);
  console.log(`   BTC Hold Sharpe: ${avgBTCHoldSharpe.toFixed(3)}`);
  console.log(`   Strategy Max Drawdown: ${avgStrategyDrawdown.toFixed(2)}%`);
  console.log(`   BTC Hold Max Drawdown: ${avgBTCHoldDrawdown.toFixed(2)}%`);
  console.log(`   Strategy Win Rate: ${avgWinRate.toFixed(1)}%`);
  console.log(`   Total Trades: ${totalTrades}\n`);
  
  console.log(`🎯 Period Performance:`);
  console.log(`   Outperformed: ${outperformancePeriods} periods`);
  console.log(`   Underperformed: ${underperformancePeriods} periods`);
  console.log(`   Tied: ${tiePeriods} periods\n`);
  
  // Generate markdown report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `btc-scorecard-${timestamp}.md`);
  
  let report = `# BTC Strategy Scorecard\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Config**: ${path.basename(configPath)}\n`;
  report += `**Periods Tested**: ${scorecards.length}\n\n`;
  
  report += `## Summary\n\n`;
  report += `| Metric | Strategy | BTC Hold | Difference |\n`;
  report += `|--------|----------|----------|------------|\n`;
  report += `| **Average Return** | ${avgStrategyReturn.toFixed(2)}% | ${avgBTCHoldReturn.toFixed(2)}% | ${avgOutperformance >= 0 ? '+' : ''}${avgOutperformance.toFixed(2)}% |\n`;
  report += `| **Sharpe Ratio** | ${avgStrategySharpe.toFixed(3)} | ${avgBTCHoldSharpe.toFixed(3)} | ${(avgStrategySharpe - avgBTCHoldSharpe).toFixed(3)} |\n`;
  report += `| **Max Drawdown** | ${avgStrategyDrawdown.toFixed(2)}% | ${avgBTCHoldDrawdown.toFixed(2)}% | ${(avgStrategyDrawdown - avgBTCHoldDrawdown).toFixed(2)}% |\n`;
  report += `| **Win Rate** | ${avgWinRate.toFixed(1)}% | N/A | N/A |\n`;
  report += `| **Total Trades** | ${totalTrades} | N/A | N/A |\n\n`;
  
  report += `## Outperformance Analysis\n\n`;
  report += `- **Outperformed**: ${outperformancePeriods} periods (${((outperformancePeriods / scorecards.length) * 100).toFixed(1)}%)\n`;
  report += `- **Underperformed**: ${underperformancePeriods} periods (${((underperformancePeriods / scorecards.length) * 100).toFixed(1)}%)\n`;
  report += `- **Tied**: ${tiePeriods} periods\n`;
  report += `- **Average Outperformance**: ${avgOutperformance >= 0 ? '+' : ''}${avgOutperformance.toFixed(2)}%\n\n`;
  
  report += `## Period-by-Period Results\n\n`;
  report += `| Period | Strategy Return | BTC Hold Return | Outperformance | Win Rate | Trades |\n`;
  report += `|--------|-----------------|------------------|----------------|---------|--------|\n`;
  
  for (const scorecard of scorecards) {
    const emoji = scorecard.outperformance > 0 ? '✅' : scorecard.outperformance < 0 ? '❌' : '🤝';
    report += `| ${scorecard.period.name} | ${scorecard.strategy.totalReturnPct.toFixed(2)}% | ${scorecard.btcHold.totalReturnPct.toFixed(2)}% | ${emoji} ${scorecard.outperformance >= 0 ? '+' : ''}${scorecard.outperformance.toFixed(2)}% | ${scorecard.strategy.winRate.toFixed(1)}% | ${scorecard.strategy.totalTrades} |\n`;
  }
  
  report += `\n## Recommendation\n\n`;
  
  if (avgOutperformance > 5 && outperformancePeriods > underperformancePeriods) {
    report += `✅ **Strong Outperformance** - Strategy significantly outperforms BTC hold with ${avgOutperformance.toFixed(2)}% average outperformance.\n`;
  } else if (avgOutperformance > 0 && outperformancePeriods >= underperformancePeriods) {
    report += `✅ **Positive Outperformance** - Strategy outperforms BTC hold with ${avgOutperformance.toFixed(2)}% average outperformance.\n`;
  } else if (avgOutperformance < -5) {
    report += `❌ **Underperformance** - Strategy underperforms BTC hold by ${Math.abs(avgOutperformance).toFixed(2)}%. Consider reviewing strategy parameters.\n`;
  } else {
    report += `🤝 **Similar Performance** - Strategy performs similarly to BTC hold. Consider risk-adjusted metrics (Sharpe ratio, drawdown) for decision.\n`;
  }
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Full scorecard saved to: ${reportPath}\n`);
}

function loadOptimizedConfigLocal(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const config = JSON.parse(content);
  
  if (!config.bullishStrategy || !config.bearishStrategy) {
    throw new Error('Invalid config: missing bullish or bearish strategy');
  }
  
  return config;
}

async function main() {
  const args = process.argv.slice(2);
  
  let configPath: string | undefined;
  let asset: TradingAsset = 'btc';
  let periodFilter: string[] | undefined;
  
  if (args[0] && (args[0].endsWith('.json') || args[0].includes('/'))) {
    configPath = args[0];
    asset = (args[1] as TradingAsset) || 'btc';
    periodFilter = args.slice(2);
  } else {
    // Find latest BTC config
    const configDir = path.join(process.cwd(), 'data', 'optimized-configs');
    const files = fs.readdirSync(configDir)
      .filter(f => f.startsWith(`ml-optimized-${asset}-`) && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(configDir, f),
        mtime: fs.statSync(path.join(configDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (files.length === 0) {
      console.error('❌ No optimized config found. Please specify a config path.');
      process.exit(1);
    }
    
    configPath = files[0]!.path;
    periodFilter = args;
  }
  
  try {
    await generateScorecard(configPath, asset, periodFilter);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await disconnectRedis();
  }
}

if (require.main === module) {
  main();
}

