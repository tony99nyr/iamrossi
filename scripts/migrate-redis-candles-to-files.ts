import * as dotenv from 'dotenv';
import { redis, ensureConnected } from '../src/lib/kv';
import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { PriceCandle } from '../src/types';

// Load environment variables from .env.local if it exists (for local development)
// In CI/GitHub Actions, REDIS_URL should be set as an environment variable
// dotenv.config() won't override existing environment variables, so this is safe
const envPath = path.resolve(process.cwd(), '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local doesn't exist (e.g., in CI) - that's OK, use environment variables
}

// Verify REDIS_URL is set (critical for the script to work)
if (!process.env.REDIS_URL) {
  console.error('❌ ERROR: REDIS_URL environment variable is not set!');
  console.error('   In GitHub Actions, make sure REDIS_URL is set in Secrets');
  console.error('   Locally, make sure .env.local contains REDIS_URL');
  process.exit(1);
}

// Support both ETH and BTC - migrate data for all assets
import { getPriceCachePrefix, ASSET_CONFIGS } from '../src/lib/asset-config';
import type { TradingAsset } from '../src/lib/asset-config';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const KEEP_RECENT_HOURS = 48; // Keep last 48 hours in Redis, migrate older data

// Assets to migrate (ETH and BTC)
const ASSETS_TO_MIGRATE: TradingAsset[] = ['eth', 'btc'];

/**
 * Get file path for historical price data
 * Simplified: Single file per symbol/interval (no dates in filename)
 * Format: {symbol}_{interval}.json.gz (e.g., ethusdt_8h.json.gz)
 */
function getHistoricalDataPath(symbol: string, interval: string): string {
  const symbolLower = symbol.toLowerCase();
  const dir = path.join(HISTORICAL_DATA_DIR, symbolLower, interval);
  
  // Ensure directory exists
  fs.mkdir(dir, { recursive: true }).catch(() => {});
  
  return path.join(dir, `${symbolLower}_${interval}.json.gz`);
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
  } catch (error) {
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
 * Supports both eth:price:cache: and btc:price:cache: prefixes
 */
function parseCacheKey(key: string): { symbol: string; interval: string; startTime: number; endTime: number; asset: TradingAsset } | null {
  // Format: eth:price:cache:ETHUSDT:1d:1766966400000:1767052799999
  // Format: btc:price:cache:BTCUSDT:1d:1766966400000:1767052799999
  
  // Try to match any asset prefix
  let asset: TradingAsset | null = null;
  let prefix = '';
  for (const a of ASSETS_TO_MIGRATE) {
    const testPrefix = getPriceCachePrefix(a);
    if (key.startsWith(testPrefix)) {
      asset = a;
      prefix = testPrefix;
      break;
    }
  }
  
  if (!asset || !prefix) return null;
  
  const parts = key.replace(prefix, '').split(':');
  if (parts.length !== 4) return null;
  
  const [symbol, interval, startTimeStr, endTimeStr] = parts;
  const startTime = parseInt(startTimeStr, 10);
  const endTime = parseInt(endTimeStr, 10);
  
  if (isNaN(startTime) || isNaN(endTime)) return null;
  
  return { symbol, interval, startTime, endTime, asset };
}

/**
 * Migrate candles from Redis to files for a specific asset
 */
async function migrateCandlesToFilesForAsset(asset: TradingAsset): Promise<void> {
  const assetConfig = ASSET_CONFIGS[asset];
  const prefix = getPriceCachePrefix(asset);
  
  console.log(`\n🔄 Migrating ${assetConfig.displayName} (${assetConfig.symbol}) data...`);
  
  // Get all price cache keys for this asset
  const keys = await redis.keys(`${prefix}*`);
  console.log(`📊 Found ${keys.length} ${assetConfig.displayName} price cache keys in Redis`);
  
  if (keys.length === 0) {
    console.log(`✅ No ${assetConfig.displayName} keys to migrate`);
    return;
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
        console.warn(`⚠️ Could not parse key: ${key}`);
        continue;
      }
      
      const { symbol, interval, startTime, endTime, asset } = parsed;
      
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
      // Use simplified naming: single file per symbol/interval
      const filePath = getHistoricalDataPath(symbol, interval);
      const fileKey = `${symbol}:${interval}:${filePath}`;
      
      // Accumulate candles for this file
      if (!candlesByFile.has(fileKey)) {
        candlesByFile.set(fileKey, []);
      }
      candlesByFile.get(fileKey)!.push(...candles);
      
      migrated.push(key);
      
    } catch (error) {
      errors.push({ key, error: error instanceof Error ? error.message : String(error) });
      console.error(`❌ Error processing key ${key}:`, error);
    }
  }
  
  // Save accumulated candles to files
  console.log(`\n💾 Saving ${candlesByFile.size} files...`);
  for (const [fileKey, candles] of candlesByFile.entries()) {
    try {
      const [symbol, interval, filePath] = fileKey.split(':');
      
      // Load existing file data
      let existingCandles = await loadFromFile(filePath) || [];
      
      // Merge new candles with existing (deduplicate by timestamp)
      const candleMap = new Map<number, PriceCandle>();
      
      // Add existing candles
      existingCandles.forEach(c => candleMap.set(c.timestamp, c));
      
      // Add new candles (overwrite if timestamp exists - Redis data is more recent)
      candles.forEach(c => candleMap.set(c.timestamp, c));
      
      // Convert to array and sort
      const mergedCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      
      // Save to file
      await saveToFile(filePath, mergedCandles);
      console.log(`✅ Saved ${mergedCandles.length} candles to ${path.basename(filePath)} (${candles.length} new)`);
      
    } catch (error) {
      console.error(`❌ Error saving file ${fileKey}:`, error);
    }
  }
  
  // Delete migrated keys from Redis
  if (migrated.length > 0) {
    console.log(`\n🗑️  Deleting ${migrated.length} migrated keys from Redis...`);
    for (const key of migrated) {
      try {
        await redis.del(key);
      } catch (error) {
        console.error(`❌ Error deleting key ${key}:`, error);
      }
    }
    console.log(`✅ Deleted ${migrated.length} keys from Redis`);
  }
  
  // Summary
  console.log(`\n📊 Migration Summary:`);
  console.log(`   - Migrated to files: ${migrated.length} keys`);
  console.log(`   - Kept in Redis (recent): ${kept.length} keys`);
  console.log(`   - Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    errors.forEach(({ key, error }) => {
      console.log(`   - ${key}: ${error}`);
    });
  }
  
  // Check Redis memory usage
  try {
    const info = await redis.info('memory');
    const usedMemoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    if (usedMemoryMatch) {
      console.log(`\n💾 Redis memory usage: ${usedMemoryMatch[1]}`);
    }
  } catch (error) {
    // Ignore if INFO command not available
  }
}

/**
 * Main function
 */
async function main() {
  try {
    await ensureConnected();
    console.log('🔄 Starting Redis to files migration for all assets...');
    console.log(`   Assets: ${ASSETS_TO_MIGRATE.join(', ').toUpperCase()}\n`);
    
    for (const asset of ASSETS_TO_MIGRATE) {
      await migrateCandlesToFilesForAsset(asset);
    }
    
    console.log('\n✅ Migration completed successfully for all assets');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();

