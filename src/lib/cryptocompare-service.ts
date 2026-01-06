/**
 * CryptoCompare API service for fetching historical OHLC candles
 * Free tier: 100,000 calls/month, supports historical data
 * Docs: https://min-api.cryptocompare.com/documentation
 */

import type { PriceCandle } from '@/types';

const CRYPTOCOMPARE_API_URL = 'https://min-api.cryptocompare.com/data';

// Rate limiting for CryptoCompare (free tier: 20 calls/second, but be conservative)
let lastCryptoCompareCall = 0;
const MIN_CRYPTOCOMPARE_DELAY = 200; // 200ms between calls (5 calls/second - conservative)

async function rateLimitCryptoCompare(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCryptoCompareCall;
  if (timeSinceLastCall < MIN_CRYPTOCOMPARE_DELAY) {
    await new Promise(resolve => setTimeout(resolve, MIN_CRYPTOCOMPARE_DELAY - timeSinceLastCall));
  }
  lastCryptoCompareCall = Date.now();
}

/**
 * Map symbol to CryptoCompare format
 */
function mapSymbol(symbol: string): string {
  const mapping: Record<string, string> = {
    'ETHUSDT': 'ETH',
    'BTCUSDT': 'BTC',
  };
  return mapping[symbol] || symbol.replace('USDT', '');
}

/**
 * Fetch historical OHLC candles from CryptoCompare
 * Free tier supports up to 2000 data points per request
 * For longer periods, we need to fetch in chunks
 */
export async function fetchCryptoCompareCandles(
  symbol: string,
  timeframe: string,
  startTime: number,
  endTime: number
): Promise<PriceCandle[]> {
  const cryptoCompareSymbol = mapSymbol(symbol);
  
  // CryptoCompare uses seconds, not milliseconds
  const startTimeSeconds = Math.floor(startTime / 1000);
  const endTimeSeconds = Math.floor(endTime / 1000);
  
  // Calculate time difference
  const hoursDiff = (endTimeSeconds - startTimeSeconds) / 3600;
  const daysDiff = hoursDiff / 24;
  
  // Determine endpoint and aggregation
  let endpoint: string;
  let aggregate: number = 1;
  let maxPointsPerRequest: number;
  
  if (timeframe === '1h') {
    endpoint = 'histohour';
    maxPointsPerRequest = 2000; // Max 2000 hours = ~83 days
  } else if (timeframe === '1d') {
    endpoint = 'histoday';
    maxPointsPerRequest = 2000; // Max 2000 days
  } else if (timeframe === '4h') {
    endpoint = 'histohour';
    aggregate = 4;
    maxPointsPerRequest = 2000; // Will aggregate 4h from hourly
  } else if (timeframe === '8h') {
    endpoint = 'histohour';
    aggregate = 8;
    maxPointsPerRequest = 2000; // Will aggregate 8h from hourly
  } else if (timeframe === '12h') {
    endpoint = 'histohour';
    aggregate = 12;
    maxPointsPerRequest = 2000; // Will aggregate 12h from hourly
  } else {
    // Default to daily
    endpoint = 'histoday';
    maxPointsPerRequest = 2000;
  }
  
  // Calculate how many requests we need
  const pointsNeeded = endpoint === 'histohour' ? Math.ceil(hoursDiff) : Math.ceil(daysDiff);
  const requestsNeeded = Math.ceil(pointsNeeded / maxPointsPerRequest);
  
  const allCandles: PriceCandle[] = [];
  
  // Fetch in chunks if needed
  let currentEndTime = endTimeSeconds;
  let requestNumber = 0;
  
  while (currentEndTime > startTimeSeconds && requestNumber < requestsNeeded) {
    requestNumber++;
    
    // Calculate limit for this request
    // When aggregating (e.g., 8h from hourly), we need enough hourly candles to cover the time range
    // Add a small buffer (1 extra period) to ensure we have complete coverage
    let remainingPoints: number;
    if (endpoint === 'histohour') {
      const hoursNeeded = Math.ceil((currentEndTime - startTimeSeconds) / 3600);
      // If aggregating, we need enough hourly candles for the target timeframe
      // For 8h: if we need 2 8h candles (16h), we need 16-24 hourly candles (with buffer)
      if (aggregate > 1) {
        // Calculate how many target-interval candles we need, then multiply by aggregate
        const targetIntervalHours = aggregate;
        const targetCandlesNeeded = Math.ceil(hoursNeeded / targetIntervalHours);
        // Request hourly candles: target candles * aggregate + 1 period buffer
        remainingPoints = (targetCandlesNeeded * targetIntervalHours) + targetIntervalHours;
      } else {
        remainingPoints = hoursNeeded;
      }
    } else {
      remainingPoints = Math.ceil((currentEndTime - startTimeSeconds) / 86400);
    }
    const limit = Math.min(remainingPoints, maxPointsPerRequest);
    
    const url = new URL(`${CRYPTOCOMPARE_API_URL}/${endpoint}`);
    url.searchParams.set('fsym', cryptoCompareSymbol);
    url.searchParams.set('tsym', 'USD');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('toTs', String(currentEndTime));
    
    // Add API key if available (free tier works without key, but with key you get higher limits)
    const apiKey = process.env.CRYPTOCOMPARE_API_KEY;
    if (apiKey) {
      url.searchParams.set('api_key', apiKey);
    }
    
    if (requestNumber === 1) {
      const candleType = aggregate > 1 
        ? `${endpoint === 'histohour' ? 'hourly' : 'daily'} (will aggregate to ${timeframe})`
        : endpoint === 'histohour' ? 'hourly' : 'daily';
      console.log(`📡 CryptoCompare: Fetching ${limit} ${candleType} candles for ${cryptoCompareSymbol}...`);
    }
    
    // Rate limiting
    await rateLimitCryptoCompare();
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`CryptoCompare API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }
    
    const data = await response.json();
    
    if (data.Response === 'Error') {
      throw new Error(`CryptoCompare API error: ${data.Message || 'Unknown error'}`);
    }
    
    // CryptoCompare format: { Data: [{ time, high, low, open, close, volumefrom, volumeto }, ...] }
    // Data is returned in reverse chronological order (newest first)
    interface CryptoCompareCandle {
      time: number;
      high: number;
      low: number;
      open: number;
      close: number;
      volumefrom: number;
      volumeto: number;
    }
    const chunkCandles: PriceCandle[] = ((data.Data || []) as CryptoCompareCandle[])
      .map((c) => ({
        timestamp: c.time * 1000, // Convert seconds to milliseconds
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volumeto || c.volumefrom || 0, // Use volumeto (USD volume) or volumefrom (crypto volume)
      }))
      .filter((c: PriceCandle) => c.timestamp >= startTime && c.timestamp <= endTime);
    
    allCandles.push(...chunkCandles);
    
    // Update currentEndTime to the oldest candle timestamp for next request
    if (chunkCandles.length > 0) {
      const oldestTimestamp = Math.min(...chunkCandles.map(c => c.timestamp));
      currentEndTime = Math.floor(oldestTimestamp / 1000) - 1; // -1 to avoid overlap
    } else {
      break; // No more data
    }
    
    // Safety check to prevent infinite loops
    if (allCandles.length > 0 && currentEndTime <= startTimeSeconds) {
      break;
    }
  }
  
  // Sort by timestamp (oldest first)
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Remove duplicates
  const uniqueCandles = Array.from(
    new Map(allCandles.map(c => [c.timestamp, c])).values()
  );
  
  // If we need 4h, 8h, or 12h, aggregate from hourly
  if (aggregate > 1) {
    const aggregated = aggregateToTargetInterval(uniqueCandles, timeframe);
    // Log shows what we fetched and what we aggregated to
    console.log(`✅ CryptoCompare: Fetched ${uniqueCandles.length} hourly candles, aggregated to ${aggregated.length} ${timeframe} candles`);
    return aggregated;
  }
  
  console.log(`✅ CryptoCompare: Fetched ${uniqueCandles.length} ${endpoint === 'histohour' ? 'hourly' : 'daily'} candles`);
  return uniqueCandles;
}

/**
 * Aggregate hourly candles to target interval (4h, 8h, 12h)
 */
function aggregateToTargetInterval(candles: PriceCandle[], targetInterval: string): PriceCandle[] {
  const intervalHours = targetInterval === '4h' ? 4 : targetInterval === '8h' ? 8 : 12;
  
  const candleMap = new Map<number, PriceCandle>();
  
  for (const candle of candles) {
    // Round to interval start (e.g., for 8h: 00:00, 08:00, 16:00 UTC)
    const candleDate = new Date(candle.timestamp);
    const hours = candleDate.getUTCHours();
    const periodStartHour = Math.floor(hours / intervalHours) * intervalHours;
    
    const periodStart = new Date(Date.UTC(
      candleDate.getUTCFullYear(),
      candleDate.getUTCMonth(),
      candleDate.getUTCDate(),
      periodStartHour,
      0, 0, 0
    ));
    
    const periodTimestamp = periodStart.getTime();
    
    let aggregated = candleMap.get(periodTimestamp);
    if (!aggregated) {
      aggregated = {
        timestamp: periodTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      };
      candleMap.set(periodTimestamp, aggregated);
    } else {
      aggregated.high = Math.max(aggregated.high, candle.high);
      aggregated.low = Math.min(aggregated.low, candle.low);
      aggregated.close = candle.close; // Last close in period
      aggregated.volume = (aggregated.volume || 0) + (candle.volume || 0);
    }
  }
  
  const aggregated = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  // Log is now handled in the calling function for better context
  
  return aggregated;
}
