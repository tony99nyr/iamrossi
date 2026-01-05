#!/usr/bin/env npx tsx
/**
 * Verify candle coverage for a symbol/timeframe
 */

import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { detectGaps } from '../src/lib/data-quality-validator';
import type { PriceCandle } from '@/types';

const envPath = path.resolve(process.cwd(), '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local doesn't exist - that's OK
}

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

async function loadFromFile(filePath: string): Promise<PriceCandle[]> {
  try {
    const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
    if (await fs.access(gzPath).then(() => true).catch(() => false)) {
      const compressed = await fs.readFile(gzPath);
      const decompressed = gunzipSync(compressed);
      return JSON.parse(decompressed.toString('utf-8')) as PriceCandle[];
    }
    return [];
  } catch {
    return [];
  }
}

async function main() {
  const symbol = process.argv[2] || 'ETHUSDT';
  const timeframe = process.argv[3] || '8h';
  
  console.log(`\n🔍 Verifying candle coverage for ${symbol} ${timeframe}\n`);
  
  // Load from files
  const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), timeframe);
  const files = await fs.readdir(dir).catch(() => []);
  const allCandles: PriceCandle[] = [];
  
  for (const file of files.filter(f => f.endsWith('.json.gz'))) {
    const filePath = path.join(dir, file);
    const candles = await loadFromFile(filePath);
    if (candles.length > 0) {
      allCandles.push(...candles);
      const first = new Date(candles[0]!.timestamp).toISOString().split('T')[0];
      const last = new Date(candles[candles.length - 1]!.timestamp).toISOString().split('T')[0];
      console.log(`📁 ${file}: ${candles.length} candles (${first} to ${last})`);
    }
  }
  
  // Remove duplicates
  const uniqueMap = new Map<number, PriceCandle>();
  for (const candle of allCandles) {
    const existing = uniqueMap.get(candle.timestamp);
    if (!existing || candle.volume > existing.volume) {
      uniqueMap.set(candle.timestamp, candle);
    }
  }
  
  const uniqueCandles = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  
  if (uniqueCandles.length === 0) {
    console.log('❌ No candles found in files');
    return;
  }
  
  const firstCandle = uniqueCandles[0]!;
  const lastCandle = uniqueCandles[uniqueCandles.length - 1]!;
  const firstDate = new Date(firstCandle.timestamp).toISOString().split('T')[0];
  const lastDate = new Date(lastCandle.timestamp).toISOString().split('T')[0];
  
  console.log(`\n📊 Total unique candles: ${uniqueCandles.length}`);
  console.log(`   Date range: ${firstDate} to ${lastDate}`);
  
  // Check for gaps
  const startTime = firstCandle.timestamp;
  const endTime = lastCandle.timestamp;
  const gapInfo = detectGaps(uniqueCandles, timeframe, startTime, endTime);
  
  console.log(`\n🔍 Gap Analysis:`);
  console.log(`   Gaps found: ${gapInfo.gapCount}`);
  console.log(`   Missing candles: ${gapInfo.missingCandles.length}`);
  console.log(`   Coverage: ${gapInfo.coverage.toFixed(1)}%`);
  
  // Check if we have data up to today
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const lastCandleTime = lastCandle.timestamp;
  
  console.log(`\n📅 Recent Data Check:`);
  console.log(`   Last candle: ${new Date(lastCandleTime).toISOString()}`);
  console.log(`   Today: ${today.toISOString()}`);
  
  if (lastCandleTime < todayTime) {
    const daysSinceLastCandle = Math.floor((todayTime - lastCandleTime) / (24 * 60 * 60 * 1000));
    console.log(`   ⚠️  Last candle is ${daysSinceLastCandle} day(s) old`);
    console.log(`   💡 Consider fetching recent data from API`);
  } else {
    console.log(`   ✅ Data is up to date`);
  }
  
  // Try to fetch recent data from API to see what's available
  console.log(`\n📡 Checking API for recent data...`);
  try {
    const recentCandles = await fetchPriceCandles(
      symbol,
      timeframe,
      lastDate,
      new Date().toISOString().split('T')[0]
    );
    
    if (recentCandles.length > 0) {
      const apiFirst = new Date(recentCandles[0]!.timestamp).toISOString().split('T')[0];
      const apiLast = new Date(recentCandles[recentCandles.length - 1]!.timestamp).toISOString().split('T')[0];
      console.log(`   ✅ API has ${recentCandles.length} candles (${apiFirst} to ${apiLast})`);
      
      // Check if API has newer data than files
      const apiLastTime = recentCandles[recentCandles.length - 1]!.timestamp;
      if (apiLastTime > lastCandleTime) {
        console.log(`   ⚠️  API has newer data than files (${new Date(apiLastTime).toISOString()} vs ${new Date(lastCandleTime).toISOString()})`);
        console.log(`   💡 Consider running gap filling script to update files`);
      }
    } else {
      console.log(`   ℹ️  No additional candles available from API`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check API: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log(`\n✅ Verification complete\n`);
}

main().catch(console.error);



