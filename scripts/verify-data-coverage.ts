#!/usr/bin/env npx tsx
/**
 * Verify data coverage for all periods, assets, and timeframes
 * Checks that we have all necessary candles for backfill tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import { getAssetConfig, type TradingAsset } from '@/lib/asset-config';

interface DataFile {
  asset: TradingAsset;
  timeframe: string;
  startDate: string;
  endDate: string;
  filepath: string;
  candleCount: number;
}

interface CoverageGap {
  asset: TradingAsset;
  timeframe: string;
  startDate: string;
  endDate: string;
  reason: string;
}

function parseFilename(filename: string): DataFile | null {
  // Pattern: {symbol}_{timeframe}_{startDate}_{endDate}.json.gz
  const match = filename.match(/^(ethusdt|btcusdt)_(4h|8h)_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json\.gz$/);
  if (!match) return null;
  
  const [, symbol, timeframe, startDate, endDate] = match;
  const asset = symbol === 'ethusdt' ? 'eth' : 'btc';
  
  // Count candles
  const filepath = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic', filename);
  let candleCount = 0;
  try {
    const compressed = fs.readFileSync(filepath);
    const decompressed = gunzipSync(compressed);
    const candles = JSON.parse(decompressed.toString());
    candleCount = candles.length;
  } catch {
    // Ignore errors
  }
  
  return { asset, timeframe, startDate, endDate, filepath, candleCount };
}

function checkCoverage(
  requiredStart: string,
  requiredEnd: string,
  files: DataFile[]
): { covered: boolean; gaps: Array<{ start: string; end: string }> } {
  const requiredStartTime = new Date(requiredStart).getTime();
  const requiredEndTime = new Date(requiredEnd).getTime();
  
  // Sort files by start date
  const sortedFiles = files
    .filter(f => f.timeframe === files[0]!.timeframe && f.asset === files[0]!.asset)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  
  const gaps: Array<{ start: string; end: string }> = [];
  let currentCoveredEnd = requiredStartTime;
  
  for (const file of sortedFiles) {
    const fileStart = new Date(file.startDate).getTime();
    const fileEnd = new Date(file.endDate).getTime();
    
    // Check if this file covers any part of the required range
    if (fileEnd < requiredStartTime || fileStart > requiredEndTime) {
      continue; // File doesn't overlap with required range
    }
    
    // If there's a gap before this file
    if (fileStart > currentCoveredEnd) {
      gaps.push({
        start: new Date(currentCoveredEnd).toISOString().split('T')[0],
        end: new Date(fileStart - 1).toISOString().split('T')[0],
      });
    }
    
    // Update covered end
    currentCoveredEnd = Math.max(currentCoveredEnd, fileEnd);
  }
  
  // Check if there's a gap at the end
  if (currentCoveredEnd < requiredEndTime) {
    gaps.push({
      start: new Date(currentCoveredEnd + 1).toISOString().split('T')[0],
      end: requiredEnd,
    });
  }
  
  return {
    covered: gaps.length === 0 && currentCoveredEnd >= requiredEndTime,
    gaps,
  };
}

async function main() {
  console.log('🔍 Verifying Data Coverage for All Periods, Assets, and Timeframes\n');
  
  const syntheticDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const historicalDir = path.join(process.cwd(), 'data', 'historical-prices');
  
  // Load all data files from synthetic directory
  let files: DataFile[] = [];
  
  if (fs.existsSync(syntheticDir)) {
    const syntheticFiles = fs.readdirSync(syntheticDir)
      .filter(f => f.endsWith('.json.gz') && (f.includes('4h') || f.includes('8h')))
      .map(f => parseFilename(path.basename(f)))
      .filter((f): f is DataFile => f !== null);
    files.push(...syntheticFiles);
  }
  
  // Also check historical directories for ETH 2025 data
  const eth8hDir = path.join(historicalDir, 'ethusdt', '8h');
  if (fs.existsSync(eth8hDir)) {
    const historicalFiles = fs.readdirSync(eth8hDir)
      .filter(f => f.endsWith('.json.gz') && !f.includes('archive'))
      .map(f => {
        const filepath = path.join(eth8hDir, f);
        let candleCount = 0;
        let startDate: string | null = null;
        let endDate: string | null = null;
        
        try {
          const compressed = fs.readFileSync(filepath);
          const decompressed = gunzipSync(compressed);
          const candles = JSON.parse(decompressed.toString());
          candleCount = candles.length;
          
          if (candles.length > 0) {
            // Get date range from file contents (works for both new and old formats)
            const first = new Date(candles[0]!.timestamp);
            const last = new Date(candles[candles.length - 1]!.timestamp);
            startDate = first.toISOString().split('T')[0];
            endDate = last.toISOString().split('T')[0];
          }
        } catch {}
        
        // Only include files that have data and cover 2025
        if (candleCount > 0 && startDate && endDate && (startDate <= '2025-12-31' && endDate >= '2025-01-01')) {
          return {
            asset: 'eth' as TradingAsset,
            timeframe: '8h',
            startDate,
            endDate,
            filepath,
            candleCount,
          };
        }
        return null;
      })
      .filter((f): f is DataFile => f !== null);
    files.push(...historicalFiles);
  }
  
  // Check for ETH 4h historical data (might not exist, but check anyway)
  const eth4hDir = path.join(historicalDir, 'ethusdt', '4h');
  if (fs.existsSync(eth4hDir)) {
    const historicalFiles = fs.readdirSync(eth4hDir)
      .filter(f => f.endsWith('.json.gz') && f.includes('2025'))
      .map(f => {
        const match = f.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json\.gz$/);
        if (match) {
          const [, startDate, endDate] = match;
          const filepath = path.join(eth4hDir, f);
          let candleCount = 0;
          try {
            const compressed = fs.readFileSync(filepath);
            const decompressed = gunzipSync(compressed);
            const candles = JSON.parse(decompressed.toString());
            candleCount = candles.length;
          } catch {}
          
          return {
            asset: 'eth' as TradingAsset,
            timeframe: '4h',
            startDate,
            endDate,
            filepath,
            candleCount,
          };
        }
        return null;
      })
      .filter((f): f is DataFile => f !== null);
    files.push(...historicalFiles);
  }
  
  console.log(`📁 Found ${files.length} data files\n`);
  
  // Required periods (from comprehensive-multi-asset-backfill.ts)
  // Note: We check for exact coverage, but backfill tests can work with partial coverage
  // as long as the required test period dates are covered
  const requiredPeriods = [
    // 2025 (historical - only ETH has this)
    { start: '2025-01-01', end: '2025-12-27', synthetic: false, assets: ['eth'] as TradingAsset[], note: 'Historical data' },
    
    // 2026
    { start: '2026-01-01', end: '2026-12-31', synthetic: true, assets: ['eth', 'btc'] as TradingAsset[], note: 'Synthetic data' },
    
    // 2027
    { start: '2027-01-01', end: '2027-12-31', synthetic: true, assets: ['eth', 'btc'] as TradingAsset[], note: 'Synthetic data' },
    
    // 2028 (divergence tests - only need up to 2028-03-17)
    { start: '2028-01-01', end: '2028-03-17', synthetic: true, assets: ['eth', 'btc'] as TradingAsset[], note: 'Synthetic data (divergence tests)' },
  ];
  
  const timeframes = ['4h', '8h'];
  const gaps: CoverageGap[] = [];
  
  console.log('Checking coverage...\n');
  
  for (const period of requiredPeriods) {
    for (const asset of period.assets) {
      for (const timeframe of timeframes) {
        const relevantFiles = files.filter(f => 
          f.asset === asset && 
          f.timeframe === timeframe
        );
        
        if (relevantFiles.length === 0) {
          gaps.push({
            asset,
            timeframe,
            startDate: period.start,
            endDate: period.end,
            reason: 'No data files found',
          });
          continue;
        }
        
        const coverage = checkCoverage(period.start, period.end, relevantFiles);
        
        if (!coverage.covered) {
          gaps.push({
            asset,
            timeframe,
            startDate: period.start,
            endDate: period.end,
            reason: `Gaps: ${coverage.gaps.map(g => `${g.start} to ${g.end}`).join(', ')}`,
          });
        }
      }
    }
  }
  
  // Print summary
  console.log('='.repeat(80));
  console.log('COVERAGE SUMMARY');
  console.log('='.repeat(80));
  
  if (gaps.length === 0) {
    console.log('\n✅ All periods are fully covered!\n');
  } else {
    console.log(`\n⚠️  Found ${gaps.length} coverage gaps:\n`);
    
    for (const gap of gaps) {
      const assetName = getAssetConfig(gap.asset).displayName;
      console.log(`❌ ${assetName} ${gap.timeframe}: ${gap.startDate} to ${gap.endDate}`);
      console.log(`   Reason: ${gap.reason}\n`);
    }
  }
  
  // Print file details
  console.log('\n' + '='.repeat(80));
  console.log('DATA FILES DETAILS');
  console.log('='.repeat(80));
  
  const grouped = new Map<string, DataFile[]>();
  for (const file of files) {
    const key = `${file.asset}-${file.timeframe}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(file);
  }
  
  for (const [key, fileList] of grouped.entries()) {
    const [asset, timeframe] = key.split('-');
    const assetName = getAssetConfig(asset as TradingAsset).displayName;
    console.log(`\n${assetName} ${timeframe.toUpperCase()}:`);
    
    for (const file of fileList.sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      console.log(`  ✅ ${file.startDate} to ${file.endDate} (${file.candleCount} candles)`);
    }
  }
  
  // Check for missing Dec 31 dates
  console.log('\n' + '='.repeat(80));
  console.log('MISSING DEC 31 CHECK');
  console.log('='.repeat(80));
  
  const missingDec31: string[] = [];
  for (const file of files) {
    if (file.endDate.endsWith('-12-30')) {
      const year = file.endDate.split('-')[0];
      missingDec31.push(`${file.asset} ${file.timeframe} ${year}`);
    }
  }
  
  if (missingDec31.length > 0) {
    console.log('\n⚠️  Files ending on Dec 30 instead of Dec 31:');
    for (const item of missingDec31) {
      console.log(`  - ${item}`);
    }
  } else {
    console.log('\n✅ All files end on Dec 31 where expected');
  }
}

main().catch(console.error);

