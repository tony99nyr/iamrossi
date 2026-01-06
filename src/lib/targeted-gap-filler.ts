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
    // DEBUG: Log batch information
    console.log(`🔍 [DEBUG] Processing batch: ${batch.timestamps.length} timestamps`);
    console.log(`   batch.start: ${batch.start} (${new Date(batch.start).toISOString()})`);
    console.log(`   batch.end: ${batch.end} (${new Date(batch.end).toISOString()})`);
    console.log(`   batch.timestamps: [${batch.timestamps.map(ts => new Date(ts).toISOString()).join(', ')}]`);
    
    let batchFetched = false;
    
    for (let batchAttempt = 0; batchAttempt < maxBatchRetries && !batchFetched; batchAttempt++) {
      try {
        if (batchAttempt > 0) {
          // Exponential backoff for batch retries
          const delay = Math.pow(2, batchAttempt - 1) * 1000;
          console.log(`🔄 Retrying batch fetch (attempt ${batchAttempt + 1}/${maxBatchRetries}) after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // CRITICAL FIX: For targeted gap filling, fetch ONLY the exact intervals needed
        // For 8h candles: if 1 candle is missing, we only need 8 hourly candles (the 8h period), not 500!
        let fetchStart: number;
        let fetchEnd: number;
        
        if (timeframe === '8h' && batch.timestamps.length === 1) {
          // Single missing 8h candle: fetch ONLY the 8-hour period it belongs to
          // CRITICAL: Align the missing timestamp to the period start (00:00, 08:00, or 16:00 UTC)
          const missingTimestamp = batch.timestamps[0]!;
          const periodStart = alignTimestampToPeriod(missingTimestamp, timeframe);
          fetchStart = periodStart;
          fetchEnd = periodStart + intervalMs - 1; // End of the 8h period
          const fetchRangeHours = (fetchEnd - fetchStart) / (1000 * 60 * 60);
          console.log(`📡 Fetching 1 missing ${timeframe} candle for ${symbol}`);
          console.log(`   Missing timestamp: ${new Date(missingTimestamp).toISOString()}`);
          console.log(`   Aligned period start: ${new Date(periodStart).toISOString()}`);
          console.log(`   Exact period: ${new Date(fetchStart).toISOString()} to ${new Date(fetchEnd).toISOString()} (${fetchRangeHours.toFixed(1)} hours)`);
          
          // CRITICAL: Verify the range is correct (should be ~8 hours, not 2184!)
          if (fetchRangeHours > 24) {
            console.error(`❌ ERROR: Fetch range is ${fetchRangeHours.toFixed(1)} hours for 1 missing candle! This is a bug.`);
            console.error(`   batch.start: ${batch.start}, batch.end: ${batch.end}`);
            console.error(`   missingTimestamp: ${missingTimestamp}, periodStart: ${periodStart}, intervalMs: ${intervalMs}`);
            console.error(`   fetchStart: ${fetchStart}, fetchEnd: ${fetchEnd}`);
            // Force correct range - something is very wrong with the batch calculation
            // Use the missing timestamp directly, aligned to period
            const correctedPeriodStart = alignTimestampToPeriod(missingTimestamp, timeframe);
            fetchStart = correctedPeriodStart;
            fetchEnd = correctedPeriodStart + intervalMs - 1;
            const correctedRange = (fetchEnd - fetchStart) / (1000 * 60 * 60);
            console.error(`   Corrected: fetchStart=${fetchStart}, fetchEnd=${fetchEnd}, range=${correctedRange.toFixed(1)} hours`);
          }
        } else if (timeframe === '8h' && batch.timestamps.length <= 3) {
          // Small batch (2-3 candles): fetch only the periods needed, with minimal buffer
          // CRITICAL: Align all timestamps to period boundaries
          const alignedTimestamps = batch.timestamps.map(ts => alignTimestampToPeriod(ts, timeframe));
          const firstPeriod = Math.min(...alignedTimestamps);
          const lastPeriod = Math.max(...alignedTimestamps);
          fetchStart = firstPeriod;
          fetchEnd = lastPeriod + intervalMs - 1; // End of last period
          const fetchRangeHours = (fetchEnd - fetchStart) / (1000 * 60 * 60);
          console.log(`📡 Fetching ${batch.timestamps.length} missing ${timeframe} candles for ${symbol}`);
          console.log(`   Period range: ${fetchRangeHours.toFixed(1)} hours (${new Date(fetchStart).toISOString()} to ${new Date(fetchEnd).toISOString()})`);
          
          // Verify range is reasonable
          const expectedMaxRange = batch.timestamps.length * intervalMs / (1000 * 60 * 60);
          if (fetchRangeHours > expectedMaxRange * 2) {
            console.warn(`⚠️  WARNING: Fetch range (${fetchRangeHours.toFixed(1)}h) is larger than expected (${expectedMaxRange.toFixed(1)}h) for ${batch.timestamps.length} candles`);
          }
        } else {
          // Larger batches: use small buffer
          const bufferMs = intervalMs; // 1 period buffer
          fetchStart = batch.start - bufferMs;
          fetchEnd = batch.end + bufferMs;
          const fetchRangeHours = (fetchEnd - fetchStart) / (1000 * 60 * 60);
          console.log(`📡 Fetching ${batch.timestamps.length} missing ${timeframe} candles for ${symbol}`);
          console.log(`   Fetch range: ${fetchRangeHours.toFixed(1)} hours (${new Date(fetchStart).toISOString()} to ${new Date(fetchEnd).toISOString()})`);
        }

        // DEBUG: Log the fetch range before calling API
        const fetchRangeHours = (fetchEnd - fetchStart) / (1000 * 60 * 60);
        console.log(`🔍 [DEBUG] About to call API with fetchStart: ${fetchStart} (${new Date(fetchStart).toISOString()}), fetchEnd: ${fetchEnd} (${new Date(fetchEnd).toISOString()}), range: ${fetchRangeHours.toFixed(1)} hours`);
        if (fetchRangeHours > 200) {
          console.error(`❌ [DEBUG] CRITICAL ERROR: fetchStart and fetchEnd are ${fetchRangeHours.toFixed(1)} hours apart! This should not happen for targeted gap filling!`);
          console.error(`   batch.start: ${batch.start}, batch.end: ${batch.end}`);
          console.error(`   batch.timestamps.length: ${batch.timestamps.length}`);
          throw new Error(`Invalid fetch range: ${fetchRangeHours.toFixed(1)} hours for ${batch.timestamps.length} missing candles`);
        }
        
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
        
        // DEBUG: Log what we fetched vs what we need
        console.log(`🔍 [DEBUG] Fetched ${fetchedCandles.length} candles, filtered to ${neededCandles.length} needed candles`);
        console.log(`🔍 [DEBUG] Batch timestamps: [${batch.timestamps.map(ts => new Date(ts).toISOString()).join(', ')}]`);
        if (neededCandles.length > 0) {
          console.log(`🔍 [DEBUG] Needed candle timestamps: [${neededCandles.map(c => new Date(c.timestamp).toISOString()).join(', ')}]`);
        } else if (fetchedCandles.length > 0) {
          console.warn(`⚠️ [DEBUG] Fetched ${fetchedCandles.length} candles but none match batch timestamps!`);
          console.warn(`   Fetched timestamps: [${fetchedCandles.slice(0, 5).map(c => new Date(c.timestamp).toISOString()).join(', ')}...]`);
          console.warn(`   Batch timestamps: [${batch.timestamps.map(ts => new Date(ts).toISOString()).join(', ')}]`);
        }

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

