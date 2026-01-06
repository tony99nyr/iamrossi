/**
 * Targeted Gap Filler
 * Fetches only the specific missing candles instead of entire date ranges
 */

import type { PriceCandle } from '@/types';
import { getHistoricalDataPath, loadCandlesFromFile, saveCandlesToFile, deduplicateCandles } from './historical-file-utils';

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
 * Fetch candles from Binance API (re-exported for use here)
 */
async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<PriceCandle[]> {
  // Import dynamically to avoid circular dependencies
  const { fetchPriceCandles } = await import('./eth-price-service');
  
  // Use fetchPriceCandles but with a targeted date range
  const startDate = new Date(startTime).toISOString().split('T')[0];
  const endDate = new Date(endTime).toISOString().split('T')[0];
  
  // fetchPriceCandles will use Binance internally, but we need direct access
  // So we'll use the internal fetchBinanceCandles from eth-price-service
  // Actually, let's just call the Binance API directly here to avoid circular deps
  const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
  
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

  // Fetch each batch with a small buffer (1 interval before and after)
  const allFetchedCandles: PriceCandle[] = [];

  for (const batch of batches) {
    try {
      // Add small buffer to ensure we get the candles we need
      const bufferMs = intervalMs;
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
        } catch (cryptoCompareError) {
          // CryptoCompare failed, fallback to Binance
          console.log(`⚠️  CryptoCompare failed, trying Binance...`);
          fetchedCandles = await fetchBinanceCandles(symbol, interval, fetchStart, fetchEnd);
        }
      } else {
        fetchedCandles = await fetchBinanceCandles(symbol, interval, fetchStart, fetchEnd);
      }

      // Filter to only the candles we actually need (within the batch timestamps)
      // Use tolerance to match candles (candles might be slightly off due to API rounding)
      const tolerance = intervalMs * 0.1;
      const neededCandles = fetchedCandles.filter(c => {
        return batch.timestamps.some(needed => {
          const diff = Math.abs(c.timestamp - needed);
          return diff <= tolerance;
        });
      });

      if (neededCandles.length > 0) {
        console.log(`✅ Fetched ${neededCandles.length} of ${batch.timestamps.length} missing candles from API`);
        allFetchedCandles.push(...neededCandles);

        // Save fetched candles to historical data file for future use
        try {
          const filePath = getHistoricalDataPath(symbol, interval);
          const existingCandles = await loadCandlesFromFile(filePath) || [];
          
          // Merge with existing candles (deduplicate by timestamp)
          const allCandles = [...existingCandles, ...neededCandles];
          const mergedCandles = deduplicateCandles(allCandles);
          
          // Save merged candles back to file
          await saveCandlesToFile(filePath, mergedCandles);
          console.log(`💾 Saved ${neededCandles.length} fetched candles to ${filePath}.gz`);
        } catch (saveError) {
          // Non-critical - log but continue
          const errorMsg = saveError instanceof Error ? saveError.message : String(saveError);
          console.warn(`⚠️  Failed to save fetched candles to file: ${errorMsg}`);
        }
      } else {
        console.warn(`⚠️  API returned no candles for batch ${new Date(batch.start).toISOString()} to ${new Date(batch.end).toISOString()}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Failed to fetch candles from API for batch ${new Date(batch.start).toISOString()} to ${new Date(batch.end).toISOString()}: ${errorMsg}`);
      // Continue with next batch
    }
  }

  return allFetchedCandles;
}

