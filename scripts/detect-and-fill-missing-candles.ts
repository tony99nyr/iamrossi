#!/usr/bin/env npx tsx
/**
 * Detect and Fill Missing Candles for ETH and BTC
 * 
 * This script:
 * 1. Checks both ETH and BTC for missing candles (8h, 1d, 12h timeframes)
 * 2. Detects gaps using data quality validator
 * 3. Fetches missing candles from API
 * 4. Saves to both Redis and files
 * 
 * Usage:
 *   pnpm tsx scripts/detect-and-fill-missing-candles.ts [timeframe]
 * 
 * Examples:
 *   pnpm tsx scripts/detect-and-fill-missing-candles.ts        # Checks 8h, 1d, 12h
 *   pnpm tsx scripts/detect-and-fill-missing-candles.ts 8h     # Only 8h timeframe
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ASSET_CONFIGS, type TradingAsset } from '@/lib/asset-config';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import { detectGaps } from '@/lib/data-quality-validator';
import { loadCandlesFromFile, saveCandlesToFile, getHistoricalDataPath, deduplicateCandles } from '@/lib/historical-file-utils';
import { disconnectRedis } from '@/lib/kv';
import type { PriceCandle } from '@/types';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function detectAndFillMissingCandles(
  asset: TradingAsset,
  timeframe: string
): Promise<{ detected: number; filled: number }> {
  const config = ASSET_CONFIGS[asset];
  const symbol = config.symbol;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Checking ${config.displayName} ${timeframe} candles`);
  console.log(`${'='.repeat(60)}`);
  
  // Load existing candles from Redis/files
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 7 days
  
  console.log(`📂 Loading candles from ${startDate} to ${endDate}...`);
  const candles = await fetchPriceCandles(symbol, timeframe, startDate, endDate, undefined, false, false);
  
  if (candles.length === 0) {
    console.log(`⚠️  No candles found. Skipping.`);
    return { detected: 0, filled: 0 };
  }
  
  console.log(`   Loaded ${candles.length} candles`);
  if (candles.length > 0) {
    const first = candles[0]!;
    const last = candles[candles.length - 1]!;
    console.log(`   First: ${new Date(first.timestamp).toISOString()}`);
    console.log(`   Last:  ${new Date(last.timestamp).toISOString()}`);
  }
  
  // Detect gaps
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate + 'T23:59:59.999Z').getTime();
  const gapInfo = detectGaps(candles, timeframe, startTime, endTime);
  
  console.log(`\n📊 Gap Analysis:`);
  console.log(`   Gap Count: ${gapInfo.gapCount}`);
  console.log(`   Missing Candles: ${gapInfo.missingCandles.length}`);
  console.log(`   Coverage: ${gapInfo.coverage.toFixed(1)}%`);
  
  if (gapInfo.missingCandles.length === 0) {
    console.log(`\n✅ No missing candles found!`);
    return { detected: 0, filled: 0 };
  }
  
  // Filter to recent gaps only (within last 7 days, completed periods)
  const now = Date.now();
  const recentGaps = gapInfo.missingCandles.filter(m => {
    const gapAge = now - m.expected;
    const maxGapAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    return gapAge > 0 && gapAge < maxGapAge;
  });
  
  if (recentGaps.length === 0) {
    console.log(`\n⚠️  Missing candles are outside 7-day window. Skipping.`);
    return { detected: gapInfo.missingCandles.length, filled: 0 };
  }
  
  console.log(`\n📡 Fetching ${recentGaps.length} missing candles from API...`);
  
  // Calculate date range for missing candles
  const missingStart = Math.min(...recentGaps.map(g => g.expected));
  const missingEnd = Math.max(...recentGaps.map(g => g.expected));
  const missingStartDate = new Date(missingStart).toISOString().split('T')[0];
  const missingEndDate = new Date(missingEnd).toISOString().split('T')[0];
  
  console.log(`   Date range: ${missingStartDate} to ${missingEndDate}`);
  
  // Fetch missing candles (this automatically saves to Redis)
  const filledCandles = await fetchPriceCandles(
    symbol,
    timeframe,
    missingStartDate,
    missingEndDate,
    undefined,
    false, // Don't skip API fetch
    false  // No synthetic data
  );
  
  if (filledCandles.length === 0) {
    console.log(`\n⚠️  API returned no candles. They may not be available yet.`);
    return { detected: recentGaps.length, filled: 0 };
  }
  
  console.log(`\n✅ Fetched ${filledCandles.length} candles from API`);
  
  // Save to files for persistence
  try {
    const filePath = getHistoricalDataPath(symbol, timeframe);
    const existingCandles = await loadCandlesFromFile(filePath) || [];
    
    // Merge with existing candles
    const allCandles = [...existingCandles, ...filledCandles];
    const mergedCandles = deduplicateCandles(allCandles);
    
    // Save merged candles to file
    await saveCandlesToFile(filePath, mergedCandles);
    console.log(`💾 Saved ${mergedCandles.length} candles to ${path.basename(filePath)}.gz`);
  } catch (error) {
    console.warn(`⚠️  Failed to save to file:`, error instanceof Error ? error.message : error);
  }
  
  return { detected: recentGaps.length, filled: filledCandles.length };
}

async function main() {
  const timeframeArg = process.argv[2];
  const timeframes = timeframeArg 
    ? [timeframeArg] 
    : ['8h', '1d', '12h']; // Default: check all critical timeframes
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Detect and Fill Missing Candles`);
  console.log(`   Timeframes: ${timeframes.join(', ')}`);
  console.log(`   Assets: ETH, BTC`);
  console.log(`${'='.repeat(80)}\n`);
  
  const results: Record<TradingAsset, Record<string, { detected: number; filled: number }>> = {
    eth: {},
    btc: {},
  };
  
  try {
    // Process each asset
    for (const [assetId, config] of Object.entries(ASSET_CONFIGS)) {
      const asset = assetId as TradingAsset;
      
      // Process each timeframe
      for (const timeframe of timeframes) {
        try {
          const result = await detectAndFillMissingCandles(asset, timeframe);
          results[asset][timeframe] = result;
        } catch (error) {
          console.error(`❌ Error processing ${config.displayName} ${timeframe}:`, error);
          results[asset][timeframe] = { detected: 0, filled: 0 };
        }
      }
    }
    
    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Summary`);
    console.log(`${'='.repeat(80)}`);
    
    for (const [assetId, config] of Object.entries(ASSET_CONFIGS)) {
      const asset = assetId as TradingAsset;
      const assetResults = results[asset];
      
      console.log(`\n${config.displayName}:`);
      for (const timeframe of timeframes) {
        const result = assetResults[timeframe];
        if (result) {
          console.log(`   ${timeframe}: ${result.detected} detected, ${result.filled} filled`);
        }
      }
    }
    
    console.log(`\n✅ Done!\n`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await disconnectRedis();
  }
}

main();

