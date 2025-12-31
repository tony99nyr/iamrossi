#!/usr/bin/env npx tsx
/**
 * Check what data the paper trading system would load
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { detectGaps } from '../src/lib/data-quality-validator';

const envPath = path.resolve(process.cwd(), '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local doesn't exist - that's OK
}

async function main() {
  const symbol = 'ETHUSDT';
  const timeframe = '8h';
  
  console.log(`\n🔍 Checking data that paper trading would load for ${symbol} ${timeframe}\n`);
  
  // Simulate what paper trading does: fetch from 2020-01-01 to today
  const startDate = '2020-01-01';
  const endDate = new Date().toISOString().split('T')[0];
  
  console.log(`📡 Fetching candles from ${startDate} to ${endDate}...`);
  const candles = await fetchPriceCandles(symbol, timeframe, startDate, endDate);
  
  console.log(`\n📊 Results:`);
  console.log(`   Total candles: ${candles.length}`);
  
  if (candles.length === 0) {
    console.log(`   ❌ No candles found!`);
    return;
  }
  
  const firstCandle = candles[0]!;
  const lastCandle = candles[candles.length - 1]!;
  const firstDate = new Date(firstCandle.timestamp).toISOString().split('T')[0];
  const lastDate = new Date(lastCandle.timestamp).toISOString().split('T')[0];
  
  console.log(`   Date range: ${firstDate} to ${lastDate}`);
  console.log(`   First candle: ${new Date(firstCandle.timestamp).toISOString()}`);
  console.log(`   Last candle: ${new Date(lastCandle.timestamp).toISOString()}`);
  
  // Check for gaps
  const startTime = firstCandle.timestamp;
  const endTime = lastCandle.timestamp;
  const gapInfo = detectGaps(candles, timeframe, startTime, endTime);
  
  console.log(`\n🔍 Gap Analysis:`);
  console.log(`   Gaps found: ${gapInfo.gapCount}`);
  console.log(`   Missing candles: ${gapInfo.missingCandles.length}`);
  console.log(`   Coverage: ${gapInfo.coverage.toFixed(1)}%`);
  
  if (gapInfo.missingCandles.length > 0) {
    console.log(`\n⚠️  Missing candles:`);
    gapInfo.missingCandles.slice(0, 10).forEach(m => {
      console.log(`   - ${new Date(m.expected).toISOString()}`);
    });
    if (gapInfo.missingCandles.length > 10) {
      console.log(`   ... and ${gapInfo.missingCandles.length - 10} more`);
    }
  }
  
  // Check if we have enough data for indicators (need at least 50 candles)
  if (candles.length < 50) {
    console.log(`\n❌ Not enough candles for indicators (need 50, have ${candles.length})`);
  } else {
    console.log(`\n✅ Sufficient candles for indicators (${candles.length} >= 50)`);
  }
  
  // Check data freshness
  const now = Date.now();
  const lastCandleAge = now - lastCandle.timestamp;
  const hoursSinceLastCandle = lastCandleAge / (60 * 60 * 1000);
  
  console.log(`\n📅 Data Freshness:`);
  console.log(`   Hours since last candle: ${hoursSinceLastCandle.toFixed(1)}`);
  
  if (hoursSinceLastCandle > 8) {
    console.log(`   ⚠️  Data is stale (last candle is ${hoursSinceLastCandle.toFixed(1)} hours old)`);
    console.log(`   💡 Consider refreshing historical data`);
  } else {
    console.log(`   ✅ Data is fresh`);
  }
  
  console.log(`\n✅ Verification complete\n`);
}

main().catch(console.error);

