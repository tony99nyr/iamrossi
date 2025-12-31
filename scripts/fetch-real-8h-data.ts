#!/usr/bin/env npx tsx
/**
 * Fetch real 8h candles from Binance API for 2025-01-01 through 2025-12-30
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const SYMBOL = 'ETHUSDT';
const TIMEFRAME = '8h';
const START_DATE = '2025-01-01';
const END_DATE = '2025-12-30';

async function main() {
  console.log(`🔄 Fetching real 8h candles from Binance API...`);
  console.log(`   Symbol: ${SYMBOL}`);
  console.log(`   Timeframe: ${TIMEFRAME}`);
  console.log(`   Date range: ${START_DATE} to ${END_DATE}`);
  console.log('');

  try {
    // Fetch candles from API (will use Binance if available)
    const candles = await fetchPriceCandles(SYMBOL, TIMEFRAME, START_DATE, END_DATE);
    
    if (candles.length === 0) {
      throw new Error('No candles fetched from API');
    }

    console.log(`✅ Fetched ${candles.length} real 8h candles`);
    
    // Sort by timestamp
    const sortedCandles = candles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Get date range
    const firstDate = new Date(sortedCandles[0]!.timestamp).toISOString().split('T')[0];
    const lastDate = new Date(sortedCandles[sortedCandles.length - 1]!.timestamp).toISOString().split('T')[0];
    
    console.log(`   Date range: ${firstDate} to ${lastDate}`);
    console.log('');

    // Save to file (matching the expected format)
    const filename = `${START_DATE}_${END_DATE}.json`;
    const dir = path.join(HISTORICAL_DATA_DIR, SYMBOL.toLowerCase(), TIMEFRAME);
    const filePath = path.join(dir, filename);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Compress and save
    const jsonString = JSON.stringify(sortedCandles, null, 2);
    const compressed = gzipSync(jsonString);
    await fs.writeFile(`${filePath}.gz`, compressed);

    console.log(`✅ Saved ${sortedCandles.length} real 8h candles to ${filename}.gz`);
    console.log(`   File size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
    console.log(`   Location: ${filePath}.gz`);
    console.log('');
    console.log('✅ Fetch complete!');
  } catch (error) {
    console.error('❌ Error fetching 8h data:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);

