import type { PriceCandle } from '@/types';
import { redis, ensureConnected } from './kv';
import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';

const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const COINBASE_API_URL = process.env.COINBASE_API_URL || 'https://api.coinbase.com/v2';

// Directory for storing historical price data
const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

// Cache key prefix for price data
const PRICE_CACHE_PREFIX = 'eth:price:cache:';

// Rate limiting: track last API call time
let lastBinanceCall = 0;
let lastCoinGeckoCall = 0;
const MIN_BINANCE_DELAY = 100; // 100ms between Binance calls
const MIN_COINGECKO_DELAY = 1200; // 1.2s between CoinGecko calls (free tier limit)
// const MIN_COINBASE_DELAY = 500; // 500ms between Coinbase calls (unused for now)

/**
 * Get cache key for price data (Redis)
 */
function getCacheKey(symbol: string, interval: string, startTime: number, endTime: number): string {
  return `${PRICE_CACHE_PREFIX}${symbol}:${interval}:${startTime}:${endTime}`;
}

/**
 * Get file path for historical price data
 * For dates after 2025-12-30, uses rolling file format: ethusdt_1d_rolling.json.gz (fixed name)
 * For dates up to 2025-12-30, uses date range format: YYYY-MM-DD_YYYY-MM-DD.json.gz
 * If the range spans the cutoff, use rolling file if endDate is after cutoff
 */
function getHistoricalDataPath(symbol: string, interval: string, startDate: string, endDate: string): string {
  // Sanitize dates for filename (YYYY-MM-DD format)
  const sanitizedStart = startDate.replace(/[^0-9-]/g, '');
  const sanitizedEnd = endDate.replace(/[^0-9-]/g, '');
  
  // Use rolling file format if endDate is after 2025-12-30 (even if startDate is before)
  const cutoffDate = '2025-12-30';
  if (sanitizedEnd > cutoffDate) {
    // Rolling file: fixed name that gets updated
    const filename = `${symbol.toLowerCase()}_${interval}_rolling.json`;
    return path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), interval, filename);
  }
  
  // Original format for dates up to 2025-12-30
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
  } catch {
    // Fallback: try uncompressed file (for backward compatibility with existing files)
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data) as PriceCandle[];
      // Note: File compression is handled by GitHub Actions workflow
      // We just return the parsed data here
      return parsed;
    } catch {
      // Neither file exists or is invalid - return null
      return null;
    }
  }
}

/**
 * Save historical price data to local file (always as compressed .json.gz)
 * Note: Currently unused - file saving is handled by GitHub Actions workflow
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * Fetch historical price data from CoinGecko OHLC endpoint (new method)
 * Returns 30-minute candles that can be aggregated to any interval
 * Valid days: 1, 7, 14, 30, 90, 180, 365, max
 */
async function fetchCoinGeckoOHLC(
  symbol: string,
  days: number = 1
): Promise<PriceCandle[]> {
  await rateLimitCoinGecko();

  // CoinGecko uses different symbol format (ethereum vs ETH)
  const coinId = symbol.toLowerCase() === 'ethusdt' ? 'ethereum' : 'ethereum';
  
  // CoinGecko OHLC endpoint only accepts specific day values
  // Map requested days to nearest valid value
  let requestedDays: number | string = days;
  if (typeof days === 'number') {
    if (days <= 1) requestedDays = 1;
    else if (days <= 7) requestedDays = 7;
    else if (days <= 14) requestedDays = 14;
    else if (days <= 30) requestedDays = 30;
    else if (days <= 90) requestedDays = 90;
    else if (days <= 180) requestedDays = 180;
    else if (days <= 365) requestedDays = 365;
    else requestedDays = 'max';
  }

  const url = new URL(`${COINGECKO_API_URL}/coins/${coinId}/ohlc`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('days', String(requestedDays));

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: HeadersInit = {};
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`CoinGecko OHLC API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  
  // CoinGecko OHLC format: [ timestamp(ms), open, high, low, close ]
  // Returns 30-minute candles
  // Note: CoinGecko returns timestamps in milliseconds, we keep them in milliseconds for consistency
  const candles = data.map((c: number[]) => ({
    timestamp: c[0], // Keep in milliseconds (CoinGecko format)
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: 0, // CoinGecko OHLC doesn't provide volume
  }));

  console.log(`✅ CoinGecko OHLC: Fetched ${candles.length} 30-minute candles (requested ${days} days, got ${requestedDays})`);
  
  if (candles.length === 0) {
    throw new Error(`CoinGecko OHLC returned no candles for ${requestedDays} days`);
  }
  
  // Log date range of fetched candles for debugging
  if (candles.length > 0) {
    const firstCandle = candles[0]!;
    const lastCandle = candles[candles.length - 1]!;
    console.log(`   Date range: ${new Date(firstCandle.timestamp).toISOString()} to ${new Date(lastCandle.timestamp).toISOString()}`);
  }
  
  return candles;
}

/**
 * Fetch historical price data from CoinGecko (fallback - old method using market_chart)
 * Splits large date ranges into smaller chunks to work around free tier limits
 * Note: CoinGecko returns price points, not OHLC candles, so we aggregate them
 */
async function fetchCoinGeckoCandles(
  symbol: string,
  startTime: number,
  endTime: number,
  interval: string = '1d' // Target interval for aggregation
): Promise<PriceCandle[]> {
  // CoinGecko uses different symbol format (ethereum vs ETH)
  const coinId = symbol.toLowerCase() === 'ethusdt' ? 'ethereum' : 'ethereum';
  const startDate = Math.floor(startTime / 1000);
  const endDate = Math.floor(endTime / 1000);
  
  // Free tier typically allows ~90 days, but let's use 30 days to be safer
  // Smaller chunks = more requests but better data coverage
  const MAX_DAYS_PER_REQUEST = 30;
  const MAX_SECONDS_PER_REQUEST = MAX_DAYS_PER_REQUEST * 24 * 60 * 60;
  
  const allPricePoints: Array<{ timestamp: number; price: number }> = [];
  let currentStart = startDate;
  let chunkNumber = 0;
  
  console.log(`📡 CoinGecko: Fetching ${interval} candles from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
  const totalDays = Math.floor((endDate - startDate) / 86400);
  const expectedChunks = Math.ceil((endDate - startDate) / MAX_SECONDS_PER_REQUEST);
  console.log(`   Date range: ${totalDays} days, will fetch in ${expectedChunks} chunk(s)`);
  
  while (currentStart < endDate) {
    chunkNumber++;
    await rateLimitCoinGecko();
    
    const currentEnd = Math.min(currentStart + MAX_SECONDS_PER_REQUEST, endDate);
    const chunkDays = Math.floor((currentEnd - currentStart) / 86400);
    
    console.log(`📡 CoinGecko chunk ${chunkNumber}/${expectedChunks}: ${new Date(currentStart * 1000).toISOString().split('T')[0]} to ${new Date(currentEnd * 1000).toISOString().split('T')[0]} (${chunkDays} days)`);
    
    const url = new URL(`${COINGECKO_API_URL}/coins/${coinId}/market_chart/range`);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('from', String(currentStart));
    url.searchParams.set('to', String(currentEnd));

    const apiKey = process.env.COINGECKO_API_KEY;
    const headers: HeadersInit = {};
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), { headers });
    } catch (fetchError) {
      console.error(`❌ CoinGecko chunk ${chunkNumber} fetch failed:`, fetchError);
      // If this is not the first chunk, continue with what we have
      if (chunkNumber > 1 && allPricePoints.length > 0) {
        console.warn(`⚠️ Continuing with ${allPricePoints.length} price points from previous chunks`);
        break;
      }
      throw fetchError;
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error(`❌ CoinGecko chunk ${chunkNumber} error: ${response.status} ${response.statusText}`);
      
      // If we have some data from previous chunks, continue
      if (chunkNumber > 1 && allPricePoints.length > 0) {
        console.warn(`⚠️ CoinGecko chunk ${chunkNumber} failed, but we have ${allPricePoints.length} price points from previous chunks - continuing`);
        break;
      }
      
      // If it's a time range error and we're trying a full year, suggest chunking
      if (response.status === 401 && currentStart === startDate && (endDate - startDate) > MAX_SECONDS_PER_REQUEST) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText} - Free tier limits historical data range. Trying to fetch in chunks...`);
      }
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    // CoinGecko returns prices array: [[timestamp, price], ...]
    // Timestamp is in milliseconds (not seconds like some endpoints)
    const prices = data.prices || [];
    
    if (prices.length === 0) {
      console.warn(`⚠️ CoinGecko chunk ${chunkNumber} returned no price data`);
      // If this is not the first chunk and we have data, continue
      if (chunkNumber > 1 && allPricePoints.length > 0) {
        console.warn(`⚠️ Continuing with ${allPricePoints.length} price points from previous chunks`);
        break;
      }
    } else {
      const pointsPerDay = chunkDays > 0 ? (prices.length / chunkDays).toFixed(1) : '0';
      console.log(`✅ CoinGecko chunk ${chunkNumber}: ${prices.length} price points (${pointsPerDay} points/day)`);
    }
    
    // Store price points for aggregation
    // CoinGecko market_chart/range returns timestamps in milliseconds
    prices.forEach(([timestamp, price]: [number, number]) => {
      allPricePoints.push({ timestamp, price });
    });
    
    // Move to next chunk
    currentStart = currentEnd + 1;
    
    // Add delay between chunks to respect rate limits
    if (currentStart < endDate) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay between chunks (more conservative)
    }
  }
  
  // Check if we got any price points
  if (allPricePoints.length === 0) {
    console.warn(`⚠️ CoinGecko returned no price points for range ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
    console.warn(`   CoinGecko free tier may not provide hourly/intraday data for very recent periods`);
    throw new Error('CoinGecko returned no price points - may not support hourly data for recent periods');
  }
  
  console.log(`📊 CoinGecko total: ${allPricePoints.length} price points collected from ${chunkNumber} chunk(s)`);
  
  // Sort price points by timestamp
  allPricePoints.sort((a, b) => a.timestamp - b.timestamp);
  
  // Aggregate price points into candles based on interval
  const intervalMs = interval === '5m' ? 5 * 60 * 1000 :
                     interval === '1h' ? 60 * 60 * 1000 : 
                     interval === '1d' ? 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000; // Default to 1d
  
  const candleMap = new Map<number, PriceCandle>();
  
  for (const point of allPricePoints) {
    // Round timestamp to interval start
    const intervalStart = Math.floor(point.timestamp / intervalMs) * intervalMs;
    
    let candle = candleMap.get(intervalStart);
    if (!candle) {
      candle = {
        timestamp: intervalStart,
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        volume: 0,
      };
      candleMap.set(intervalStart, candle);
    } else {
      // Update OHLC
      candle.high = Math.max(candle.high, point.price);
      candle.low = Math.min(candle.low, point.price);
      candle.close = point.price; // Last price in interval is close
    }
  }
  
  // Convert map to array and filter to requested range
  const aggregatedCandles = Array.from(candleMap.values())
    .filter(c => c.timestamp >= startTime && c.timestamp <= endTime)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  console.log(`📊 CoinGecko aggregation: ${allPricePoints.length} price points → ${aggregatedCandles.length} ${interval} candles`);
  
  // Warn if we got fewer candles than expected (for daily candles)
  if (interval === '1d') {
    const expectedDays = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));
    if (aggregatedCandles.length < expectedDays * 0.5) {
      console.warn(`⚠️ CoinGecko returned only ${aggregatedCandles.length} daily candles for ${expectedDays} day range`);
      console.warn(`   This is normal for CoinGecko free tier - it may only return 1 price point per day for recent data`);
    }
  }
  
  if (aggregatedCandles.length === 0) {
    throw new Error('CoinGecko aggregation resulted in 0 candles - may not support hourly data for recent periods');
  }
  
  return aggregatedCandles;
}

/**
 * Aggregate candles from one interval to another
 * Used to convert CoinGecko 30-minute candles to other intervals
 */
function aggregateCandles(candles: PriceCandle[], targetInterval: string): PriceCandle[] {
  if (candles.length === 0) return [];
  
  const intervalMs = targetInterval === '5m' ? 5 * 60 * 1000 :
                     targetInterval === '1h' ? 60 * 60 * 1000 : 
                     targetInterval === '1d' ? 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000; // Default to 1d
  
  const candleMap = new Map<number, PriceCandle>();
  
  for (const candle of candles) {
    // Round timestamp to interval start
    const intervalStart = Math.floor(candle.timestamp / intervalMs) * intervalMs;
    
    let aggregated = candleMap.get(intervalStart);
    if (!aggregated) {
      aggregated = {
        timestamp: intervalStart,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      };
      candleMap.set(intervalStart, aggregated);
    } else {
      // Update OHLC
      aggregated.high = Math.max(aggregated.high, candle.high);
      aggregated.low = Math.min(aggregated.low, candle.low);
      aggregated.close = candle.close; // Last close in interval
      aggregated.volume = (aggregated.volume || 0) + (candle.volume || 0);
    }
  }
  
  return Array.from(candleMap.values())
    .sort((a, b) => a.timestamp - b.timestamp);
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
    '8h': '8h',
    '12h': '12h',
    '1d': '1d',
  };
  return mapping[timeframe] || '1d';
}

/**
 * Fetch historical price candles for ETH/USDC
 * Priority: Local JSON files > Redis cache > API calls
 * Saves fetched data to Redis (file writes handled by GitHub Actions workflow)
 */
export async function fetchPriceCandles(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
  currentPrice?: number, // Optional: if provided, use this for today's candle instead of fetching
  skipAPIFetch?: boolean // Optional: if true, skip API fetches (for backfill tests on historical data)
): Promise<PriceCandle[]> {
  const startTime = new Date(startDate).getTime();
  // For endDate, use end of day to include all candles from that date
  const endDateObj = new Date(endDate);
  endDateObj.setUTCHours(23, 59, 59, 999);
  const endTime = endDateObj.getTime();
  
  // For intraday intervals, ensure we have the full time range (not just date boundaries)
  // This is important for 5m/1h candles where we want all data in the range
  const actualEndTime = timeframe === '5m' || timeframe === '1h' 
    ? Math.max(endTime, Date.now()) // Include up to now for intraday
    : endTime;
  const now = Date.now();
  const interval = mapTimeframeToInterval(timeframe);
  const cutoffDate = '2025-12-30';
  const startDateStr = startDate.replace(/[^0-9-]/g, '');
  const endDateStr = endDate.replace(/[^0-9-]/g, '');

  // 1. Load data from local files
  // If date range spans the cutoff, we need to load from both historical and rolling files
  let allCandles: PriceCandle[] = [];
  
  // Load from historical file (if startDate is before or equal to cutoff)
  // Always try to load historical file if startDate is before cutoff, even if endDate is after
  if (startDateStr <= cutoffDate) {
    // Use cutoff date as the end date for historical file lookup
    // The actual file may contain data beyond the cutoff, but we use cutoff for the filename
    const historicalEndDate = cutoffDate;
    const historicalFilePath = getHistoricalDataPath(symbol, interval, startDateStr, historicalEndDate);
    const historicalData = await loadFromFile(historicalFilePath);
    
    if (historicalData && historicalData.length > 0) {
      // Filter to date range (don't filter by cutoff - file may contain data beyond cutoff)
      const filtered = historicalData.filter(c => 
        c.timestamp >= startTime && c.timestamp <= actualEndTime
      );
      allCandles.push(...filtered);
      console.log(`📁 Loaded ${filtered.length} candles from historical file (${historicalFilePath})`);
    }
    
    // Always try to find additional historical files that might cover this range
    // This ensures we load all relevant files, not just the primary one
    try {
      const dir = path.dirname(historicalFilePath);
      const files = await fs.readdir(dir);
      // Look for both naming patterns:
      // 1. Symbol-based: ethusdt_8h_YYYY-MM-DD_YYYY-MM-DD.json.gz
      // 2. Date-based: YYYY-MM-DD_YYYY-MM-DD.json.gz
      const historicalFiles = files.filter(f => 
        f.endsWith('.json.gz') &&
        !f.includes('rolling') &&
        (f.startsWith(`${symbol.toLowerCase()}_${interval}_`) || /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)) &&
        f !== path.basename(historicalFilePath) // Don't reload the primary file
      );
      
      for (const file of historicalFiles) {
        const filePath = path.join(dir, file);
        try {
          const compressed = await fs.readFile(filePath);
          const decompressed = gunzipSync(compressed);
          const jsonString = decompressed.toString('utf-8');
          const candles = JSON.parse(jsonString) as PriceCandle[];
          
          // Don't filter by cutoff date here - the file may contain data beyond the cutoff
          // The cutoff is only for determining which file to load, not for filtering the data
          // Use actualEndTime to include all candles up to now for intraday intervals
          const filtered = candles.filter(c => 
            c.timestamp >= startTime && c.timestamp <= actualEndTime
          );
          
          if (filtered.length > 0) {
            allCandles.push(...filtered);
            const first = filtered[0]!;
            const last = filtered[filtered.length - 1]!;
            console.log(`📁 Loaded ${filtered.length} candles from historical file: ${file}`);
            console.log(`   Range: ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}`);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Directory doesn't exist or can't read - continue
    }
  }
  
  // Load from rolling file (if endDate is after cutoff)
  if (endDateStr > cutoffDate) {
    const rollingStartDate = startDateStr > cutoffDate ? startDateStr : '2025-12-31';
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
    
    // Debug: log what we have before merging today's candle
    if (uniqueCandles.length > 0) {
      const first = uniqueCandles[0]!;
      const last = uniqueCandles[uniqueCandles.length - 1]!;
      console.log(`📊 After deduplication: ${uniqueCandles.length} unique candles from ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}`);
    }
    
    // Merge in today's candle from Redis cache if available (more up-to-date than file)
    // This is critical because:
    // 1. File writes don't work in Vercel serverless, so today's candle is only in Redis
    // 2. Even locally, updateTodayCandle runs async, so file might not be updated yet
    // 3. Redis is updated synchronously in updateTodayCandle, so it's always fresh
    // 4. If Redis doesn't have it yet, we'll try to fetch latest price and create it
    try {
      await ensureConnected();
      const now = Date.now();
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
      
      // Always check for today's candles if endDate includes today (unless skipAPIFetch is true)
      if (endTime >= todayStart && !skipAPIFetch) {
        const cacheKey = getCacheKey(symbol, interval, todayStart, todayEnd);
        const cached = await redis.get(cacheKey);
        let todayCandles: PriceCandle[] = []; // For 8h/12h, we may have multiple periods per day
        
        if (cached) {
          const cachedCandles = JSON.parse(cached) as PriceCandle[];
          // For 8h/12h candles, get ALL periods from today (00:00, 08:00, 16:00 for 8h or 00:00, 12:00 for 12h)
          // For daily candles, get the single day candle
          if (interval === '8h' || interval === '12h') {
            // For 8h/12h, get all candles from today (multiple periods)
            todayCandles = cachedCandles.filter(c => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart;
            });
            if (todayCandles.length > 0) {
              console.log(`📦 Found ${todayCandles.length} ${interval} candle(s) in cache for today: ${todayCandles.map(c => new Date(c.timestamp).toISOString()).join(', ')}`);
            }
          } else {
            // For daily candles, match by day start
            const dailyCandle = cachedCandles.find(c => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart;
            });
            if (dailyCandle) {
              todayCandles = [dailyCandle];
            }
          }
          
          // Filter out synthetic candles (all OHLC same, volume 0, AND stale)
          todayCandles = todayCandles.filter(candle => {
            const isSameOHLC = candle.open === candle.high && 
                               candle.high === candle.low && 
                               candle.low === candle.close && 
                               candle.volume === 0;
            if (!isSameOHLC) return true; // Real candle with varying OHLC
            
            const candleAge = now - candle.timestamp;
            // For 8h candles, max age is 8 hours before considering it synthetic
            // For 12h candles, max age is 12 hours
            const maxAgeForSynthetic = interval === '1h' ? 60 * 60 * 1000 :
                                       interval === '5m' ? 5 * 60 * 1000 :
                                       interval === '8h' ? 8 * 60 * 60 * 1000 :
                                       interval === '12h' ? 12 * 60 * 60 * 1000 :
                                       24 * 60 * 60 * 1000;
            
            if (candleAge > maxAgeForSynthetic) {
              console.log(`⚠️ Filtering out synthetic candle (OHLC all $${candle.close.toFixed(2)}, age: ${Math.floor(candleAge / (60 * 60 * 1000))}h)`);
              return false;
            }
            return true; // Recent candle with same OHLC is real data
          });
        }
        
        // If we don't have all today's candles from cache, try to fetch from API
        // For 8h candles, we should have candles for completed periods
        const needsAPIFetch = todayCandles.length === 0;
        
        if (needsAPIFetch && !skipAPIFetch && endTime >= todayStart) {
          // Try to fetch today's candles from Binance API
          try {
            console.log(`📡 Fetching today's ${interval} candles from Binance API...`);
            const apiCandles = await fetchBinanceCandles(symbol, interval, todayStart, now);
            // Get all candles from today
            const apiTodayCandles = apiCandles.filter(c => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart;
            });
            
            if (apiTodayCandles.length > 0) {
              todayCandles = apiTodayCandles;
              console.log(`✅ Fetched ${apiTodayCandles.length} ${interval} candle(s) from API for today`);
              
              // Save to Redis for future use (preserve existing candles in cache)
              try {
                const existingCached = await redis.get(cacheKey);
                const allCachedCandles: PriceCandle[] = existingCached ? JSON.parse(existingCached) : [];
                
                // Merge API candles into cache
                for (const apiCandle of apiTodayCandles) {
                  const existingIdx = allCachedCandles.findIndex(c => c.timestamp === apiCandle.timestamp);
                  if (existingIdx >= 0) {
                    allCachedCandles[existingIdx] = apiCandle;
                  } else {
                    allCachedCandles.push(apiCandle);
                  }
                }
                allCachedCandles.sort((a, b) => a.timestamp - b.timestamp);
                await redis.setEx(cacheKey, 86400, JSON.stringify(allCachedCandles));
              } catch (redisError) {
                console.warn('Failed to save today candles to Redis:', redisError);
              }
            }
          } catch (apiError) {
            console.log(`⚠️ Could not fetch today's candles from API:`, apiError instanceof Error ? apiError.message : apiError);
          }
          
          // If API didn't have candles, try fetching latest price to update current period
          if (todayCandles.length === 0 && !skipAPIFetch) {
            try {
              await fetchLatestPrice(symbol);
              // Wait for updateTodayCandle to complete
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Try Redis again
              const retryCached = await redis.get(cacheKey);
              if (retryCached) {
                const retryCandles = JSON.parse(retryCached) as PriceCandle[];
                if (interval === '8h' || interval === '12h') {
                  todayCandles = retryCandles.filter(c => {
                    const candleDate = new Date(c.timestamp);
                    candleDate.setUTCHours(0, 0, 0, 0);
                    return candleDate.getTime() === todayStart;
                  });
                } else {
                  const dailyCandle = retryCandles.find(c => {
                    const candleDate = new Date(c.timestamp);
                    candleDate.setUTCHours(0, 0, 0, 0);
                    return candleDate.getTime() === todayStart;
                  });
                  if (dailyCandle) todayCandles = [dailyCandle];
                }
                if (todayCandles.length > 0) {
                  console.log(`✅ Found ${todayCandles.length} candle(s) in Redis after price fetch`);
                }
              }
            } catch (priceError) {
              console.warn('Failed to fetch latest price for today candle:', priceError);
            }
          }
        }
        
        // Merge ALL today's candles into uniqueCandles
        if (todayCandles.length > 0) {
          console.log(`🔍 Before merge - Total candles: ${uniqueCandles.length}`);
          
          for (const todayCandle of todayCandles) {
            // Find existing candle with same timestamp and merge
            const existingIndex = uniqueCandles.findIndex(c => c.timestamp === todayCandle.timestamp);
            
            if (existingIndex >= 0) {
              uniqueCandles[existingIndex] = todayCandle;
            } else {
              uniqueCandles.push(todayCandle);
            }
            
            // Also update allCandles
            const allCandlesIdx = allCandles.findIndex(c => c.timestamp === todayCandle.timestamp);
            if (allCandlesIdx >= 0) {
              allCandles[allCandlesIdx] = todayCandle;
            } else {
              allCandles.push(todayCandle);
            }
          }
          
          // Re-sort after merging
          uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
          allCandles.sort((a, b) => a.timestamp - b.timestamp);
          
          console.log(`🔄 Merged ${todayCandles.length} today's candle(s) - Total now: ${uniqueCandles.length}`);
        } else {
          console.warn(`⚠️ Could not get today's candles from Redis or API (key: ${cacheKey})`);
        }
      }
    } catch (error) {
      // Non-critical - log but continue
      console.warn('Failed to merge today candle from cache:', error);
    }
    
    // Check if we have complete coverage of the requested date range
    // Determine expected interval based on timeframe
    let expectedInterval: number;
    if (timeframe === '5m') {
      expectedInterval = 5 * 60 * 1000; // 5 minutes in ms
    } else if (timeframe === '1h') {
      expectedInterval = 60 * 60 * 1000; // 1 hour in ms
    } else if (timeframe === '4h') {
      expectedInterval = 4 * 60 * 60 * 1000; // 4 hours in ms
    } else if (timeframe === '8h') {
      expectedInterval = 8 * 60 * 60 * 1000; // 8 hours in ms
    } else if (timeframe === '12h') {
      expectedInterval = 12 * 60 * 60 * 1000; // 12 hours in ms
    } else if (timeframe === '1d') {
      expectedInterval = 24 * 60 * 60 * 1000; // 1 day in ms
    } else {
      expectedInterval = 24 * 60 * 60 * 1000; // Default to 1 day
    }
    let hasCompleteCoverage = false;
    
    if (uniqueCandles.length > 0 && actualEndTime >= startTime) {
      // Get candles that are in the requested range (use actualEndTime for intraday)
      const candlesInRange = uniqueCandles.filter(c => c.timestamp >= startTime && c.timestamp <= actualEndTime);
      
      if (candlesInRange.length === 0) {
        hasCompleteCoverage = false; // No candles in the requested range
        console.log(`⚠️ No candles in requested range (${new Date(startTime).toISOString().split('T')[0]} to ${new Date(actualEndTime).toISOString().split('T')[0]})`);
      } else {
        // Calculate how many intervals are in the requested range (use actualEndTime for intraday)
        const intervalsInRange = Math.ceil((actualEndTime - startTime) / expectedInterval) + 1;
        
        // For hourly candles, we need one candle per hour
        // For daily candles, we need one candle per day
        const sortedInRange = [...candlesInRange].sort((a, b) => a.timestamp - b.timestamp);
        const uniqueIntervals = new Set<number>();
        
        sortedInRange.forEach(c => {
          // Round to the nearest interval start
          const intervalStart = Math.floor(c.timestamp / expectedInterval) * expectedInterval;
          uniqueIntervals.add(intervalStart);
        });
        
        // For intraday intervals (5m, 1h) loaded from Redis, we accept partial coverage
        // This is because we're just trying to get recent granular data, not complete historical coverage
        // For daily candles, we require complete coverage
        if (timeframe === '5m' || timeframe === '1h') {
          // For intraday, accept if we have at least 10% coverage OR at least 10 candles
          // This allows us to use partial Redis data without triggering unnecessary API calls
          hasCompleteCoverage = uniqueIntervals.size >= Math.max(10, intervalsInRange * 0.1);
        } else {
          // For daily candles, require complete coverage
          hasCompleteCoverage = uniqueIntervals.size >= intervalsInRange;
        }
        
        const intervalLabel = timeframe === '1h' ? 'hours' : timeframe === '1d' ? 'days' : 'intervals';
        console.log(`📊 Coverage check (${timeframe}): requested ${intervalsInRange} ${intervalLabel}, have ${uniqueIntervals.size} unique ${intervalLabel}, ${candlesInRange.length} total candles`);
        
        if (!hasCompleteCoverage && (timeframe !== '5m' && timeframe !== '1h')) {
          // Only warn about incomplete coverage for daily candles (intraday partial coverage is OK)
          if (skipAPIFetch || endTime < Date.now()) {
            console.log(`⚠️ Incomplete coverage: have ${uniqueIntervals.size} unique ${intervalLabel}, need ${intervalsInRange} ${intervalLabel} in range - but skipping API fetch (historical period or skipAPIFetch=true)`);
          } else {
            console.log(`⚠️ Incomplete coverage: have ${uniqueIntervals.size} unique ${intervalLabel}, need ${intervalsInRange} ${intervalLabel} in range - will fetch from API`);
          }
        } else if (timeframe === '5m' || timeframe === '1h') {
          console.log(`ℹ️ Partial coverage OK for intraday: have ${uniqueIntervals.size}/${intervalsInRange} ${intervalLabel} (${((uniqueIntervals.size / intervalsInRange) * 100).toFixed(1)}%)`);
        }
      }
    } else {
      hasCompleteCoverage = false;
      console.log(`⚠️ Cannot check coverage: ${uniqueCandles.length} candles, range: ${new Date(startTime).toISOString().split('T')[0]} to ${new Date(actualEndTime).toISOString().split('T')[0]}`);
    }
    
    // If we have enough data AND complete coverage, return early
    // OR if skipAPIFetch is true, return early with what we have (even if incomplete coverage)
    // OR if we have enough data (>=50 candles) and coverage is incomplete but we're requesting a very large historical range
    // (in which case incomplete coverage is expected and we should use what we have)
    const hasEnoughData = uniqueCandles.length >= 50 || uniqueCandles.some(c => c.timestamp >= startTime && c.timestamp <= endTime);
    const isLargeHistoricalRange = (endTime - startTime) > 365 * 24 * 60 * 60 * 1000; // More than 1 year
    const shouldReturnEarly = hasEnoughData && (hasCompleteCoverage || skipAPIFetch || (isLargeHistoricalRange && !hasCompleteCoverage));
    
    if (shouldReturnEarly) {
      if (skipAPIFetch && !hasCompleteCoverage) {
        console.log(`ℹ️ Using existing data: ${uniqueCandles.length} candles (skipAPIFetch=true, coverage incomplete but acceptable)`);
      } else if (isLargeHistoricalRange && !hasCompleteCoverage) {
        console.log(`ℹ️ Using existing data: ${uniqueCandles.length} candles (large historical range, incomplete coverage expected)`);
      } else {
        console.log(`ℹ️ Using existing data: ${uniqueCandles.length} candles with complete coverage of requested range`);
      }
      
      // Skip API fetches if:
      // 1. skipAPIFetch is true (explicit flag for backfill tests)
      // 2. endDate is in the past (historical data, no need for today's candle)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      const isHistoricalPeriod = endTime < todayStart;
      
      // Skip today's candle fetch if skipAPIFetch is true or it's a historical period
      if (!skipAPIFetch && !isHistoricalPeriod && endTime >= todayStart) {
        // For 8h/12h candles, check if we have ALL periods for today (00:00, 08:00, 16:00 for 8h)
        // For daily candles, check for the single day candle
        let needsAPIFetch = false;
        let todayCandleIndices: number[] = [];
        
        if (interval === '8h' || interval === '12h') {
          // Find ALL today's candles for 8h/12h
          todayCandleIndices = uniqueCandles
            .map((c, i) => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart ? i : -1;
            })
            .filter(i => i >= 0);
          
          // Calculate expected periods that should exist by now
          const currentHours = new Date(now).getUTCHours();
          const periodSize = interval === '8h' ? 8 : 12;
          const currentPeriod = Math.floor(currentHours / periodSize);
          const expectedPeriods = currentPeriod + 1; // Periods 0 to currentPeriod should exist
          
          // Check if we're missing any periods
          if (todayCandleIndices.length < expectedPeriods) {
            console.log(`📊 Missing ${interval} candles: have ${todayCandleIndices.length}, expected ${expectedPeriods} periods for today`);
            needsAPIFetch = true;
          } else {
            // Check if any existing candles are synthetic
            for (const idx of todayCandleIndices) {
              const candle = uniqueCandles[idx]!;
              const isSameOHLC = candle.open === candle.high && candle.high === candle.low && 
                                 candle.low === candle.close && candle.volume === 0;
              if (isSameOHLC) {
                const candleAge = now - candle.timestamp;
                const maxAge = interval === '8h' ? 8 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
                if (candleAge > maxAge) {
                  console.log(`📊 Found synthetic ${interval} candle at ${new Date(candle.timestamp).toISOString()}`);
                  needsAPIFetch = true;
                  break;
                }
              }
            }
          }
        } else {
          // For daily candles, just check for one
          const todayCandleIndex = uniqueCandles.findIndex(c => {
            const candleDate = new Date(c.timestamp);
            candleDate.setUTCHours(0, 0, 0, 0);
            return candleDate.getTime() === todayStart;
          });
          
          if (todayCandleIndex < 0) {
            needsAPIFetch = true;
          } else {
            const candle = uniqueCandles[todayCandleIndex]!;
            const isSameOHLC = candle.open === candle.high && candle.high === candle.low && 
                               candle.low === candle.close && candle.volume === 0;
            const candleAge = now - candle.timestamp;
            if (isSameOHLC && candleAge > 24 * 60 * 60 * 1000) {
              needsAPIFetch = true;
            }
          }
        }
        
        if (needsAPIFetch) {
          // Fetch all of today's candles from API
          try {
            console.log(`📡 Fetching today's ${interval} candles from API...`);
            const apiTodayCandles = await fetchBinanceCandles(symbol, interval, todayStart, Date.now());
            
            // Filter to today's candles only
            const todayApiCandles = apiTodayCandles.filter(c => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart;
            });
            
            if (todayApiCandles.length > 0) {
              console.log(`✅ Fetched ${todayApiCandles.length} ${interval} candle(s) from API for today`);
              
              // Merge each API candle into uniqueCandles
              for (const apiCandle of todayApiCandles) {
                const existingIdx = uniqueCandles.findIndex(c => c.timestamp === apiCandle.timestamp);
                if (existingIdx >= 0) {
                  uniqueCandles[existingIdx] = apiCandle;
                } else {
                  uniqueCandles.push(apiCandle);
                }
              }
              uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
              
              // Save to Redis (merge with existing cached candles)
              try {
                await ensureConnected();
                const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
                const cacheKey = getCacheKey(symbol, interval, todayStart, todayEnd);
                const existingCached = await redis.get(cacheKey);
                const allCachedCandles: PriceCandle[] = existingCached ? JSON.parse(existingCached) : [];
                
                for (const apiCandle of todayApiCandles) {
                  const existingIdx = allCachedCandles.findIndex(c => c.timestamp === apiCandle.timestamp);
                  if (existingIdx >= 0) {
                    allCachedCandles[existingIdx] = apiCandle;
                  } else {
                    allCachedCandles.push(apiCandle);
                  }
                }
                allCachedCandles.sort((a, b) => a.timestamp - b.timestamp);
                await redis.setEx(cacheKey, 86400, JSON.stringify(allCachedCandles));
              } catch (redisError) {
                console.warn('Failed to save today candles to Redis:', redisError);
              }
            }
          } catch (apiError) {
            console.warn('Could not fetch today candles from API:', apiError instanceof Error ? apiError.message : apiError);
          }
        }
      }
      
      // Debug: log what we're returning
      if (uniqueCandles.length > 0) {
        const first = uniqueCandles[0]!;
        const last = uniqueCandles[uniqueCandles.length - 1]!;
        console.log(`📤 Returning ${uniqueCandles.length} candles: ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}`);
      }
      
      return uniqueCandles;
    }
  }

  // 2. Check Redis cache (for recent data or if file doesn't exist)
  // For intraday intervals (5m, 1h), check ALL matching Redis keys and merge them
  // This is important because Redis may have multiple keys with different time ranges
  try {
    await ensureConnected();
    
    // For intraday intervals, search for all matching keys and merge them
    if (interval === '5m' || interval === '1h') {
      const pattern = `${PRICE_CACHE_PREFIX}${symbol}:${interval}:*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        const allCachedCandles: PriceCandle[] = [];
        
        // Load candles from all matching keys
        for (const key of keys) {
          try {
            const cached = await redis.get(key);
            if (cached) {
              const parsed = JSON.parse(cached) as PriceCandle[];
              // Filter to requested time range (use actualEndTime for intraday to include up to now)
              const filtered = parsed.filter(c => c.timestamp >= startTime && c.timestamp <= actualEndTime);
              allCachedCandles.push(...filtered);
            }
          } catch {
            // Skip this key if it fails
            continue;
          }
        }
        
        // Remove duplicates and sort
        if (allCachedCandles.length > 0) {
          const uniqueCandles = Array.from(
            new Map(allCachedCandles.map(c => [c.timestamp, c])).values()
          ).sort((a, b) => a.timestamp - b.timestamp);
          
          // If we have enough data from cache, return it
          if (uniqueCandles.length >= 10 || uniqueCandles.some(c => c.timestamp >= startTime && c.timestamp <= actualEndTime)) {
            console.log(`📦 Loaded ${uniqueCandles.length} ${interval} candles from Redis (${keys.length} keys)`);
            return uniqueCandles;
          }
        }
      }
    } else {
      // For daily candles, use the exact key match (original behavior)
      const cacheKey = getCacheKey(symbol, interval, startTime, endTime);
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as PriceCandle[];
        // If we have enough data from cache, return it
        if (parsed.length >= 50 || parsed.some(c => c.timestamp >= startTime && c.timestamp <= endTime)) {
          return parsed;
        }
      }
    }
  } catch (error) {
    // Cache miss or error - continue to fetch
    console.warn('Redis cache read failed, fetching fresh data:', error);
  }

  // 3. Fetch from API (only if we don't have enough data from files)
  // Special case: Always try to fetch today's candle from API if endDate includes today
  // This ensures we have the most up-to-date OHLC data for today
  let candles: PriceCandle[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const shouldFetchToday = endTime >= todayStart;

  try {
    // If we need today's candle, try fetching it specifically first
    // But only if we haven't already added it from Redis (which happens in the early return path)
    // Check if we already have today's candle in allCandles
    const hasTodayCandleInAllCandles = allCandles.some(c => {
      const candleDate = new Date(c.timestamp);
      candleDate.setUTCHours(0, 0, 0, 0);
      return candleDate.getTime() === todayStart;
    });
    
    if (shouldFetchToday && allCandles.length > 0 && !hasTodayCandleInAllCandles) {
      try {
        // Fetch just today's candle from API to get fresh OHLC data
        const todayCandles = await fetchBinanceCandles(symbol, interval, todayStart, Date.now());
        if (todayCandles.length > 0) {
          // Merge today's candle from API into allCandles
          const existingMap = new Map(allCandles.map(c => [c.timestamp, c]));
          todayCandles.forEach(c => {
            const candleDate = new Date(c.timestamp);
            candleDate.setUTCHours(0, 0, 0, 0);
            if (candleDate.getTime() === todayStart) {
              existingMap.set(c.timestamp, c); // API data overwrites file data
              console.log(`📡 Fetched today's candle from API (close: $${c.close.toFixed(2)})`);
            }
          });
          allCandles = Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        }
      } catch (todayError) {
        console.log('Could not fetch today candle from API, will try full range:', todayError instanceof Error ? todayError.message : todayError);
      }
    }
    
    // Fetch full range from API if we don't have enough data OR if we don't have complete coverage
    const hasCompleteCoverage = allCandles.length > 0 && 
      allCandles[0]!.timestamp <= startTime && 
      allCandles[allCandles.length - 1]!.timestamp >= endTime;
    
    // Skip API fetch if:
    // 1. skipAPIFetch is true (explicit flag for backfill tests)
    // 2. endDate is in the past (historical data, no need for API)
    const isHistoricalPeriod = endTime < Date.now();
    
    if (!skipAPIFetch && !isHistoricalPeriod && (allCandles.length < 50 || !allCandles.some(c => c.timestamp >= startTime && c.timestamp <= endTime) || !hasCompleteCoverage)) {
      console.log(`📡 Fetching from API: need to fill gaps (have ${allCandles.length} candles, coverage: ${hasCompleteCoverage ? 'complete' : 'incomplete'})`);
      // Save allCandles count before API fetch to verify merge
      const allCandlesBeforeAPI = allCandles.length;
      const has0800BeforeAPI = allCandles.some(c => new Date(c.timestamp).toISOString() === '2025-12-31T08:00:00.000Z');
      console.log(`📊 Before API: ${allCandlesBeforeAPI} candles in allCandles, Has 08:00? ${has0800BeforeAPI}`);
      // Try Binance first
      // Note: API might not return the most recent 08:00 candle if it's still in progress
      // We'll merge API data with file data to preserve all candles from files
      candles = await fetchBinanceCandles(symbol, interval, startTime, endTime);
      console.log(`📡 API returned ${candles.length} candles`);
    } else {
      if (skipAPIFetch || isHistoricalPeriod) {
        console.log(`ℹ️ Using existing data: ${allCandles.length} candles (skipping API fetch for historical period)`);
      } else {
        console.log(`ℹ️ Using existing data: ${allCandles.length} candles with complete coverage`);
      }
    }
  } catch (error) {
    // Skip API fallbacks if skipAPIFetch is true or this is a historical period
    const isHistoricalPeriod = endTime < Date.now();
    if (skipAPIFetch || isHistoricalPeriod) {
      console.log(`ℹ️ Skipping API fallbacks (skipAPIFetch=${skipAPIFetch}, isHistorical=${isHistoricalPeriod}) - using file data only`);
      if (allCandles.length > 0) {
        // Deduplicate and sort allCandles to ensure we have all candles from files
        candles = Array.from(
          new Map(allCandles.map(c => [c.timestamp, c])).values()
        ).sort((a, b) => a.timestamp - b.timestamp);
      }
    } else {
      console.error('Binance API failed, trying CryptoCompare:', error);
      
      // Try CryptoCompare first (free tier, good historical data)
      try {
        const { fetchCryptoCompareCandles } = await import('./cryptocompare-service');
        console.log(`📡 Trying CryptoCompare API for ${interval} candles...`);
        candles = await fetchCryptoCompareCandles(symbol, timeframe, startTime, endTime);
        console.log(`✅ CryptoCompare succeeded: ${candles.length} ${interval} candles`);
      } catch (cryptoCompareError) {
      console.error('CryptoCompare API failed, trying CoinGecko OHLC:', cryptoCompareError);
      
      // Try CoinGecko OHLC endpoint (new method - returns 30-minute candles)
        try {
      // Calculate days needed - if start and end are the same, we still need at least 1 day
      // Add 1 day buffer to ensure we get complete data coverage
      const daysSinceStart = Math.max(1, Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1);
      const daysToFetch = Math.min(daysSinceStart, 365); // Max 365 days for OHLC endpoint
      
      console.log(`📡 Trying CoinGecko OHLC endpoint (${daysToFetch} days, range: ${new Date(startTime).toISOString().split('T')[0]} to ${new Date(endTime).toISOString().split('T')[0]})...`);
      const ohlcCandles = await fetchCoinGeckoOHLC(symbol, daysToFetch);
      
      // Filter to requested time range (timestamps are already in milliseconds)
      let filteredCandles = ohlcCandles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
      
      // Aggregate 30-minute candles to requested interval if needed
      if (interval !== '30m' && filteredCandles.length > 0) {
        filteredCandles = aggregateCandles(filteredCandles, interval);
        console.log(`📊 Aggregated ${ohlcCandles.length} 30m candles → ${filteredCandles.length} ${interval} candles`);
      }
      
      if (filteredCandles.length > 0) {
        candles = filteredCandles;
        console.log(`✅ CoinGecko OHLC succeeded: ${candles.length} ${interval} candles`);
        } else {
          throw new Error('CoinGecko OHLC returned no candles in requested range');
        }
        } catch (ohlcError) {
        console.error('CoinGecko OHLC failed, trying CoinGecko market_chart (old method):', ohlcError);
        // Fallback to CoinGecko market_chart (will aggregate price points into candles)
          try {
            console.log(`📡 Fetching from CoinGecko market_chart and aggregating into ${interval} candles...`);
            candles = await fetchCoinGeckoCandles(symbol, startTime, endTime, interval);
          } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        console.error('CoinGecko API also failed:', fallbackError);
        
        // If skipAPIFetch or historical period, use file data and return early
        if (skipAPIFetch || isHistoricalPeriod) {
          if (allCandles.length > 0) {
            // Deduplicate and sort allCandles to ensure we have all candles from files
            candles = Array.from(
              new Map(allCandles.map(c => [c.timestamp, c])).values()
            ).sort((a, b) => a.timestamp - b.timestamp);
            console.log(`ℹ️ Using file data only (${candles.length} candles after dedup) - skipping all API fallbacks`);
          } else {
            throw new Error(`No file data available and API fetch is disabled (skipAPIFetch=${skipAPIFetch}, isHistorical=${isHistoricalPeriod})`);
          }
        } else {
      
        // NO SYNTHETIC DATA - Only use real API data
        // If CoinGecko doesn't have the data, we fail gracefully
        // This ensures we never trade on fake/synthetic data
        if (fallbackMessage.includes('no price data') || fallbackMessage.includes('no price points') || fallbackMessage.includes('0 candles')) {
          console.error(`❌ CoinGecko doesn't have ${interval} data for this period - cannot create synthetic data for trading`);
          console.error(`   Missing data range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
          // Don't create synthetic data - fail gracefully
          // Last resort: try CryptoCompare if we haven't already
          if (!candles || candles.length === 0) {
            try {
              const { fetchCryptoCompareCandles } = await import('./cryptocompare-service');
              console.log(`📡 Last resort: Trying CryptoCompare API...`);
              candles = await fetchCryptoCompareCandles(symbol, timeframe, startTime, endTime);
              if (candles.length > 0) {
                console.log(`✅ CryptoCompare succeeded: ${candles.length} ${interval} candles`);
              }
            } catch (cryptoCompareError2) {
              console.error('CryptoCompare also failed:', cryptoCompareError2);
            }
          }
          
          if (!candles || candles.length === 0) {
            throw new Error(`No real API data available for ${interval} candles in requested range - cannot use synthetic data for trading`);
          }
        }
        
        // NO SYNTHETIC DATA - Only use real API data
        // If all APIs fail, return what we have from files (real data only)
        console.error(`❌ All APIs failed - cannot fetch real ${interval} candles`);
        console.error(`   Missing data range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
        console.error(`   Will use existing file data only - NO SYNTHETIC DATA will be created`);
        
        // Return existing file data if we have it (real data only)
        if (allCandles.length > 0) {
          console.warn(`⚠️ Returning ${allCandles.length} candles from files (incomplete range - missing API data)`);
          const uniqueCandles = Array.from(
            new Map(allCandles.map(c => [c.timestamp, c])).values()
          ).sort((a, b) => a.timestamp - b.timestamp);
          return uniqueCandles;
        }
        
        throw new Error(`No real API data available and no file data - cannot proceed without real data`);
          }
        }
      }
      }
    }
  }
  
  // Merge API data with file data
  // Always start with file data (allCandles) as the base, then merge in API data
  // This ensures we preserve all candles from files, even if API doesn't return them
  if (allCandles.length > 0) {
    const existingMap = new Map(allCandles.map(c => [c.timestamp, c]));
    const fileCandleCount = existingMap.size;
    // Merge in API data (API data overwrites file data for same timestamps)
    if (candles.length > 0) {
      candles.forEach(c => {
        existingMap.set(c.timestamp, c); // API data overwrites file data
      });
    }
    candles = Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    const has0800 = candles.some(c => new Date(c.timestamp).toISOString() === '2025-12-31T08:00:00.000Z');
    console.log(`📊 After merge: ${candles.length} candles (${fileCandleCount} from files, ${candles.length - fileCandleCount} from API), Has 08:00? ${has0800}`);
  } else if (candles.length > 0) {
    // No API data, but we have file data
    // Use allCandles directly (already deduplicated and sorted from file loading)
    candles = Array.from(
      new Map(allCandles.map(c => [c.timestamp, c])).values()
    ).sort((a, b) => a.timestamp - b.timestamp);
    
    // Debug: log what we're returning from file data only
    if (candles.length > 0) {
      const first = candles[0]!;
      const last = candles[candles.length - 1]!;
      console.log(`📤 Returning ${candles.length} candles from file data only: ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}`);
      console.log(`📊 Requested range: ${new Date(startTime).toISOString()} to ${new Date(actualEndTime).toISOString()}`);
    }
  }

  // 4. Save to Redis only (file writes handled by GitHub Actions workflow)
  // Note: File writes are handled by GitHub Actions workflow (migrate-redis-candles.yml)
  // This keeps Vercel serverless deployments clean (no EROFS errors)

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
    let candles: PriceCandle[] = [];
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        candles = JSON.parse(cached) as PriceCandle[];
      }
    } catch (error) {
      // Cache read failed - start with empty array
      console.warn('Failed to read today candle from cache, creating new:', error);
    }
    
    // For daily candles, find or create today's candle
    // For hourly candles, find or create the current hour's candle
    // For 8h candles, find or create the current 8h period's candle
    // For 12h candles, find or create the current 12h period's candle
    let targetTimestamp: number;
    if (interval === '1d') {
      targetTimestamp = todayStart; // Start of day
    } else if (interval === '1h') {
      // Round to current hour start
      const currentHour = new Date(now);
      currentHour.setUTCMinutes(0, 0, 0);
      targetTimestamp = currentHour.getTime();
    } else if (interval === '8h') {
      // Round to current 8-hour period start (00:00, 08:00, or 16:00)
      const current8h = new Date(now);
      const hours = current8h.getUTCHours();
      const period = Math.floor(hours / 8); // 0, 1, or 2
      current8h.setUTCHours(period * 8, 0, 0, 0);
      targetTimestamp = current8h.getTime();
    } else if (interval === '12h') {
      // Round to current 12-hour period start (00:00 or 12:00)
      const current12h = new Date(now);
      const hours = current12h.getUTCHours();
      const period = Math.floor(hours / 12); // 0 or 1
      current12h.setUTCHours(period * 12, 0, 0, 0);
      targetTimestamp = current12h.getTime();
    } else if (interval === '5m') {
      // Round to current 5-minute period start
      const current5m = new Date(now);
      const minutes = current5m.getUTCMinutes();
      const roundedMinutes = Math.floor(minutes / 5) * 5;
      current5m.setUTCMinutes(roundedMinutes, 0, 0);
      targetTimestamp = current5m.getTime();
    } else {
      targetTimestamp = todayStart; // Default to start of day
    }
    
    const targetCandleIndex = candles.findIndex(c => {
      if (interval === '1d') {
        const candleDate = new Date(c.timestamp);
        candleDate.setUTCHours(0, 0, 0, 0);
        return candleDate.getTime() === targetTimestamp;
      } else if (interval === '1h') {
        // For hourly, match the exact hour timestamp
        const candleHour = new Date(c.timestamp);
        candleHour.setUTCMinutes(0, 0, 0);
        return candleHour.getTime() === targetTimestamp;
      } else if (interval === '8h') {
        // For 8-hour, match the exact 8-hour period timestamp
        const candle8h = new Date(c.timestamp);
        const hours = candle8h.getUTCHours();
        const period = Math.floor(hours / 8);
        candle8h.setUTCHours(period * 8, 0, 0, 0);
        return candle8h.getTime() === targetTimestamp;
      } else if (interval === '12h') {
        // For 12-hour, match the exact 12-hour period timestamp
        const candle12h = new Date(c.timestamp);
        const hours = candle12h.getUTCHours();
        const period = Math.floor(hours / 12);
        candle12h.setUTCHours(period * 12, 0, 0, 0);
        return candle12h.getTime() === targetTimestamp;
      } else if (interval === '5m') {
        // For 5-minute, match the exact 5-minute period timestamp
        const candle5m = new Date(c.timestamp);
        const minutes = candle5m.getUTCMinutes();
        const roundedMinutes = Math.floor(minutes / 5) * 5;
        candle5m.setUTCMinutes(roundedMinutes, 0, 0);
        return candle5m.getTime() === targetTimestamp;
      }
      return c.timestamp === targetTimestamp;
    });
    
    if (targetCandleIndex >= 0) {
      // Update existing candle with new price point (REAL DATA - aggregating actual prices)
      const targetCandle = candles[targetCandleIndex]!;
      // Update close (latest price in this period)
      targetCandle.close = price;
      // Update high/low (tracking actual price movement over time)
      targetCandle.high = Math.max(targetCandle.high, price);
      targetCandle.low = Math.min(targetCandle.low, price);
      // Keep original open price (first price in the period)
      if (!targetCandle.open || targetCandle.open === 0) {
        targetCandle.open = price;
      }
    } else {
      // Add new candle for this period (day or hour)
      // This is REAL data - we're starting a new candle with the first price point
      candles.push({
        timestamp: targetTimestamp,
        open: price, // First price in this period
        high: price,  // Will be updated as we get more prices
        low: price,   // Will be updated as we get more prices
        close: price, // Latest price
        volume: 0,
      });
    }
    
    // Sort by timestamp and update cache (CRITICAL: This must succeed)
    candles.sort((a, b) => a.timestamp - b.timestamp);
    await redis.setEx(cacheKey, 86400, JSON.stringify(candles));
    const periodLabel = interval === '1h' ? 'hour' 
      : interval === '8h' ? '8-hour' 
      : interval === '12h' ? '12-hour'
      : interval === '5m' ? '5-minute' 
      : 'day';
    console.log(`✅ Updated ${periodLabel}'s candle in Redis (close: $${price.toFixed(2)}, timestamp: ${new Date(targetTimestamp).toISOString()})`);
    
    // Note: File writes are handled by GitHub Actions workflow (migrate-redis-candles.yml)
    // This keeps Vercel serverless deployments clean (no EROFS errors)
  } catch (error) {
    // Non-critical - log but don't throw
    console.warn(`Failed to update candle in Redis:`, error);
  }
}

/**
 * Fetch latest price for ETH/USDC with retry logic and rate limit handling
 */
async function fetchPriceWithRetry(
  url: string,
  headers: HeadersInit,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  parsePrice?: (data: unknown) => number,
  apiName: string = 'API'
): Promise<number> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Starting retry attempt ${attempt + 1}/${maxRetries}...`);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          return parseFloat(data.price || data.ethereum?.usd || '0');
        } else if (response.status === 429 || response.status === 451) {
          // Rate limited - wait and retry with longer delays for 451
          const retryAfter = response.headers.get('Retry-After');
          // For 451 (often more restrictive), use longer delays
          const baseDelayForStatus = response.status === 451 ? baseDelay * 2 : baseDelay;
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelayForStatus * Math.pow(2, attempt);
          
          if (attempt < maxRetries - 1) {
            console.log(`⏳ ${apiName} rate limited (${response.status}), retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // This will go to the next iteration of the for loop
          } else {
            // This is the last attempt - log it before throwing
            console.log(`⏳ ${apiName} rate limited (${response.status}) on final attempt (${attempt + 1}/${maxRetries}) - giving up`);
            throw new Error(`Rate limited (${response.status}) after ${maxRetries} attempts - will use cached price if available`);
          }
        } else {
          throw new Error(`API returned ${response.status}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          if (attempt < maxRetries - 1) {
            console.log(`⏳ Request timeout, retrying...`);
            await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
            continue;
          }
          throw new Error('Request timeout after retries');
        }
        throw fetchError;
      }
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw new Error('Failed after all retries');
}

/**
 * Fetch latest price for ETH/USDC and update historical data
 * Includes retry logic for rate limits and fallback to cached price
 */
export async function fetchLatestPrice(symbol: string = 'ETHUSDT'): Promise<number> {
  let price: number;
  
  // Try to get cached price first (in case APIs are rate limited)
  try {
    await ensureConnected();
    const cacheKey = `eth:price:latest:${symbol}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const cachedPrice = parseFloat(cached);
      if (cachedPrice > 0) {
        console.log(`📦 Using cached price: $${cachedPrice.toFixed(2)} (APIs may be rate limited)`);
        // Still try to fetch fresh price in background, but return cached
        fetchLatestPriceFresh(symbol).catch(() => {}); // Fire and forget
        return cachedPrice;
      }
    }
  } catch {
    // Cache read failed - continue to fetch
  }
  
  // Try to fetch fresh price
  try {
    price = await fetchLatestPriceFresh(symbol);
    
    // Cache the price for 5 minutes (in case of future rate limits)
    try {
      await ensureConnected();
      const cacheKey = `eth:price:latest:${symbol}`;
      await redis.setEx(cacheKey, 300, String(price)); // 5 minute cache
    } catch {
      // Cache write failed - non-critical
    }
    
    // Update historical data with latest price (non-blocking)
    // Update daily, hourly, 8-hour, 12-hour, and 5-minute candles
    // This builds real candle data from actual price points (not synthetic)
    updateTodayCandle(symbol, price, '1d').catch(err => {
      console.warn('Failed to update daily candle with latest price:', err);
    });
    updateTodayCandle(symbol, price, '1h').catch(err => {
      console.warn('Failed to update hourly candle with latest price:', err);
    });
    updateTodayCandle(symbol, price, '8h').catch(err => {
      console.warn('Failed to update 8-hour candle with latest price:', err);
    });
    updateTodayCandle(symbol, price, '12h').catch(err => {
      console.warn('Failed to update 12-hour candle with latest price:', err);
    });
    updateTodayCandle(symbol, price, '5m').catch(err => {
      console.warn('Failed to update 5-minute candle with latest price:', err);
    });
    
    return price;
  } catch (error) {
    // Log rate limit errors at a lower level (they're expected and handled gracefully)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Rate limited') || errorMessage.includes('451') || errorMessage.includes('429')) {
      console.log(`ℹ️ API rate limited, using cached price: ${errorMessage}`);
    } else {
      console.error('Failed to fetch fresh price, trying cached price:', error);
    }
    
    // Last resort: try cached price
    try {
      await ensureConnected();
      const cacheKey = `eth:price:latest:${symbol}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedPrice = parseFloat(cached);
        if (cachedPrice > 0) {
          console.warn(`⚠️ Using stale cached price: $${cachedPrice.toFixed(2)} (APIs rate limited)`);
          // Still try to update today's candles with cached price
          updateTodayCandle(symbol, cachedPrice, '1d').catch(() => {});
          updateTodayCandle(symbol, cachedPrice, '1h').catch(() => {});
          updateTodayCandle(symbol, cachedPrice, '8h').catch(() => {});
          updateTodayCandle(symbol, cachedPrice, '12h').catch(() => {});
          updateTodayCandle(symbol, cachedPrice, '5m').catch(() => {});
          return cachedPrice;
        }
      }
    } catch {
      // Cache read failed
    }
    
    throw new Error('Failed to fetch latest price from APIs and no cached price available');
  }
}

/**
 * Fetch latest price from APIs (internal, with retry logic)
 */
async function fetchLatestPriceFresh(symbol: string = 'ETHUSDT'): Promise<number> {
  // Try Binance first with retry
  try {
    console.log('📡 Trying Binance API...');
    const url = `${BINANCE_API_URL}/ticker/price?symbol=${symbol}`;
    const price = await fetchPriceWithRetry(url, {}, 3, 1000, undefined, 'Binance');
    console.log(`✅ Binance API succeeded: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    // Only log non-rate-limit errors at error level (rate limits are expected and handled gracefully)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Rate limited') || errorMessage.includes('451') || errorMessage.includes('429')) {
      console.log(`ℹ️ Binance rate limited, trying CoinGecko...`);
    } else if (!errorMessage.includes('Rate limited') && !errorMessage.includes('451') && !errorMessage.includes('429')) {
      console.error('Binance price fetch failed:', error);
    }
    
    // Fallback to CoinGecko with retry
    try {
      console.log('📡 Trying CoinGecko API...');
      const coinId = 'ethereum';
      const url = `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd`;
      const apiKey = process.env.COINGECKO_API_KEY;
      const headers: HeadersInit = {};
      if (apiKey) {
        headers['x-cg-demo-api-key'] = apiKey;
      }
      
      const price = await fetchPriceWithRetry(url, headers, 3, 2000, undefined, 'CoinGecko');
      if (!price || price === 0) {
        throw new Error('CoinGecko returned invalid price');
      }
      console.log(`✅ CoinGecko API succeeded: $${price.toFixed(2)}`);
      return price;
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      if (fallbackMessage.includes('Rate limited') || fallbackMessage.includes('451') || fallbackMessage.includes('429')) {
        console.log(`ℹ️ CoinGecko rate limited, trying Coinbase...`);
      } else if (!fallbackMessage.includes('Rate limited') && !fallbackMessage.includes('451') && !fallbackMessage.includes('429')) {
        console.error('CoinGecko price fetch failed:', fallbackError);
      }
      // Third fallback: Coinbase (public API, no key required)
      try {
        console.log('📡 Trying Coinbase API (third backup)...');
        const url = `${COINBASE_API_URL}/exchange-rates?currency=ETH`;
        
        // Coinbase returns data in format: { data: { rates: { USD: "2933.32" } } }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            const price = parseFloat(data.data?.rates?.USD);
            if (price && price > 0) {
              console.log(`✅ Coinbase API succeeded: $${price.toFixed(2)}`);
              return price;
            }
          }
          throw new Error(`Coinbase returned ${response.status}`);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Coinbase request timeout');
          }
          throw fetchError;
        }
      } catch (coinbaseError) {
        const coinbaseMessage = coinbaseError instanceof Error ? coinbaseError.message : String(coinbaseError);
        // Only log non-rate-limit errors at error level
        if (!coinbaseMessage.includes('Rate limited') && !coinbaseMessage.includes('451') && !coinbaseMessage.includes('429')) {
          console.error('Coinbase price fetch failed:', coinbaseError);
        }
        throw new Error('Failed to fetch latest price from all APIs (Binance, CoinGecko, Coinbase)');
      }
    }
  }
  
  // This code is unreachable - all successful paths return early
  // TypeScript requires a return statement, but this should never execute
  throw new Error('Unexpected: fetchLatestPriceFresh reached unreachable code');
}

