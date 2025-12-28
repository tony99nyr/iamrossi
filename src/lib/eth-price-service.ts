import type { PriceCandle } from '@/types';
import { redis, ensureConnected } from './kv';
import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';

const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';

// Directory for storing historical price data
const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

// Cache key prefix for price data
const PRICE_CACHE_PREFIX = 'eth:price:cache:';

// Rate limiting: track last API call time
let lastBinanceCall = 0;
let lastCoinGeckoCall = 0;
const MIN_BINANCE_DELAY = 100; // 100ms between Binance calls
const MIN_COINGECKO_DELAY = 1200; // 1.2s between CoinGecko calls (free tier limit)

/**
 * Get cache key for price data (Redis)
 */
function getCacheKey(symbol: string, interval: string, startTime: number, endTime: number): string {
  return `${PRICE_CACHE_PREFIX}${symbol}:${interval}:${startTime}:${endTime}`;
}

/**
 * Get file path for historical price data
 */
function getHistoricalDataPath(symbol: string, interval: string, startDate: string, endDate: string): string {
  // Sanitize dates for filename (YYYY-MM-DD format)
  const sanitizedStart = startDate.replace(/[^0-9-]/g, '');
  const sanitizedEnd = endDate.replace(/[^0-9-]/g, '');
  const filename = `${sanitizedStart}_${sanitizedEnd}.json`;
  return path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), interval, filename);
}

/**
 * Load historical price data from local JSON file (supports both .json and .json.gz)
 */
async function loadFromFile(filePath: string): Promise<PriceCandle[] | null> {
  try {
    // Try regular JSON file first
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as PriceCandle[];
  } catch (error) {
    // Try compressed file (.json.gz)
    try {
      const compressedPath = `${filePath}.gz`;
      const compressed = await fs.readFile(compressedPath);
      const decompressed = gunzipSync(compressed);
      const jsonString = decompressed.toString('utf-8');
      return JSON.parse(jsonString) as PriceCandle[];
    } catch (compressedError) {
      // Neither file exists or is invalid - return null
      return null;
    }
  }
}

/**
 * Save historical price data to local JSON file
 */
async function saveToFile(filePath: string, candles: PriceCandle[]): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write data to file
    await fs.writeFile(filePath, JSON.stringify(candles, null, 2), 'utf-8');
  } catch (error) {
    // File write failure is not critical - log and continue
    console.warn(`Failed to save historical data to ${filePath}:`, error);
  }
}

/**
 * Rate limit helper for Binance
 */
async function rateLimitBinance(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastBinanceCall;
  if (timeSinceLastCall < MIN_BINANCE_DELAY) {
    await new Promise(resolve => setTimeout(resolve, MIN_BINANCE_DELAY - timeSinceLastCall));
  }
  lastBinanceCall = Date.now();
}

/**
 * Rate limit helper for CoinGecko
 */
async function rateLimitCoinGecko(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCoinGeckoCall;
  if (timeSinceLastCall < MIN_COINGECKO_DELAY) {
    await new Promise(resolve => setTimeout(resolve, MIN_COINGECKO_DELAY - timeSinceLastCall));
  }
  lastCoinGeckoCall = Date.now();
}

/**
 * Fetch historical price data from Binance
 */
async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<PriceCandle[]> {
  await rateLimitBinance();

  const url = new URL(`${BINANCE_API_URL}/klines`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('startTime', String(startTime));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', '1000');

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Binance API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.map((candle: (string | number)[]) => ({
    timestamp: typeof candle[0] === 'number' ? candle[0] : parseInt(String(candle[0]), 10),
    open: parseFloat(String(candle[1])),
    high: parseFloat(String(candle[2])),
    low: parseFloat(String(candle[3])),
    close: parseFloat(String(candle[4])),
    volume: parseFloat(String(candle[5])),
  }));
}

/**
 * Fetch historical price data from CoinGecko (fallback)
 * Splits large date ranges into smaller chunks to work around free tier limits
 */
async function fetchCoinGeckoCandles(
  symbol: string,
  startTime: number,
  endTime: number
): Promise<PriceCandle[]> {
  // CoinGecko uses different symbol format (ethereum vs ETH)
  const coinId = symbol.toLowerCase() === 'ethusdt' ? 'ethereum' : 'ethereum';
  const startDate = Math.floor(startTime / 1000);
  const endDate = Math.floor(endTime / 1000);
  
  // Free tier typically allows ~90 days, but let's use 60 days to be safe
  const MAX_DAYS_PER_REQUEST = 60;
  const MAX_SECONDS_PER_REQUEST = MAX_DAYS_PER_REQUEST * 24 * 60 * 60;
  
  const allCandles: PriceCandle[] = [];
  let currentStart = startDate;
  
  while (currentStart < endDate) {
    await rateLimitCoinGecko();
    
    const currentEnd = Math.min(currentStart + MAX_SECONDS_PER_REQUEST, endDate);
    
    const url = new URL(`${COINGECKO_API_URL}/coins/${coinId}/market_chart/range`);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('from', String(currentStart));
    url.searchParams.set('to', String(currentEnd));

    const apiKey = process.env.COINGECKO_API_KEY;
    const headers: HeadersInit = {};
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      // If it's a time range error and we're trying a full year, suggest chunking
      if (response.status === 401 && currentStart === startDate && (endDate - startDate) > MAX_SECONDS_PER_REQUEST) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText} - Free tier limits historical data range. Trying to fetch in chunks...`);
      }
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    // CoinGecko returns prices array: [[timestamp, price], ...]
    const prices = data.prices || [];
    
    // Convert to OHLCV format (simplified - CoinGecko only provides prices)
    const chunkCandles = prices.map(([timestamp, price]: [number, number]) => ({
      timestamp: timestamp,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0, // CoinGecko doesn't provide volume in this endpoint
    }));
    
    allCandles.push(...chunkCandles);
    
    // Move to next chunk
    currentStart = currentEnd + 1;
    
    // Add delay between chunks to respect rate limits
    if (currentStart < endDate) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s delay between chunks
    }
  }
  
  // Remove duplicates and sort by timestamp
  const uniqueCandles = Array.from(
    new Map(allCandles.map(c => [c.timestamp, c])).values()
  ).sort((a, b) => a.timestamp - b.timestamp);
  
  return uniqueCandles;
}

/**
 * Map timeframe to Binance interval
 */
function mapTimeframeToInterval(timeframe: string): string {
  const mapping: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return mapping[timeframe] || '1d';
}

/**
 * Fetch historical price candles for ETH/USDC
 * Priority: Local JSON files > Redis cache > API calls
 * Saves fetched data to both local files and Redis
 */
export async function fetchPriceCandles(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string
): Promise<PriceCandle[]> {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const interval = mapTimeframeToInterval(timeframe);

  // 1. Check local JSON file first (most reliable for historical data)
  // Also check for organized compressed files (symbol_timeframe_start_end.json.gz)
  const filePath = getHistoricalDataPath(symbol, interval, startDate, endDate);
  let fileData = await loadFromFile(filePath);
  
  // If no exact match, try to find organized compressed file
  if (!fileData || fileData.length === 0) {
    try {
      const dir = path.dirname(filePath);
      const files = await fs.readdir(dir);
      const organizedFiles = files.filter(f => 
        f.startsWith(`${symbol.toLowerCase()}_${interval}_`) && 
        f.endsWith('.json.gz')
      );
      
      // Try to find a file that covers our date range
      for (const file of organizedFiles) {
        const organizedPath = path.join(dir, file);
        try {
          const compressed = await fs.readFile(organizedPath);
          const decompressed = gunzipSync(compressed);
          const jsonString = decompressed.toString('utf-8');
          const allCandles = JSON.parse(jsonString) as PriceCandle[];
          
          // Filter candles within our date range
          const filtered = allCandles.filter(c => 
            c.timestamp >= startTime && c.timestamp <= endTime
          );
          
          if (filtered.length > 0) {
            fileData = filtered;
            console.log(`📁 Loaded ${filtered.length} candles from organized file: ${file}`);
            break;
          }
        } catch (error) {
          // Continue to next file
          continue;
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't read - continue
    }
  }
  
  if (fileData && fileData.length > 0) {
    return fileData;
  }

  // 2. Check Redis cache (for recent data or if file doesn't exist)
  try {
    await ensureConnected();
    const cacheKey = getCacheKey(symbol, interval, startTime, endTime);
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as PriceCandle[];
      // Also save to file for future use
      await saveToFile(filePath, parsed);
      return parsed;
    }
  } catch (error) {
    // Cache miss or error - continue to fetch
    console.warn('Redis cache read failed, fetching fresh data:', error);
  }

  // 3. Fetch from API
  let candles: PriceCandle[];

  try {
    // Try Binance first
    candles = await fetchBinanceCandles(symbol, interval, startTime, endTime);
  } catch (error) {
    console.error('Binance API failed, trying CoinGecko:', error);
    // Fallback to CoinGecko
    try {
      candles = await fetchCoinGeckoCandles(symbol, startTime, endTime);
    } catch (fallbackError) {
      console.error('CoinGecko API also failed:', fallbackError);
      throw new Error('Both Binance and CoinGecko APIs failed');
    }
  }

  // 4. Save to both local file and Redis
  // Save to file first (persistent, can be committed to repo)
  await saveToFile(filePath, candles);
  console.log(`💾 Saved ${candles.length} candles to local file: ${filePath}`);

  // Also cache in Redis for 24 hours (for quick access)
  try {
    const cacheKey = getCacheKey(symbol, interval, startTime, endTime);
    await redis.setEx(cacheKey, 86400, JSON.stringify(candles)); // 24 hours TTL
  } catch (error) {
    // Cache write failure is not critical
    console.warn('Failed to cache price data in Redis:', error);
  }

  return candles;
}

/**
 * Fetch latest price for ETH/USDC
 */
export async function fetchLatestPrice(symbol: string = 'ETHUSDT'): Promise<number> {
  try {
    // Try Binance first
    const url = `${BINANCE_API_URL}/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return parseFloat(data.price);
    }
  } catch (error) {
    console.error('Binance price fetch failed:', error);
  }

  // Fallback to CoinGecko
  try {
    const coinId = 'ethereum';
    const url = `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const apiKey = process.env.COINGECKO_API_KEY;
    const headers: HeadersInit = {};
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }
    const response = await fetch(url, { headers });
    if (response.ok) {
      const data = await response.json();
      return data[coinId]?.usd || 0;
    }
  } catch (error) {
    console.error('CoinGecko price fetch failed:', error);
  }

  throw new Error('Failed to fetch latest price from both APIs');
}

