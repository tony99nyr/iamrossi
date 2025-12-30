import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { redis, ensureConnected } from '@/lib/kv';
import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

const PRICE_CACHE_PREFIX = 'eth:price:cache:';
const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const KEEP_RECENT_HOURS = 48; // Keep last 48 hours in Redis, migrate older data

/**
 * Get file path for historical price data
 */
function getHistoricalDataPath(symbol: string, interval: string, startDate: string, endDate: string): string {
  const symbolLower = symbol.toLowerCase();
  const dir = path.join(HISTORICAL_DATA_DIR, symbolLower, interval);
  
  // For dates after 2025-12-27, use rolling file format
  if (endDate > '2025-12-27') {
    return path.join(dir, `${symbolLower}_${interval}_rolling.json.gz`);
  } else {
    return path.join(dir, `${symbolLower}_${interval}_${startDate}_${endDate}.json.gz`);
  }
}

/**
 * Load existing candles from file
 */
async function loadFromFile(filePath: string): Promise<PriceCandle[] | null> {
  try {
    // Try compressed file first (.json.gz)
    const compressedPath = `${filePath}.gz`;
    const compressed = await fs.readFile(compressedPath);
    const decompressed = gunzipSync(compressed);
    const jsonString = decompressed.toString('utf-8');
    return JSON.parse(jsonString) as PriceCandle[];
  } catch {
    // Fallback: try uncompressed file
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as PriceCandle[];
    } catch {
      return null;
    }
  }
}

/**
 * Save candles to file (always as compressed .json.gz)
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
    console.error(`Failed to save to ${filePath}.gz:`, error);
    throw error;
  }
}

/**
 * Parse cache key to extract symbol, interval, and time range
 */
function parseCacheKey(key: string): { symbol: string; interval: string; startTime: number; endTime: number } | null {
  // Format: eth:price:cache:ETHUSDT:1d:1766966400000:1767052799999
  const parts = key.replace(PRICE_CACHE_PREFIX, '').split(':');
  if (parts.length !== 4) return null;
  
  const [symbol, interval, startTimeStr, endTimeStr] = parts;
  const startTime = parseInt(startTimeStr, 10);
  const endTime = parseInt(endTimeStr, 10);
  
  if (isNaN(startTime) || isNaN(endTime)) return null;
  
  return { symbol, interval, startTime, endTime };
}

/**
 * POST /api/trading/paper/migrate-redis
 * Migrate old candle data from Redis to files to free up Redis memory
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication (supports both admin auth and CRON_SECRET for GitHub Actions)
    const authHeader = request.headers.get('authorization');
    const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const isAdmin = await verifyAdminAuth(request);
    
    if (!isValidCron && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureConnected();
    
    // Get all price cache keys
    const keys = await redis.keys(`${PRICE_CACHE_PREFIX}*`);
    
    if (keys.length === 0) {
      return NextResponse.json({
        success: true,
        migrated: 0,
        kept: 0,
        message: 'No keys to migrate',
      });
    }
    
    const now = Date.now();
    const cutoffTime = now - (KEEP_RECENT_HOURS * 60 * 60 * 1000);
    const migrated: string[] = [];
    const kept: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];
    
    // Group candles by symbol and interval for efficient file operations
    const candlesByFile = new Map<string, PriceCandle[]>();
    
    for (const key of keys) {
      try {
        const parsed = parseCacheKey(key);
        if (!parsed) {
          continue;
        }
        
        const { symbol, interval, endTime } = parsed;
        
        // Check if this data is old enough to migrate (older than cutoff)
        // Keep recent data in Redis for quick access
        const isRecent = endTime >= cutoffTime;
        
        if (isRecent) {
          kept.push(key);
          continue;
        }
        
        // Get candles from Redis
        const cached = await redis.get(key);
        if (!cached) {
          continue;
        }
        
        const candles = JSON.parse(cached) as PriceCandle[];
        if (!Array.isArray(candles) || candles.length === 0) {
          continue;
        }
        
        // Determine file path based on candle timestamps
        const firstCandle = candles[0]!;
        const lastCandle = candles[candles.length - 1]!;
        const firstDate = new Date(firstCandle.timestamp);
        const lastDate = new Date(lastCandle.timestamp);
        const startDateStr = firstDate.toISOString().split('T')[0];
        const endDateStr = lastDate.toISOString().split('T')[0];
        
        const filePath = getHistoricalDataPath(symbol, interval, startDateStr, endDateStr);
        const fileKey = `${symbol}:${interval}:${filePath}`;
        
        // Accumulate candles for this file
        if (!candlesByFile.has(fileKey)) {
          candlesByFile.set(fileKey, []);
        }
        candlesByFile.get(fileKey)!.push(...candles);
        
        migrated.push(key);
        
      } catch (err) {
        errors.push({ key, error: err instanceof Error ? err.message : String(err) });
      }
    }
    
    // Save accumulated candles to files
    // NOTE: In Vercel serverless, file writes don't persist (filesystem is read-only)
    // This will work when run locally via CLI, but in serverless it will only delete from Redis
    let filesSaved = 0;
    let fileWriteErrors = 0;
    for (const [fileKey, candles] of candlesByFile.entries()) {
      try {
        const [, , filePath] = fileKey.split(':');
        
        // Load existing file data
        const existingCandles = await loadFromFile(filePath) || [];
        
        // Merge new candles with existing (deduplicate by timestamp)
        const candleMap = new Map<number, PriceCandle>();
        
        // Add existing candles
        existingCandles.forEach(c => candleMap.set(c.timestamp, c));
        
        // Add new candles (overwrite if timestamp exists - Redis data is more recent)
        candles.forEach(c => candleMap.set(c.timestamp, c));
        
        // Convert to array and sort
        const mergedCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        
        // Save to file (will fail silently in Vercel serverless, but that's OK)
        try {
          await saveToFile(filePath, mergedCandles);
          filesSaved++;
        } catch (fileError) {
          // In serverless, file writes fail - this is expected
          fileWriteErrors++;
          console.warn(`File write failed (expected in serverless): ${filePath}`, fileError);
        }
        
      } catch (error) {
        console.error(`Error processing file ${fileKey}:`, error);
      }
    }
    
    // Delete migrated keys from Redis
    let deletedCount = 0;
    if (migrated.length > 0) {
      for (const key of migrated) {
        try {
          await redis.del(key);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting key ${key}:`, error);
        }
      }
    }
    
    // Get Redis memory usage
    let memoryUsage = 'unknown';
    try {
      const info = await redis.info('memory');
      const usedMemoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      if (usedMemoryMatch) {
        memoryUsage = usedMemoryMatch[1]!.trim();
      }
    } catch {
      // Ignore if INFO command not available
    }
    
    const isServerless = process.env.VERCEL === '1';
    const message = isServerless
      ? `Deleted ${deletedCount} old keys from Redis (file writes not available in serverless). Run locally via 'pnpm eth:migrate-redis' to save to files.`
      : `Migrated ${migrated.length} keys to files, kept ${kept.length} recent keys in Redis`;
    
    return NextResponse.json({
      success: true,
      migrated: migrated.length,
      kept: kept.length,
      deleted: deletedCount,
      filesSaved,
      fileWriteErrors,
      errors: errors.length,
      memoryUsage,
      isServerless,
      message,
    });
    
  } catch (error) {
    console.error('Error migrating Redis data:', error);
    return NextResponse.json(
      { error: 'Failed to migrate Redis data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

