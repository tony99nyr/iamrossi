#!/usr/bin/env npx tsx
/**
 * Verify regime history for the last 6 months
 * This simulates what the trading strategy would calculate for each historical period
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { detectMarketRegimeCached, clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { disconnectRedis } from '@/lib/kv';

async function main() {
  console.log('🔍 Verifying regime history for last 6 months...\n');
  
  // Fetch 8h candles for the last 6 months
  const now = new Date();
  const endDateParts = now.toISOString().split('T');
  const endDate = endDateParts[0] || '2025-12-31';
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDateParts = sixMonthsAgo.toISOString().split('T');
  const startDate = startDateParts[0] || '2025-07-01';
  
  console.log(`Fetching candles from ${startDate} to ${endDate}...`);
  console.log(`  startDate type: ${typeof startDate}, value: "${startDate}"`);
  console.log(`  endDate type: ${typeof endDate}, value: "${endDate}"`);
  
  const candles = await fetchPriceCandles(
    'ETHUSDT',
    '8h',
    startDate,
    endDate,
    undefined, // currentPrice
    true // skipAPIFetch: Use cached/historical data
  );
  
  console.log(`Loaded ${candles.length} candles\n`);
  
  if (candles.length < 50) {
    console.log('Not enough candles for regime detection (need at least 50)');
    return;
  }
  
  // Calculate regimes for each point starting from index 50
  clearIndicatorCache();
  
  const regimeChanges: Array<{
    index: number;
    timestamp: number;
    date: string;
    regime: string;
    confidence: number;
    price: number;
  }> = [];
  
  let lastRegime: string | null = null;
  let regimeCounts = { bullish: 0, bearish: 0, neutral: 0 };
  
  for (let i = 50; i < candles.length; i++) {
    const signal = detectMarketRegimeCached(candles, i);
    const candle = candles[i]!;
    const regime = signal.regime;
    
    regimeCounts[regime]++;
    
    // Track regime changes
    if (regime !== lastRegime) {
      regimeChanges.push({
        index: i,
        timestamp: candle.timestamp,
        date: new Date(candle.timestamp).toISOString(),
        regime,
        confidence: signal.confidence,
        price: candle.close,
      });
      lastRegime = regime;
    }
  }
  
  // Print regime changes
  console.log('📊 REGIME CHANGES (chronological order):');
  console.log('=========================================\n');
  
  regimeChanges.forEach((change, idx) => {
    const emoji = change.regime === 'bullish' ? '🟢' : change.regime === 'bearish' ? '🔴' : '⚪';
    const duration = idx < regimeChanges.length - 1 
      ? Math.round((regimeChanges[idx + 1]!.timestamp - change.timestamp) / (8 * 60 * 60 * 1000)) + ' periods'
      : 'current';
    
    console.log(`${emoji} ${change.date.split('T')[0]} - ${change.regime.toUpperCase()} (confidence: ${(change.confidence * 100).toFixed(1)}%, price: $${change.price.toFixed(2)}, duration: ${duration})`);
  });
  
  console.log('\n📈 REGIME DISTRIBUTION:');
  console.log('========================');
  const total = regimeCounts.bullish + regimeCounts.bearish + regimeCounts.neutral;
  console.log(`🟢 Bullish: ${regimeCounts.bullish} periods (${(regimeCounts.bullish / total * 100).toFixed(1)}%)`);
  console.log(`🔴 Bearish: ${regimeCounts.bearish} periods (${(regimeCounts.bearish / total * 100).toFixed(1)}%)`);
  console.log(`⚪ Neutral: ${regimeCounts.neutral} periods (${(regimeCounts.neutral / total * 100).toFixed(1)}%)`);
  
  // Print last 10 regimes for debugging
  console.log('\n📍 LAST 10 PERIODS:');
  console.log('===================');
  for (let i = Math.max(50, candles.length - 10); i < candles.length; i++) {
    clearIndicatorCache();
    const signal = detectMarketRegimeCached(candles, i);
    const candle = candles[i]!;
    const emoji = signal.regime === 'bullish' ? '🟢' : signal.regime === 'bearish' ? '🔴' : '⚪';
    console.log(`${emoji} ${new Date(candle.timestamp).toISOString().split('T')[0]} ${new Date(candle.timestamp).toISOString().split('T')[1]?.slice(0,5)} - ${signal.regime} (${(signal.confidence * 100).toFixed(1)}%) - $${candle.close.toFixed(2)}`);
  }
  
  await disconnectRedis();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error:', err);
  await disconnectRedis();
  process.exit(1);
});

