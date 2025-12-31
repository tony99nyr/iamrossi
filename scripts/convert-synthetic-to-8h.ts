#!/usr/bin/env npx tsx
/**
 * Convert synthetic 2026 data from 1d to 8h candles
 * Similar to convert-to-8h-timeframe.ts but specifically for synthetic data
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const SYNTHETIC_DIR = path.join(HISTORICAL_DATA_DIR, 'synthetic');
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/**
 * Load 1d synthetic candles
 */
async function load1dSyntheticCandles(): Promise<PriceCandle[]> {
  const filepath = path.join(SYNTHETIC_DIR, 'ethusdt_1d_2026-01-01_2026-12-30.json.gz');
  
  if (!await fs.access(filepath).then(() => true).catch(() => false)) {
    throw new Error(`Synthetic 1d data not found at ${filepath}. Run 'pnpm eth:generate-2026' first.`);
  }
  
  const compressed = await fs.readFile(filepath);
  const decompressed = gunzipSync(compressed);
  const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
  
  console.log(`✅ Loaded ${candles.length} 1d candles from synthetic data`);
  return candles;
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

      // Ensure high/low are within daily bounds
      high = Math.min(high, dailyCandle.high);
      low = Math.max(low, dailyCandle.low);

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
async function save8hCandles(candles8h: PriceCandle[]): Promise<void> {
  if (candles8h.length === 0) {
    throw new Error('No 8h candles to save');
  }

  const startDate = new Date(candles8h[0].timestamp).toISOString().split('T')[0];
  const endDate = new Date(candles8h[candles8h.length - 1].timestamp).toISOString().split('T')[0];

  // Create filename
  const filename = `ethusdt_8h_${startDate}_${endDate}.json.gz`;
  const filePath = path.join(SYNTHETIC_DIR, filename);

  // Ensure directory exists
  await fs.mkdir(SYNTHETIC_DIR, { recursive: true });

  // Compress and save
  const jsonString = JSON.stringify(candles8h, null, 2);
  const compressed = gzipSync(jsonString);
  await fs.writeFile(filePath, compressed);

  console.log(`✅ Saved ${candles8h.length} 8h candles to ${filename}`);
  console.log(`   Date range: ${startDate} to ${endDate}`);
  console.log(`   File size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
}

/**
 * Main function
 */
async function main() {
  console.log(`🔄 Converting synthetic 2026 data from 1d to 8h candles...\n`);

  // Load 1d candles
  console.log('📥 Loading 1d synthetic candles...');
  const candles1d = await load1dSyntheticCandles();
  console.log('');

  // Convert to 8h
  console.log('🔄 Converting to 8h candles...');
  const candles8h = convertTo8h(candles1d);
  console.log(`✅ Created ${candles8h.length} 8h candles (expected: ${candles1d.length * 3})`);
  console.log('');

  // Save 8h candles
  console.log('💾 Saving 8h candles...');
  await save8hCandles(candles8h);
  console.log('');

  console.log('✅ Conversion complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   Input: ${candles1d.length} 1d candles`);
  console.log(`   Output: ${candles8h.length} 8h candles`);
  console.log(`   Ratio: ${(candles8h.length / candles1d.length).toFixed(2)}x (expected: 3x)`);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

