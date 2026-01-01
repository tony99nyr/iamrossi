#!/usr/bin/env npx tsx
/**
 * Fetch real BTC historical data from APIs and save to files
 * This collects REAL price data (not synthetic) for BTC paper trading
 * 
 * Usage:
 *   pnpm tsx scripts/fetch-btc-real-historical-data.ts [timeframe] [startDate] [endDate]
 * 
 * Examples:
 *   pnpm tsx scripts/fetch-btc-real-historical-data.ts 8h 2025-01-01 2025-12-31
 *   pnpm tsx scripts/fetch-btc-real-historical-data.ts 4h 2025-01-01 2025-12-31
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const SYMBOL = 'BTCUSDT';

async function main() {
  const args = process.argv.slice(2);
  const timeframe = args[0] || '8h';
  const startDate = args[1] || '2025-01-01';
  const endDate = args[2] || new Date().toISOString().split('T')[0]; // Today by default

  console.log(`🔄 Fetching REAL BTC historical data...`);
  console.log(`   Symbol: ${SYMBOL}`);
  console.log(`   Timeframe: ${timeframe}`);
  console.log(`   Date range: ${startDate} to ${endDate}`);
  console.log('');
  console.log('⚠️  This will fetch REAL price data from APIs (Binance, CoinGecko, Coinbase)');
  console.log('   Synthetic data is NOT used here - only real historical prices\n');

  try {
    // Fetch candles from API (will use Binance/CoinGecko/Coinbase)
    // allowSyntheticData=false ensures we only get REAL data
    const candles = await fetchPriceCandles(
      SYMBOL, 
      timeframe, 
      startDate, 
      endDate,
      undefined, // currentPrice
      false, // skipAPIFetch - we want to fetch from APIs
      false  // allowSyntheticData - NEVER use synthetic for real data collection
    );
    
    if (candles.length === 0) {
      throw new Error('No candles fetched from API');
    }

    console.log(`✅ Fetched ${candles.length} REAL ${timeframe} candles`);
    
    // Sort by timestamp
    const sortedCandles = candles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Get date range
    const firstDate = new Date(sortedCandles[0]!.timestamp).toISOString().split('T')[0];
    const lastDate = new Date(sortedCandles[sortedCandles.length - 1]!.timestamp).toISOString().split('T')[0];
    
    console.log(`   Date range: ${firstDate} to ${lastDate}`);
    console.log('');

    // Save to file (new simplified format: {symbol}_{timeframe}.json.gz)
    const filename = `${SYMBOL.toLowerCase()}_${timeframe}.json.gz`;
    const dir = path.join(HISTORICAL_DATA_DIR, SYMBOL.toLowerCase(), timeframe);
    const filePath = path.join(dir, filename);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Load existing data and merge
    let existingCandles: PriceCandle[] = [];
    try {
      const existing = await fs.readFile(filePath);
      const decompressed = gunzipSync(existing);
      existingCandles = JSON.parse(decompressed.toString('utf-8')) as PriceCandle[];
    } catch {
      // File doesn't exist yet
    }

    // Merge and deduplicate
    const allCandles = [...existingCandles, ...sortedCandles];
    const uniqueCandles = Array.from(
      new Map(allCandles.map(c => [c.timestamp, c])).values()
    ).sort((a, b) => a.timestamp - b.timestamp);

    // Compress and save
    const jsonString = JSON.stringify(uniqueCandles, null, 2);
    const compressed = gzipSync(jsonString);
    await fs.writeFile(filePath, compressed);

    console.log(`✅ Saved ${sortedCandles.length} REAL ${timeframe} candles to ${filename}.gz`);
    console.log(`   File size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
    console.log(`   Location: ${filePath}.gz`);
    console.log('');
    console.log('✅ Fetch complete!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   - Run verification: pnpm tsx scripts/verify-real-historical-data.ts');
    console.log('   - BTC paper trading can now use this real historical data');
  } catch (error) {
    console.error('❌ Error fetching BTC historical data:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);

