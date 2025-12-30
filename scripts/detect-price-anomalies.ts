#!/usr/bin/env tsx
/**
 * Detect price anomalies in Pokemon card snapshots
 * 
 * Usage:
 *   pnpm tsx scripts/detect-price-anomalies.ts
 */

import { getPokemonCardPriceSnapshots } from '../src/lib/kv';

function detectAnomalies(snapshots: any[]) {
  const byCard = new Map<string, any[]>();
  
  // Group by card
  for (const snap of snapshots) {
    if (!byCard.has(snap.cardId)) {
      byCard.set(snap.cardId, []);
    }
    byCard.get(snap.cardId)!.push(snap);
  }
  
  const anomalies: any[] = [];
  
  for (const [cardId, cardSnapshots] of byCard.entries()) {
    // Get all ungraded prices
    const ungradedPrices = cardSnapshots
      .filter(s => s.ungradedPrice != null)
      .map(s => ({ date: s.date, price: s.ungradedPrice! }))
      .sort((a, b) => a.price - b.price);
    
    // Get all PSA 10 prices
    const psa10Prices = cardSnapshots
      .filter(s => s.psa10Price != null)
      .map(s => ({ date: s.date, price: s.psa10Price! }))
      .sort((a, b) => a.price - b.price);
    
    if (ungradedPrices.length === 0 && psa10Prices.length === 0) continue;
    
    // Calculate statistics for ungraded
    if (ungradedPrices.length > 0) {
      const prices = ungradedPrices.map(p => p.price);
      const median = prices[Math.floor(prices.length / 2)]!;
      const q1 = prices[Math.floor(prices.length * 0.25)]!;
      const q3 = prices[Math.floor(prices.length * 0.75)]!;
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      
      // Find outliers
      for (const { date, price } of ungradedPrices) {
        if (price < lowerBound || price > upperBound) {
          anomalies.push({
            cardId,
            type: 'ungraded',
            date,
            price,
            median,
            reason: price < lowerBound ? 'too_low' : 'too_high',
            expectedRange: `$${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)}`,
          });
        }
      }
    }
    
    // Calculate statistics for PSA 10
    if (psa10Prices.length > 0) {
      const prices = psa10Prices.map(p => p.price);
      const median = prices[Math.floor(prices.length / 2)]!;
      const q1 = prices[Math.floor(prices.length * 0.25)]!;
      const q3 = prices[Math.floor(prices.length * 0.75)]!;
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      
      // Find outliers
      for (const { date, price } of psa10Prices) {
        if (price < lowerBound || price > upperBound) {
          anomalies.push({
            cardId,
            type: 'psa10',
            date,
            price,
            median,
            reason: price < lowerBound ? 'too_low' : 'too_high',
            expectedRange: `$${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)}`,
          });
        }
      }
    }
  }
  
  return anomalies;
}

async function main() {
  console.log('🔍 Detecting price anomalies...\n');
  
  const snapshots = await getPokemonCardPriceSnapshots();
  console.log(`📊 Total snapshots: ${snapshots.length}\n`);
  
  const anomalies = detectAnomalies(snapshots);
  
  if (anomalies.length === 0) {
    console.log('✅ No anomalies detected!');
    return;
  }
  
  console.log(`⚠️  Found ${anomalies.length} price anomalies:\n`);
  
  // Group by card
  const byCard = new Map<string, any[]>();
  for (const anomaly of anomalies) {
    if (!byCard.has(anomaly.cardId)) {
      byCard.set(anomaly.cardId, []);
    }
    byCard.get(anomaly.cardId)!.push(anomaly);
  }
  
  for (const [cardId, cardAnomalies] of byCard.entries()) {
    console.log(`📦 Card: ${cardId}`);
    for (const anomaly of cardAnomalies) {
      console.log(`   ${anomaly.type.toUpperCase()} - ${anomaly.date}: $${anomaly.price.toFixed(2)} (${anomaly.reason})`);
      console.log(`      Median: $${anomaly.median.toFixed(2)}, Expected range: ${anomaly.expectedRange}`);
    }
    console.log();
  }
  
  // Summary
  const tooLow = anomalies.filter(a => a.reason === 'too_low').length;
  const tooHigh = anomalies.filter(a => a.reason === 'too_high').length;
  
  console.log(`\n📊 Summary:`);
  console.log(`   Too low: ${tooLow}`);
  console.log(`   Too high: ${tooHigh}`);
  console.log(`\n💡 These anomalies likely indicate incorrect price conversion.`);
  console.log(`   Run 'pnpm pokemon:backfill' to re-scrape with corrected conversion logic.`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});




