#!/usr/bin/env npx tsx
/**
 * Convert 8h ETH synthetic data to 4h candles
 * 
 * Splits each 8h candle into two 4h candles while maintaining price continuity
 * and realistic intraday volatility.
 * 
 * Usage:
 *   pnpm tsx scripts/convert-8h-to-4h.ts [year]
 * 
 * Examples:
 *   pnpm tsx scripts/convert-8h-to-4h.ts 2026
 *   pnpm tsx scripts/convert-8h-to-4h.ts 2027
 */

import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

/**
 * Split an 8h candle into two 4h candles
 */
function split8hTo4h(candle: PriceCandle, isFirstHalf: boolean): PriceCandle {
  const halfDuration = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  
  if (isFirstHalf) {
    // First 4h: use open, calculate midpoint for close
    const midPrice = (candle.open + candle.close) / 2;
    const midHigh = Math.max(candle.open, midPrice);
    const midLow = Math.min(candle.open, midPrice);
    
    return {
      timestamp: candle.timestamp,
      open: candle.open,
      high: Math.max(candle.high, midHigh),
      low: Math.min(candle.low, midLow),
      close: midPrice,
      volume: candle.volume * 0.5, // Split volume proportionally
    };
  } else {
    // Second 4h: use midpoint as open, original close
    const midPrice = (candle.open + candle.close) / 2;
    const midHigh = Math.max(midPrice, candle.close);
    const midLow = Math.min(midPrice, candle.close);
    
    return {
      timestamp: candle.timestamp + halfDuration,
      open: midPrice,
      high: Math.max(candle.high, midHigh),
      low: Math.min(candle.low, midLow),
      close: candle.close,
      volume: candle.volume * 0.5, // Split volume proportionally
    };
  }
}

/**
 * Convert 8h candles to 4h candles
 */
function convertTo4h(candles8h: PriceCandle[]): PriceCandle[] {
  const candles4h: PriceCandle[] = [];
  
  for (const candle8h of candles8h) {
    // Split into two 4h candles
    const first4h = split8hTo4h(candle8h, true);
    const second4h = split8hTo4h(candle8h, false);
    
    candles4h.push(first4h, second4h);
  }
  
  return candles4h;
}

async function main() {
  const args = process.argv.slice(2);
  const year = args[0] ? parseInt(args[0], 10) : 2026;
  
  if (isNaN(year) || year < 2026 || year > 2028) {
    console.error('❌ Invalid year. Must be 2026, 2027, or 2028');
    process.exit(1);
  }
  
  console.log(`🔄 Converting 8h ETH synthetic data to 4h for ${year}\n`);
  
  // Load 8h data
  const syntheticDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const files = fs.readdirSync(syntheticDir);
  const eth8hFile = files.find(f => 
    f.includes(`ethusdt_8h_${year}`) && f.endsWith('.json.gz')
  );
  
  if (!eth8hFile) {
    console.error(`❌ No ETH 8h synthetic data found for ${year}`);
    console.error(`   Looking for: ethusdt_8h_${year}*.json.gz`);
    console.error(`   Please generate 8h data first using:`);
    console.error(`   pnpm tsx scripts/generate-synthetic-${year}-data-enhanced.ts`);
    process.exit(1);
  }
  
  const filePath = path.join(syntheticDir, eth8hFile);
  console.log(`📊 Loading 8h data from: ${eth8hFile}`);
  
  const compressed = fs.readFileSync(filePath);
  const decompressed = gunzipSync(compressed);
  const candles8h = JSON.parse(decompressed.toString()) as PriceCandle[];
  
  console.log(`✅ Loaded ${candles8h.length} 8h candles\n`);
  
  // Convert to 4h
  console.log('🔄 Converting to 4h candles...');
  const candles4h = convertTo4h(candles8h);
  console.log(`✅ Generated ${candles4h.length} 4h candles\n`);
  
  // Save 4h data
  const startDate = new Date(candles4h[0]!.timestamp).toISOString().split('T')[0];
  const endDate = new Date(candles4h[candles4h.length - 1]!.timestamp).toISOString().split('T')[0];
  
  const filename = `ethusdt_4h_${startDate}_${endDate}.json.gz`;
  const outputPath = path.join(syntheticDir, filename);
  
  const jsonData = JSON.stringify(candles4h, null, 2);
  const compressed4h = gzipSync(jsonData);
  fs.writeFileSync(outputPath, compressed4h);
  
  console.log(`✅ Saved 4h data to: ${filename}`);
  console.log(`💰 Price range: $${Math.min(...candles4h.map(c => c.low)).toFixed(2)} - $${Math.max(...candles4h.map(c => c.high)).toFixed(2)}`);
  console.log(`📈 Starting price: $${candles4h[0]!.close.toFixed(2)}`);
  console.log(`📉 Ending price: $${candles4h[candles4h.length - 1]!.close.toFixed(2)}`);
}

main().catch(console.error);

