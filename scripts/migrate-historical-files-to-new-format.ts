#!/usr/bin/env npx tsx
/**
 * Migrate historical price data files to new simplified naming format
 * 
 * This script:
 * 1. Finds all existing files (date-based, rolling, etc.)
 * 2. Loads all candles from all files
 * 3. Deduplicates by timestamp (keeps highest volume entry)
 * 4. Sorts chronologically
 * 5. Saves to new format: {symbol}_{interval}.json.gz
 * 6. Optionally archives old files
 * 
 * Usage:
 *   pnpm tsx scripts/migrate-historical-files-to-new-format.ts [--dry-run] [--archive]
 * 
 * Options:
 *   --dry-run: Show what would be done without actually migrating
 *   --archive: Move old files to archive/ subdirectory instead of deleting
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const DRY_RUN = process.argv.includes('--dry-run');
const ARCHIVE = process.argv.includes('--archive');

interface MigrationResult {
  symbol: string;
  interval: string;
  oldFiles: string[];
  newFile: string;
  totalCandles: number;
  uniqueCandles: number;
  dateRange: { start: string; end: string } | null;
  errors: string[];
}

/**
 * Load candles from a file (handles both .json.gz and .json)
 */
async function loadCandlesFromFile(filePath: string): Promise<PriceCandle[]> {
  try {
    // Handle double-compressed files (.json.gz.gz)
    if (filePath.endsWith('.json.gz.gz')) {
      const compressed = await fs.readFile(filePath);
      // Decompress twice
      const firstDecompressed = gunzipSync(compressed);
      const secondDecompressed = gunzipSync(firstDecompressed);
      return JSON.parse(secondDecompressed.toString('utf-8')) as PriceCandle[];
    }
    
    // Try compressed first
    const compressedPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
    try {
      const compressed = await fs.readFile(compressedPath);
      const decompressed = gunzipSync(compressed);
      return JSON.parse(decompressed.toString('utf-8')) as PriceCandle[];
    } catch {
      // Try uncompressed
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as PriceCandle[];
    }
  } catch (error) {
    console.error(`  ⚠️  Failed to load ${filePath}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Save candles to file (always compressed)
 */
async function saveCandlesToFile(filePath: string, candles: PriceCandle[]): Promise<void> {
  const jsonString = JSON.stringify(candles, null, 2);
  const compressed = gzipSync(jsonString);
  await fs.writeFile(filePath, compressed);
}

/**
 * Migrate files for a specific symbol and interval
 */
async function migrateSymbolInterval(
  symbol: string,
  interval: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    symbol,
    interval,
    oldFiles: [],
    newFile: '',
    totalCandles: 0,
    uniqueCandles: 0,
    dateRange: null,
    errors: [],
  };

  const dir = path.join(HISTORICAL_DATA_DIR, symbol, interval);
  const newFilePath = path.join(dir, `${symbol}_${interval}.json.gz`);

  // Check if directory exists
  try {
    await fs.access(dir);
  } catch {
    console.log(`  ⚠️  Directory doesn't exist: ${dir}`);
    return result;
  }

  // Find all files in directory
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (error) {
    result.errors.push(`Failed to read directory: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  // Filter to JSON files (exclude archive directory)
  // Handle both .json, .json.gz, and .json.gz.gz (double-compressed files)
  const jsonFiles = files.filter(f => 
    (f.endsWith('.json') || f.endsWith('.json.gz') || f.endsWith('.json.gz.gz')) &&
    !f.startsWith('.') &&
    f !== path.basename(newFilePath) && // Don't include the new file if it already exists
    f !== 'archive'
  );

  if (jsonFiles.length === 0) {
    console.log(`  ℹ️  No files to migrate for ${symbol}/${interval}`);
    return result;
  }

  result.oldFiles = jsonFiles;

  // Load all candles from all files
  const allCandles: PriceCandle[] = [];
  for (const file of jsonFiles) {
    const filePath = path.join(dir, file);
    const candles = await loadCandlesFromFile(filePath);
    allCandles.push(...candles);
    console.log(`  📁 Loaded ${candles.length} candles from ${file}`);
  }

  result.totalCandles = allCandles.length;

  if (allCandles.length === 0) {
    console.log(`  ⚠️  No candles found in any files for ${symbol}/${interval}`);
    return result;
  }

  // Deduplicate by timestamp (keep highest volume entry if duplicates)
  const candleMap = new Map<number, PriceCandle>();
  for (const candle of allCandles) {
    const existing = candleMap.get(candle.timestamp);
    if (!existing || (candle.volume || 0) > (existing.volume || 0)) {
      candleMap.set(candle.timestamp, candle);
    }
  }

  const uniqueCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  result.uniqueCandles = uniqueCandles.length;

  if (uniqueCandles.length > 0) {
    const first = uniqueCandles[0]!;
    const last = uniqueCandles[uniqueCandles.length - 1]!;
    result.dateRange = {
      start: new Date(first.timestamp).toISOString().split('T')[0],
      end: new Date(last.timestamp).toISOString().split('T')[0],
    };
  }

  result.newFile = newFilePath;

  if (DRY_RUN) {
    console.log(`  🔍 [DRY RUN] Would create: ${path.basename(newFilePath)}`);
    console.log(`     - ${result.uniqueCandles} unique candles (from ${result.totalCandles} total)`);
    if (result.dateRange) {
      console.log(`     - Date range: ${result.dateRange.start} to ${result.dateRange.end}`);
    }
    console.log(`     - Would ${ARCHIVE ? 'archive' : 'delete'} ${jsonFiles.length} old file(s)`);
    return result;
  }

  // Save to new file
  try {
    await saveCandlesToFile(newFilePath, uniqueCandles);
    console.log(`  ✅ Created: ${path.basename(newFilePath)} (${result.uniqueCandles} candles)`);
  } catch (error) {
    result.errors.push(`Failed to save new file: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  // Archive or delete old files
  if (ARCHIVE) {
    const archiveDir = path.join(dir, 'archive');
    try {
      await fs.mkdir(archiveDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    for (const file of jsonFiles) {
      const oldPath = path.join(dir, file);
      const archivePath = path.join(archiveDir, file);
      try {
        await fs.rename(oldPath, archivePath);
        // Also move .gz version if it exists
        if (!file.endsWith('.gz')) {
          try {
            await fs.rename(`${oldPath}.gz`, `${archivePath}.gz`);
          } catch {
            // .gz version might not exist
          }
        }
        console.log(`  📦 Archived: ${file}`);
      } catch (error) {
        result.errors.push(`Failed to archive ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    // Delete old files
    for (const file of jsonFiles) {
      const oldPath = path.join(dir, file);
      try {
        await fs.unlink(oldPath);
        // Also delete .gz version if it exists
        if (!file.endsWith('.gz')) {
          try {
            await fs.unlink(`${oldPath}.gz`);
          } catch {
            // .gz version might not exist
          }
        }
        console.log(`  🗑️  Deleted: ${file}`);
      } catch (error) {
        result.errors.push(`Failed to delete ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return result;
}

/**
 * Main migration function
 */
async function main() {
  console.log('🔄 Migrating historical price data files to new format...\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  if (ARCHIVE) {
    console.log('📦 Old files will be archived to archive/ subdirectories\n');
  } else {
    console.log('🗑️  Old files will be deleted\n');
  }

  // Find all symbol directories
  const symbols: string[] = [];
  try {
    const entries = await fs.readdir(HISTORICAL_DATA_DIR);
    for (const entry of entries) {
      const entryPath = path.join(HISTORICAL_DATA_DIR, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory() && entry !== 'synthetic' && entry !== 'archive') {
        symbols.push(entry);
      }
    }
  } catch (error) {
    console.error('Failed to read historical data directory:', error);
    process.exit(1);
  }

  if (symbols.length === 0) {
    console.log('No symbol directories found');
    return;
  }

  const results: MigrationResult[] = [];

  // Migrate each symbol/interval combination
  for (const symbol of symbols) {
    console.log(`\n📊 Processing ${symbol}...`);
    
    const symbolDir = path.join(HISTORICAL_DATA_DIR, symbol);
    let intervals: string[] = [];
    
    try {
      const entries = await fs.readdir(symbolDir);
      for (const entry of entries) {
        const entryPath = path.join(symbolDir, entry);
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
          intervals.push(entry);
        }
      }
    } catch (error) {
      console.error(`  ⚠️  Failed to read ${symbol} directory:`, error);
      continue;
    }

    for (const interval of intervals) {
      console.log(`\n  Processing ${symbol}/${interval}...`);
      const result = await migrateSymbolInterval(symbol, interval);
      results.push(result);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary\n');

  const successful = results.filter(r => r.uniqueCandles > 0 && r.errors.length === 0);
  const withErrors = results.filter(r => r.errors.length > 0);
  const skipped = results.filter(r => r.uniqueCandles === 0 && r.errors.length === 0);

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`⚠️  With errors: ${withErrors.length}`);
  console.log(`ℹ️  Skipped (no data): ${skipped.length}\n`);

  if (successful.length > 0) {
    console.log('Successful migrations:');
    for (const result of successful) {
      console.log(`  ${result.symbol}/${result.interval}:`);
      console.log(`    - ${result.uniqueCandles} unique candles (from ${result.totalCandles} total)`);
      if (result.dateRange) {
        console.log(`    - Date range: ${result.dateRange.start} to ${result.dateRange.end}`);
      }
      console.log(`    - Migrated ${result.oldFiles.length} file(s) → ${path.basename(result.newFile)}`);
    }
  }

  if (withErrors.length > 0) {
    console.log('\n⚠️  Migrations with errors:');
    for (const result of withErrors) {
      console.log(`  ${result.symbol}/${result.interval}:`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  if (DRY_RUN) {
    console.log('\n🔍 This was a dry run. Run without --dry-run to perform the migration.');
  } else {
    console.log('\n✅ Migration complete!');
  }
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});

