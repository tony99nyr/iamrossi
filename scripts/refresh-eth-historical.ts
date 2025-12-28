#!/usr/bin/env tsx
/**
 * Refresh Historical ETH Price Data
 * Fetches and updates historical price data for yesterday and today
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fetchPriceCandles } from '@/lib/eth-price-service';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  console.log('🔄 Refreshing Historical ETH Price Data\n');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Format dates as YYYY-MM-DD
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  console.log(`📅 Fetching data for:`);
  console.log(`   Yesterday: ${yesterdayStr}`);
  console.log(`   Today: ${todayStr}\n`);

  // Fetch yesterday's data
  console.log('📊 Fetching yesterday\'s data...');
  try {
    const yesterdayCandles = await fetchPriceCandles(
      'ETHUSDT',
      '1d',
      yesterdayStr,
      yesterdayStr
    );
    console.log(`✅ Fetched ${yesterdayCandles.length} candle(s) for yesterday`);
    if (yesterdayCandles.length > 0) {
      console.log(`   Price: $${yesterdayCandles[0].close.toFixed(2)}`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch yesterday data:', error);
  }

  console.log();

  // Fetch today's data - use fetchLatestPrice which automatically updates historical data
  console.log('📊 Fetching today\'s latest price...');
  try {
    const { fetchLatestPrice } = await import('@/lib/eth-price-service');
    const latestPrice = await fetchLatestPrice('ETHUSDT');
    console.log(`✅ Fetched latest price for today: $${latestPrice.toFixed(2)}`);
    console.log(`   (Historical data automatically updated with this price)`);
    
    // Also try to fetch today's candle if available
    try {
      const todayCandles = await fetchPriceCandles(
        'ETHUSDT',
        '1d',
        todayStr,
        todayStr
      );
      if (todayCandles.length > 0) {
        console.log(`   Also found ${todayCandles.length} candle(s) in historical data`);
      }
    } catch (candleError) {
      // This is OK - we already have the price
      console.log('   (Today candle not yet available in historical data - will be created)');
    }
  } catch (error) {
    console.error('❌ Failed to fetch today data:', error);
  }

  console.log('\n✨ Historical data refresh complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

