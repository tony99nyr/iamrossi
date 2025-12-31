#!/usr/bin/env npx tsx
/**
 * Fetch real 8h candles from CryptoCompare API for ETH and BTC
 * CryptoCompare free tier: 100,000 calls/month, supports historical data
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { fetchCryptoCompareCandles } from '@/lib/cryptocompare-service';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const START_DATE = '2025-01-01';
const END_DATE = '2025-12-30';
const TIMEFRAME = '8h';

async function fetchAndSave(symbol: string, displayName: string) {
  console.log(`\n🔄 Fetching ${displayName} (${symbol}) 8h candles...`);
  console.log(`   Date range: ${START_DATE} to ${END_DATE}`);
  
  const startTime = new Date(START_DATE).getTime();
  const endTime = new Date(END_DATE + 'T23:59:59Z').getTime();
  
  try {
    const candles = await fetchCryptoCompareCandles(symbol, TIMEFRAME, startTime, endTime);
    
    if (candles.length === 0) {
      throw new Error(`No candles fetched for ${symbol}`);
    }
    
    console.log(`✅ Fetched ${candles.length} 8h candles`);
    
    // Sort by timestamp
    const sortedCandles = candles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Get date range
    const firstDate = new Date(sortedCandles[0]!.timestamp).toISOString().split('T')[0];
    const lastDate = new Date(sortedCandles[sortedCandles.length - 1]!.timestamp).toISOString().split('T')[0];
    
    console.log(`   Date range: ${firstDate} to ${lastDate}`);
    
    // Save to file
    const filename = `${START_DATE}_${END_DATE}.json`;
    const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), TIMEFRAME);
    const filePath = path.join(dir, filename);
    
    await fs.mkdir(dir, { recursive: true });
    
    const jsonString = JSON.stringify(sortedCandles, null, 2);
    const compressed = gzipSync(jsonString);
    await fs.writeFile(`${filePath}.gz`, compressed);
    
    console.log(`✅ Saved to ${filename}.gz`);
    console.log(`   File size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
    
    return sortedCandles.length;
  } catch (error) {
    console.error(`❌ Error fetching ${displayName}:`, error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    throw error;
  }
}

async function main() {
  console.log('🔄 Fetching real 8h candles from CryptoCompare API...');
  console.log(`   Timeframe: ${TIMEFRAME}`);
  console.log(`   Date range: ${START_DATE} to ${END_DATE}`);
  console.log('');
  
  try {
    // Fetch ETH
    const ethCount = await fetchAndSave('ETHUSDT', 'Ethereum');
    
    // Longer delay between requests to avoid rate limits
    console.log('\n⏳ Waiting 10 seconds before fetching BTC (to avoid rate limits)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Fetch BTC
    let btcCount = 0;
    try {
      btcCount = await fetchAndSave('BTCUSDT', 'Bitcoin');
    } catch (btcError) {
      console.warn('\n⚠️  BTC fetch failed (rate limit). You can run this script again later to fetch BTC.');
      console.warn('   ETH data has been saved successfully.');
    }
    
    console.log('\n✅ Fetch complete!');
    console.log(`   ETH: ${ethCount} candles`);
    console.log(`   BTC: ${btcCount} candles`);
  } catch (error) {
    console.error('\n❌ Failed to fetch data:', error);
    process.exit(1);
  }
}

main().catch(console.error);

