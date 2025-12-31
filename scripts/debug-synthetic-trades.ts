#!/usr/bin/env npx tsx
/**
 * Debug why synthetic periods have 0 trades
 * Analyzes signals, regimes, and thresholds
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import type { PriceCandle } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';

const TIMEFRAME = '8h';

const DEFAULT_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Conservative',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.3, params: { period: 20 } },
      { type: 'ema', weight: 0.3, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.4,
    sellThreshold: -0.3,
    maxPositionPct: 0.90,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Strategy1',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.8,
    sellThreshold: -0.2,
    maxPositionPct: 0.2,
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.25,
  momentumConfirmationThreshold: 0.3,
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 2,
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.0167,
  circuitBreakerWinRate: 0.2,
  circuitBreakerLookback: 10,
  whipsawDetectionPeriods: 5,
  whipsawMaxChanges: 3,
};

function loadSynthetic2026Data(): PriceCandle[] {
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const filepath = path.join(dataDir, 'ethusdt_8h_2026-01-01_2026-12-30.json.gz');
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Synthetic 8h data not found: ${filepath}`);
  }
  
  const compressed = fs.readFileSync(filepath);
  const decompressed = gunzipSync(compressed);
  const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
  
  return candles;
}

async function debugPeriod(startDate: string, endDate: string, periodName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Debugging: ${periodName} (${startDate} to ${endDate})`);
  console.log('='.repeat(60));
  
  clearRegimeHistory();
  clearIndicatorCache();
  
  const candles = loadSynthetic2026Data();
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  
  const filteredCandles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
  console.log(`📊 Loaded ${filteredCandles.length} candles for period`);
  
  if (filteredCandles.length < 50) {
    console.log(`⚠️  Not enough candles (need at least 50 for indicators)`);
    return;
  }
  
  // Need history for indicators
  const allCandles = candles.filter(c => c.timestamp <= endTime);
  const startIndex = allCandles.findIndex(c => c.timestamp >= startTime);
  const minIndex = Math.max(50, Math.floor(allCandles.length * 0.1));
  const actualStartIndex = Math.max(startIndex, minIndex);
  
  console.log(`📈 Using candles from index ${actualStartIndex} to ${allCandles.length - 1}`);
  console.log(`   (${allCandles.length - actualStartIndex} candles for analysis)\n`);
  
  const analysis: Array<{
    index: number;
    timestamp: number;
    price: number;
    regime: string;
    confidence: number;
    signal: number;
    action: string;
    buyThreshold: number;
    sellThreshold: number;
    volatility: number;
    blocked: string[];
  }> = [];
  
  let tradeCount = 0;
  let signalCount = 0;
  let blockedCount = 0;
  
  for (let i = actualStartIndex; i < allCandles.length; i++) {
    const signal = generateEnhancedAdaptiveSignal(allCandles, DEFAULT_CONFIG, i, 'debug');
    const confidence = calculateConfidence(signal, allCandles, i);
    
    const currentPrice = allCandles[i]!.close;
    const buyThreshold = signal.activeStrategy.buyThreshold;
    const sellThreshold = signal.activeStrategy.sellThreshold;
    
    const blocked: string[] = [];
    
    // Check why trades might be blocked
    if (signal.signal === 0) {
      blocked.push('signal=0');
    }
    if (signal.confidence === 0) {
      blocked.push('confidence=0');
    }
    if (signal.action === 'hold') {
      blocked.push('action=hold');
    }
    const regimeThreshold = DEFAULT_CONFIG.regimeConfidenceThreshold ?? 0.2;
    if (signal.regime.confidence < regimeThreshold) {
      blocked.push(`low-regime-confidence(${signal.regime.confidence.toFixed(2)})`);
    }
    if (!signal.momentumConfirmed && signal.regime.regime === 'bullish') {
      blocked.push('momentum-not-confirmed');
    }
    
    const wouldTrade = 
      signal.signal >= buyThreshold || 
      signal.signal <= sellThreshold;
    
    if (wouldTrade) {
      signalCount++;
      if (blocked.length > 0) {
        blockedCount++;
      } else {
        tradeCount++;
      }
    }
    
    // Sample analysis (every 10th candle or when signal is strong)
    if (i % 10 === 0 || Math.abs(signal.signal) > 0.3) {
      analysis.push({
        index: i,
        timestamp: allCandles[i]!.timestamp,
        price: currentPrice,
        regime: signal.regime.regime,
        confidence: signal.regime.confidence,
        signal: signal.signal,
        action: signal.action,
        buyThreshold,
        sellThreshold,
        volatility: signal.regime.indicators.volatility,
        blocked: blocked.length > 0 ? blocked : ['none'],
      });
    }
  }
  
  console.log(`\n📊 Analysis Summary:`);
  console.log(`   Total candles analyzed: ${allCandles.length - actualStartIndex}`);
  console.log(`   Signals above threshold: ${signalCount}`);
  console.log(`   Signals blocked: ${blockedCount}`);
  console.log(`   Would execute trades: ${tradeCount}`);
  console.log(`   Actual trades: 0 (from verification)`);
  
  console.log(`\n📋 Sample Analysis (${analysis.length} samples):`);
  console.log(`   Index | Date       | Price  | Regime  | Conf  | Signal  | Action | Blocked`);
  console.log(`   ${'-'.repeat(70)}`);
  analysis.slice(0, 20).forEach(a => {
    const date = new Date(a.timestamp).toISOString().split('T')[0];
    console.log(`   ${a.index.toString().padStart(5)} | ${date} | $${a.price.toFixed(2).padStart(6)} | ${a.regime.padEnd(7)} | ${a.confidence.toFixed(2)} | ${a.signal.toFixed(3).padStart(7)} | ${a.action.padEnd(6)} | ${a.blocked.join(', ')}`);
  });
  
  // Check regime distribution
  const regimes = analysis.map(a => a.regime);
  const regimeCounts = {
    bullish: regimes.filter(r => r === 'bullish').length,
    bearish: regimes.filter(r => r === 'bearish').length,
    neutral: regimes.filter(r => r === 'neutral').length,
  };
  
  console.log(`\n📊 Regime Distribution:`);
  console.log(`   Bullish: ${regimeCounts.bullish} (${(regimeCounts.bullish / analysis.length * 100).toFixed(1)}%)`);
  console.log(`   Bearish: ${regimeCounts.bearish} (${(regimeCounts.bearish / analysis.length * 100).toFixed(1)}%)`);
  console.log(`   Neutral: ${regimeCounts.neutral} (${(regimeCounts.neutral / analysis.length * 100).toFixed(1)}%)`);
  
  // Check signal distribution
  const signals = analysis.map(a => a.signal);
  const maxSignal = Math.max(...signals);
  const minSignal = Math.min(...signals);
  const avgSignal = signals.reduce((a, b) => a + Math.abs(b), 0) / signals.length;
  
  console.log(`\n📊 Signal Distribution:`);
  console.log(`   Max signal: ${maxSignal.toFixed(3)}`);
  console.log(`   Min signal: ${minSignal.toFixed(3)}`);
  console.log(`   Avg |signal|: ${avgSignal.toFixed(3)}`);
  console.log(`   Buy threshold: ${DEFAULT_CONFIG.bullishStrategy.buyThreshold}`);
  console.log(`   Sell threshold: ${DEFAULT_CONFIG.bullishStrategy.sellThreshold}`);
}

async function main() {
  const testPeriods = [
    { name: '2026 Q1 (Bull Run)', start: '2026-01-01', end: '2026-03-31' },
    { name: '2026 Q2 (Crash→Recovery)', start: '2026-04-01', end: '2026-06-30' },
    { name: '2026 Q3 (Bear Market)', start: '2026-07-01', end: '2026-09-30' },
  ];
  
  for (const period of testPeriods) {
    await debugPeriod(period.start, period.end, period.name);
  }
}

main().catch(console.error);

