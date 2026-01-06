/**
 * BTC Price Service
 * 
 * Fetches BTC price data from Binance for correlation analysis with ETH.
 * Uses similar patterns to eth-price-service.ts but simplified for read-only access.
 */

import type { PriceCandle } from '@/types';
import { redis, ensureConnected } from './kv';
import { getHistoricalDataPath, loadCandlesFromFile, fixOHLCRelationships } from './historical-file-utils';

const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

// Map timeframe strings to Binance interval strings
const INTERVAL_MAP: Record<string, string> = {
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '8h': '8h',
  '12h': '12h',
  '1d': '1d',
};

// Map timeframe to milliseconds
const INTERVAL_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const CACHE_PREFIX = 'btc:candles:';
const CACHE_TTL = 300; // 5 minutes

/**
 * Fetch BTC price candles from Binance
 */
export async function fetchBTCCandles(
  symbol: string = 'BTCUSDT',
  timeframe: string = '8h',
  startDate: string,
  endDate: string
): Promise<PriceCandle[]> {
  const interval = INTERVAL_MAP[timeframe] || '8h';
  const intervalMs = INTERVAL_MS[timeframe] || 8 * 60 * 60 * 1000;
  
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).setHours(23, 59, 59, 999);
  
  // First, try to load from historical files (like ETH does)
  const historicalFilePath = getHistoricalDataPath(symbol, timeframe);
  const historicalData = await loadCandlesFromFile(historicalFilePath);
  let allCandles: PriceCandle[] = [];
  
  if (historicalData && historicalData.length > 0) {
    // Fix OHLC relationships
    const fixedData = fixOHLCRelationships(historicalData);
    
    // Filter to requested date range
    const filtered = fixedData.filter(c => 
      c.timestamp >= startTime && c.timestamp <= endTime
    );
    allCandles.push(...filtered);
  }
  
  // Try to get from cache
  const cacheKey = `${CACHE_PREFIX}${symbol}:${timeframe}:${startDate}:${endDate}`;
  
  try {
    await ensureConnected();
    const cached = await redis.get(cacheKey);
    if (cached) {
      const cachedCandles = JSON.parse(cached) as PriceCandle[];
      if (cachedCandles.length > 0) {
        // Merge with file data (cache overwrites file for same timestamps)
        const candleMap = new Map<number, PriceCandle>();
        allCandles.forEach(c => candleMap.set(c.timestamp, c));
        cachedCandles.forEach(c => candleMap.set(c.timestamp, c));
        allCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        
        // If we have enough data from files + cache, return early
        if (allCandles.length >= 30) {
          return allCandles;
        }
      }
    }
  } catch (error) {
    console.warn('[BTC Price] Cache read failed:', error instanceof Error ? error.message : error);
  }

  // Fetch from Binance API if we don't have enough data from files/cache
  // For correlation analysis, we need at least 30 candles, so fetch from API if we have less
  const needsAPIFetch = allCandles.length < 30 || 
    allCandles.length === 0 || 
    allCandles[0]!.timestamp > startTime || 
    allCandles[allCandles.length - 1]!.timestamp < endTime;
  
  const apiCandles: PriceCandle[] = [];
  if (needsAPIFetch) {
    console.log(`[BTC Price] Fetching from API: ${allCandles.length} candles from files/cache, need more for ${startDate} to ${endDate}`);
    let currentStart = startTime;
    const maxCandles = 1000; // Binance limit per request

    while (currentStart < endTime) {
    const url = `${BINANCE_API_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${maxCandles}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      for (const kline of data) {
        apiCandles.push({
          timestamp: kline[0],
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
        });
      }

      // Move to next batch
      const lastTimestamp = data[data.length - 1]?.[0];
      if (lastTimestamp) {
        currentStart = lastTimestamp + intervalMs;
      } else {
        break;
      }

      // Rate limiting
      if (currentStart < endTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes('451') || errorMessage.includes('429') || errorMessage.includes('Rate limited');
      if (isRateLimit) {
        console.log(`ℹ️ [BTC Price] Binance rate limited (${errorMessage}), using available cached data`);
      } else {
        console.error('[BTC Price] Fetch error:', errorMessage);
      }
      break;
    }
    }
  } else {
    console.log(`[BTC Price] Using ${allCandles.length} candles from files/cache (no API fetch needed)`);
  }

  // Merge API candles with file/cache data
  if (apiCandles.length > 0) {
    const candleMap = new Map<number, PriceCandle>();
    allCandles.forEach(c => candleMap.set(c.timestamp, c));
    apiCandles.forEach(c => candleMap.set(c.timestamp, c)); // API data overwrites
    allCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    
    // Cache the API results
    try {
      await ensureConnected();
      await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(apiCandles));
    } catch (error) {
      console.warn('[BTC Price] Cache write failed:', error instanceof Error ? error.message : error);
    }
  }

  return allCandles;
}

/**
 * Get latest BTC price
 */
export async function fetchLatestBTCPrice(symbol: string = 'BTCUSDT'): Promise<number> {
  try {
    const url = `${BINANCE_API_BASE}/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error('[BTC Price] Latest price fetch error:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Fetch aligned candles for both ETH and BTC for correlation analysis
 */
export async function fetchAlignedCandles(
  ethCandles: PriceCandle[],
  timeframe: string = '8h'
): Promise<{ eth: PriceCandle[]; btc: PriceCandle[] }> {
  if (ethCandles.length === 0) {
    return { eth: [], btc: [] };
  }

  // Get date range from ETH candles
  const ethStartTime = ethCandles[0]!.timestamp;
  const ethEndTime = ethCandles[ethCandles.length - 1]!.timestamp;
  
  // Check what BTC data we have available first
  // BTC might not have data for the full ETH range (e.g., ETH starts Dec 2024, BTC starts Oct 2025)
  const btcHistoricalPath = getHistoricalDataPath('BTCUSDT', timeframe);
  const btcHistoricalData = await loadCandlesFromFile(btcHistoricalPath);
  
  let btcDataStartTime = ethStartTime; // Default to ETH start
  let btcDataEndTime = ethEndTime; // Default to ETH end
  
  if (btcHistoricalData && btcHistoricalData.length > 0) {
    // Find the actual BTC data range
    const btcTimestamps = btcHistoricalData.map(c => c.timestamp).sort((a, b) => a - b);
    btcDataStartTime = btcTimestamps[0]!;
    btcDataEndTime = btcTimestamps[btcTimestamps.length - 1]!;
    
    // Only request BTC for the overlapping period (where both ETH and BTC have data)
    const overlapStart = Math.max(ethStartTime, btcDataStartTime);
    const overlapEnd = Math.min(ethEndTime, btcDataEndTime);
    
    if (overlapStart > overlapEnd) {
      return { eth: [], btc: [] };
    }
    
    btcDataStartTime = overlapStart;
    btcDataEndTime = overlapEnd;
  }
  
  const startDate = new Date(btcDataStartTime).toISOString().split('T')[0];
  const endDate = new Date(btcDataEndTime).toISOString().split('T')[0];
  
  // Fetch BTC candles for the overlapping period
  const btcCandles = await fetchBTCCandles('BTCUSDT', timeframe, startDate, endDate);

  // Create a map of BTC candles by timestamp for quick lookup
  const btcMap = new Map<number, PriceCandle>();
  btcCandles.forEach(candle => {
    btcMap.set(candle.timestamp, candle);
  });

  // Filter ETH candles to only the overlapping period (where BTC has data)
  // This ensures we only try to align candles where both assets have data
  const ethCandlesInOverlap = ethCandles.filter(c => 
    c.timestamp >= btcDataStartTime && c.timestamp <= btcDataEndTime
  );

  // Align candles - only keep pairs where both ETH and BTC have data
  const alignedEth: PriceCandle[] = [];
  const alignedBtc: PriceCandle[] = [];

  // For 8h candles, timestamps should align exactly (e.g., 00:00, 08:00, 16:00 UTC)
  // But allow small tolerance (1 minute) for rounding differences
  const timestampTolerance = 60 * 1000; // 1 minute
  
  for (const ethCandle of ethCandlesInOverlap) {
    // Try exact match first
    let btcCandle = btcMap.get(ethCandle.timestamp);
    
    // If no exact match, try to find closest BTC candle within tolerance
    if (!btcCandle) {
      for (const [btcTimestamp, candle] of btcMap.entries()) {
        if (Math.abs(btcTimestamp - ethCandle.timestamp) <= timestampTolerance) {
          btcCandle = candle;
          break;
        }
      }
    }
    
    if (btcCandle) {
      alignedEth.push(ethCandle);
      alignedBtc.push(btcCandle);
    }
  }
  
  if (alignedEth.length === 0 && ethCandlesInOverlap.length > 0 && btcCandles.length > 0) {
    // Log warning if alignment failed but we have data
    console.warn(`[BTC Aligned] No aligned candles found despite having ${ethCandlesInOverlap.length} ETH and ${btcCandles.length} BTC candles - timestamp mismatch`);
  }
  
  return { eth: alignedEth, btc: alignedBtc };
}

