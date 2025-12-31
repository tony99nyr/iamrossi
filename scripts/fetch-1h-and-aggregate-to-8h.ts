#!/usr/bin/env npx tsx
/**
 * Fetch 1h candles from API and aggregate to 8h for better data quality
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const SYMBOL = 'ETHUSDT';
const START_DATE = '2025-01-01';
const END_DATE = '2025-12-30';

/**
 * Aggregate 1h candles to 8h candles
 */
function aggregateTo8h(candles1h: PriceCandle[]): PriceCandle[] {
  if (candles1h.length === 0) return [];

  const candles8h: PriceCandle[] = [];
  const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

  // Group 1h candles into 8h periods
  const candleMap = new Map<number, PriceCandle>();

  for (const candle of candles1h) {
    // Round to 8-hour period start (00:00, 08:00, 16:00 UTC)
    const candleDate = new Date(candle.timestamp);
    const hours = candleDate.getUTCHours();
    const periodStartHour = Math.floor(hours / 8) * 8;
    
    const periodStart = new Date(Date.UTC(
      candleDate.getUTCFullYear(),
      candleDate.getUTCMonth(),
      candleDate.getUTCDate(),
      periodStartHour,
      0, 0, 0
    ));
    
    const periodTimestamp = periodStart.getTime();
    
    let aggregated = candleMap.get(periodTimestamp);
    if (!aggregated) {
      aggregated = {
        timestamp: periodTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      };
      candleMap.set(periodTimestamp, aggregated);
    } else {
      // Update OHLC
      aggregated.high = Math.max(aggregated.high, candle.high);
      aggregated.low = Math.min(aggregated.low, candle.low);
      aggregated.close = candle.close; // Last close in period
      aggregated.volume = (aggregated.volume || 0) + (candle.volume || 0);
    }
  }

  return Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function main() {
  console.log(`🔄 Fetching price data and aggregating to 8h...`);
  console.log(`   Symbol: ${SYMBOL}`);
  console.log(`   Date range: ${START_DATE} to ${END_DATE}`);
  console.log('');

  try {
    // Try to fetch 1h candles first (best quality)
    console.log('📡 Attempting to fetch 1h candles from API...');
    let candles1h: PriceCandle[] = [];
    
    try {
      candles1h = await fetchPriceCandles(SYMBOL, '1h', START_DATE, END_DATE);
      if (candles1h.length > 100) {
        console.log(`✅ Fetched ${candles1h.length} 1h candles`);
      } else {
        console.log(`⚠️ Only got ${candles1h.length} 1h candles, trying market_chart method...`);
        candles1h = []; // Clear and try alternative
      }
    } catch (error) {
      console.log(`⚠️ 1h fetch failed, trying market_chart method...`);
    }

    // If 1h fetch didn't work well, note that we need more data
    if (candles1h.length < 2000) { // Need at least ~8760 hours for a full year
      console.log(`⚠️ Only got ${candles1h.length} 1h candles (need ~8760 for full year)`);
      console.log('   CoinGecko free tier may not provide hourly historical data');
      console.log('   Will use available data and aggregate to 8h...');
    }
    
    if (candles1h.length === 0) {
      throw new Error('No 1h candles fetched from API');
    }

    console.log('');

    // Aggregate to 8h
    console.log('🔄 Aggregating 1h candles to 8h...');
    const candles8h = aggregateTo8h(candles1h);
    
    if (candles8h.length === 0) {
      throw new Error('Failed to aggregate 1h candles to 8h');
    }

    console.log(`✅ Aggregated to ${candles8h.length} 8h candles`);
    
    // Get date range
    const firstDate = new Date(candles8h[0]!.timestamp).toISOString().split('T')[0];
    const lastDate = new Date(candles8h[candles8h.length - 1]!.timestamp).toISOString().split('T')[0];
    
    console.log(`   Date range: ${firstDate} to ${lastDate}`);
    console.log('');

    // Save to file
    const filename = `${START_DATE}_${END_DATE}.json`;
    const dir = path.join(HISTORICAL_DATA_DIR, SYMBOL.toLowerCase(), '8h');
    const filePath = path.join(dir, filename);

    await fs.mkdir(dir, { recursive: true });

    const jsonString = JSON.stringify(candles8h, null, 2);
    const compressed = gzipSync(jsonString);
    await fs.writeFile(`${filePath}.gz`, compressed);

    console.log(`✅ Saved ${candles8h.length} real 8h candles to ${filename}.gz`);
    console.log(`   File size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
    console.log('');
    console.log('✅ Fetch complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);

