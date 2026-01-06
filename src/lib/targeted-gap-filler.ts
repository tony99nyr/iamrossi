/**
 * Targeted Gap Filler
 * Fetches only the specific missing candles instead of entire date ranges
 */

import type { PriceCandle } from '@/types';
import { getHistoricalDataPath, loadCandlesFromFile, saveCandlesToFile, deduplicateCandles } from './historical-file-utils';
import { redis, ensureConnected } from './kv';
import { getAssetFromSymbol, getPriceCachePrefix } from './asset-config';
import { fixOHLCRelationships } from './historical-file-utils';

/**
 * Map timeframe to Binance interval format
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
 * Align timestamp to period boundary for period-based timeframes
 * This ensures consistency with gap detection logic
 */
function alignTimestampToPeriod(timestamp: number, timeframe: string): number {
  const date = new Date(timestamp);
  
  if (timeframe === '8h') {
    const hours = date.getUTCHours();
    const period = Math.floor(hours / 8);
    date.setUTCHours(period * 8, 0, 0, 0);
    date.setUTCMinutes(0, 0, 0);
    date.setUTCSeconds(0, 0);
    date.setUTCMilliseconds(0);
    return date.getTime();
  } else if (timeframe === '12h') {
    const hours = date.getUTCHours();
    const period = Math.floor(hours / 12);
    date.setUTCHours(period * 12, 0, 0, 0);
    date.setUTCMinutes(0, 0, 0);
    date.setUTCSeconds(0, 0);
    date.setUTCMilliseconds(0);
    return date.getTime();
  } else if (timeframe === '1d') {
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCMinutes(0, 0, 0);
    date.setUTCSeconds(0, 0);
    date.setUTCMilliseconds(0);
    return date.getTime();
  }
  
  // For other timeframes, return as-is
  return timestamp;
}

/**
 * Fetch candles from Binance API with retry logic
 */
async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
  maxRetries: number = 3
): Promise<PriceCandle[]> {
  const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`🔄 Retrying Binance API fetch (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const url = new URL(`${BINANCE_API_URL}/klines`);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', interval);
      url.searchParams.set('startTime', String(startTime));
      url.searchParams.set('endTime', String(endTime));
      url.searchParams.set('limit', '1000');

      const response = await fetch(url.toString());
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Binance API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
        }
        // Retry on 5xx errors (server errors)
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (attempt === maxRetries - 1) {
        // Last attempt failed
        throw new Error(`Failed to fetch from Binance API after ${maxRetries} attempts: ${errorMsg}`);
      }
      // Continue to retry
    }
  }
  
  throw new Error(`Failed to fetch from Binance API after ${maxRetries} attempts`);
}


/**
 * Fetch only the specific missing candles from the API
 * This is much more efficient than fetching entire date ranges
 * 
 * @param symbol - Trading symbol (e.g., 'ETHUSDT')
 * @param timeframe - Timeframe (e.g., '8h')
 * @param missingTimestamps - Array of expected timestamps for missing candles
 * @returns Array of fetched candles (may be fewer than requested if API doesn't have them)
 */
export async function fetchMissingCandles(
  symbol: string,
  timeframe: string,
  missingTimestamps: number[]
): Promise<PriceCandle[]> {
  if (missingTimestamps.length === 0) {
    return [];
  }

  const interval = mapTimeframeToInterval(timeframe);
  const intervalMs = timeframe === '5m' ? 5 * 60 * 1000 :
                     timeframe === '1h' ? 60 * 60 * 1000 :
                     timeframe === '4h' ? 4 * 60 * 60 * 1000 :
                     timeframe === '8h' ? 8 * 60 * 60 * 1000 :
                     timeframe === '12h' ? 12 * 60 * 60 * 1000 :
                     timeframe === '1d' ? 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000;

  // Group consecutive missing candles into batches
  // This reduces API calls while still being targeted
  const batches: Array<{ start: number; end: number; timestamps: number[] }> = [];
  let currentBatch: { start: number; end: number; timestamps: number[] } | null = null;

  // Sort timestamps
  const sortedTimestamps = [...missingTimestamps].sort((a, b) => a - b);

  for (const timestamp of sortedTimestamps) {
    if (!currentBatch) {
      // Start new batch
      currentBatch = {
        start: timestamp,
        end: timestamp,
        timestamps: [timestamp],
      };
    } else {
      // Check if this timestamp is consecutive (within 2 intervals of the last one)
      const gap = timestamp - currentBatch.end;
      if (gap <= intervalMs * 2) {
        // Add to current batch
        currentBatch.end = timestamp;
        currentBatch.timestamps.push(timestamp);
      } else {
        // Start new batch
        batches.push(currentBatch);
        currentBatch = {
          start: timestamp,
          end: timestamp,
          timestamps: [timestamp],
        };
      }
    }
  }

  // Add the last batch
  if (currentBatch) {
    batches.push(currentBatch);
  }

  // Fetch each batch with retry logic and small buffer (1 interval before and after)
  const allFetchedCandles: PriceCandle[] = [];
  const maxBatchRetries = 3;

  for (const batch of batches) {
    let batchFetched = false;
    
    for (let batchAttempt = 0; batchAttempt < maxBatchRetries && !batchFetched; batchAttempt++) {
      try {
        if (batchAttempt > 0) {
          // Exponential backoff for batch retries
          const delay = Math.pow(2, batchAttempt - 1) * 1000;
          console.log(`🔄 Retrying batch fetch (attempt ${batchAttempt + 1}/${maxBatchRetries}) after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Add small buffer to ensure we get the candles we need
        // For 8h candles, we only need a small buffer (1 period) since CryptoCompare aggregates from hourly
        const bufferMs = timeframe === '8h' ? intervalMs : intervalMs;
        const fetchStart = batch.start - bufferMs;
        const fetchEnd = batch.end + bufferMs;

        console.log(`📡 Fetching ${batch.timestamps.length} missing ${timeframe} candles for ${symbol} (batch: ${new Date(batch.start).toISOString()} to ${new Date(batch.end).toISOString()})`);

        // For 8h candles, use CryptoCompare first (most reliable)
        // For other timeframes, use Binance
        let fetchedCandles: PriceCandle[] = [];
        if (timeframe === '8h') {
          try {
            const { fetchCryptoCompareCandles } = await import('./cryptocompare-service');
            fetchedCandles = await fetchCryptoCompareCandles(symbol, timeframe, fetchStart, fetchEnd);
          } catch {
            // CryptoCompare failed, fallback to Binance with retry
            console.log(`⚠️  CryptoCompare failed, trying Binance...`);
            fetchedCandles = await fetchBinanceCandles(symbol, interval, fetchStart, fetchEnd, maxBatchRetries);
          }
        } else {
          fetchedCandles = await fetchBinanceCandles(symbol, interval, fetchStart, fetchEnd, maxBatchRetries);
        }

        // Filter to only the candles we actually need (within the batch timestamps)
        // Use tolerance to match candles (candles might be slightly off due to API rounding)
        const tolerance = intervalMs * 0.1;
        let neededCandles = fetchedCandles.filter(c => {
          return batch.timestamps.some(needed => {
            const diff = Math.abs(c.timestamp - needed);
            return diff <= tolerance;
          });
        });

        // CRITICAL: For period-based timeframes (8h, 12h, 1d), align timestamps to period boundaries
        // This ensures consistency with gap detection logic
        if (timeframe === '8h' || timeframe === '12h' || timeframe === '1d') {
          neededCandles = neededCandles.map(candle => {
            const alignedTimestamp = alignTimestampToPeriod(candle.timestamp, timeframe);
            return {
              ...candle,
              timestamp: alignedTimestamp,
            };
          });
        }

        // Fix OHLC relationships to ensure data quality
        neededCandles = fixOHLCRelationships(neededCandles);

        if (neededCandles.length > 0) {
          console.log(`✅ Fetched ${neededCandles.length} of ${batch.timestamps.length} missing candles from API`);
          allFetchedCandles.push(...neededCandles);

          // CRITICAL: Persist to both Redis and files
          await persistFetchedCandles(symbol, interval, neededCandles);
          batchFetched = true; // Successfully fetched batch
        } else {
          // API returned no candles - might be a future period or data not available
          console.warn(`⚠️  API returned no candles for batch ${new Date(batch.start).toISOString()} to ${new Date(batch.end).toISOString()}`);
          // Don't retry if API returned empty (likely means data doesn't exist yet)
          batchFetched = true;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (batchAttempt === maxBatchRetries - 1) {
          // Last attempt failed
          console.error(`❌ Failed to fetch candles from API for batch ${new Date(batch.start).toISOString()} to ${new Date(batch.end).toISOString()} after ${maxBatchRetries} attempts: ${errorMsg}`);
        } else {
          console.warn(`⚠️  Failed to fetch candles from API for batch (attempt ${batchAttempt + 1}/${maxBatchRetries}): ${errorMsg}`);
        }
        // Continue to retry or move to next batch
      }
    }
  }

  return allFetchedCandles;
}

/**
 * Persist fetched candles to both Redis and files
 * This ensures data is available immediately (Redis) and permanently (files)
 */
async function persistFetchedCandles(
  symbol: string,
  interval: string,
  candles: PriceCandle[]
): Promise<void> {
  if (candles.length === 0) {
    return;
  }

  // Persist to files (permanent storage)
  try {
    const filePath = getHistoricalDataPath(symbol, interval);
    const existingCandles = await loadCandlesFromFile(filePath) || [];
    
    // Merge with existing candles (deduplicate by timestamp)
    const allCandles = [...existingCandles, ...candles];
    const mergedCandles = deduplicateCandles(allCandles);
    
    // Save merged candles back to file
    await saveCandlesToFile(filePath, mergedCandles);
    console.log(`💾 Saved ${candles.length} fetched candles to ${filePath}.gz`);
  } catch (saveError) {
    // File save failure is non-critical but log warning
    const errorMsg = saveError instanceof Error ? saveError.message : String(saveError);
    console.warn(`⚠️  Failed to save fetched candles to file: ${errorMsg}`);
  }

  // Persist to Redis (immediate availability)
  try {
    await ensureConnected();
    const asset = getAssetFromSymbol(symbol) || 'eth';
    const prefix = getPriceCachePrefix(asset);
    
    // Group candles by date range for Redis cache keys
    // Redis caches by date range, so we need to update the appropriate cache keys
    const candlesByDate = new Map<string, PriceCandle[]>();
    
    for (const candle of candles) {
      const candleDate = new Date(candle.timestamp);
      const dateStr = candleDate.toISOString().split('T')[0]!;
      
      if (!candlesByDate.has(dateStr)) {
        candlesByDate.set(dateStr, []);
      }
      candlesByDate.get(dateStr)!.push(candle);
    }
    
    // Update Redis cache for each date
    for (const [dateStr, dateCandles] of candlesByDate.entries()) {
      const dateStart = new Date(dateStr).getTime();
      const dateEnd = dateStart + 24 * 60 * 60 * 1000 - 1;
      const cacheKey = `${prefix}${symbol}:${interval}:${dateStart}:${dateEnd}`;
      
      try {
        // Get existing candles from cache
        const existingCached = await redis.get(cacheKey);
        let allCachedCandles: PriceCandle[] = existingCached ? JSON.parse(existingCached) : [];
        
        // Merge with fetched candles (deduplicate by timestamp)
        const candleMap = new Map<number, PriceCandle>();
        allCachedCandles.forEach(c => candleMap.set(c.timestamp, c));
        dateCandles.forEach(c => candleMap.set(c.timestamp, c));
        
        allCachedCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        
        // Update cache with 24 hour TTL
        await redis.setEx(cacheKey, 86400, JSON.stringify(allCachedCandles));
        console.log(`💾 Updated Redis cache for ${dateStr} with ${dateCandles.length} candles`);
      } catch (redisError) {
        // Redis update failure is non-critical but log warning
        const errorMsg = redisError instanceof Error ? redisError.message : String(redisError);
        console.warn(`⚠️  Failed to update Redis cache for ${dateStr}: ${errorMsg}`);
      }
    }
  } catch (redisError) {
    // Redis connection failure is non-critical but log warning
    const errorMsg = redisError instanceof Error ? redisError.message : String(redisError);
    console.warn(`⚠️  Failed to persist fetched candles to Redis: ${errorMsg}`);
  }
}

