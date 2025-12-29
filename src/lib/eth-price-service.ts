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
const lastCoinbaseCall = 0;
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
  
  // Free tier typically allows ~90 days, but let's use 60 days to be safe
  const MAX_DAYS_PER_REQUEST = 60;
  const MAX_SECONDS_PER_REQUEST = MAX_DAYS_PER_REQUEST * 24 * 60 * 60;
  
  const allPricePoints: Array<{ timestamp: number; price: number }> = [];
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
    // Timestamp is in milliseconds (not seconds like some endpoints)
    const prices = data.prices || [];
    
    if (prices.length === 0) {
      console.warn(`⚠️ CoinGecko returned no price data for range ${new Date(currentStart * 1000).toISOString()} to ${new Date(currentEnd * 1000).toISOString()}`);
    } else {
      console.log(`📊 CoinGecko returned ${prices.length} price points for this chunk`);
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
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s delay between chunks
    }
  }
  
  // Check if we got any price points
  if (allPricePoints.length === 0) {
    console.warn(`⚠️ CoinGecko returned no price points for range ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
    console.warn(`   CoinGecko free tier may not provide hourly/intraday data for very recent periods`);
    throw new Error('CoinGecko returned no price points - may not support hourly data for recent periods');
  }
  
  // Sort price points by timestamp
  allPricePoints.sort((a, b) => a.timestamp - b.timestamp);
  
  // Aggregate price points into candles based on interval
  const intervalMs = interval === '5m' ? 5 * 60 * 1000 :
                     interval === '1h' ? 60 * 60 * 1000 : 
                     interval === '1d' ? 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000; // Default to 1d
  
  const candles: PriceCandle[] = [];
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
  
  console.log(`📊 Aggregated ${allPricePoints.length} CoinGecko price points into ${aggregatedCandles.length} ${interval} candles`);
  
  if (aggregatedCandles.length === 0) {
    throw new Error('CoinGecko aggregation resulted in 0 candles - may not support hourly data for recent periods');
  }
  
  return aggregatedCandles;
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
  endDate: string,
  currentPrice?: number // Optional: if provided, use this for today's candle instead of fetching
): Promise<PriceCandle[]> {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const now = Date.now();
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
      
      // Always check for today's candle if endDate includes today
      if (endTime >= todayStart) {
        const cacheKey = getCacheKey(symbol, interval, todayStart, todayEnd);
        const cached = await redis.get(cacheKey);
        let todayCandle: PriceCandle | null = null;
        
        if (cached) {
          const cachedCandles = JSON.parse(cached) as PriceCandle[];
          // Find today's candle in cache
          todayCandle = cachedCandles.find(c => {
            const candleDate = new Date(c.timestamp);
            candleDate.setUTCHours(0, 0, 0, 0);
            return candleDate.getTime() === todayStart;
          }) || null;
          
          // Check if the cached candle is synthetic (all OHLC values are the same, volume is 0)
          // If so, we should try to fetch the real candle from API
          if (todayCandle && 
              todayCandle.open === todayCandle.high && 
              todayCandle.high === todayCandle.low && 
              todayCandle.low === todayCandle.close && 
              todayCandle.volume === 0) {
            console.log(`⚠️ Found synthetic candle in cache (OHLC all $${todayCandle.close.toFixed(2)}), will try to fetch real candle from API`);
            todayCandle = null; // Treat as missing so we fetch from API
          }
        }
        
        // If not in Redis (or synthetic), try to fetch today's candle from API first (has real OHLC data)
        // Then fall back to creating from currentPrice if API doesn't have it yet
        if (!todayCandle) {
          // Try to fetch today's candle from Binance API (has real OHLC, not just close price)
          try {
            console.log(`📡 Fetching today's candle from Binance API...`);
            const apiCandles = await fetchBinanceCandles(symbol, interval, todayStart, now);
            const apiTodayCandle = apiCandles.find(c => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart;
            });
            
            if (apiTodayCandle) {
              todayCandle = apiTodayCandle;
              console.log(`✅ Fetched today's candle from API (OHLC: O=$${apiTodayCandle.open.toFixed(2)}, H=$${apiTodayCandle.high.toFixed(2)}, L=$${apiTodayCandle.low.toFixed(2)}, C=$${apiTodayCandle.close.toFixed(2)})`);
              
              // Save to Redis for future use
              try {
                await redis.setEx(cacheKey, 86400, JSON.stringify([todayCandle]));
              } catch (redisError) {
                console.warn('Failed to save today candle to Redis:', redisError);
              }
            }
          } catch (apiError) {
            console.log(`⚠️ Could not fetch today's candle from API, will create from current price:`, apiError instanceof Error ? apiError.message : apiError);
          }
          
          // If API didn't have it, create from currentPrice (if provided) or fetch latest price
          if (!todayCandle) {
            let priceToUse: number | null = null;
            
            // Use provided currentPrice if available (avoids redundant API call)
            if (currentPrice !== undefined && currentPrice > 0) {
              priceToUse = currentPrice;
              console.log(`📅 Using provided current price for today's candle: $${priceToUse.toFixed(2)}`);
            } else {
              // Fallback: fetch latest price
              try {
                priceToUse = await fetchLatestPrice(symbol);
                // Wait a bit for updateTodayCandle to complete
                await new Promise(resolve => setTimeout(resolve, 300));
                // Try Redis again after fetch
                const retryCached = await redis.get(cacheKey);
                if (retryCached) {
                  const retryCandles = JSON.parse(retryCached) as PriceCandle[];
                  todayCandle = retryCandles.find(c => {
                    const candleDate = new Date(c.timestamp);
                    candleDate.setUTCHours(0, 0, 0, 0);
                    return candleDate.getTime() === todayStart;
                  }) || null;
                }
              } catch (priceError) {
                console.warn('Failed to fetch latest price for today candle:', priceError);
              }
            }
            
            // NO SYNTHETIC DATA - If we can't get real OHLC from API, we don't create a candle
            // This ensures we only trade on real data
            if (!todayCandle && priceToUse !== null) {
              console.warn(`⚠️ Cannot create synthetic candle - only real API OHLC data allowed for trading`);
              console.warn(`   Need real candle from API with proper OHLC values, not just a price`);
              // Don't create synthetic candle - the system will work with whatever real data we have
            }
          }
        }
        
        if (todayCandle) {
          // Merge today's candle (overwrite if exists, add if not)
          const existingIndex = uniqueCandles.findIndex(c => {
            const candleDate = new Date(c.timestamp);
            candleDate.setUTCHours(0, 0, 0, 0);
            return candleDate.getTime() === todayStart;
          });
          
          if (existingIndex >= 0) {
            // Always update with Redis/cached data (it's more recent)
            uniqueCandles[existingIndex] = todayCandle;
            console.log(`🔄 Merged today's candle from Redis/latest price (close: $${todayCandle.close.toFixed(2)})`);
          } else {
            // Add new candle
            uniqueCandles.push(todayCandle);
            console.log(`➕ Added today's candle from Redis/latest price (close: $${todayCandle.close.toFixed(2)})`);
          }
          
          // Re-sort after adding/updating
          uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
        } else {
          console.warn(`⚠️ Could not create today's candle (key: ${cacheKey})`);
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
    } else if (timeframe === '1d') {
      expectedInterval = 24 * 60 * 60 * 1000; // 1 day in ms
    } else {
      expectedInterval = 24 * 60 * 60 * 1000; // Default to 1 day
    }
    let hasCompleteCoverage = false;
    
    if (uniqueCandles.length > 0 && endTime >= startTime) {
      // Get candles that are in the requested range
      const candlesInRange = uniqueCandles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
      
      if (candlesInRange.length === 0) {
        hasCompleteCoverage = false; // No candles in the requested range
        console.log(`⚠️ No candles in requested range (${new Date(startTime).toISOString().split('T')[0]} to ${new Date(endTime).toISOString().split('T')[0]})`);
      } else {
        // Calculate how many intervals are in the requested range
        const intervalsInRange = Math.ceil((endTime - startTime) / expectedInterval) + 1;
        
        // For hourly candles, we need one candle per hour
        // For daily candles, we need one candle per day
        const sortedInRange = [...candlesInRange].sort((a, b) => a.timestamp - b.timestamp);
        const uniqueIntervals = new Set<number>();
        
        sortedInRange.forEach(c => {
          // Round to the nearest interval start
          const intervalStart = Math.floor(c.timestamp / expectedInterval) * expectedInterval;
          uniqueIntervals.add(intervalStart);
        });
        
        // We have complete coverage if we have candles for all intervals in the range
        hasCompleteCoverage = uniqueIntervals.size >= intervalsInRange;
        
        const intervalLabel = timeframe === '1h' ? 'hours' : timeframe === '1d' ? 'days' : 'intervals';
        console.log(`📊 Coverage check (${timeframe}): requested ${intervalsInRange} ${intervalLabel}, have ${uniqueIntervals.size} unique ${intervalLabel}, ${candlesInRange.length} total candles`);
        
        if (!hasCompleteCoverage) {
          console.log(`⚠️ Incomplete coverage: have ${uniqueIntervals.size} unique ${intervalLabel}, need ${intervalsInRange} ${intervalLabel} in range - will fetch from API`);
        }
      }
    } else {
      hasCompleteCoverage = false;
      console.log(`⚠️ Cannot check coverage: ${uniqueCandles.length} candles, range: ${new Date(startTime).toISOString().split('T')[0]} to ${new Date(endTime).toISOString().split('T')[0]}`);
    }
    
    // If we have enough data AND complete coverage, return early
    // Otherwise, we need to fetch from API to fill gaps
    if ((uniqueCandles.length >= 50 || uniqueCandles.some(c => c.timestamp >= startTime && c.timestamp <= endTime)) && hasCompleteCoverage) {
      console.log(`ℹ️ Using existing data: ${uniqueCandles.length} candles with complete coverage of requested range`);
      // Check if we have today's candle - if not, try to fetch it from API
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      
      if (endTime >= todayStart) {
        const todayCandleIndex = uniqueCandles.findIndex(c => {
          const candleDate = new Date(c.timestamp);
          candleDate.setUTCHours(0, 0, 0, 0);
          return candleDate.getTime() === todayStart;
        });
        
        const hasTodayCandle = todayCandleIndex >= 0;
        const todayCandle = hasTodayCandle ? uniqueCandles[todayCandleIndex]! : null;
        
        // Check if today's candle is synthetic (all OHLC values are the same, volume is 0)
        const isSynthetic = todayCandle && 
          todayCandle.open === todayCandle.high && 
          todayCandle.high === todayCandle.low && 
          todayCandle.low === todayCandle.close && 
          todayCandle.volume === 0;
        
        if (!hasTodayCandle || isSynthetic) {
          // Don't have today's candle, or it's synthetic - try to fetch real one from API
          try {
            if (isSynthetic) {
              console.log(`📡 Today's candle is synthetic (OHLC all $${todayCandle!.close.toFixed(2)}), fetching real candle from API...`);
            } else {
              console.log('📡 Fetching today\'s candle from API (not in file data)...');
            }
            const todayCandles = await fetchBinanceCandles(symbol, interval, todayStart, Date.now());
            const apiTodayCandle = todayCandles.find(c => {
              const candleDate = new Date(c.timestamp);
              candleDate.setUTCHours(0, 0, 0, 0);
              return candleDate.getTime() === todayStart;
            });
            
            if (apiTodayCandle) {
              if (hasTodayCandle && isSynthetic) {
                // Replace synthetic candle with real one
                uniqueCandles[todayCandleIndex] = apiTodayCandle;
                console.log(`✅ Replaced synthetic candle with real API candle (OHLC: O=$${apiTodayCandle.open.toFixed(2)}, H=$${apiTodayCandle.high.toFixed(2)}, L=$${apiTodayCandle.low.toFixed(2)}, C=$${apiTodayCandle.close.toFixed(2)})`);
              } else {
                // Add new candle
                uniqueCandles.push(apiTodayCandle);
                console.log(`✅ Added today's candle from API (close: $${apiTodayCandle.close.toFixed(2)})`);
              }
              uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
              
              // Also save to Redis
              try {
                await ensureConnected();
                const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
                const cacheKey = getCacheKey(symbol, interval, todayStart, todayEnd);
                await redis.setEx(cacheKey, 86400, JSON.stringify([apiTodayCandle]));
              } catch (redisError) {
                console.warn('Failed to save real candle to Redis:', redisError);
              }
            }
          } catch (apiError) {
            console.warn('Could not fetch today candle from API:', apiError instanceof Error ? apiError.message : apiError);
          }
        }
      }
      
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
  // Special case: Always try to fetch today's candle from API if endDate includes today
  // This ensures we have the most up-to-date OHLC data for today
  let candles: PriceCandle[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const shouldFetchToday = endTime >= todayStart;

  try {
    // If we need today's candle, try fetching it specifically first
    if (shouldFetchToday && allCandles.length > 0) {
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
    
    if (allCandles.length < 50 || !allCandles.some(c => c.timestamp >= startTime && c.timestamp <= endTime) || !hasCompleteCoverage) {
      console.log(`📡 Fetching from API: need to fill gaps (have ${allCandles.length} candles, coverage: ${hasCompleteCoverage ? 'complete' : 'incomplete'})`);
      // Try Binance first
      candles = await fetchBinanceCandles(symbol, interval, startTime, endTime);
    } else {
      console.log(`ℹ️ Using existing data: ${allCandles.length} candles with complete coverage`);
    }
  } catch (error) {
    console.error('Binance API failed, trying CoinGecko:', error);
    // Fallback to CoinGecko (will aggregate price points into candles)
    try {
      console.log(`📡 Fetching from CoinGecko and aggregating into ${interval} candles...`);
      candles = await fetchCoinGeckoCandles(symbol, startTime, endTime, interval);
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error('CoinGecko API also failed:', fallbackError);
      
      // NO SYNTHETIC DATA - Only use real API data
      // If CoinGecko doesn't have the data, we fail gracefully
      // This ensures we never trade on fake/synthetic data
      if (fallbackMessage.includes('no price data') || fallbackMessage.includes('no price points') || fallbackMessage.includes('0 candles')) {
        console.error(`❌ CoinGecko doesn't have ${interval} data for this period - cannot create synthetic data for trading`);
        console.error(`   Missing data range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
        // Don't create synthetic data - fail gracefully
        throw new Error(`No real API data available for ${interval} candles in requested range - cannot use synthetic data for trading`);
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
    let candles: PriceCandle[] = [];
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        candles = JSON.parse(cached) as PriceCandle[];
      }
    } catch (cacheError) {
      // Cache read failed - start with empty array
      console.warn('Failed to read today candle from cache, creating new:', cacheError);
    }
    
    // For daily candles, find or create today's candle
    // For hourly candles, find or create the current hour's candle
    let targetTimestamp: number;
    if (interval === '1d') {
      targetTimestamp = todayStart; // Start of day
    } else if (interval === '1h') {
      // Round to current hour start
      const currentHour = new Date(now);
      currentHour.setUTCMinutes(0, 0, 0);
      targetTimestamp = currentHour.getTime();
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
    const periodLabel = interval === '1h' ? 'hour' : 'day';
    console.log(`✅ Updated ${periodLabel}'s candle in Redis (close: $${price.toFixed(2)}, timestamp: ${new Date(targetTimestamp).toISOString()})`);
    
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
        // Find the candle for the target period (day or hour)
        const fileCandleIndex = existingFileData.findIndex(c => {
          if (interval === '1d') {
            const candleDate = new Date(c.timestamp);
            candleDate.setUTCHours(0, 0, 0, 0);
            return candleDate.getTime() === targetTimestamp;
          } else if (interval === '1h') {
            const candleHour = new Date(c.timestamp);
            candleHour.setUTCMinutes(0, 0, 0);
            return candleHour.getTime() === targetTimestamp;
          } else if (interval === '5m') {
            const candle5m = new Date(c.timestamp);
            const minutes = candle5m.getUTCMinutes();
            const roundedMinutes = Math.floor(minutes / 5) * 5;
            candle5m.setUTCMinutes(roundedMinutes, 0, 0);
            return candle5m.getTime() === targetTimestamp;
          }
          return c.timestamp === targetTimestamp;
        });
        
        if (fileCandleIndex >= 0) {
          // Update existing candle with new price point (REAL DATA - aggregating actual prices)
          existingFileData[fileCandleIndex].close = price;
          existingFileData[fileCandleIndex].high = Math.max(existingFileData[fileCandleIndex].high, price);
          existingFileData[fileCandleIndex].low = Math.min(existingFileData[fileCandleIndex].low, price);
        } else {
          // Add new candle for this period
          existingFileData.push({
            timestamp: targetTimestamp,
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
  } catch (cacheError) {
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
    } catch (cacheError) {
      // Cache write failed - non-critical
    }
    
    // Update historical data with latest price (non-blocking)
    // Update daily, hourly, and 5-minute candles
    // This builds real candle data from actual price points (not synthetic)
    updateTodayCandle(symbol, price, '1d').catch(err => {
      console.warn('Failed to update daily candle with latest price:', err);
    });
    updateTodayCandle(symbol, price, '1h').catch(err => {
      console.warn('Failed to update hourly candle with latest price:', err);
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
          // Still try to update today's candle with cached price
          updateTodayCandle(symbol, cachedPrice, '1d').catch(() => {});
          return cachedPrice;
        }
      }
    } catch (cacheError) {
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

