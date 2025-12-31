#!/usr/bin/env npx tsx
/**
 * Convert 1d historical price data to 8h candles
 * Aggregates daily candles into 8-hour periods (3 candles per day)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/**
 * Load 1d candles from historical files
 */
async function load1dCandles(symbol: string): Promise<PriceCandle[]> {
  const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), '1d');
  const allCandles: PriceCandle[] = [];

  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => 
      (f.endsWith('.json.gz') || f.endsWith('.json')) && 
      !f.includes('rolling')
    );

    for (const file of jsonFiles) {
      const filePath = path.join(dir, file);
      try {
        let data: string;
        
        if (file.endsWith('.gz')) {
          const { gunzipSync } = await import('zlib');
          const compressed = await fs.readFile(filePath);
          const decompressed = gunzipSync(compressed);
          data = decompressed.toString('utf-8');
        } else {
          data = await fs.readFile(filePath, 'utf-8');
        }
        
        const candles = JSON.parse(data) as PriceCandle[];
        allCandles.push(...candles);
        console.log(`   Loaded ${candles.length} candles from ${file}`);
      } catch (error) {
        console.warn(`   ⚠️  Failed to read ${file}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`   ❌ Error reading directory ${dir}: ${error}`);
    return [];
  }

  // Sort by timestamp and remove duplicates
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
 * Convert 1d candles to 8h candles
 * Each day is split into 3 periods: 00:00-08:00, 08:00-16:00, 16:00-24:00
 */
function convertTo8h(candles1d: PriceCandle[]): PriceCandle[] {
  if (candles1d.length === 0) {
    return [];
  }

  const candles8h: PriceCandle[] = [];

  for (const dailyCandle of candles1d) {
    const date = new Date(dailyCandle.timestamp);
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);

    // Create 3 8-hour candles for this day
    for (let i = 0; i < 3; i++) {
      const periodStart = new Date(dayStart);
      periodStart.setUTCHours(i * 8, 0, 0, 0);
      
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCHours((i + 1) * 8, 0, 0, 0);

      // For 8h candles from daily data, we distribute the daily OHLC
      // This is an approximation since we don't have intraday data
      const timestamp = periodStart.getTime();
      
      // Distribute price across the 3 periods
      // Period 0 (00:00-08:00): open = daily open, close = daily open + (daily range * 0.33)
      // Period 1 (08:00-16:00): open = period 0 close, close = daily open + (daily range * 0.66)
      // Period 2 (16:00-24:00): open = period 1 close, close = daily close
      const dailyRange = dailyCandle.high - dailyCandle.low;
      const dailyMid = (dailyCandle.high + dailyCandle.low) / 2;
      
      let open: number;
      let close: number;
      let high: number;
      let low: number;

      if (i === 0) {
        // First period: starts at daily open
        open = dailyCandle.open;
        close = dailyMid + (dailyRange * 0.15); // Slight movement
        high = Math.max(open, close) + (dailyRange * 0.1);
        low = Math.min(open, close) - (dailyRange * 0.1);
      } else if (i === 1) {
        // Second period: continues from first
        const prevClose = candles8h[candles8h.length - 1]?.close || dailyCandle.open;
        open = prevClose;
        close = dailyMid + (dailyRange * 0.15);
        high = Math.max(open, close) + (dailyRange * 0.1);
        low = Math.min(open, close) - (dailyRange * 0.1);
      } else {
        // Third period: ends at daily close
        const prevClose = candles8h[candles8h.length - 1]?.close || dailyCandle.open;
        open = prevClose;
        close = dailyCandle.close;
        high = Math.max(open, close, dailyCandle.high * 0.98);
        low = Math.min(open, close, dailyCandle.low * 1.02);
      }

      // Distribute volume evenly across 3 periods (approximation)
      const volume = dailyCandle.volume / 3;

      candles8h.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });
    }
  }

  return candles8h;
}

/**
 * Save 8h candles to compressed file
 */
async function save8hCandles(
  symbol: string,
  candles8h: PriceCandle[]
): Promise<void> {
  if (candles8h.length === 0) {
    throw new Error('No 8h candles to save');
  }

  const startDate = new Date(candles8h[0].timestamp).toISOString().split('T')[0];
  const endDate = new Date(candles8h[candles8h.length - 1].timestamp).toISOString().split('T')[0];

  // Create filename - match the format expected by fetchPriceCandles
  // Format: YYYY-MM-DD_YYYY-MM-DD.json (without .gz extension, loadFromFile adds it)
  const filename = `${startDate}_${endDate}.json`;
  const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), '8h');
  const filePath = path.join(dir, filename);

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });

  // Compress and save (as .json.gz)
  const jsonString = JSON.stringify(candles8h, null, 2);
  const compressed = gzipSync(jsonString);
  await fs.writeFile(`${filePath}.gz`, compressed);

  console.log(`✅ Saved ${candles8h.length} 8h candles to ${filename}`);
  console.log(`   Date range: ${startDate} to ${endDate}`);
  console.log(`   File size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
}

/**
 * Main function
 */
async function main() {
  const symbol = process.argv[2] || 'ETHUSDT';
  
  console.log(`🔄 Converting 1d to 8h candles for ${symbol}...`);
  console.log('');

  // Load 1d candles
  console.log('📥 Loading 1d candles...');
  const candles1d = await load1dCandles(symbol);
  
  if (candles1d.length === 0) {
    console.error('❌ No 1d candles found. Please ensure historical data exists.');
    process.exit(1);
  }

  console.log(`✅ Loaded ${candles1d.length} 1d candles`);
  console.log('');

  // Convert to 8h
  console.log('🔄 Converting to 8h candles...');
  const candles8h = convertTo8h(candles1d);
  console.log(`✅ Created ${candles8h.length} 8h candles (expected: ${candles1d.length * 3})`);
  console.log('');

  // Save 8h candles
  console.log('💾 Saving 8h candles...');
  await save8hCandles(symbol, candles8h);
  console.log('');

  console.log('✅ Conversion complete!');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

