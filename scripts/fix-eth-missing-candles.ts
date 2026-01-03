#!/usr/bin/env npx tsx
/**
 * Fix Missing Candles
 * 
 * Detects missing candles in historical data, fetches them from APIs,
 * and saves them to the appropriate historical data files.
 * 
 * Usage:
 *   pnpm tsx scripts/fix-eth-missing-candles.ts [asset] [timeframe]
 * 
 * Examples:
 *   pnpm tsx scripts/fix-eth-missing-candles.ts eth 8h
 *   pnpm tsx scripts/fix-eth-missing-candles.ts btc 8h
 *   pnpm tsx scripts/fix-eth-missing-candles.ts eth 5m
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';
import { detectGaps } from '@/lib/data-quality-validator';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import { fetchBTCCandles } from '@/lib/btc-price-service';
import { loadCandlesFromFile, saveCandlesToFile, getHistoricalDataPath, deduplicateCandles, fixOHLCRelationships } from '@/lib/historical-file-utils';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { disconnectRedis } from '@/lib/kv';

type TradingAsset = 'eth' | 'btc';

function getSymbol(asset: TradingAsset): string {
  return asset === 'eth' ? 'ETHUSDT' : 'BTCUSDT';
}

/**
 * Get expected interval in milliseconds for a timeframe
 */
function getExpectedInterval(timeframe: string): number {
  const intervals: Record<string, number> = {
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return intervals[timeframe] || 24 * 60 * 60 * 1000;
}

/**
 * Load all candles for a symbol/timeframe from historical files
 * Uses the simplified single-file structure: {symbol}_{timeframe}.json.gz
 */
async function loadAllHistoricalCandles(symbol: string, timeframe: string): Promise<PriceCandle[]> {
  const filePath = getHistoricalDataPath(symbol, timeframe);
  
  console.log(`📂 Loading candles from: ${path.basename(filePath)}.gz`);

  try {
    const candles = await loadCandlesFromFile(filePath);
    if (candles) {
      // Fix OHLC relationships
      const fixedCandles = fixOHLCRelationships(candles);
      fixedCandles.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log(`   ✅ Loaded ${fixedCandles.length} candles`);
      return fixedCandles;
    }
  } catch (error) {
    console.warn(`   ⚠️  Failed to load:`, error instanceof Error ? error.message : error);
  }

  console.log(`📊 No candles found`);
  return [];
}

/**
 * Fetch missing candles from API
 */
async function fetchMissingCandles(
  missingTimestamps: number[],
  timeframe: string,
  asset: TradingAsset
): Promise<PriceCandle[]> {
  if (missingTimestamps.length === 0) {
    return [];
  }

  // Group timestamps by date range to minimize API calls
  const sortedTimestamps = [...missingTimestamps].sort((a, b) => a - b);
  const startTime = sortedTimestamps[0]!;
  const endTime = sortedTimestamps[sortedTimestamps.length - 1]!;

  // Add buffer (2 days before and after) to ensure we get all candles
  // This helps catch candles that might be slightly misaligned
  const buffer = 2 * 24 * 60 * 60 * 1000;
  const startDate = new Date(startTime - buffer).toISOString().split('T')[0];
  const endDate = new Date(endTime + buffer).toISOString().split('T')[0];

  console.log(`\n🔄 Fetching candles from API:`);
  console.log(`   Date range: ${startDate} to ${endDate}`);
  console.log(`   Missing timestamps: ${missingTimestamps.length}`);

  try {
    let fetchedCandles: PriceCandle[];
    const symbol = getSymbol(asset);
    
    if (asset === 'eth') {
      fetchedCandles = await fetchPriceCandles(
        symbol,
        timeframe,
        startDate,
        endDate,
        undefined, // currentPrice
        false, // skipAPIFetch
        false // allowSyntheticData
      );
    } else {
      // BTC uses fetchBTCCandles
      fetchedCandles = await fetchBTCCandles(
        symbol,
        timeframe,
        startDate,
        endDate
      );
    }

    // Filter to only include candles that match missing timestamps (within tolerance)
    const expectedInterval = getExpectedInterval(timeframe);
    const tolerance = expectedInterval * 0.5; // Allow 50% tolerance for timestamp matching
    
    const filteredCandles: PriceCandle[] = [];
    const matchedTimestamps = new Set<number>();
    
    for (const missingTs of missingTimestamps) {
      // Find the closest candle to this missing timestamp
      let bestMatch: PriceCandle | null = null;
      let bestDiff = Infinity;
      
      for (const candle of fetchedCandles) {
        const diff = Math.abs(candle.timestamp - missingTs);
        if (diff < tolerance && diff < bestDiff) {
          bestDiff = diff;
          bestMatch = candle;
        }
      }
      
      if (bestMatch && !matchedTimestamps.has(bestMatch.timestamp)) {
        filteredCandles.push(bestMatch);
        matchedTimestamps.add(bestMatch.timestamp);
      }
    }

    console.log(`   ✅ Fetched ${fetchedCandles.length} candles from API`);
    
    // Debug: Show what timestamps we got
    if (fetchedCandles.length > 0) {
      console.log(`   📊 Fetched ${fetchedCandles.length} candles from API:`);
      fetchedCandles.forEach(c => {
        const date = new Date(c.timestamp).toISOString();
        const isMissing = missingTimestamps.some(ts => {
          const diff = Math.abs(c.timestamp - ts);
          return diff < expectedInterval;
        });
        console.log(`      ${isMissing ? '✅' : '  '} ${date}`);
      });
    }
    
    console.log(`   ✅ Found ${filteredCandles.length} matching missing timestamps (out of ${missingTimestamps.length} missing)`);

    // If we didn't find exact matches, check if we can use nearby candles
    // For 8h candles, check if any fetched candles fall within the missing periods
    if (filteredCandles.length === 0 && fetchedCandles.length > 0) {
      console.log(`   🔄 Checking for candles in missing periods...`);
      
      for (const missingTs of missingTimestamps) {
        // For 8h candles, check if any fetched candle is within the 8h period starting at missingTs
        const periodStart = missingTs;
        const periodEnd = missingTs + expectedInterval;
        
        // Find any candle that falls within this period
        for (const candle of fetchedCandles) {
          if (candle.timestamp >= periodStart && candle.timestamp < periodEnd) {
            if (!matchedTimestamps.has(candle.timestamp)) {
              // Adjust timestamp to the period start (standardize to 00:00, 08:00, or 16:00 for 8h)
              let adjustedTimestamp = candle.timestamp;
              if (timeframe === '8h') {
                const candleDate = new Date(candle.timestamp);
                const hours = candleDate.getUTCHours();
                const period = Math.floor(hours / 8);
                const aligned = new Date(candleDate);
                aligned.setUTCHours(period * 8, 0, 0, 0);
                aligned.setUTCMinutes(0, 0, 0);
                aligned.setUTCSeconds(0, 0);
                aligned.setUTCMilliseconds(0);
                adjustedTimestamp = aligned.getTime();
              }
              
              const adjustedCandle: PriceCandle = {
                ...candle,
                timestamp: adjustedTimestamp,
              };
              filteredCandles.push(adjustedCandle);
              matchedTimestamps.add(candle.timestamp);
              console.log(`      ✅ Found candle in period: ${new Date(candle.timestamp).toISOString()} → ${new Date(adjustedTimestamp).toISOString()}`);
              break; // Found a match for this missing timestamp
            }
          }
        }
      }
      
      console.log(`   ✅ After period matching: Found ${filteredCandles.length} matching candles`);
    }

    return filteredCandles;
  } catch (error) {
    console.error(`   ❌ Failed to fetch from API:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Save candles to the historical file
 * Uses the simplified single-file structure: {symbol}_{timeframe}.json.gz
 */
async function saveCandlesToFiles(
  newCandles: PriceCandle[],
  symbol: string,
  timeframe: string
): Promise<void> {
  if (newCandles.length === 0) {
    return;
  }

  // Load existing candles
  const filePath = getHistoricalDataPath(symbol, timeframe);
  const existingCandles = await loadCandlesFromFile(filePath) || [];

  // Merge and deduplicate (keep highest volume if duplicates)
  const allCandles = deduplicateCandles([...existingCandles, ...newCandles]);
  allCandles.sort((a, b) => a.timestamp - b.timestamp);

  // Fix OHLC relationships
  const fixedCandles = fixOHLCRelationships(allCandles);

  // Save back to file
  await saveCandlesToFile(filePath, fixedCandles);
  console.log(`   ✅ Saved ${fixedCandles.length} candles (${newCandles.length} new) to ${path.basename(filePath)}.gz`);
}

async function main() {
  const assetArg = process.argv[2]?.toLowerCase();
  const timeframe = process.argv[3] || '8h';
  
  // Validate asset
  if (assetArg !== 'eth' && assetArg !== 'btc') {
    console.error('❌ Invalid asset. Must be "eth" or "btc"');
    console.error('Usage: pnpm tsx scripts/fix-eth-missing-candles.ts [eth|btc] [timeframe]');
    process.exit(1);
  }
  
  const asset = assetArg as TradingAsset;
  const symbol = getSymbol(asset);
  const assetName = asset.toUpperCase();
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Fixing Missing ${assetName} Candles - ${timeframe}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Load all existing candles
    console.log('📂 Loading existing historical data...');
    const existingCandles = await loadAllHistoricalCandles(symbol, timeframe);

    if (existingCandles.length === 0) {
      console.log('❌ No existing candles found. Cannot detect gaps.');
      return;
    }

    // Detect gaps
    const firstCandle = existingCandles[0]!;
    const lastCandle = existingCandles[existingCandles.length - 1]!;
    const startTime = firstCandle.timestamp;
    // Extend endTime to current time to catch missing recent candles
    const endTime = Math.max(lastCandle.timestamp, Date.now());

    console.log(`\n🔍 Detecting gaps in data...`);
    console.log(`   Date range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
    console.log(`   Last candle: ${new Date(lastCandle.timestamp).toISOString()}`);
    console.log(`   Current time: ${new Date(Date.now()).toISOString()}`);
    
    const gapInfo = detectGaps(existingCandles, timeframe, startTime, endTime);
    
    console.log(`   Gap count: ${gapInfo.gapCount}`);
    console.log(`   Coverage: ${gapInfo.coverage.toFixed(1)}%`);
    console.log(`   Missing candles: ${gapInfo.missingCandles.length}`);

    if (gapInfo.missingCandles.length === 0) {
      console.log(`\n✅ No missing candles detected!`);
      return;
    }

    // Extract missing timestamps
    const missingTimestamps = gapInfo.missingCandles
      .map(m => m.expected)
      .filter((ts): ts is number => ts !== null);

    console.log(`\n📋 Missing timestamps:`);
    missingTimestamps.slice(0, 10).forEach(ts => {
      console.log(`   - ${new Date(ts).toISOString()}`);
    });
    if (missingTimestamps.length > 10) {
      console.log(`   ... and ${missingTimestamps.length - 10} more`);
    }

    // Fetch missing candles
    let fetchedCandles = await fetchMissingCandles(missingTimestamps, timeframe, asset);
    const expectedInterval = getExpectedInterval(timeframe);

    // If we couldn't fetch all missing candles, try to interpolate from surrounding data
    const stillMissing = missingTimestamps.filter(ts => {
      return !fetchedCandles.some(c => {
        const diff = Math.abs(c.timestamp - ts);
        return diff < expectedInterval * 0.5;
      });
    });

    if (stillMissing.length > 0 && existingCandles.length > 0) {
      console.log(`\n🔄 Interpolating ${stillMissing.length} missing candles from surrounding data...`);
      
      const interpolatedCandles: PriceCandle[] = [];
      for (const missingTs of stillMissing) {
        // Find surrounding candles (before and after)
        const before = existingCandles.filter(c => c.timestamp < missingTs).sort((a, b) => b.timestamp - a.timestamp)[0];
        const after = existingCandles.filter(c => c.timestamp > missingTs).sort((a, b) => a.timestamp - b.timestamp)[0];
        
        // Also check fetched candles
        const fetchedBefore = fetchedCandles.filter(c => c.timestamp < missingTs).sort((a, b) => b.timestamp - a.timestamp)[0];
        const fetchedAfter = fetchedCandles.filter(c => c.timestamp > missingTs).sort((a, b) => a.timestamp - b.timestamp)[0];
        
        const prev = fetchedBefore || before;
        const next = fetchedAfter || after;
        
        if (prev && next) {
          // Interpolate price (linear interpolation)
          const timeDiff = next.timestamp - prev.timestamp;
          const missingTimeDiff = missingTs - prev.timestamp;
          const ratio = timeDiff > 0 ? missingTimeDiff / timeDiff : 0.5;
          
          const interpolatedCandle: PriceCandle = {
            timestamp: missingTs,
            open: prev.close, // Use previous close as open (common in gaps)
            high: Math.max(prev.close, next.open) * (1 + Math.abs(ratio - 0.5) * 0.01), // Slight volatility
            low: Math.min(prev.close, next.open) * (1 - Math.abs(ratio - 0.5) * 0.01),
            close: prev.close + (next.open - prev.close) * ratio, // Interpolate between prev close and next open
            volume: (prev.volume + next.volume) / 2, // Average volume
          };
          
          // Fix OHLC relationships
          const fixed = fixOHLCRelationships([interpolatedCandle])[0]!;
          interpolatedCandles.push(fixed);
          console.log(`      ✅ Interpolated candle for ${new Date(missingTs).toISOString()}`);
        } else if (prev) {
          // Only have previous candle - use it as template
          const interpolatedCandle: PriceCandle = {
            ...prev,
            timestamp: missingTs,
            volume: prev.volume * 0.5, // Reduced volume for missing period
          };
          interpolatedCandles.push(interpolatedCandle);
          console.log(`      ⚠️  Used previous candle as template for ${new Date(missingTs).toISOString()} (no next candle)`);
        } else {
          console.log(`      ⚠️  Cannot interpolate ${new Date(missingTs).toISOString()} - no surrounding data`);
        }
      }
      
      fetchedCandles.push(...interpolatedCandles);
    }

    if (fetchedCandles.length === 0) {
      console.log(`\n⚠️  No candles were fetched or interpolated. They may not be available.`);
      return;
    }

    // Fix OHLC relationships
    const fixedCandles = fixOHLCRelationships(fetchedCandles);

    // Save to files
    console.log(`\n💾 Saving candles to historical files...`);
    await saveCandlesToFiles(fixedCandles, symbol, timeframe);

    // Verify gaps are fixed
    console.log(`\n✅ Verification:`);
    const updatedCandles = await loadAllHistoricalCandles(symbol, timeframe);
    const updatedGapInfo = detectGaps(updatedCandles, timeframe, startTime, endTime);
    
    console.log(`   Gap count: ${updatedGapInfo.gapCount} (was ${gapInfo.gapCount})`);
    console.log(`   Coverage: ${updatedGapInfo.coverage.toFixed(1)}% (was ${gapInfo.coverage.toFixed(1)}%)`);
    console.log(`   Missing candles: ${updatedGapInfo.missingCandles.length} (was ${gapInfo.missingCandles.length})`);

    if (updatedGapInfo.gapCount === 0) {
      console.log(`\n🎉 All gaps have been fixed!`);
    } else {
      console.log(`\n⚠️  Some gaps remain. This may be due to:`);
      console.log(`   - API data not available for those periods`);
      console.log(`   - Exchange downtime during those periods`);
      console.log(`   - Future timestamps (not yet available)`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    try {
      await disconnectRedis();
    } catch {
      // Ignore disconnect errors
    }
  }
}

if (require.main === module) {
  main()
    .then(() => {
      setImmediate(() => process.exit(0));
    })
    .catch((error) => {
      console.error('Error:', error);
      setImmediate(() => process.exit(1));
    });
}

