import type { PriceCandle } from '@/types';
import { redis, ensureConnected } from './kv';
import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';

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
 * For dates after 2025-12-27, uses rolling file format: ethusdt_1d_rolling.json.gz (fixed name)
 * For dates up to 2025-12-27, uses date range format: YYYY-MM-DD_YYYY-MM-DD.json.gz
 * If the range spans the cutoff, use rolling file if endDate is after cutoff
 */
function getHistoricalDataPath(symbol: string, interval: string, startDate: string, endDate: string): string {
  // Sanitize dates for filename (YYYY-MM-DD format)
  const sanitizedStart = startDate.replace(/[^0-9-]/g, '');
  const sanitizedEnd = endDate.replace(/[^0-9-]/g, '');
  
  // Use rolling file format if endDate is after 2025-12-27 (even if startDate is before)
  const cutoffDate = '2025-12-27';
  if (sanitizedEnd > cutoffDate) {
    // Rolling file: fixed name that gets updated
    const filename = `${symbol.toLowerCase()}_${interval}_rolling.json`;
    return path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), interval, filename);
  }
  
  // Original format for dates up to 2025-12-27
  const filename = `${sanitizedStart}_${sanitizedEnd}.json`;
  return path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), interval, filename);
}

/**
 * Load historical price data from local JSON file (always expects .json.gz)
 */
async function loadFromFile(filePath: string): Promise<PriceCandle[] | null> {
  try {
    // Always try compressed file first (.json.gz)
    const compressedPath = `${filePath}.gz`;
    const compressed = await fs.readFile(compressedPath);
    const decompressed = gunzipSync(compressed);
    const jsonString = decompressed.toString('utf-8');
    return JSON.parse(jsonString) as PriceCandle[];
  } catch (error) {
    // Fallback: try uncompressed file (for backward compatibility with existing files)
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data) as PriceCandle[];
      // If we successfully loaded an uncompressed file, compress it and delete the old one
      await saveToFile(filePath, parsed);
      await fs.unlink(filePath).catch(() => {}); // Delete uncompressed file
      return parsed;
    } catch (fallbackError) {
      // Neither file exists or is invalid - return null
      return null;
    }
  }
}

/**
 * Save historical price data to local file (always as compressed .json.gz)
 */
async function saveToFile(filePath: string, candles: PriceCandle[]): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Always save as compressed .gz file
    const compressedPath = `${filePath}.gz`;
    const jsonString = JSON.stringify(candles, null, 2);
    const compressed = gzipSync(jsonString);
    await fs.writeFile(compressedPath, compressed);
    
    // Remove any uncompressed file if it exists (cleanup)
    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, which is fine
    }
  } catch (error) {
    // File write failure is not critical - log and continue
    console.warn(`Failed to save historical data to ${filePath}.gz:`, error);
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
  const cutoffDate = '2025-12-27';
  const startDateStr = startDate.replace(/[^0-9-]/g, '');
  const endDateStr = endDate.replace(/[^0-9-]/g, '');

  // 1. Load data from local files
  // If date range spans the cutoff, we need to load from both historical and rolling files
  let allCandles: PriceCandle[] = [];
  
  // Load from historical file (if startDate is before cutoff)
  if (startDateStr <= cutoffDate) {
    const historicalEndDate = endDateStr <= cutoffDate ? endDateStr : cutoffDate;
    const historicalFilePath = getHistoricalDataPath(symbol, interval, startDateStr, historicalEndDate);
    const historicalData = await loadFromFile(historicalFilePath);
    
    if (historicalData && historicalData.length > 0) {
      // Filter to date range
      const filtered = historicalData.filter(c => 
        c.timestamp >= startTime && c.timestamp <= endTime
      );
      allCandles.push(...filtered);
      console.log(`📁 Loaded ${filtered.length} candles from historical file`);
    } else {
      // Try to find any historical file that might cover this range
      try {
        const dir = path.dirname(historicalFilePath);
        const files = await fs.readdir(dir);
        const historicalFiles = files.filter(f => 
          f.startsWith(`${symbol.toLowerCase()}_${interval}_`) && 
          f.endsWith('.json.gz') &&
          !f.includes('rolling')
        );
        
        for (const file of historicalFiles) {
          const filePath = path.join(dir, file);
          try {
            const compressed = await fs.readFile(filePath);
            const decompressed = gunzipSync(compressed);
            const jsonString = decompressed.toString('utf-8');
            const candles = JSON.parse(jsonString) as PriceCandle[];
            
            const filtered = candles.filter(c => 
              c.timestamp >= startTime && c.timestamp <= endTime && c.timestamp <= new Date(cutoffDate + 'T23:59:59Z').getTime()
            );
            
            if (filtered.length > 0) {
              allCandles.push(...filtered);
              console.log(`📁 Loaded ${filtered.length} candles from historical file: ${file}`);
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't read - continue
      }
    }
  }
  
  // Load from rolling file (if endDate is after cutoff)
  if (endDateStr > cutoffDate) {
    const rollingStartDate = startDateStr > cutoffDate ? startDateStr : '2025-12-28';
    const rollingFilePath = getHistoricalDataPath(symbol, interval, rollingStartDate, endDateStr);
    const rollingData = await loadFromFile(rollingFilePath);
    
    if (rollingData && rollingData.length > 0) {
      // Filter to date range
      const filtered = rollingData.filter(c => 
        c.timestamp >= startTime && c.timestamp <= endTime
      );
      allCandles.push(...filtered);
      console.log(`📁 Loaded ${filtered.length} candles from rolling file`);
    }
  }
  
  // Remove duplicates and sort by timestamp
  if (allCandles.length > 0) {
    const uniqueCandles = Array.from(
      new Map(allCandles.map(c => [c.timestamp, c])).values()
    ).sort((a, b) => a.timestamp - b.timestamp);
    
    // If we have enough data, return it
    if (uniqueCandles.length >= 50 || uniqueCandles.some(c => c.timestamp >= startTime && c.timestamp <= endTime)) {
      return uniqueCandles;
    }
  }

  // 2. Check Redis cache (for recent data or if file doesn't exist)
  try {
    await ensureConnected();
    const cacheKey = getCacheKey(symbol, interval, startTime, endTime);
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as PriceCandle[];
      // If we have enough data from cache, return it
      if (parsed.length >= 50 || parsed.some(c => c.timestamp >= startTime && c.timestamp <= endTime)) {
        return parsed;
      }
    }
  } catch (error) {
    // Cache miss or error - continue to fetch
    console.warn('Redis cache read failed, fetching fresh data:', error);
  }

  // 3. Fetch from API (only if we don't have enough data from files)
  let candles: PriceCandle[] = [];

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
      // If we have some data from files, use that instead of throwing
      if (allCandles.length > 0) {
        console.warn('API fetch failed, but using existing file data');
        const uniqueCandles = Array.from(
          new Map(allCandles.map(c => [c.timestamp, c])).values()
        ).sort((a, b) => a.timestamp - b.timestamp);
        return uniqueCandles;
      }
      throw new Error('Both Binance and CoinGecko APIs failed and no file data available');
    }
  }
  
  // Merge API data with file data
  if (candles.length > 0 && allCandles.length > 0) {
    const existingMap = new Map(allCandles.map(c => [c.timestamp, c]));
    candles.forEach(c => {
      existingMap.set(c.timestamp, c); // API data overwrites file data
    });
    candles = Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  } else if (allCandles.length > 0 && candles.length === 0) {
    // No API data, but we have file data
    candles = Array.from(
      new Map(allCandles.map(c => [c.timestamp, c])).values()
    ).sort((a, b) => a.timestamp - b.timestamp);
  }

  // 4. Save to both local file and Redis
  // Determine which file(s) to save to based on date range
  if (endDateStr > cutoffDate) {
    // This is going to the rolling file - merge with existing data
    const rollingStartDate = startDateStr > cutoffDate ? startDateStr : '2025-12-28';
    const rollingFilePath = getHistoricalDataPath(symbol, interval, rollingStartDate, endDateStr);
    const existingRollingData = await loadFromFile(rollingFilePath);
    if (existingRollingData && existingRollingData.length > 0) {
      // Merge candles, avoiding duplicates (new data overwrites old for same timestamp)
      const existingMap = new Map(existingRollingData.map(c => [c.timestamp, c]));
      candles.forEach(c => {
        existingMap.set(c.timestamp, c); // New data overwrites old data for same timestamp
      });
      const merged = Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      await saveToFile(rollingFilePath, merged);
      console.log(`💾 Merged ${candles.length} candles into rolling file: ${rollingFilePath} (total: ${merged.length})`);
    } else {
      await saveToFile(rollingFilePath, candles);
      console.log(`💾 Saved ${candles.length} candles to rolling file: ${rollingFilePath}`);
    }
  }
  
  // Also save to historical file if startDate is before cutoff
  if (startDateStr <= cutoffDate && candles.length > 0) {
    const historicalEndDate = endDateStr <= cutoffDate ? endDateStr : cutoffDate;
    const historicalFilePath = getHistoricalDataPath(symbol, interval, startDateStr, historicalEndDate);
    // Only save candles that are within the historical date range
    const historicalCandles = candles.filter(c => {
      const candleDate = new Date(c.timestamp).toISOString().split('T')[0].replace(/[^0-9-]/g, '');
      return candleDate <= cutoffDate;
    });
    if (historicalCandles.length > 0) {
      await saveToFile(historicalFilePath, historicalCandles);
      console.log(`💾 Saved ${historicalCandles.length} candles to historical file: ${historicalFilePath}`);
    }
  }

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
 * Update today's candle in historical data with latest price
 * This keeps historical data current as new prices are fetched
 */
async function updateTodayCandle(symbol: string, price: number, timeframe: string = '1d'): Promise<void> {
  try {
    await ensureConnected();
    const interval = mapTimeframeToInterval(timeframe);
    
    // Get today's date range (start of day to end of day)
    const now = Date.now();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    
    // Try to get existing today's candle from cache
    const cacheKey = getCacheKey(symbol, interval, todayStart, todayEnd);
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      const candles = JSON.parse(cached) as PriceCandle[];
      if (candles.length > 0) {
        // Find or create today's candle
        const todayCandleIndex = candles.findIndex(c => {
          const candleDate = new Date(c.timestamp);
          candleDate.setUTCHours(0, 0, 0, 0);
          return candleDate.getTime() === todayStart;
        });
        
        if (todayCandleIndex >= 0) {
          // Update existing today's candle
          const todayCandle = candles[todayCandleIndex];
          todayCandle.close = price;
          todayCandle.high = Math.max(todayCandle.high, price);
          todayCandle.low = Math.min(todayCandle.low, price);
        } else {
          // Add new candle for today
          candles.push({
            timestamp: todayStart,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
          });
        }
        
        // Sort by timestamp and update cache
        candles.sort((a, b) => a.timestamp - b.timestamp);
        await redis.setEx(cacheKey, 86400, JSON.stringify(candles));
      }
    } else {
      // No cache for today - create new candle
      const newCandle: PriceCandle = {
        timestamp: todayStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      };
      await redis.setEx(cacheKey, 86400, JSON.stringify([newCandle]));
    }
    
    // Also try to update file if we're not in serverless (filesystem available)
    // This is best-effort and won't work in Vercel serverless
    try {
      const todayStr = new Date(todayStart).toISOString().split('T')[0];
      
      // For dates after 2025-12-27, use rolling file format: ethusdt_1d_rolling.json.gz (fixed name)
      let filePath: string;
      if (todayStr > '2025-12-27') {
        // Rolling file format for dates after 2025-12-27 (fixed filename)
        filePath = getHistoricalDataPath(symbol, interval, '2025-12-28', todayStr);
      } else {
        // Date-specific file for dates up to 2025-12-27
        filePath = getHistoricalDataPath(symbol, interval, todayStr, todayStr);
      }
      
      let existingFileData = await loadFromFile(filePath);
      
      // If rolling file doesn't exist yet, create it
      if (!existingFileData && todayStr > '2025-12-27') {
        existingFileData = [];
      }
      
      if (existingFileData) {
        const todayCandleIndex = existingFileData.findIndex(c => {
          const candleDate = new Date(c.timestamp);
          candleDate.setUTCHours(0, 0, 0, 0);
          return candleDate.getTime() === todayStart;
        });
        
        if (todayCandleIndex >= 0) {
          existingFileData[todayCandleIndex].close = price;
          existingFileData[todayCandleIndex].high = Math.max(existingFileData[todayCandleIndex].high, price);
          existingFileData[todayCandleIndex].low = Math.min(existingFileData[todayCandleIndex].low, price);
        } else {
          existingFileData.push({
            timestamp: todayStart,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
          });
        }
        
        // Sort by timestamp to keep data organized
        existingFileData.sort((a, b) => a.timestamp - b.timestamp);
        
        await saveToFile(filePath, existingFileData);
      }
    } catch (fileError) {
      // File update is optional (won't work in serverless) - ignore errors
    }
  } catch (error) {
    // Non-critical - log but don't throw
    console.warn('Failed to update today candle in historical data:', error);
  }
}

/**
 * Fetch latest price for ETH/USDC and update historical data
 */
export async function fetchLatestPrice(symbol: string = 'ETHUSDT'): Promise<number> {
  let price: number;
  
  try {
    // Try Binance first with timeout
    const url = `${BINANCE_API_URL}/ticker/price?symbol=${symbol}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        price = parseFloat(data.price);
        return price;
      } else {
        throw new Error(`Binance returned ${response.status}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Binance request timeout');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Binance price fetch failed:', error);
    
    // Fallback to CoinGecko
    try {
      const coinId = 'ethereum';
      const url = `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd`;
      const apiKey = process.env.COINGECKO_API_KEY;
      const headers: HeadersInit = {};
      if (apiKey) {
        headers['x-cg-demo-api-key'] = apiKey;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        const response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          price = data[coinId]?.usd || 0;
          if (!price) {
            throw new Error('CoinGecko returned invalid price');
          }
          return price;
        } else {
          throw new Error(`CoinGecko returned ${response.status}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('CoinGecko request timeout');
        }
        throw fetchError;
      }
    } catch (fallbackError) {
      console.error('CoinGecko price fetch failed:', fallbackError);
      throw new Error('Failed to fetch latest price from both APIs');
    }
  }

  // Update historical data with latest price (non-blocking)
  updateTodayCandle(symbol, price, '1d').catch(err => {
    console.warn('Failed to update historical data with latest price:', err);
  });

  return price;
}

