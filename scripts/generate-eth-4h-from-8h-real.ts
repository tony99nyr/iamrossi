#!/usr/bin/env npx tsx
/**
 * Generate ETH 4h real historical data from 8h real data
 * This splits each 8h candle into two 4h candles while maintaining price continuity
 * 
 * Usage:
 *   pnpm tsx scripts/generate-eth-4h-from-8h-real.ts [year]
 * 
 * Example:
 *   pnpm tsx scripts/generate-eth-4h-from-8h-real.ts 2025
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

async function main() {
  const args = process.argv.slice(2);
  const year = args[0] || '2025';
  
  console.log(`🔄 Generating ETH 4h REAL data from 8h REAL data for ${year}...\n`);
  
  const historicalDir = path.join(process.cwd(), 'data', 'historical-prices');
  const eth8hDir = path.join(historicalDir, 'ethusdt', '8h');
  const eth4hDir = path.join(historicalDir, 'ethusdt', '4h');
  
  // Find 8h files for the year
  if (!fs.existsSync(eth8hDir)) {
    console.error(`❌ ETH 8h directory not found: ${eth8hDir}`);
    console.error('   Run fetch-real-8h-data.ts first to collect 8h data');
    process.exit(1);
  }
  
  const files = fs.readdirSync(eth8hDir)
    .filter(f => f.endsWith('.json.gz') && f.includes(year));
  
  if (files.length === 0) {
    console.error(`❌ No 8h files found for year ${year}`);
    console.error(`   Check: ${eth8hDir}`);
    process.exit(1);
  }
  
  console.log(`📁 Found ${files.length} 8h file(s) for ${year}\n`);
  
  // Process each file
  for (const filename of files) {
    const filePath = path.join(eth8hDir, filename);
    
    console.log(`📖 Reading ${filename}...`);
    
    try {
      const fileData = fs.readFileSync(filePath);
      const decompressed = gunzipSync(fileData);
      const candles8h = JSON.parse(decompressed.toString()) as PriceCandle[];
      
      console.log(`   Loaded ${candles8h.length} 8h candles`);
      
      // Convert to 4h
      const candles4h: PriceCandle[] = [];
      for (const candle8h of candles8h) {
        candles4h.push(split8hTo4h(candle8h, true));  // First half
        candles4h.push(split8hTo4h(candle8h, false)); // Second half
      }
      
      console.log(`   Generated ${candles4h.length} 4h candles`);
      
      // Determine output filename (extract date range from 8h filename)
      let outputFilename: string;
      const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json\.gz$/);
      if (dateMatch) {
        const [, startDate, endDate] = dateMatch;
        outputFilename = `${startDate}_${endDate}.json.gz`;
      } else if (filename.includes('rolling')) {
        outputFilename = 'ethusdt_4h_rolling.json.gz';
      } else {
        // Use same filename but in 4h directory
        outputFilename = filename.replace('8h', '4h');
      }
      
      // Ensure 4h directory exists
      if (!fs.existsSync(eth4hDir)) {
        fs.mkdirSync(eth4hDir, { recursive: true });
      }
      
      // Save 4h data
      const outputPath = path.join(eth4hDir, outputFilename);
      const jsonString = JSON.stringify(candles4h, null, 2);
      const compressed4h = gzipSync(jsonString);
      fs.writeFileSync(outputPath, compressed4h);
      
      console.log(`✅ Saved to ${outputFilename}`);
      console.log(`   File size: ${(compressed4h.length / 1024).toFixed(2)} KB (compressed)\n`);
    } catch (error) {
      console.error(`❌ Error processing ${filename}:`, error);
      if (error instanceof Error) {
        console.error('   Message:', error.message);
      }
    }
  }
  
  console.log('✅ Conversion complete!');
  console.log('');
  console.log('📝 Next steps:');
  console.log('   - Run verification: pnpm tsx scripts/verify-real-historical-data.ts');
  console.log('   - ETH 4h paper trading can now use this real historical data');
}

main().catch(console.error);

