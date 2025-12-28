import 'dotenv/config';
import { fetchPriceCandles, fetchLatestPrice } from '../src/lib/eth-price-service';
import { ensureConnected } from '../src/lib/kv';
import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';

const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

async function fetchCoinGeckoIntradayPrices(startTime: number, endTime: number): Promise<Array<{ timestamp: number; price: number }>> {
  const coinId = 'ethereum';
  const startDate = Math.floor(startTime / 1000);
  const endDate = Math.floor(endTime / 1000);
  
  const url = new URL(`${COINGECKO_API_URL}/coins/${coinId}/market_chart/range`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('from', String(startDate));
  url.searchParams.set('to', String(endDate));

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: HeadersInit = {};
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const prices = data.prices || [];
  
  return prices.map(([timestamp, price]: [number, number]) => ({
    timestamp,
    price,
  }));
}

async function main() {
  await ensureConnected();
  console.log('🔄 Filling rolling file with today\'s price data (2025-12-28)\n');

  const symbol = 'ETHUSDT';
  const today = '2025-12-28';
  
  // Get today's date range
  const todayDate = new Date(today);
  todayDate.setUTCHours(0, 0, 0, 0);
  const todayStart = todayDate.getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
  const now = Date.now();
  const actualEnd = Math.min(now, todayEnd);

  // Fetch daily candle for today (this will update the rolling file)
  console.log('📊 Fetching daily candle for today...');
  try {
    const candles1d = await fetchPriceCandles(symbol, '1d', today, today);
    console.log(`✅ Fetched ${candles1d.length} daily candle(s) for today`);
    
    if (candles1d.length > 0) {
      const candle = candles1d[0];
      console.log(`   Timestamp: ${new Date(candle.timestamp).toISOString()}`);
      console.log(`   OHLC: O=$${candle.open.toFixed(2)}, H=$${candle.high.toFixed(2)}, L=$${candle.low.toFixed(2)}, C=$${candle.close.toFixed(2)}`);
      console.log(`   Volume: ${candle.volume.toFixed(2)}`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch daily candle:', error);
  }

  // Try to get intraday price points from CoinGecko to improve today's candle
  console.log('\n📊 Fetching intraday price points from CoinGecko...');
  try {
    const pricePoints = await fetchCoinGeckoIntradayPrices(todayStart, actualEnd);
    console.log(`✅ Fetched ${pricePoints.length} price point(s) for today`);
    
    if (pricePoints.length > 0) {
      // Calculate OHLC from price points
      const prices = pricePoints.map(p => p.price);
      const open = prices[0] || 0;
      const close = prices[prices.length - 1] || 0;
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      
      console.log(`   Price points: ${pricePoints.length}`);
      console.log(`   Calculated OHLC: O=$${open.toFixed(2)}, H=$${high.toFixed(2)}, L=$${low.toFixed(2)}, C=$${close.toFixed(2)}`);
      
      // Update the rolling file with improved OHLC data
      const rollingFilePath = path.join(HISTORICAL_DATA_DIR, 'ethusdt', '1d', 'ethusdt_1d_rolling.json');
      let existingData: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
      
      try {
        const compressed = await fs.readFile(`${rollingFilePath}.gz`);
        const decompressed = gunzipSync(compressed);
        existingData = JSON.parse(decompressed.toString('utf-8'));
      } catch {
        // File doesn't exist yet
      }
      
      // Find or create today's candle
      const todayCandleIndex = existingData.findIndex(c => {
        const candleDate = new Date(c.timestamp);
        candleDate.setUTCHours(0, 0, 0, 0);
        return candleDate.getTime() === todayStart;
      });
      
      if (todayCandleIndex >= 0) {
        // Update existing candle with better OHLC
        const candle = existingData[todayCandleIndex];
        candle.open = open;
        candle.high = Math.max(candle.high, high);
        candle.low = Math.min(candle.low, low);
        candle.close = close;
        console.log(`   ✅ Updated today's candle in rolling file`);
      } else {
        // Add new candle
        existingData.push({
          timestamp: todayStart,
          open,
          high,
          low,
          close,
          volume: 0,
        });
        console.log(`   ✅ Added today's candle to rolling file`);
      }
      
      // Sort and save
      existingData.sort((a, b) => a.timestamp - b.timestamp);
      const jsonString = JSON.stringify(existingData, null, 2);
      const compressed = gzipSync(jsonString);
      await fs.mkdir(path.dirname(rollingFilePath), { recursive: true });
      await fs.writeFile(`${rollingFilePath}.gz`, compressed);
      console.log(`   💾 Saved ${existingData.length} candle(s) to rolling file`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch intraday prices:', error);
  }

  // Also fetch latest price to ensure we have the most current data
  console.log('\n📊 Fetching latest price...');
  try {
    const latestPrice = await fetchLatestPrice(symbol);
    console.log(`✅ Latest price: $${latestPrice.toFixed(2)} (rolling file will be updated)`);
  } catch (error) {
    console.error('❌ Failed to fetch latest price:', error);
  }

  // Verify final state
  console.log('\n📁 Final rolling file contents...');
  try {
    const rollingFilePath = path.join(HISTORICAL_DATA_DIR, 'ethusdt', '1d', 'ethusdt_1d_rolling.json.gz');
    const compressed = await fs.readFile(rollingFilePath);
    const decompressed = gunzipSync(compressed);
    const candles = JSON.parse(decompressed.toString('utf-8'));
    
    console.log(`✅ Rolling file contains ${candles.length} candle(s)`);
    const todayCandles = candles.filter((c: { timestamp: number }) => {
      const date = new Date(c.timestamp);
      return date.toISOString().split('T')[0] === today;
    });
    if (todayCandles.length > 0) {
      const todayCandle = todayCandles[0];
      console.log(`   Today's candle: O=$${todayCandle.open.toFixed(2)}, H=$${todayCandle.high.toFixed(2)}, L=$${todayCandle.low.toFixed(2)}, C=$${todayCandle.close.toFixed(2)}`);
    }
  } catch (error) {
    console.log('   ⚠️  Could not read rolling file');
  }

  console.log('\n✨ Rolling file update complete!');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
