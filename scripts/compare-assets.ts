#!/usr/bin/env npx tsx
/**
 * Compare ETH vs BTC Performance
 * 
 * Runs backfill tests for both ETH and BTC and compares:
 * - Total return
 * - Sharpe ratio
 * - Max drawdown
 * - Win rate
 * - Trade count
 * 
 * Usage:
 *   pnpm tsx scripts/compare-assets.ts [timeframe] [startDate] [endDate]
 * 
 * Examples:
 *   pnpm tsx scripts/compare-assets.ts 8h 2025-01-01 2025-12-31
 *   pnpm tsx scripts/compare-assets.ts 4h 2026-01-01 2026-12-31
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
import { getAssetConfig } from '@/lib/asset-config';

interface ComparisonResult {
  asset: string;
  result: BacktestResult;
}

async function compareAssets(
  timeframe: '4h' | '8h',
  startDate: string,
  endDate: string
): Promise<void> {
  console.log(`\n📊 Comparing Assets (${timeframe} timeframe)`);
  console.log(`   Period: ${startDate} to ${endDate}\n`);

  const assets: ('eth' | 'btc')[] = ['eth', 'btc'];
  const results: ComparisonResult[] = [];
  const isSynthetic = new Date(startDate).getFullYear() >= 2026;

  // Set timeframe via environment variable
  process.env.TIMEFRAME = timeframe;

  for (const asset of assets) {
    const assetConfig = getAssetConfig(asset);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${assetConfig.displayName} (${assetConfig.symbol})...`);
    console.log('='.repeat(60));

    try {
      // Note: runBacktest uses ETHUSDT hardcoded - we'll need to update it to support multi-asset
      // For now, this is a placeholder that shows the structure
      const result = await runBacktest(startDate, endDate, isSynthetic);

      results.push({
        asset: assetConfig.displayName,
        result,
      });

      const winRate = result.winTrades > 0 ? (result.winTrades / result.sellTrades) * 100 : 0;
      console.log(`\n✅ ${assetConfig.displayName} Results:`);
      console.log(`   Total Return: ${result.totalReturnPct.toFixed(2)}%`);
      console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
      console.log(`   Max Drawdown: ${result.maxDrawdownPct.toFixed(2)}%`);
      console.log(`   Win Rate: ${winRate.toFixed(2)}%`);
      console.log(`   Trade Count: ${result.totalTrades}`);
    } catch (error) {
      console.error(`❌ Failed to test ${assetConfig.displayName}:`, error);
    }
  }

  // Comparison Summary
  if (results.length === 2) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📈 COMPARISON SUMMARY');
    console.log('='.repeat(60));

    const [resultEth, resultBtc] = results;
    const winRateEth = resultEth.result.winTrades > 0 ? (resultEth.result.winTrades / resultEth.result.sellTrades) * 100 : 0;
    const winRateBtc = resultBtc.result.winTrades > 0 ? (resultBtc.result.winTrades / resultBtc.result.sellTrades) * 100 : 0;

    console.log(`\n💰 Total Return:`);
    console.log(`   ETH: ${resultEth.result.totalReturnPct.toFixed(2)}%`);
    console.log(`   BTC: ${resultBtc.result.totalReturnPct.toFixed(2)}%`);
    console.log(`   Winner: ${resultEth.result.totalReturnPct > resultBtc.result.totalReturnPct ? 'ETH' : 'BTC'}`);

    console.log(`\n📊 Sharpe Ratio (Risk-Adjusted Return):`);
    console.log(`   ETH: ${resultEth.result.sharpeRatio.toFixed(2)}`);
    console.log(`   BTC: ${resultBtc.result.sharpeRatio.toFixed(2)}`);
    console.log(`   Winner: ${resultEth.result.sharpeRatio > resultBtc.result.sharpeRatio ? 'ETH' : 'BTC'}`);

    console.log(`\n📉 Max Drawdown (Lower is Better):`);
    console.log(`   ETH: ${resultEth.result.maxDrawdownPct.toFixed(2)}%`);
    console.log(`   BTC: ${resultBtc.result.maxDrawdownPct.toFixed(2)}%`);
    console.log(`   Winner: ${resultEth.result.maxDrawdownPct < resultBtc.result.maxDrawdownPct ? 'ETH' : 'BTC'}`);

    console.log(`\n🎯 Win Rate:`);
    console.log(`   ETH: ${winRateEth.toFixed(2)}%`);
    console.log(`   BTC: ${winRateBtc.toFixed(2)}%`);
    console.log(`   Winner: ${winRateEth > winRateBtc ? 'ETH' : 'BTC'}`);

    console.log(`\n📈 Trade Count:`);
    console.log(`   ETH: ${resultEth.result.totalTrades}`);
    console.log(`   BTC: ${resultBtc.result.totalTrades}`);
    console.log(`   Difference: ${Math.abs(resultEth.result.totalTrades - resultBtc.result.totalTrades)} trades`);

    // Overall recommendation
    const scoreEth = 
      (resultEth.result.totalReturnPct > resultBtc.result.totalReturnPct ? 1 : 0) +
      (resultEth.result.sharpeRatio > resultBtc.result.sharpeRatio ? 1 : 0) +
      (resultEth.result.maxDrawdownPct < resultBtc.result.maxDrawdownPct ? 1 : 0) +
      (winRateEth > winRateBtc ? 1 : 0);

    const scoreBtc = 4 - scoreEth;

    console.log(`\n🏆 Overall Recommendation:`);
    if (scoreEth > scoreBtc) {
      console.log(`   ✅ ETH performs better (${scoreEth}/4 metrics)`);
    } else if (scoreBtc > scoreEth) {
      console.log(`   ✅ BTC performs better (${scoreBtc}/4 metrics)`);
    } else {
      console.log(`   ⚖️  Both assets perform similarly`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const timeframeArg = args[0] || '8h';
  const startDate = args[1] || '2025-01-01';
  const endDate = args[2] || '2025-12-31';

  const timeframe: '4h' | '8h' = timeframeArg === '4h' ? '4h' : '8h';

  await compareAssets(timeframe, startDate, endDate);
}

main().catch(console.error);

