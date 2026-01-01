#!/usr/bin/env npx tsx
/**
 * Compare 4h vs 8h Timeframe Performance
 * 
 * Runs backfill tests for both 4h and 8h timeframes and compares:
 * - Total return
 * - Sharpe ratio
 * - Max drawdown
 * - Win rate
 * - Trade count
 * 
 * Usage:
 *   pnpm tsx scripts/compare-timeframes.ts [asset] [startDate] [endDate]
 * 
 * Examples:
 *   pnpm tsx scripts/compare-timeframes.ts eth 2025-01-01 2025-12-31
 *   pnpm tsx scripts/compare-timeframes.ts btc 2026-01-01 2026-12-31
 */

import { runBacktest } from './backfill-test';

// Import BacktestResult type from backfill-test
interface BacktestResult {
  startDate: string;
  endDate: string;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  winTrades: number;
  lossTrades: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
}
import { getAssetConfig, type TradingAsset } from '@/lib/asset-config';

interface ComparisonResult {
  timeframe: string;
  result: BacktestResult;
}

async function compareTimeframes(
  asset: TradingAsset,
  startDate: string,
  endDate: string
): Promise<void> {
  const assetConfig = getAssetConfig(asset);
  console.log(`\n📊 Comparing Timeframes for ${assetConfig.displayName}`);
  console.log(`   Period: ${startDate} to ${endDate}\n`);

  const timeframes: ('4h' | '8h')[] = ['4h', '8h'];
  const results: ComparisonResult[] = [];
  const isSynthetic = new Date(startDate).getFullYear() >= 2026;

  for (const timeframe of timeframes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${timeframe} timeframe...`);
    console.log('='.repeat(60));

    try {
      // Set timeframe via environment variable for backfill-test
      process.env.TIMEFRAME = timeframe;
      
      const result = await runBacktest(startDate, endDate, isSynthetic);

      results.push({
        timeframe,
        result,
      });

      console.log(`\n✅ ${timeframe} Results:`);
      console.log(`   Total Return: ${result.totalReturnPct.toFixed(2)}%`);
      console.log(`   Max Drawdown: ${result.maxDrawdownPct.toFixed(2)}%`);
      console.log(`   Win Rate: ${result.winTrades > 0 ? ((result.winTrades / result.sellTrades) * 100).toFixed(2) : 0}%`);
      console.log(`   Trade Count: ${result.totalTrades}`);
    } catch (error) {
      console.error(`❌ Failed to test ${timeframe}:`, error);
    }
  }

  // Comparison Summary
  if (results.length === 2) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📈 COMPARISON SUMMARY');
    console.log('='.repeat(60));

    const [result4h, result8h] = results;
    const winRate4h = result4h.result.winTrades > 0 ? (result4h.result.winTrades / result4h.result.sellTrades) * 100 : 0;
    const winRate8h = result8h.result.winTrades > 0 ? (result8h.result.winTrades / result8h.result.sellTrades) * 100 : 0;

    console.log(`\n💰 Total Return:`);
    console.log(`   4h: ${result4h.result.totalReturnPct.toFixed(2)}%`);
    console.log(`   8h: ${result8h.result.totalReturnPct.toFixed(2)}%`);
    console.log(`   Winner: ${result4h.result.totalReturnPct > result8h.result.totalReturnPct ? '4h' : '8h'}`);

    console.log(`\n📉 Max Drawdown (Lower is Better):`);
    console.log(`   4h: ${result4h.result.maxDrawdownPct.toFixed(2)}%`);
    console.log(`   8h: ${result8h.result.maxDrawdownPct.toFixed(2)}%`);
    console.log(`   Winner: ${result4h.result.maxDrawdownPct < result8h.result.maxDrawdownPct ? '4h' : '8h'}`);

    console.log(`\n🎯 Win Rate:`);
    console.log(`   4h: ${winRate4h.toFixed(2)}%`);
    console.log(`   8h: ${winRate8h.toFixed(2)}%`);
    console.log(`   Winner: ${winRate4h > winRate8h ? '4h' : '8h'}`);

    console.log(`\n📈 Trade Count:`);
    console.log(`   4h: ${result4h.result.totalTrades}`);
    console.log(`   8h: ${result8h.result.totalTrades}`);
    console.log(`   Difference: ${Math.abs(result4h.result.totalTrades - result8h.result.totalTrades)} trades`);

    // Overall recommendation
    const score4h = 
      (result4h.result.totalReturnPct > result8h.result.totalReturnPct ? 1 : 0) +
      (result4h.result.sharpeRatio > result8h.result.sharpeRatio ? 1 : 0) +
      (result4h.result.maxDrawdownPct < result8h.result.maxDrawdownPct ? 1 : 0) +
      (winRate4h > winRate8h ? 1 : 0);

    const score8h = 4 - score4h;

    console.log(`\n🏆 Overall Recommendation:`);
    if (score4h > score8h) {
      console.log(`   ✅ 4h timeframe performs better (${score4h}/4 metrics)`);
    } else if (score8h > score4h) {
      console.log(`   ✅ 8h timeframe performs better (${score8h}/4 metrics)`);
    } else {
      console.log(`   ⚖️  Both timeframes perform similarly`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const assetArg = args[0] || 'eth';
  const startDate = args[1] || '2025-01-01';
  const endDate = args[2] || '2025-12-31';

  const asset: TradingAsset = assetArg === 'btc' ? 'btc' : 'eth';

  await compareTimeframes(asset, startDate, endDate);
}

main().catch(console.error);

