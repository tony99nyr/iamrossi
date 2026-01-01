#!/usr/bin/env npx tsx
/**
 * Generate BTC Synthetic Data with Realistic Divergence
 * 
 * Generates BTC synthetic data with more realistic divergence from ETH.
 * Uses variable correlation (0.5-0.9) and higher independent volatility
 * to create periods where assets move independently.
 * 
 * Usage:
 *   pnpm tsx scripts/generate-btc-synthetic-data-divergence.ts [year] [timeframe]
 * 
 * Examples:
 *   pnpm tsx scripts/generate-btc-synthetic-data-divergence.ts 2026 8h
 *   pnpm tsx scripts/generate-btc-synthetic-data-divergence.ts 2027 8h
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

// Configuration for more realistic divergence
const BASE_CORRELATION = 0.65; // Lower base correlation (was 0.8)
const CORRELATION_VOLATILITY = 0.3; // Correlation varies ±0.3 (0.35 to 0.95)
const INDEPENDENT_VOLATILITY = 0.6; // Higher independent volatility (was 0.3)
const DIVERGENCE_PERIOD_LENGTH = 50; // Create divergence periods every ~50 candles
const BTC_PRICE_MULTIPLIER = 18.0; // BTC typically 15-20x ETH price

/**
 * Load ETH synthetic data for a given year and timeframe
 */
function loadETHSyntheticData(year: number, timeframe: string): PriceCandle[] | null {
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  
  const files = fs.readdirSync(dataDir);
  const ethFile = files.find(f => 
    f.includes(`ethusdt_${timeframe}`) && 
    (f.includes(`_${year}-`) || f.includes(`-${year}-`) || (year === 2028 && f.includes('2027-10'))) &&
    f.endsWith('.json.gz')
  );
  
  if (!ethFile) {
    console.warn(`⚠️  No ETH synthetic data found for ${year} ${timeframe}`);
    return null;
  }
  
  const filePath = path.join(dataDir, ethFile);
  try {
    const compressed = fs.readFileSync(filePath);
    const decompressed = gunzipSync(compressed);
    const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
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
 * Generate BTC candles with variable correlation and higher divergence
 */
function generateDivergentBTCCandles(ethCandles: PriceCandle[], startBTCPrice: number): PriceCandle[] {
  if (ethCandles.length === 0) {
    return [];
  }
  
  const btcCandles: PriceCandle[] = [];
  let currentBTCPrice = startBTCPrice;
  
  // Calculate ETH returns
  const ethReturns = calculateReturns(ethCandles);
  
  // Generate first BTC candle
  const firstEthCandle = ethCandles[0]!;
  btcCandles.push({
    timestamp: firstEthCandle.timestamp,
    open: startBTCPrice,
    high: startBTCPrice * 1.01,
    low: startBTCPrice * 0.99,
    close: startBTCPrice,
    volume: firstEthCandle.volume * BTC_PRICE_MULTIPLIER,
  });
  
  // Track correlation over time (for realistic variation)
  let currentCorrelation = BASE_CORRELATION;
  let divergencePeriodCounter = 0;
  let inDivergencePeriod = false;
  
  // Generate remaining BTC candles with variable correlation
  for (let i = 1; i < ethCandles.length; i++) {
    const ethCandle = ethCandles[i]!;
    const ethReturn = ethReturns[i - 1]!;
    
    // Create periodic divergence periods (realistic: markets sometimes diverge)
    divergencePeriodCounter++;
    if (divergencePeriodCounter >= DIVERGENCE_PERIOD_LENGTH) {
      // Start a divergence period (lower correlation)
      if (Math.random() < 0.3) { // 30% chance to enter divergence period
        inDivergencePeriod = true;
        divergencePeriodCounter = 0;
      }
    }
    
    if (inDivergencePeriod && divergencePeriodCounter > 20) {
      // End divergence period after ~20 candles
      inDivergencePeriod = false;
      divergencePeriodCounter = 0;
    }
    
    // Adjust correlation based on divergence period
    if (inDivergencePeriod) {
      // Lower correlation during divergence (0.3 to 0.6)
      currentCorrelation = 0.45 + (Math.random() - 0.5) * 0.3;
    } else {
      // Normal correlation with variation (0.6 to 0.9)
      const correlationChange = (Math.random() - 0.5) * 0.08;
      currentCorrelation = BASE_CORRELATION + 
        (currentCorrelation - BASE_CORRELATION) * 0.92 + // Mean reversion
        correlationChange;
      currentCorrelation = Math.max(0.6, Math.min(0.9, currentCorrelation));
    }
    
    // Calculate correlated BTC return
    const correlatedComponent = ethReturn * currentCorrelation;
    
    // Higher independent component (more divergence, especially during divergence periods)
    const independentMultiplier = inDivergencePeriod ? 1.5 : 1.0; // More independent movement during divergence
    const independentComponent = (Math.random() - 0.5) * INDEPENDENT_VOLATILITY * 0.03 * independentMultiplier;
    
    // Combined return
    const btcReturn = correlatedComponent + independentComponent;
    
    // Apply return to price
    currentBTCPrice = currentBTCPrice * (1 + btcReturn);
    
    // Ensure price stays within reasonable bounds
    currentBTCPrice = Math.max(10000, Math.min(200000, currentBTCPrice));
    
    // Calculate OHLC with realistic intraday range
    const intradayRange = Math.abs(btcReturn) * 1.5 + 0.005;
    const high = currentBTCPrice * (1 + intradayRange * 0.5 + Math.random() * 0.002);
    const low = currentBTCPrice * (1 - intradayRange * 0.5 - Math.random() * 0.002);
    const open = btcCandles[btcCandles.length - 1]!.close;
    const close = currentBTCPrice;
    
    const actualHigh = Math.max(high, low, open, close);
    const actualLow = Math.min(high, low, open, close);
    
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
  
  console.log(`🎲 Generating BTC Synthetic Data with Realistic Divergence for ${year} (${timeframe} candles)\n`);
  console.log(`   Base correlation: ${BASE_CORRELATION} (varies 0.5-0.9)`);
  console.log(`   Independent volatility: ${INDEPENDENT_VOLATILITY * 100}%`);
  console.log(`   BTC price multiplier: ${BTC_PRICE_MULTIPLIER}x ETH\n`);
  
  // Load ETH synthetic data
  const ethCandles = loadETHSyntheticData(year, timeframe);
  if (!ethCandles || ethCandles.length === 0) {
    console.error(`❌ Failed to load ETH synthetic data for ${year} ${timeframe}`);
    process.exit(1);
  }
  
  // Calculate starting BTC price
  const startETHPrice = ethCandles[0]!.close;
  const startBTCPrice = startETHPrice * BTC_PRICE_MULTIPLIER;
  
  console.log(`📊 ETH starting price: $${startETHPrice.toFixed(2)}`);
  console.log(`📊 BTC starting price: $${startBTCPrice.toFixed(2)} (${BTC_PRICE_MULTIPLIER}x)\n`);
  
  // Generate divergent BTC candles
  console.log('🔄 Generating BTC candles with realistic divergence...');
  const btcCandles = generateDivergentBTCCandles(ethCandles, startBTCPrice);
  
  if (btcCandles.length === 0) {
    console.error('❌ Failed to generate BTC candles');
    process.exit(1);
  }
  
  // Calculate actual correlation
  const actualCorrelation = calculateCorrelation(ethCandles, btcCandles);
  console.log(`✅ Generated ${btcCandles.length} BTC candles`);
  console.log(`   Actual correlation with ETH: ${(actualCorrelation * 100).toFixed(1)}%`);
  console.log(`   Target base correlation: ${(BASE_CORRELATION * 100).toFixed(1)}% (varies 0.5-0.9)\n`);
  
  // Price statistics
  const ethEndPrice = ethCandles[ethCandles.length - 1]!.close;
  const btcEndPrice = btcCandles[btcCandles.length - 1]!.close;
  const ethReturn = ((ethEndPrice - startETHPrice) / startETHPrice) * 100;
  const btcReturn = ((btcEndPrice - startBTCPrice) / startBTCPrice) * 100;
  
  console.log(`📈 Price Statistics:`);
  console.log(`   ETH: $${startETHPrice.toFixed(2)} → $${ethEndPrice.toFixed(2)} (${ethReturn > 0 ? '+' : ''}${ethReturn.toFixed(2)}%)`);
  console.log(`   BTC: $${startBTCPrice.toFixed(2)} → $${btcEndPrice.toFixed(2)} (${btcReturn > 0 ? '+' : ''}${btcReturn.toFixed(2)}%)`);
  console.log(`   BTC/ETH ratio: ${(startBTCPrice / startETHPrice).toFixed(1)}x → ${(btcEndPrice / ethEndPrice).toFixed(1)}x\n`);
  
  // Save to file (with "divergence" suffix to distinguish from original)
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const startDate = btcCandles[0]!.timestamp;
  const endDate = btcCandles[btcCandles.length - 1]!.timestamp;
  const startDateStr = new Date(startDate).toISOString().split('T')[0];
  const endDateStr = new Date(endDate).toISOString().split('T')[0];
  
  // Save with "divergence" suffix
  const filename = `btcusdt_${timeframe}_${startDateStr}_${endDateStr}_divergence.json.gz`;
  const filepath = path.join(dataDir, filename);
  
  const jsonData = JSON.stringify(btcCandles, null, 2);
  const compressed = zlib.gzipSync(jsonData);
  
  fs.writeFileSync(filepath, compressed);
  
  console.log(`✅ Generated ${btcCandles.length} BTC candles with realistic divergence`);
  console.log(`📁 Saved to: ${filepath}`);
  console.log(`💰 Price range: $${Math.min(...btcCandles.map(c => c.low)).toFixed(2)} - $${Math.max(...btcCandles.map(c => c.high)).toFixed(2)}`);
  console.log(`📈 Starting price: $${btcCandles[0]!.close.toFixed(2)}`);
  console.log(`📉 Ending price: $${btcCandles[btcCandles.length - 1]!.close.toFixed(2)}`);
  console.log(`\n🎯 Correlation with ETH: ${(actualCorrelation * 100).toFixed(1)}% (more divergence than original)`);
  console.log(`\n📝 Note: This data has more realistic divergence. Use for correlation impact testing.`);
}

main().catch(console.error);

