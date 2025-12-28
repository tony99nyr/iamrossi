#!/usr/bin/env tsx
/**
 * Script to organize, merge, deduplicate, sort, and compress historical price data
 * Consolidates multiple JSON files into organized, compressed files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

interface OrganizedData {
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  candleCount: number;
  filePath: string;
}

/**
 * Read all JSON files for a symbol/timeframe combination
 */
async function readAllFiles(
  symbol: string,
  timeframe: string
): Promise<PriceCandle[]> {
  const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), timeframe);
  
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.gz'));
    
    const allCandles: PriceCandle[] = [];
    
    for (const file of jsonFiles) {
      const filePath = path.join(dir, file);
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const candles = JSON.parse(data) as PriceCandle[];
        allCandles.push(...candles);
        console.log(`   Read ${candles.length} candles from ${file}`);
      } catch (error) {
        console.warn(`   ⚠️  Failed to read ${file}: ${error}`);
      }
    }
    
    return allCandles;
  } catch (error) {
    console.warn(`   ⚠️  Directory ${dir} doesn't exist or is empty`);
    return [];
  }
}

/**
 * Deduplicate and sort candles by timestamp
 */
function organizeCandles(candles: PriceCandle[]): PriceCandle[] {
  // Remove duplicates by timestamp
  const uniqueMap = new Map<number, PriceCandle>();
  
  for (const candle of candles) {
    const existing = uniqueMap.get(candle.timestamp);
    if (!existing || candle.volume > existing.volume) {
      // Keep the one with higher volume (more complete data)
      uniqueMap.set(candle.timestamp, candle);
    }
  }
  
  // Convert to array and sort by timestamp
  const sorted = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  
  return sorted;
}

/**
 * Save organized data as compressed JSON
 */
async function saveCompressed(
  symbol: string,
  timeframe: string,
  candles: PriceCandle[]
): Promise<OrganizedData> {
  if (candles.length === 0) {
    throw new Error('No candles to save');
  }
  
  const startDate = new Date(candles[0].timestamp).toISOString().split('T')[0];
  const endDate = new Date(candles[candles.length - 1].timestamp).toISOString().split('T')[0];
  
  // Create organized filename
  const filename = `${symbol.toLowerCase()}_${timeframe}_${startDate}_${endDate}.json.gz`;
  const filePath = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), timeframe, filename);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Compress JSON
  const jsonString = JSON.stringify(candles, null, 0); // No pretty printing for smaller size
  const compressed = gzipSync(jsonString, { level: 9 }); // Maximum compression
  
  // Save compressed file
  await fs.writeFile(filePath, compressed);
  
  const originalSize = Buffer.byteLength(jsonString, 'utf8');
  const compressedSize = compressed.length;
  const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
  
  console.log(`   💾 Saved ${candles.length} candles to ${filename}`);
  console.log(`      Original: ${(originalSize / 1024).toFixed(1)} KB`);
  console.log(`      Compressed: ${(compressedSize / 1024).toFixed(1)} KB`);
  console.log(`      Compression: ${compressionRatio}%`);
  
  return {
    symbol: symbol.toLowerCase(),
    timeframe,
    startDate,
    endDate,
    candleCount: candles.length,
    filePath,
  };
}

/**
 * Load compressed data
 */
export async function loadCompressed(filePath: string): Promise<PriceCandle[]> {
  const compressed = await fs.readFile(filePath);
  const decompressed = gunzipSync(compressed);
  const jsonString = decompressed.toString('utf-8');
  return JSON.parse(jsonString) as PriceCandle[];
}

/**
 * Main organization function
 */
async function organizeData(symbol: string, timeframe: string) {
  console.log(`\n📦 Organizing ${symbol} ${timeframe} data...\n`);
  
  // Read all files
  console.log('📖 Reading existing files...');
  const allCandles = await readAllFiles(symbol, timeframe);
  
  if (allCandles.length === 0) {
    console.log('   No data found to organize.');
    return null;
  }
  
  console.log(`\n   Total candles read: ${allCandles.length}`);
  
  // Organize (deduplicate and sort)
  console.log('\n🔄 Deduplicating and sorting...');
  const organized = organizeCandles(allCandles);
  console.log(`   Unique candles after deduplication: ${organized.length}`);
  
  if (organized.length === 0) {
    console.log('   No valid candles to save.');
    return null;
  }
  
  // Save compressed
  console.log('\n💾 Compressing and saving...');
  const result = await saveCompressed(symbol, timeframe, organized);
  
  // Optionally, archive original files
  const archiveDir = path.join(
    HISTORICAL_DATA_DIR,
    symbol.toLowerCase(),
    timeframe,
    'archive'
  );
  await fs.mkdir(archiveDir, { recursive: true });
  
  const dir = path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), timeframe);
  const files = await fs.readdir(dir);
  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.gz'));
  
  let archivedCount = 0;
  for (const file of jsonFiles) {
    const sourcePath = path.join(dir, file);
    const archivePath = path.join(archiveDir, file);
    try {
      await fs.rename(sourcePath, archivePath);
      archivedCount++;
    } catch (error) {
      console.warn(`   ⚠️  Failed to archive ${file}: ${error}`);
    }
  }
  
  if (archivedCount > 0) {
    console.log(`\n📁 Archived ${archivedCount} original files to archive/`);
  }
  
  return result;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const symbol = args[0] || 'ETHUSDT';
  const timeframe = args[1] || '1d';
  
  console.log('🚀 Historical Data Organization Tool');
  console.log('='.repeat(60));
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Timeframe: ${timeframe}`);
  console.log('='.repeat(60));
  
  try {
    const result = await organizeData(symbol, timeframe);
    
    if (result) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ Organization Complete!');
      console.log('='.repeat(60));
      console.log(`   Symbol: ${result.symbol}`);
      console.log(`   Timeframe: ${result.timeframe}`);
      console.log(`   Date Range: ${result.startDate} to ${result.endDate}`);
      console.log(`   Total Candles: ${result.candleCount}`);
      console.log(`   File: ${result.filePath}`);
      console.log('='.repeat(60));
      console.log('\n💡 To load compressed data, use:');
      console.log(`   import { loadCompressed } from '@/scripts/organize-historical-data';`);
      console.log(`   const candles = await loadCompressed('${result.filePath}');`);
    }
  } catch (error) {
    console.error('\n❌ Organization failed:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

