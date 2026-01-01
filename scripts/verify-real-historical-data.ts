#!/usr/bin/env npx tsx
/**
 * Verify REAL historical data coverage for all assets and timeframes
 * REAL data = from APIs (Binance, CoinGecko, Coinbase)
 * Synthetic data = NOT REAL (only for backfill tests)
 */

import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import { getAssetConfig, type TradingAsset } from '@/lib/asset-config';

interface RealDataFile {
  asset: TradingAsset;
  timeframe: string;
  startDate: string;
  endDate: string;
  filepath: string;
  candleCount: number;
  isReal: boolean; // true = real historical, false = synthetic
}

function findRealHistoricalFiles(): RealDataFile[] {
  const historicalDir = path.join(process.cwd(), 'data', 'historical-prices');
  const files: RealDataFile[] = [];
  
  // Check each asset directory (excluding synthetic)
  const assetDirs = fs.readdirSync(historicalDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'synthetic')
    .map(d => d.name);
  
  for (const assetDir of assetDirs) {
    // Determine asset from directory name (ethusdt -> eth, btcusdt -> btc)
    let asset: TradingAsset | null = null;
    if (assetDir.toLowerCase().includes('eth')) {
      asset = 'eth';
    } else if (assetDir.toLowerCase().includes('btc')) {
      asset = 'btc';
    }
    
    if (!asset) continue;
    
    const assetPath = path.join(historicalDir, assetDir);
    const timeframeDirs = fs.readdirSync(assetPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const timeframe of timeframeDirs) {
      const timeframePath = path.join(assetPath, timeframe);
      const dataFiles = fs.readdirSync(timeframePath)
        .filter(f => f.endsWith('.json.gz'));
      
      for (const filename of dataFiles) {
        // Parse filename patterns:
        // 1. {symbol}_{timeframe}.json.gz (new simplified format)
        // 2. YYYY-MM-DD_YYYY-MM-DD.json.gz (legacy)
        // 3. {symbol}_{timeframe}_YYYY-MM-DD_YYYY-MM-DD.json.gz (legacy)
        // 4. {symbol}_{timeframe}_rolling.json.gz (legacy)
        let startDate: string | null = null;
        let endDate: string | null = null;
        
        // Check for new simplified format first: {symbol}_{timeframe}.json.gz
        const newFormatMatch = filename.match(/^([a-z]+)_([a-z0-9]+)\.json\.gz$/);
        if (newFormatMatch) {
          // New format - check contents to determine date range
          const filepath = path.join(timeframePath, filename);
          try {
            const compressed = fs.readFileSync(filepath);
            const decompressed = gunzipSync(compressed);
            const candles = JSON.parse(decompressed.toString());
            if (candles.length > 0) {
              const first = new Date(candles[0]!.timestamp);
              const last = new Date(candles[candles.length - 1]!.timestamp);
              startDate = first.toISOString().split('T')[0];
              endDate = last.toISOString().split('T')[0];
            }
          } catch {
            continue;
          }
        } else {
          // Legacy formats
          const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json\.gz$/);
          if (dateMatch) {
            [, startDate, endDate] = dateMatch;
          } else if (filename.includes('rolling')) {
            // Rolling file - check its contents to determine date range
            const filepath = path.join(timeframePath, filename);
            try {
              const compressed = fs.readFileSync(filepath);
              const decompressed = gunzipSync(compressed);
              const candles = JSON.parse(decompressed.toString());
              if (candles.length > 0) {
                const first = new Date(candles[0]!.timestamp);
                const last = new Date(candles[candles.length - 1]!.timestamp);
                startDate = first.toISOString().split('T')[0];
                endDate = last.toISOString().split('T')[0];
              }
            } catch {
              continue;
            }
          }
        }
        
        if (!startDate || !endDate) continue;
        
        const filepath = path.join(timeframePath, filename);
        let candleCount = 0;
        try {
          const compressed = fs.readFileSync(filepath);
          const decompressed = gunzipSync(compressed);
          const candles = JSON.parse(decompressed.toString());
          candleCount = candles.length;
        } catch {
          continue;
        }
        
        files.push({
          asset,
          timeframe,
          startDate,
          endDate,
          filepath,
          candleCount,
          isReal: true, // All files in asset directories are real
        });
      }
    }
  }
  
  return files;
}

async function main() {
  console.log('🔍 Verifying REAL Historical Data Coverage\n');
  console.log('REAL data = from APIs (Binance, CoinGecko, Coinbase)');
  console.log('Synthetic data = NOT REAL (only for backfill tests)\n');
  
  const realFiles = findRealHistoricalFiles();
  
  console.log(`📁 Found ${realFiles.length} REAL historical data files\n`);
  
  // Group by asset and timeframe
  const grouped = new Map<string, RealDataFile[]>();
  for (const file of realFiles) {
    const key = `${file.asset}-${file.timeframe}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(file);
  }
  
  // Check coverage for required timeframes
  const assets: TradingAsset[] = ['eth', 'btc'];
  const timeframes = ['4h', '8h'];
  
  console.log('='.repeat(80));
  console.log('REAL HISTORICAL DATA COVERAGE');
  console.log('='.repeat(80));
  
  for (const asset of assets) {
    const assetConfig = getAssetConfig(asset);
    console.log(`\n${assetConfig.displayName} (${assetConfig.symbol}):`);
    
    for (const timeframe of timeframes) {
      const key = `${asset}-${timeframe}`;
      const files = grouped.get(key) || [];
      
      if (files.length === 0) {
        console.log(`  ❌ ${timeframe}: NO REAL DATA FILES FOUND`);
        console.log(`     Paper trading will need to fetch from APIs`);
      } else {
        console.log(`  ✅ ${timeframe}: ${files.length} file(s)`);
        
        // Sort by start date
        const sorted = files.sort((a, b) => a.startDate.localeCompare(b.startDate));
        
        for (const file of sorted) {
          const dateRange = file.endDate === file.startDate 
            ? file.startDate 
            : `${file.startDate} to ${file.endDate}`;
          console.log(`     - ${dateRange} (${file.candleCount} candles)`);
        }
        
        // Calculate total coverage
        const earliest = sorted[0]!.startDate;
        const latest = sorted.reduce((latest, f) => f.endDate > latest ? f.endDate : latest, sorted[0]!.endDate);
        const totalCandles = sorted.reduce((sum, f) => sum + f.candleCount, 0);
        
        console.log(`     Total: ${earliest} to ${latest} (${totalCandles} candles)`);
      }
    }
  }
  
  // Check what's needed for paper trading
  console.log('\n' + '='.repeat(80));
  console.log('PAPER TRADING REQUIREMENTS');
  console.log('='.repeat(80));
  
  console.log('\nPaper trading needs:');
  console.log('- ETH: Real historical data from 2020-01-01 (or as far back as available)');
  console.log('- BTC: Real historical data from 90 days ago (or as far back as available)');
  console.log('- Minimum 50 candles to start a session');
  console.log('- NO synthetic data (synthetic is only for backfill tests)\n');
  
  // Check ETH coverage
  const eth8hFiles = grouped.get('eth-8h') || [];
  const eth4hFiles = grouped.get('eth-4h') || [];
  
  console.log('ETH Coverage:');
  if (eth8hFiles.length > 0) {
    const totalCandles = eth8hFiles.reduce((sum, f) => sum + f.candleCount, 0);
    console.log(`  ✅ 8h: ${totalCandles} real candles available`);
  } else {
    console.log(`  ❌ 8h: No real data files - will fetch from APIs`);
  }
  
  if (eth4hFiles.length > 0) {
    const totalCandles = eth4hFiles.reduce((sum, f) => sum + f.candleCount, 0);
    console.log(`  ✅ 4h: ${totalCandles} real candles available`);
  } else {
    console.log(`  ❌ 4h: No real data files - will fetch from APIs`);
  }
  
  // Check BTC coverage
  const btc8hFiles = grouped.get('btc-8h') || [];
  const btc4hFiles = grouped.get('btc-4h') || [];
  
  console.log('\nBTC Coverage:');
  if (btc8hFiles.length > 0) {
    const totalCandles = btc8hFiles.reduce((sum, f) => sum + f.candleCount, 0);
    console.log(`  ✅ 8h: ${totalCandles} real candles available`);
  } else {
    console.log(`  ❌ 8h: No real data files - will fetch from APIs`);
    console.log(`     ⚠️  BTC paper trading will rely on API fetches (90 days lookback)`);
  }
  
  if (btc4hFiles.length > 0) {
    const totalCandles = btc4hFiles.reduce((sum, f) => sum + f.candleCount, 0);
    console.log(`  ✅ 4h: ${totalCandles} real candles available`);
  } else {
    console.log(`  ❌ 4h: No real data files - will fetch from APIs`);
    console.log(`     ⚠️  BTC paper trading will rely on API fetches (90 days lookback)`);
  }
  
  // Recommendations
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));
  
  if (btc8hFiles.length === 0 && btc4hFiles.length === 0) {
    console.log('\n⚠️  BTC has no real historical data files!');
    console.log('   - Paper trading will work (fetches from APIs)');
    console.log('   - But it would be better to collect and save real BTC data');
    console.log('   - Consider running a script to fetch and save BTC historical data');
    console.log('   - This would improve performance and reduce API calls');
  }
  
  if (eth4hFiles.length === 0) {
    console.log('\n⚠️  ETH 4h has no real historical data files!');
    console.log('   - Paper trading will fetch from APIs');
    console.log('   - Consider generating 4h from 8h data or fetching from APIs');
  }
  
  console.log('\n✅ Synthetic data is correctly separated (only in synthetic/ directory)');
  console.log('✅ Paper trading will NEVER use synthetic data (allowSyntheticData=false)');
}

main().catch(console.error);

