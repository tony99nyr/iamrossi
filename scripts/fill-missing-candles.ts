#!/usr/bin/env npx tsx
/**
 * Fill Missing Historical Candles
 * 
 * This script identifies missing candles in historical data and fetches them from APIs.
 * It uses the data quality validator to detect gaps and fills them by fetching from
 * Binance API (with CoinGecko as fallback).
 * 
 * Usage:
 *   pnpm tsx scripts/fill-missing-candles.ts [symbol] [timeframe] [startDate] [endDate]
 * 
 * Examples:
 *   pnpm tsx scripts/fill-missing-candles.ts ETHUSDT 8h 2025-01-01 2025-12-31
 *   pnpm tsx scripts/fill-missing-candles.ts ETHUSDT 8h  # Fills all gaps in existing files
 */

import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { validateDataQuality, detectGaps } from '../src/lib/data-quality-validator';
import { redis } from '../src/lib/kv';
import type { PriceCandle } from '@/types';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local doesn't exist - that's OK
}

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

/**
 * Get file path for historical data
 */
function getHistoricalDataPath(symbol: string, timeframe: string, startDate: string, endDate: string): string {
  const symbolLower = symbol.toLowerCase();
  const dir = path.join(HISTORICAL_DATA_DIR, symbolLower, timeframe);
  // Try both naming patterns
  const filename1 = `${symbolLower}_${timeframe}_${startDate}_${endDate}.json.gz`;
  const filename2 = `${startDate}_${endDate}.json.gz`;
  const filePath1 = path.join(dir, filename1);
  const filePath2 = path.join(dir, filename2);
  return filePath1; // Prefer symbol-based naming
}

/**
 * Load candles from file
 */
async function loadFromFile(filePath: string): Promise<PriceCandle[]> {
  try {
    // Try .gz first
    const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
    if (await fs.access(gzPath).then(() => true).catch(() => false)) {
      const compressed = await fs.readFile(gzPath);
      const decompressed = gunzipSync(compressed);
      return JSON.parse(decompressed.toString('utf-8')) as PriceCandle[];
    }
    
    // Try uncompressed
    if (await fs.access(filePath).then(() => true).catch(() => false)) {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as PriceCandle[];
    }
    
    return [];
  } catch (error) {
    console.warn(`Failed to load from ${filePath}:`, error);
    return [];
  }
}

/**
 * Save candles to file (compressed)
 */
async function saveToFile(filePath: string, candles: PriceCandle[]): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Sort by timestamp
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove duplicates (keep highest volume)
    const uniqueMap = new Map<number, PriceCandle>();
    for (const candle of sorted) {
      const existing = uniqueMap.get(candle.timestamp);
      if (!existing || candle.volume > existing.volume) {
        uniqueMap.set(candle.timestamp, candle);
      }
    }
    
    const uniqueCandles = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    
    // Save as compressed .gz file
    const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
    const jsonString = JSON.stringify(uniqueCandles, null, 2);
    const compressed = gzipSync(jsonString);
    await fs.writeFile(gzPath, compressed);
    
    console.log(`✅ Saved ${uniqueCandles.length} candles to ${path.basename(gzPath)}`);
  } catch (error) {
    console.error(`❌ Failed to save to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Find all historical files for a symbol/timeframe (including rolling files)
 */
async function findAllHistoricalFiles(symbol: string, timeframe: string): Promise<string[]> {
  const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), timeframe);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith('.json.gz'))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Load all candles from all files for a symbol/timeframe
 */
async function loadAllCandles(symbol: string, timeframe: string): Promise<PriceCandle[]> {
  const files = await findAllHistoricalFiles(symbol, timeframe);
  const allCandles: PriceCandle[] = [];
  
  for (const file of files) {
    const candles = await loadFromFile(file);
    allCandles.push(...candles);
    console.log(`   Loaded ${candles.length} candles from ${path.basename(file)}`);
  }
  
  // Remove duplicates (keep highest volume)
  const uniqueMap = new Map<number, PriceCandle>();
  for (const candle of allCandles) {
    const existing = uniqueMap.get(candle.timestamp);
    if (!existing || candle.volume > existing.volume) {
      uniqueMap.set(candle.timestamp, candle);
    }
  }
  
  return Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get expected interval for timeframe
 */
function getExpectedInterval(timeframe: string): number {
  const intervals: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return intervals[timeframe] || 24 * 60 * 60 * 1000;
}

/**
 * Fetch missing candles from API
 */
async function fetchMissingCandles(
  symbol: string,
  timeframe: string,
  missingTimestamps: number[]
): Promise<PriceCandle[]> {
  if (missingTimestamps.length === 0) {
    return [];
  }
  
  // Group missing timestamps by date range to minimize API calls
  const sorted = [...missingTimestamps].sort((a, b) => a - b);
  const firstTimestamp = sorted[0]!;
  const lastTimestamp = sorted[sorted.length - 1]!;
  
  // Add buffer (1 day before/after) to ensure we get all candles
  const startTime = firstTimestamp - (24 * 60 * 60 * 1000);
  const endTime = lastTimestamp + (24 * 60 * 60 * 1000);
  
  const startDate = new Date(startTime).toISOString().split('T')[0];
  const endDate = new Date(endTime).toISOString().split('T')[0];
  
  console.log(`📡 Fetching candles from API: ${startDate} to ${endDate} (${missingTimestamps.length} missing candles)`);
  
  try {
    // Fetch from API (this will use Binance with CoinGecko fallback)
    const fetchedCandles = await fetchPriceCandles(symbol, timeframe, startDate, endDate);
    
    // Filter to only include missing timestamps
    const expectedInterval = getExpectedInterval(timeframe);
    const missingSet = new Set(missingTimestamps);
    const filledCandles = fetchedCandles.filter(candle => {
      // Check if this candle matches any missing timestamp (within tolerance)
      for (const missingTs of missingSet) {
        const diff = Math.abs(candle.timestamp - missingTs);
        if (diff < expectedInterval / 2) {
          return true;
        }
      }
      return false;
    });
    
    console.log(`✅ Fetched ${filledCandles.length} candles, ${filledCandles.length} match missing timestamps`);
    return filledCandles;
  } catch (error) {
    console.error(`❌ Failed to fetch candles from API:`, error);
    return [];
  }
}

/**
 * Determine which file a candle belongs to
 */
function getFileForCandle(
  symbol: string,
  timeframe: string,
  candle: PriceCandle,
  existingFiles: string[]
): string {
  const candleDate = new Date(candle.timestamp).toISOString().split('T')[0];
  
  // Find file that should contain this candle
  // Files are named: {symbol}_{timeframe}_{startDate}_{endDate}.json.gz
  for (const file of existingFiles) {
    const basename = path.basename(file, '.json.gz');
    const match = basename.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const fileStart = match[1]!;
      const fileEnd = match[2]!;
      if (candleDate >= fileStart && candleDate <= fileEnd) {
        return file;
      }
    }
  }
  
  // If no file found, create new file name based on candle date
  const symbolLower = symbol.toLowerCase();
  const dir = path.join(HISTORICAL_DATA_DIR, symbolLower, timeframe);
  return path.join(dir, `${symbolLower}_${timeframe}_${candleDate}_${candleDate}.json.gz`);
}

/**
 * Main function
 */
async function main() {
  const symbol = process.argv[2] || 'ETHUSDT';
  const timeframe = process.argv[3] || '8h';
  const startDate = process.argv[4]; // Optional: specific start date
  const endDate = process.argv[5]; // Optional: specific end date
  
  console.log(`\n🔍 Filling missing candles for ${symbol} ${timeframe}`);
  
  // Load all existing candles
  console.log(`\n📁 Loading existing candles...`);
  const existingCandles = await loadAllCandles(symbol, timeframe);
  console.log(`   Total existing candles: ${existingCandles.length}`);
  
  if (existingCandles.length === 0) {
    console.log(`⚠️  No existing candles found. Use fetchPriceCandles to get initial data.`);
    return;
  }
  
  // Determine date range to check
  const firstCandle = existingCandles[0]!;
  const lastCandle = existingCandles[existingCandles.length - 1]!;
  const checkStartTime = startDate 
    ? new Date(startDate).getTime()
    : firstCandle.timestamp;
  const checkEndTime = endDate
    ? new Date(endDate).getTime()
    : lastCandle.timestamp;
  
  console.log(`\n🔍 Checking for gaps from ${new Date(checkStartTime).toISOString().split('T')[0]} to ${new Date(checkEndTime).toISOString().split('T')[0]}`);
  
  // Detect gaps
  const gapInfo = detectGaps(existingCandles, timeframe, checkStartTime, checkEndTime);
  console.log(`   Gaps found: ${gapInfo.gapCount}`);
  console.log(`   Missing candles: ${gapInfo.missingCandles.length}`);
  console.log(`   Coverage: ${gapInfo.coverage.toFixed(1)}%`);
  
  if (gapInfo.missingCandles.length === 0) {
    console.log(`\n✅ No missing candles found!`);
    return;
  }
  
  // Fetch missing candles
  console.log(`\n📡 Fetching ${gapInfo.missingCandles.length} missing candles from API...`);
  const missingTimestamps = gapInfo.missingCandles.map(m => m.expected);
  const filledCandles = await fetchMissingCandles(symbol, timeframe, missingTimestamps);
  
  if (filledCandles.length === 0) {
    console.log(`\n⚠️  Could not fetch any missing candles. They may be outside API availability.`);
    return;
  }
  
  // Merge filled candles with existing
  const allCandles = [...existingCandles, ...filledCandles];
  
  // Remove duplicates (keep highest volume)
  const uniqueMap = new Map<number, PriceCandle>();
  for (const candle of allCandles) {
    const existing = uniqueMap.get(candle.timestamp);
    if (!existing || candle.volume > existing.volume) {
      uniqueMap.set(candle.timestamp, candle);
    }
  }
  
  const mergedCandles = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  
  console.log(`\n💾 Saving ${mergedCandles.length} candles (${filledCandles.length} new)...`);
  
  // Group candles by file and save
  const existingFiles = await findAllHistoricalFiles(symbol, timeframe);
  const candlesByFile = new Map<string, PriceCandle[]>();
  
  // Initialize with existing file contents
  for (const file of existingFiles) {
    const fileCandles = await loadFromFile(file);
    candlesByFile.set(file, fileCandles);
  }
  
  // Add new candles to appropriate files
  for (const candle of filledCandles) {
    const file = getFileForCandle(symbol, timeframe, candle, existingFiles);
    if (!candlesByFile.has(file)) {
      candlesByFile.set(file, []);
    }
    candlesByFile.get(file)!.push(candle);
  }
  
  // Save all files
  for (const [file, candles] of candlesByFile.entries()) {
    // Remove duplicates within file
    const uniqueInFile = new Map<number, PriceCandle>();
    for (const candle of candles) {
      const existing = uniqueInFile.get(candle.timestamp);
      if (!existing || candle.volume > existing.volume) {
        uniqueInFile.set(candle.timestamp, candle);
      }
    }
    
    const sortedCandles = Array.from(uniqueInFile.values()).sort((a, b) => a.timestamp - b.timestamp);
    await saveToFile(file, sortedCandles);
  }
  
  // Verify coverage after filling
  console.log(`\n✅ Verification...`);
  const finalCandles = await loadAllCandles(symbol, timeframe);
  const finalGapInfo = detectGaps(finalCandles, timeframe, checkStartTime, checkEndTime);
  console.log(`   Final gaps: ${finalGapInfo.gapCount}`);
  console.log(`   Final missing candles: ${finalGapInfo.missingCandles.length}`);
  console.log(`   Final coverage: ${finalGapInfo.coverage.toFixed(1)}%`);
  
  if (finalGapInfo.coverage >= 95) {
    console.log(`\n✅ Success! Coverage is now ${finalGapInfo.coverage.toFixed(1)}%`);
  } else {
    console.log(`\n⚠️  Coverage improved but still below 95% (${finalGapInfo.coverage.toFixed(1)}%)`);
    console.log(`   Some candles may be unavailable from APIs.`);
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(async () => {
      // Close Redis connection and exit
      try {
        if (redis.isOpen) {
          await redis.quit();
        }
      } catch (error) {
        // Ignore errors when closing
      }
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Error:', error);
      try {
        if (redis.isOpen) {
          await redis.quit();
        }
      } catch (closeError) {
        // Ignore errors when closing
      }
      process.exit(1);
    });
}

