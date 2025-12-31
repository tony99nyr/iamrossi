#!/usr/bin/env npx tsx
/**
 * Debug script to test synthetic 2026/2027 periods and identify why trades aren't executing
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { disconnectRedis } from '@/lib/kv';
import type { PriceCandle } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';

const TIMEFRAME = '8h';

function loadSyntheticData(year: number): PriceCandle[] | null {
  if (year < 2026) return null;
  
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const possibleFilenames = [
    `ethusdt_8h_${year}-01-01_${year}-12-31.json.gz`,
    `ethusdt_8h_${year}-01-01_${year}-12-30.json.gz`,
  ];
  
  let filepath: string | null = null;
  for (const filename of possibleFilenames) {
    const testPath = path.join(dataDir, filename);
    if (fs.existsSync(testPath)) {
      filepath = testPath;
      break;
    }
  }
  
  if (!filepath) {
    try {
      const files = fs.readdirSync(dataDir);
      const matchingFile = files.find(f => f.includes(`${year}`) && f.endsWith('.json.gz'));
      if (matchingFile) {
        filepath = path.join(dataDir, matchingFile);
      }
    } catch (error) {
      return null;
    }
  }
  
  if (!filepath || !fs.existsSync(filepath)) {
    return null;
  }
  
  try {
    const compressed = fs.readFileSync(filepath);
    const decompressed = gunzipSync(compressed);
    const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
    return candles;
  } catch (error) {
    return null;
  }
}

// Test with current config
const CURRENT_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Hybrid',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.35, params: { period: 20 } },
      { type: 'ema', weight: 0.35, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.1, params: { period: 14 } },
    ],
    buyThreshold: 0.41,
    sellThreshold: -0.45,
    maxPositionPct: 0.90,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Bearish-Recovery',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.65,
    sellThreshold: -0.25,
    maxPositionPct: 0.3,
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.22,
  momentumConfirmationThreshold: 0.26,
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 1,
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.019,
  circuitBreakerWinRate: 0.18,
  circuitBreakerLookback: 12,
  whipsawDetectionPeriods: 5,
  whipsawMaxChanges: 3,
};

// Test with optimized config
const OPTIMIZED_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Conservative',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.4, params: { period: 20 } },
      { type: 'ema', weight: 0.4, params: { period: 12 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.38,
    sellThreshold: -0.40,
    maxPositionPct: 0.85,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Bearish-Recovery',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.63,
    sellThreshold: -0.25,
    maxPositionPct: 0.3,
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.22,
  momentumConfirmationThreshold: 0.26,
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 1,
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.019,
  circuitBreakerWinRate: 0.18,
  circuitBreakerLookback: 12,
  whipsawDetectionPeriods: 5,
  whipsawMaxChanges: 3,
};

async function testPeriod(
  config: EnhancedAdaptiveStrategyConfig,
  startDate: string,
  endDate: string,
  year: number,
  configName: string
): Promise<void> {
  clearRegimeHistory();
  clearIndicatorCache();

  const candles = loadSyntheticData(year);
  if (!candles) {
    console.log(`❌ No data for ${year}`);
    return;
  }

  // Filter to date range
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate + 'T23:59:59Z').getTime();
  const filtered = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${configName} | ${startDate} to ${endDate}`);
  console.log(`Total candles: ${filtered.length}`);
  console.log('='.repeat(60));

  if (filtered.length < 50) {
    console.log(`⚠️  Not enough candles: ${filtered.length}`);
    return;
  }

  const startIndex = Math.max(50, Math.floor(filtered.length * 0.1));
  const sessionId = `debug-${Date.now()}`;

  let tradeCount = 0;
  let buySignals = 0;
  let sellSignals = 0;
  let holdSignals = 0;
  let regimeCounts = { bullish: 0, bearish: 0, neutral: 0 };
  let signalStats = {
    max: -Infinity,
    min: Infinity,
    aboveBuyThreshold: 0,
    belowSellThreshold: 0,
  };

  // Sample every 10th candle for analysis
  for (let i = startIndex; i < filtered.length; i += 10) {
    const candle = filtered[i]!;
    const signal = generateEnhancedAdaptiveSignal(filtered, config, i, sessionId);
    const confidence = calculateConfidence(signal, filtered, i);

    // Track regime (regime is a MarketRegimeSignal object)
    const regimeType = signal.regime.regime;
    if (regimeType === 'bullish') regimeCounts.bullish++;
    else if (regimeType === 'bearish') regimeCounts.bearish++;
    else regimeCounts.neutral++;

    // Track signals
    if (signal.action === 'buy') buySignals++;
    else if (signal.action === 'sell') sellSignals++;
    else holdSignals++;

    // Track signal values
    if (signal.signal > signalStats.max) signalStats.max = signal.signal;
    if (signal.signal < signalStats.min) signalStats.min = signal.signal;
    
    const activeStrategy = signal.activeStrategy;
    if (activeStrategy) {
      if (signal.signal >= activeStrategy.buyThreshold) signalStats.aboveBuyThreshold++;
      if (signal.signal <= activeStrategy.sellThreshold) signalStats.belowSellThreshold++;
    }

    if (signal.action !== 'hold') tradeCount++;
  }

  console.log(`\n📊 Signal Analysis:`);
  console.log(`   Regime Distribution:`);
  console.log(`     Bullish: ${regimeCounts.bullish} (${((regimeCounts.bullish / (filtered.length - startIndex)) * 100).toFixed(1)}%)`);
  console.log(`     Bearish: ${regimeCounts.bearish} (${((regimeCounts.bearish / (filtered.length - startIndex)) * 100).toFixed(1)}%)`);
  console.log(`     Neutral: ${regimeCounts.neutral} (${((regimeCounts.neutral / (filtered.length - startIndex)) * 100).toFixed(1)}%)`);
  
  console.log(`\n   Action Distribution:`);
  console.log(`     Buy: ${buySignals}`);
  console.log(`     Sell: ${sellSignals}`);
  console.log(`     Hold: ${holdSignals}`);
  
  console.log(`\n   Signal Statistics:`);
  console.log(`     Max Signal: ${signalStats.max.toFixed(3)}`);
  console.log(`     Min Signal: ${signalStats.min.toFixed(3)}`);
  console.log(`     Above Buy Threshold: ${signalStats.aboveBuyThreshold}`);
  console.log(`     Below Sell Threshold: ${signalStats.belowSellThreshold}`);
  
  console.log(`\n   Strategy Thresholds:`);
  if (config.bullishStrategy) {
    console.log(`     Bullish Buy: ${config.bullishStrategy.buyThreshold}`);
    console.log(`     Bullish Sell: ${config.bullishStrategy.sellThreshold}`);
  }
  if (config.bearishStrategy) {
    console.log(`     Bearish Buy: ${config.bearishStrategy.buyThreshold}`);
    console.log(`     Bearish Sell: ${config.bearishStrategy.sellThreshold}`);
  }

  // Check a few specific periods
  console.log(`\n🔍 Sample Periods:`);
  const sampleIndices = [
    Math.floor(startIndex + (filtered.length - startIndex) * 0.25),
    Math.floor(startIndex + (filtered.length - startIndex) * 0.5),
    Math.floor(startIndex + (filtered.length - startIndex) * 0.75),
  ];

  for (const idx of sampleIndices) {
    if (idx >= filtered.length) continue;
    const candle = filtered[idx]!;
    const signal = generateEnhancedAdaptiveSignal(filtered, config, idx, sessionId);
    const confidence = calculateConfidence(signal, filtered, idx);
    const date = new Date(candle.timestamp).toISOString().split('T')[0];
    
    console.log(`\n   ${date} (Index ${idx}):`);
    console.log(`     Price: $${candle.close.toFixed(2)}`);
    console.log(`     Regime: ${signal.regime.regime} (confidence: ${(signal.regime.confidence * 100).toFixed(1)}%)`);
    console.log(`     Signal: ${signal.signal.toFixed(3)}`);
    console.log(`     Action: ${signal.action}`);
    if (signal.activeStrategy) {
      console.log(`     Active Strategy: ${signal.activeStrategy.name}`);
      console.log(`     Buy Threshold: ${signal.activeStrategy.buyThreshold}`);
      console.log(`     Sell Threshold: ${signal.activeStrategy.sellThreshold}`);
      console.log(`     Signal vs Buy: ${(signal.signal - signal.activeStrategy.buyThreshold).toFixed(3)}`);
      console.log(`     Signal vs Sell: ${(signal.signal - signal.activeStrategy.sellThreshold).toFixed(3)}`);
    }
  }
}

async function main() {
  console.log('🔍 Debugging Synthetic Period Backfill Tests\n');

  const testPeriods = [
    { year: 2026, start: '2026-01-01', end: '2026-12-31', name: '2026 Full Year' },
    { year: 2027, start: '2027-01-01', end: '2027-12-31', name: '2027 Full Year' },
    { year: 2026, start: '2026-03-01', end: '2026-04-30', name: '2026 Bull Run' },
    { year: 2027, start: '2027-10-01', end: '2027-12-31', name: '2027 Q4' },
  ];

  for (const period of testPeriods) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# Testing: ${period.name}`);
    console.log(`${'#'.repeat(60)}`);

    // Test with current config
    await testPeriod(CURRENT_CONFIG, period.start, period.end, period.year, 'Current Config (Hybrid-0.41 + Recovery-0.65)');
    
    // Test with optimized config
    await testPeriod(OPTIMIZED_CONFIG, period.start, period.end, period.year, 'Optimized Config (Conservative-0.38 + Recovery-0.63)');
  }

  await disconnectRedis();
}

main().catch(console.error);

