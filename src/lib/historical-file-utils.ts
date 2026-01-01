/**
 * Historical File Utilities
 * Shared utilities for reading and writing historical price data files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

/**
 * Get the standard path for historical price data files
 * Format: data/historical-prices/{symbol}/{timeframe}/{symbol}_{timeframe}.json
 */
export function getHistoricalDataPath(symbol: string, timeframe: string): string {
  const filename = `${symbol.toLowerCase()}_${timeframe}.json`;
  return path.join(process.cwd(), 'data', 'historical-prices', symbol.toLowerCase(), timeframe, filename);
}

/**
 * Load historical price data from local JSON file
 * Handles both compressed (.json.gz) and uncompressed (.json) files
 * Tries compressed first, falls back to uncompressed for backward compatibility
 * 
 * @param filePath - Path to the file (without .gz extension)
 * @returns Array of PriceCandle objects, or null if file doesn't exist or is invalid
 */
export async function loadCandlesFromFile(filePath: string): Promise<PriceCandle[] | null> {
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
      return parsed;
    } catch {
      // Neither file exists or is invalid - return null
      return null;
    }
  }
}

/**
 * Save historical price data to local file (always as compressed .json.gz)
 * 
 * @param filePath - Path to the file (without .gz extension)
 * @param candles - Array of PriceCandle objects to save
 */
export async function saveCandlesToFile(filePath: string, candles: PriceCandle[]): Promise<void> {
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
 * Load all historical files for a symbol/timeframe combination
 * Scans the directory for all matching files and loads them
 * 
 * @param symbol - Trading symbol (e.g., 'ETHUSDT')
 * @param timeframe - Timeframe (e.g., '8h', '1d')
 * @param includeRolling - Whether to include rolling files (default: true)
 * @returns Array of all candles from all matching files
 */
export async function loadAllHistoricalFiles(
  symbol: string,
  timeframe: string,
  includeRolling: boolean = true
): Promise<PriceCandle[]> {
  const dir = path.join(process.cwd(), 'data', 'historical-prices', symbol.toLowerCase(), timeframe);
  const allCandles: PriceCandle[] = [];
  
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => {
      const isJson = f.endsWith('.json') || f.endsWith('.json.gz');
      const isRolling = f.includes('rolling');
      return isJson && (includeRolling || !isRolling);
    });
    
    for (const file of jsonFiles) {
      const filePath = path.join(dir, file);
      // Remove .gz extension if present for loadCandlesFromFile
      const basePath = file.endsWith('.gz') ? filePath.slice(0, -3) : filePath;
      const candles = await loadCandlesFromFile(basePath);
      if (candles) {
        allCandles.push(...candles);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't read - return empty array
    console.warn(`Directory ${dir} doesn't exist or is empty:`, error);
    return [];
  }
  
  return allCandles;
}

/**
 * Deduplicate candles by timestamp, keeping the one with higher volume if duplicates exist
 * 
 * @param candles - Array of candles to deduplicate
 * @returns Deduplicated and sorted array of candles
 */
export function deduplicateCandles(candles: PriceCandle[]): PriceCandle[] {
  const uniqueMap = new Map<number, PriceCandle>();
  
  for (const candle of candles) {
    const existing = uniqueMap.get(candle.timestamp);
    if (!existing || candle.volume > existing.volume) {
      uniqueMap.set(candle.timestamp, candle);
    }
  }
  
  return Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Filter candles by date range
 * 
 * @param candles - Array of candles to filter
 * @param startTime - Start timestamp (inclusive)
 * @param endTime - End timestamp (inclusive)
 * @returns Filtered array of candles
 */
export function filterCandlesByDateRange(
  candles: PriceCandle[],
  startTime: number,
  endTime: number
): PriceCandle[] {
  return candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
}

/**
 * Fix invalid OHLC relationships in candles
 * Ensures: high >= max(open, low, close) and low <= min(open, close)
 * 
 * @param candles - Array of candles to fix
 * @returns Array of candles with corrected OHLC relationships
 */
/**
 * Fix invalid OHLC relationships in candles
 * Ensures: high >= max(open, low, close) and low <= min(open, close)
 * 
 * @param candles - Array of candles to fix
 * @returns Array of candles with corrected OHLC relationships
 */
export function fixOHLCRelationships(candles: PriceCandle[]): PriceCandle[] {
  return candles.map(candle => {
    // Calculate the actual high and low based on open, close
    // high must be >= all of (open, high, low, close)
    // low must be <= all of (open, high, low, close)
    const actualHigh = Math.max(candle.open, candle.high, candle.low, candle.close);
    const actualLow = Math.min(candle.open, candle.high, candle.low, candle.close);
    
    // Only fix if there's an issue
    if (candle.high !== actualHigh || candle.low !== actualLow) {
      return {
        ...candle,
        high: actualHigh,
        low: actualLow,
      };
    }
    
    return candle;
  });
}

/**
 * Fill gaps in candle data by fetching from API or creating interpolated candles
 * Used when merging data from different sources (e.g., historical + synthetic)
 * 
 * @param candles - Array of candles (should be sorted by timestamp)
 * @param timeframe - Timeframe string (e.g., '8h', '1d')
 * @param symbol - Trading symbol (e.g., 'ETHUSDT') - required for API fetching
 * @param fetchFromAPI - If true, try to fetch missing candles from API (default: false)
 * @returns Array of candles with gaps filled
 */
export async function fillGapsInCandles(
  candles: PriceCandle[],
  timeframe: string,
  symbol?: string,
  fetchFromAPI: boolean = false
): Promise<PriceCandle[]> {
  if (candles.length === 0) return candles;
  
  // Calculate expected interval in milliseconds
  const intervalMs = timeframe === '5m' ? 5 * 60 * 1000 :
                     timeframe === '1h' ? 60 * 60 * 1000 :
                     timeframe === '4h' ? 4 * 60 * 60 * 1000 :
                     timeframe === '8h' ? 8 * 60 * 60 * 1000 :
                     timeframe === '12h' ? 12 * 60 * 60 * 1000 :
                     timeframe === '1d' ? 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000;
  
  const filled: PriceCandle[] = [candles[0]!]; // Start with first candle
  // Use same tolerance as validation (10%) to ensure we fill all gaps that validation would detect
  const tolerance = intervalMs * 0.1;
  
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    const gap = curr.timestamp - prev.timestamp;
    
    // If gap is larger than expected interval + tolerance, fill it
    // This matches the validation logic exactly
    if (gap > intervalMs + tolerance) {
      // Calculate how many candles should fit in this gap
      const expectedCandles = Math.floor(gap / intervalMs);
      const missingCount = Math.max(1, expectedCandles - 1);
      
      // Limit to reasonable number of candles to fill (max 1000 to prevent infinite loops)
      const maxFill = Math.min(missingCount, 1000);
      
      // Calculate date range for missing candles
      const gapStartTime = prev.timestamp + intervalMs;
      const gapEndTime = curr.timestamp - tolerance;
      const gapStartDate = new Date(gapStartTime).toISOString().split('T')[0];
      const gapEndDate = new Date(gapEndTime).toISOString().split('T')[0];
      
      // Try to fetch from API if:
      // 1. fetchFromAPI is true
      // 2. Symbol is provided
      // 3. Gap is in the past (not future data)
      // 4. Gap is reasonable size (not too large to avoid excessive API calls)
      const now = Date.now();
      const isHistoricalGap = gapEndTime < now;
      const isReasonableGap = maxFill <= 100 && gap < 30 * 24 * 60 * 60 * 1000; // Max 30 days
      
      let fetchedCandles: PriceCandle[] = [];
      if (fetchFromAPI && symbol && isHistoricalGap && isReasonableGap) {
        try {
          const { fetchPriceCandles } = await import('./eth-price-service');
          console.log(`📡 Fetching ${maxFill} missing candles from API for gap ${gapStartDate} to ${gapEndDate}...`);
          fetchedCandles = await fetchPriceCandles(
            symbol,
            timeframe,
            gapStartDate,
            gapEndDate,
            undefined, // currentPrice
            false, // skipAPIFetch - we want to fetch from API
            false  // allowSyntheticData - we want real data
          );
          
          // Filter to only candles within the gap and sort
          const gapCandles = fetchedCandles
            .filter(c => c.timestamp >= gapStartTime && c.timestamp <= gapEndTime)
            .sort((a, b) => a.timestamp - b.timestamp);
          
          if (gapCandles.length > 0) {
            console.log(`✅ Fetched ${gapCandles.length} candles from API for gap`);
            
            // Save fetched candles to historical data file for future use
            try {
              const filePath = getHistoricalDataPath(symbol, timeframe);
              // Load existing candles from file
              const existingCandles = await loadCandlesFromFile(filePath) || [];
              
              // Merge with existing candles (deduplicate by timestamp)
              const allCandles = [...existingCandles, ...gapCandles];
              const mergedCandles = deduplicateCandles(allCandles);
              
              // Save merged candles back to file
              await saveCandlesToFile(filePath, mergedCandles);
              console.log(`💾 Saved ${gapCandles.length} fetched candles to ${filePath}.gz`);
            } catch (saveError) {
              // Non-critical - log but continue
              const errorMsg = saveError instanceof Error ? saveError.message : String(saveError);
              console.warn(`⚠️  Failed to save fetched candles to file: ${errorMsg}`);
            }
            
            // Use fetched candles instead of interpolating
            filled.push(...gapCandles);
            continue; // Skip to next iteration, don't interpolate
          } else {
            console.log(`⚠️  API returned no candles for gap ${gapStartDate} to ${gapEndDate}, will interpolate`);
          }
        } catch (error) {
          // API fetch failed, fall back to interpolation
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`⚠️  Failed to fetch candles from API for gap ${gapStartDate} to ${gapEndDate}: ${errorMsg}, will interpolate`);
        }
      }
      
      // Fall back to interpolation if API fetch failed or wasn't attempted
      for (let j = 1; j <= maxFill; j++) {
        const missingTimestamp = prev.timestamp + intervalMs * j;
        
        // Stop if we've reached or passed the current candle
        // We want to fill all gaps up to (but not including) the current candle
        if (missingTimestamp >= curr.timestamp) {
          break;
        }
        
        const progress = j / (maxFill + 1); // Progress from prev to curr
        
        // Interpolate price (simple linear interpolation)
        const priceDiff = curr.open - prev.close;
        const interpolatedPrice = prev.close + priceDiff * progress;
        
        // Add small random variation to high/low to make it more realistic
        const priceVariation = Math.abs(priceDiff) * 0.1;
        const high = interpolatedPrice + Math.random() * priceVariation;
        const low = interpolatedPrice - Math.random() * priceVariation;
        
        // Create a candle with realistic OHLC
        const missingCandle: PriceCandle = {
          timestamp: missingTimestamp,
          open: interpolatedPrice,
          high: Math.max(interpolatedPrice, high, curr.open),
          low: Math.min(interpolatedPrice, low, curr.open),
          close: interpolatedPrice,
          volume: prev.volume * 0.5 + curr.volume * 0.5 * progress, // Interpolated volume
        };
        
        filled.push(missingCandle);
      }
    }
    
    filled.push(curr);
  }
  
  // Sort again to ensure proper order (in case of any edge cases)
  const sorted = filled.sort((a, b) => a.timestamp - b.timestamp);
  
  // Fix any OHLC relationship issues
  return fixOHLCRelationships(sorted);
}

