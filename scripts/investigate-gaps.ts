/**
 * Investigate data gaps in paper trading candles
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { detectGaps } from '../src/lib/data-quality-validator';
import { redis } from '../src/lib/kv';

async function investigateGaps() {
  try {
    console.log('🔍 Investigating data gaps...\n');
    
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = '2020-01-01';
    const timeframe = '8h';
    
    console.log(`Fetching ${timeframe} candles from ${startDate} to ${endDate}...`);
    const candles = await fetchPriceCandles('ETHUSDT', timeframe, startDate, endDate, undefined, true);
    
    console.log(`\n✅ Loaded ${candles.length} candles`);
    if (candles.length > 0) {
      const first = candles[0]!;
      const last = candles[candles.length - 1]!;
      console.log(`   First: ${new Date(first.timestamp).toISOString()}`);
      console.log(`   Last:  ${new Date(last.timestamp).toISOString()}\n`);
    }
    
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate + 'T23:59:59.999Z').getTime();
    
    console.log('🔍 Detecting gaps...');
    const gapInfo = detectGaps(candles, timeframe, startTime, endTime);
    
    console.log(`\n📊 Gap Analysis:`);
    console.log(`   Gap Count: ${gapInfo.gapCount}`);
    console.log(`   Missing Candles: ${gapInfo.missingCandles.length}`);
    console.log(`   Coverage: ${gapInfo.coverage.toFixed(2)}%\n`);
    
    if (gapInfo.missingCandles.length > 0) {
      console.log('❌ Missing Candles:');
      gapInfo.missingCandles.forEach((missing, idx) => {
        const date = new Date(missing.expected);
        console.log(`   ${idx + 1}. Expected: ${date.toISOString()} (${date.toUTCString()})`);
      });
      console.log('');
    }
    
    // Check for gaps between consecutive candles
    const sortedCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    const expectedInterval = 8 * 60 * 60 * 1000; // 8 hours
    const tolerance = expectedInterval * 0.1;
    
    console.log('🔍 Checking for gaps between consecutive candles...\n');
    let gapFound = false;
    for (let i = 1; i < sortedCandles.length; i++) {
      const prev = sortedCandles[i - 1]!;
      const curr = sortedCandles[i]!;
      const timeDiff = curr.timestamp - prev.timestamp;
      
      if (timeDiff > expectedInterval + tolerance) {
        gapFound = true;
        const missingCount = Math.floor((timeDiff - tolerance) / expectedInterval) - 1;
        console.log(`⚠️  Gap detected between:`);
        console.log(`   Previous: ${new Date(prev.timestamp).toISOString()}`);
        console.log(`   Current:  ${new Date(curr.timestamp).toISOString()}`);
        console.log(`   Time diff: ${(timeDiff / (60 * 60 * 1000)).toFixed(2)} hours`);
        console.log(`   Expected: ${(expectedInterval / (60 * 60 * 1000)).toFixed(2)} hours`);
        console.log(`   Missing: ${missingCount} candle(s)\n`);
        
        // Show what candles are missing
        for (let j = 1; j <= missingCount; j++) {
          const expectedTimestamp = prev.timestamp + expectedInterval * j;
          console.log(`      Missing candle ${j}: ${new Date(expectedTimestamp).toISOString()}`);
        }
        console.log('');
      }
    }
    
    if (!gapFound) {
      console.log('✅ No gaps found between consecutive candles\n');
    }
    
    // Check for missing candles at the end
    const lastCandle = sortedCandles[sortedCandles.length - 1]!;
    const now = Date.now();
    const effectiveEndTime = Math.min(endTime, now);
    
    if (lastCandle.timestamp < effectiveEndTime - expectedInterval) {
      const missingAtEnd = Math.floor((effectiveEndTime - lastCandle.timestamp) / expectedInterval);
      console.log(`⚠️  Missing candles at the end:`);
      console.log(`   Last candle: ${new Date(lastCandle.timestamp).toISOString()}`);
      console.log(`   Effective end: ${new Date(effectiveEndTime).toISOString()}`);
      console.log(`   Missing: ${missingAtEnd} candle(s)\n`);
      
      for (let j = 1; j <= Math.min(missingAtEnd, 3); j++) {
        const expectedTimestamp = lastCandle.timestamp + expectedInterval * j;
        if (expectedTimestamp <= effectiveEndTime) {
          console.log(`   Missing candle ${j}: ${new Date(expectedTimestamp).toISOString()}`);
        }
      }
      console.log('');
    }
  } finally {
    // Close Redis connection
    try {
      await redis.quit();
    } catch (error) {
      // Ignore errors when closing
    }
    // Force exit
    process.exit(0);
  }
}

investigateGaps().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

