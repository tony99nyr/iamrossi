#!/usr/bin/env tsx
/**
 * Test Market Regime Detector
 * Quickly test if the detector correctly identifies bullish/bearish periods
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import { detectMarketRegime, getMarketRegimeForPeriod } from '@/lib/market-regime-detector';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testRegimeDetection(startDate: string, endDate: string, expectedRegime: 'bullish' | 'bearish' | 'neutral') {
  console.log(`\n📊 Testing: ${startDate} to ${endDate}`);
  console.log(`   Expected: ${expectedRegime}`);
  
  const candles = await fetchPriceCandles('ETHUSDT', '1d', startDate, endDate);
  if (candles.length === 0) {
    console.log('   ❌ No data available');
    return;
  }

  // Test regime detection at multiple points
  const testPoints = [
    Math.floor(candles.length * 0.25),
    Math.floor(candles.length * 0.5),
    Math.floor(candles.length * 0.75),
    candles.length - 1,
  ];

  const regimes: Array<{ index: number; regime: string; confidence: number; trend: number; momentum: number }> = [];
  
  for (const idx of testPoints) {
    if (idx >= 200) { // Need enough data for 200-day SMA
      const signal = detectMarketRegime(candles, idx);
      const date = new Date(candles[idx].timestamp).toISOString().split('T')[0];
      regimes.push({
        index: idx,
        regime: signal.regime,
        confidence: signal.confidence,
        trend: signal.indicators.trend,
        momentum: signal.indicators.momentum,
      });
      console.log(`   [${date}] Regime: ${signal.regime} (confidence: ${(signal.confidence * 100).toFixed(1)}%, trend: ${signal.indicators.trend.toFixed(3)}, momentum: ${signal.indicators.momentum.toFixed(3)})`);
    }
  }

  // Get overall regime for the period
  const periodRegime = getMarketRegimeForPeriod(candles, 200, candles.length - 1);
  console.log(`\n   Overall Period Regime: ${periodRegime.regime} (${(periodRegime.percentage * 100).toFixed(1)}%)`);
  
  const correct = periodRegime.regime === expectedRegime;
  console.log(`   ${correct ? '✅' : '❌'} Detection: ${correct ? 'CORRECT' : 'INCORRECT'}`);
  
  return { correct, regime: periodRegime.regime, percentage: periodRegime.percentage };
}

async function main() {
  console.log('🔍 Market Regime Detector Test\n');
  console.log('='.repeat(60));

  const results = [];

  // Test known periods
  results.push(await testRegimeDetection('2025-01-01', '2025-06-01', 'bearish'));
  results.push(await testRegimeDetection('2025-04-01', '2025-08-23', 'bullish'));
  results.push(await testRegimeDetection('2025-03-01', '2025-11-01', 'bullish'));

  console.log('\n' + '='.repeat(60));
  console.log('📈 Summary:');
  console.log('='.repeat(60));
  
  const correctCount = results.filter(r => r?.correct).length;
  console.log(`   Correct Detections: ${correctCount}/${results.length}`);
  
  results.forEach((result, idx) => {
    if (result) {
      const periods = ['Bearish (Jan-Jun)', 'Bull Run (Apr-Aug)', 'Bullish (Mar-Nov)'];
      console.log(`   ${periods[idx]}: ${result.regime} (${(result.percentage * 100).toFixed(1)}%) ${result.correct ? '✅' : '❌'}`);
    }
  });
}

main().catch(console.error);





