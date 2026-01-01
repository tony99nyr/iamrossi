#!/usr/bin/env tsx
/**
 * Script to populate local historical price data files
 * Fetches data in chunks going back as far as APIs allow
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { promises as fs } from 'fs';
import path from 'path';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

interface ChunkResult {
  startDate: string;
  endDate: string;
  success: boolean;
  candleCount: number;
  error?: string;
}

/**
 * Generate date chunks for fetching historical data
 */
function generateDateChunks(
  startDate: Date,
  endDate: Date,
  chunkDays: number = 60 // CoinGecko free tier limit
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let current = new Date(startDate);

  while (current < endDate) {
    const chunkStart = new Date(current);
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);

    // Don't go past endDate
    if (chunkEnd > endDate) {
      chunkEnd.setTime(endDate.getTime());
    }

    chunks.push({
      start: formatDate(chunkStart),
      end: formatDate(chunkEnd),
    });

    // Move to next chunk
    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }

  return chunks;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a data file already exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file path for historical data (new simplified format)
 */
function getFilePath(symbol: string, timeframe: string): string {
  return path.join(HISTORICAL_DATA_DIR, symbol.toLowerCase(), timeframe, `${symbol.toLowerCase()}_${timeframe}.json.gz`);
}

/**
 * Check if a date range is already covered by existing file
 */
async function isDateRangeCovered(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string
): Promise<{ covered: boolean; candleCount?: number }> {
  const filePath = getFilePath(symbol, timeframe);
  
  if (await fileExists(filePath)) {
    try {
      // Load compressed file
      const { gunzipSync } = await import('zlib');
      const compressed = await fs.readFile(filePath);
      const decompressed = gunzipSync(compressed);
      const candles = JSON.parse(decompressed.toString('utf-8')) as Array<{ timestamp: number }>;
      
      if (candles.length > 0) {
        // Check if the date range is covered
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime() + (24 * 60 * 60 * 1000) - 1; // End of day
        
        const candlesInRange = candles.filter(c => 
          c.timestamp >= startTime && c.timestamp <= endTime
        );
        
        // Consider covered if we have at least 80% of expected candles (allows for some gaps)
        // For daily candles, expect ~1 per day; for 8h, expect ~3 per day
        const daysDiff = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));
        const expectedCandles = timeframe === '1d' ? daysDiff : timeframe === '8h' ? daysDiff * 3 : daysDiff * 24;
        const coverageRatio = candlesInRange.length / expectedCandles;
        
        if (coverageRatio >= 0.8) {
          return { covered: true, candleCount: candles.length };
        }
      }
    } catch (error) {
      // File exists but is corrupted or can't be read - need to re-fetch
      return { covered: false };
    }
  }
  
  return { covered: false };
}

/**
 * Fetch and save a single chunk of historical data
 */
async function fetchChunk(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
  skipIfExists: boolean = true
): Promise<ChunkResult> {
  // Check if date range is already covered in the consolidated file
  if (skipIfExists) {
    const coverage = await isDateRangeCovered(symbol, timeframe, startDate, endDate);
    if (coverage.covered && coverage.candleCount) {
      return {
        startDate,
        endDate,
        success: true,
        candleCount: coverage.candleCount,
      };
    }
  }

  try {
    console.log(`📥 Fetching ${symbol} ${timeframe} from ${startDate} to ${endDate}...`);
    // fetchPriceCandles will automatically save to the new format file
    const candles = await fetchPriceCandles(symbol, timeframe, startDate, endDate);

    return {
      startDate,
      endDate,
      success: true,
      candleCount: candles.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      startDate,
      endDate,
      success: false,
      candleCount: 0,
      error: errorMessage,
    };
  }
}

/**
 * Main function to populate historical data
 */
async function main() {
  const args = process.argv.slice(2);
  const symbol = args[0] || 'ETHUSDT';
  const timeframe = args[1] || '1d';

  // Determine date range
  const endDate = new Date();
  const startDate = new Date();
  
  // Try to go back 2 years (CoinGecko free tier typically allows up to ~90 days per request,
  // but we can work backwards from today)
  startDate.setFullYear(startDate.getFullYear() - 2);
  
  // For CoinGecko free tier, use smaller chunks (30 days) to avoid time range limits
  const chunkDays = 30;

  console.log('🚀 Populating Historical Price Data');
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Timeframe: ${timeframe}`);
  console.log(`   Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
  console.log(`   Chunk Size: ${chunkDays} days\n`);

  const chunks = generateDateChunks(startDate, endDate, chunkDays);
  
  // Check which chunks already exist
  console.log(`📊 Checking existing data files...\n`);
  const existingChunks: Set<string> = new Set();
  let existingCount = 0;
  
  for (const chunk of chunks) {
    const coverage = await isDateRangeCovered(symbol, timeframe, chunk.start, chunk.end);
    if (coverage.covered) {
      existingChunks.add(`${chunk.start}_${chunk.end}`);
      existingCount++;
    }
  }
  
  const chunksToFetch = chunks.filter(
    chunk => !existingChunks.has(`${chunk.start}_${chunk.end}`)
  );
  
  console.log(`   Total chunks: ${chunks.length}`);
  console.log(`   Already cached: ${existingCount}`);
  console.log(`   Need to fetch: ${chunksToFetch.length}\n`);

  if (chunksToFetch.length === 0) {
    console.log('✅ All data already cached! Nothing to fetch.\n');
    // Still show summary with existing data
    let totalCandles = 0;
    for (const chunk of chunks) {
      const coverage = await isDateRangeCovered(symbol, timeframe, chunk.start, chunk.end);
      if (coverage.candleCount) {
        totalCandles += coverage.candleCount;
      }
    }
    console.log('='.repeat(60));
    console.log('📈 Population Summary');
    console.log('='.repeat(60));
    console.log(`   Total Chunks: ${chunks.length}`);
    console.log(`   Already Cached: ${existingCount}`);
    console.log(`   Total Candles: ${totalCandles}`);
    console.log(`   Data Directory: ${HISTORICAL_DATA_DIR}`);
    console.log('='.repeat(60));
    return;
  }

  const results: ChunkResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let totalCandles = 0;
  let skippedCount = 0;

  // Process chunks sequentially to avoid rate limits
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkKey = `${chunk.start}_${chunk.end}`;
    
    // Skip if already exists
    if (existingChunks.has(chunkKey)) {
      skippedCount++;
      const coverage = await isDateRangeCovered(symbol, timeframe, chunk.start, chunk.end);
      if (coverage.candleCount) {
        totalCandles += coverage.candleCount;
      }
      continue;
    }
    
    const result = await fetchChunk(symbol, timeframe, chunk.start, chunk.end, true);
    results.push(result);

    if (result.success) {
      successCount++;
      totalCandles += result.candleCount;
      const isNew = !existingChunks.has(chunkKey);
      console.log(`✅ Chunk ${i + 1}/${chunks.length}: ${result.candleCount} candles ${isNew ? 'saved' : 'loaded'}`);
    } else {
      failCount++;
      console.log(`❌ Chunk ${i + 1}/${chunks.length}: Failed - ${result.error?.substring(0, 100)}`);
      
      // If we hit API limits, stop trying more chunks
      if (result.error?.includes('exceeds the allowed time range') || 
          result.error?.includes('rate limit') ||
          result.error?.includes('Rate Limit') ||
          result.error?.includes('429') ||
          result.error?.includes('Unauthorized') ||
          result.error?.includes('restricted location')) {
        console.log(`\n⚠️  Hit API limits or restrictions. Stopping early.`);
        console.log(`   Try again later or use a different data source.`);
        break;
      }
    }

    // Add delay between chunks to respect rate limits
    // Longer delay to avoid hitting rate limits
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 Population Summary');
  console.log('='.repeat(60));
  console.log(`   Total Chunks: ${chunks.length}`);
  console.log(`   Skipped (already cached): ${skippedCount}`);
  console.log(`   Newly Fetched: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total Candles: ${totalCandles}`);
  console.log(`   Data Directory: ${HISTORICAL_DATA_DIR}`);
  console.log('='.repeat(60));

  // Show failed chunks
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ Failed Chunks:');
    failed.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.startDate} to ${result.endDate}: ${result.error?.substring(0, 80)}`);
    });
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

