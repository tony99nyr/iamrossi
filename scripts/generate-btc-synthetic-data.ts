#!/usr/bin/env npx tsx
/**
 * Generate Correlated BTC Synthetic Data
 * 
 * Generates BTC synthetic data for 2026, 2027, 2028 that is correlated with ETH synthetic data.
 * Uses ETH synthetic data as a base and applies:
 * - Correlation factor (0.7-0.9 typical ETH-BTC correlation)
 * - Independent volatility component
 * - Realistic BTC price levels (typically 15-20x ETH price)
 * 
 * Usage:
 *   pnpm tsx scripts/generate-btc-synthetic-data.ts [year] [timeframe]
 * 
 * Examples:
 *   pnpm tsx scripts/generate-btc-synthetic-data.ts 2026 8h
 *   pnpm tsx scripts/generate-btc-synthetic-data.ts 2027 4h
 *   pnpm tsx scripts/generate-btc-synthetic-data.ts 2028 8h
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';
import { getAssetConfig } from '@/lib/asset-config';

// Configuration
const CORRELATION_FACTOR = 0.8; // Typical ETH-BTC correlation (0.7-0.9)
const INDEPENDENT_VOLATILITY = 0.3; // 30% independent volatility component
const BTC_PRICE_MULTIPLIER = 18.0; // BTC typically 15-20x ETH price

/**
 * Load ETH synthetic data for a given year and timeframe
 */
function loadETHSyntheticData(year: number, timeframe: string): PriceCandle[] | null {
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  
  // Try to find ETH synthetic data file for the year
  const files = fs.readdirSync(dataDir);
  // For 2028, the file might start with 2027 date, so check for files containing the year
  const ethFile = files.find(f => 
    f.includes(`ethusdt_${timeframe}`) && 
    (f.includes(`_${year}-`) || f.includes(`-${year}-`) || (year === 2028 && f.includes('2027-10'))) &&
    f.endsWith('.json.gz')
  );
  
  if (!ethFile) {
    console.warn(`⚠️  No ETH synthetic data found for ${year} ${timeframe}`);
    console.warn(`   Looking for: ethusdt_${timeframe}_${year}*.json.gz`);
    return null;
  }
  
  const filePath = path.join(dataDir, ethFile);
  try {
    const compressed = fs.readFileSync(filePath);
    const decompressed = gunzipSync(compressed);
    const jsonString = decompressed.toString('utf-8');
    const candles = JSON.parse(jsonString) as PriceCandle[];
    console.log(`✅ Loaded ${candles.length} ETH candles from ${ethFile}`);
    return candles;
  } catch (error) {
    console.error(`❌ Failed to load ETH synthetic data:`, error);
    return null;
  }
}

/**
 * Calculate price returns from candles
 */
function calculateReturns(candles: PriceCandle[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1]!.close;
    const currentClose = candles[i]!.close;
    const return_ = (currentClose - prevClose) / prevClose;
    returns.push(return_);
  }
  return returns;
}

/**
 * Generate correlated BTC candles from ETH candles
 */
function generateCorrelatedBTCCandles(ethCandles: PriceCandle[], startBTCPrice: number): PriceCandle[] {
  if (ethCandles.length === 0) {
    return [];
  }
  
  const btcCandles: PriceCandle[] = [];
  let currentBTCPrice = startBTCPrice;
  
  // Calculate ETH returns
  const ethReturns = calculateReturns(ethCandles);
  
  // Generate first BTC candle (same timestamp as first ETH candle)
  const firstEthCandle = ethCandles[0]!;
  btcCandles.push({
    timestamp: firstEthCandle.timestamp,
    open: startBTCPrice,
    high: startBTCPrice * 1.01, // 1% range
    low: startBTCPrice * 0.99,
    close: startBTCPrice,
    volume: firstEthCandle.volume * BTC_PRICE_MULTIPLIER, // Scale volume proportionally
  });
  
  // Generate remaining BTC candles with correlation
  for (let i = 1; i < ethCandles.length; i++) {
    const ethCandle = ethCandles[i]!;
    const ethReturn = ethReturns[i - 1]!;
    
    // Calculate correlated BTC return
    // Correlated component: follows ETH with correlation factor
    const correlatedComponent = ethReturn * CORRELATION_FACTOR;
    
    // Independent component: random volatility (30% of movement is independent)
    const independentComponent = (Math.random() - 0.5) * INDEPENDENT_VOLATILITY * 0.02; // ±0.3% independent movement
    
    // Combined return
    const btcReturn = correlatedComponent + independentComponent;
    
    // Apply return to price
    currentBTCPrice = currentBTCPrice * (1 + btcReturn);
    
    // Ensure price stays within reasonable bounds (BTC shouldn't go below $10k or above $200k)
    currentBTCPrice = Math.max(10000, Math.min(200000, currentBTCPrice));
    
    // Calculate OHLC with realistic intraday range
    const intradayRange = Math.abs(btcReturn) * 1.5 + 0.005; // 0.5% minimum range
    const high = currentBTCPrice * (1 + intradayRange * 0.5 + Math.random() * 0.002);
    const low = currentBTCPrice * (1 - intradayRange * 0.5 - Math.random() * 0.002);
    const open = btcCandles[btcCandles.length - 1]!.close;
    const close = currentBTCPrice;
    
    // Ensure high >= low and price is within range
    const actualHigh = Math.max(high, low, open, close);
    const actualLow = Math.min(high, low, open, close);
    
    // Volume scales with BTC price multiplier
    const volume = ethCandle.volume * BTC_PRICE_MULTIPLIER * (1 + Math.random() * 0.2);
    
    btcCandles.push({
      timestamp: ethCandle.timestamp,
      open,
      high: actualHigh,
      low: actualLow,
      close,
      volume,
    });
  }
  
  return btcCandles;
}

/**
 * Calculate correlation between two price series
 */
function calculateCorrelation(ethCandles: PriceCandle[], btcCandles: PriceCandle[]): number {
  if (ethCandles.length !== btcCandles.length || ethCandles.length < 2) {
    return 0;
  }
  
  const ethReturns = calculateReturns(ethCandles);
  const btcReturns = calculateReturns(btcCandles);
  
  if (ethReturns.length !== btcReturns.length) {
    return 0;
  }
  
  // Calculate Pearson correlation
  const n = ethReturns.length;
  const ethMean = ethReturns.reduce((a, b) => a + b, 0) / n;
  const btcMean = btcReturns.reduce((a, b) => a + b, 0) / n;
  
  let covariance = 0;
  let ethVariance = 0;
  let btcVariance = 0;
  
  for (let i = 0; i < n; i++) {
    const ethDiff = ethReturns[i]! - ethMean;
    const btcDiff = btcReturns[i]! - btcMean;
    covariance += ethDiff * btcDiff;
    ethVariance += ethDiff * ethDiff;
    btcVariance += btcDiff * btcDiff;
  }
  
  const ethStd = Math.sqrt(ethVariance / n);
  const btcStd = Math.sqrt(btcVariance / n);
  
  if (ethStd === 0 || btcStd === 0) {
    return 0;
  }
  
  return (covariance / n) / (ethStd * btcStd);
}

async function main() {
  const args = process.argv.slice(2);
  const year = args[0] ? parseInt(args[0], 10) : 2026;
  const timeframe = args[1] || '8h';
  
  if (isNaN(year) || year < 2026 || year > 2028) {
    console.error('❌ Invalid year. Must be 2026, 2027, or 2028');
    process.exit(1);
  }
  
  if (!['4h', '8h', '12h', '1d'].includes(timeframe)) {
    console.error('❌ Invalid timeframe. Must be 4h, 8h, 12h, or 1d');
    process.exit(1);
  }
  
  console.log(`🎲 Generating Correlated BTC Synthetic Data for ${year} (${timeframe} candles)\n`);
  console.log(`   Correlation factor: ${CORRELATION_FACTOR}`);
  console.log(`   Independent volatility: ${INDEPENDENT_VOLATILITY * 100}%`);
  console.log(`   BTC price multiplier: ${BTC_PRICE_MULTIPLIER}x ETH\n`);
  
  // Load ETH synthetic data
  const ethCandles = loadETHSyntheticData(year, timeframe);
  if (!ethCandles || ethCandles.length === 0) {
    console.error(`❌ Failed to load ETH synthetic data for ${year} ${timeframe}`);
    console.error(`   Please generate ETH synthetic data first using:`);
    console.error(`   pnpm tsx scripts/generate-synthetic-${year}-data-enhanced.ts`);
    process.exit(1);
  }
  
  // Calculate starting BTC price based on ETH price and multiplier
  const startETHPrice = ethCandles[0]!.close;
  const startBTCPrice = startETHPrice * BTC_PRICE_MULTIPLIER;
  
  console.log(`📊 ETH starting price: $${startETHPrice.toFixed(2)}`);
  console.log(`📊 BTC starting price: $${startBTCPrice.toFixed(2)} (${BTC_PRICE_MULTIPLIER}x)\n`);
  
  // Generate correlated BTC candles
  console.log('🔄 Generating correlated BTC candles...');
  const btcCandles = generateCorrelatedBTCCandles(ethCandles, startBTCPrice);
  
  if (btcCandles.length === 0) {
    console.error('❌ Failed to generate BTC candles');
    process.exit(1);
  }
  
  // Calculate actual correlation
  const actualCorrelation = calculateCorrelation(ethCandles, btcCandles);
  console.log(`✅ Generated ${btcCandles.length} BTC candles`);
  console.log(`   Actual correlation with ETH: ${(actualCorrelation * 100).toFixed(1)}%`);
  console.log(`   Target correlation: ${(CORRELATION_FACTOR * 100).toFixed(1)}%\n`);
  
  // Price statistics
  const ethEndPrice = ethCandles[ethCandles.length - 1]!.close;
  const btcEndPrice = btcCandles[btcCandles.length - 1]!.close;
  const ethReturn = ((ethEndPrice - startETHPrice) / startETHPrice) * 100;
  const btcReturn = ((btcEndPrice - startBTCPrice) / startBTCPrice) * 100;
  
  console.log(`📈 Price Statistics:`);
  console.log(`   ETH: $${startETHPrice.toFixed(2)} → $${ethEndPrice.toFixed(2)} (${ethReturn > 0 ? '+' : ''}${ethReturn.toFixed(2)}%)`);
  console.log(`   BTC: $${startBTCPrice.toFixed(2)} → $${btcEndPrice.toFixed(2)} (${btcReturn > 0 ? '+' : ''}${btcReturn.toFixed(2)}%)`);
  console.log(`   BTC/ETH ratio: ${(startBTCPrice / startETHPrice).toFixed(1)}x → ${(btcEndPrice / ethEndPrice).toFixed(1)}x\n`);
  
  // Save to file
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const startDate = btcCandles[0]!.timestamp;
  const endDate = btcCandles[btcCandles.length - 1]!.timestamp;
  const startDateStr = new Date(startDate).toISOString().split('T')[0];
  const endDateStr = new Date(endDate).toISOString().split('T')[0];
  
  const filename = `btcusdt_${timeframe}_${startDateStr}_${endDateStr}.json.gz`;
  const filepath = path.join(dataDir, filename);
  
  const jsonData = JSON.stringify(btcCandles, null, 2);
  const compressed = zlib.gzipSync(jsonData);
  
  fs.writeFileSync(filepath, compressed);
  
  console.log(`✅ Generated ${btcCandles.length} BTC candles for ${year}`);
  console.log(`📁 Saved to: ${filepath}`);
  console.log(`💰 Price range: $${Math.min(...btcCandles.map(c => c.low)).toFixed(2)} - $${Math.max(...btcCandles.map(c => c.high)).toFixed(2)}`);
  console.log(`📈 Starting price: $${btcCandles[0]!.close.toFixed(2)}`);
  console.log(`📉 Ending price: $${btcCandles[btcCandles.length - 1]!.close.toFixed(2)}`);
  console.log(`\n🎯 Correlation with ETH: ${(actualCorrelation * 100).toFixed(1)}%`);
}

main().catch(console.error);

