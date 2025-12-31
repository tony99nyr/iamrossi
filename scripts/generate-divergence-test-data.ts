/**
 * Generate synthetic data with clear divergence patterns
 * 
 * Divergence Scenarios:
 * 1. Bearish Divergence: Price makes higher highs, RSI makes lower highs (top forming)
 * 2. Bullish Divergence: Price makes lower lows, RSI makes higher lows (bottom forming)
 * 
 * Includes 250 candles of "warm-up" history for indicator calculation (SMA200 needs 200)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateCandle(
  timestamp: number,
  basePrice: number,
  volatility: number = 0.02
): Candle {
  const change = (Math.random() - 0.5) * 2 * volatility;
  const open = basePrice;
  const close = basePrice * (1 + change);
  const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
  const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
  
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: 1000 + Math.random() * 5000,
  };
}

/**
 * Generate warmup candles (sideways/slightly bullish market)
 * These provide history for indicator calculation
 */
function generateWarmupCandles(startDate: Date, count: number, startPrice: number): Candle[] {
  const candles: Candle[] = [];
  let timestamp = startDate.getTime();
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    // Random walk with slight upward bias
    price *= 1 + (Math.random() - 0.48) * 0.02;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  
  return candles;
}

async function main() {
  console.log('🔧 Generating divergence test data with warmup history...\n');
  
  const outputDir = 'data/historical-prices/synthetic';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate full year 2028 with divergence scenarios
  // Include 250 warmup candles BEFORE the divergence pattern starts
  const WARMUP_CANDLES = 250;
  
  // Calculate start date for warmup (before 2028-01-01)
  const warmupStartMs = new Date('2028-01-01T00:00:00Z').getTime() - (WARMUP_CANDLES * INTERVAL_MS);
  const warmupStart = new Date(warmupStartMs);
  
  console.log('📊 Generating 2028 full year with divergence scenarios...');
  console.log(`   Warmup period: ${warmupStart.toISOString().split('T')[0]} (${WARMUP_CANDLES} candles)\n`);
  
  // Generate warmup period
  const warmupCandles = generateWarmupCandles(warmupStart, WARMUP_CANDLES, 2500);
  const lastWarmupPrice = warmupCandles[warmupCandles.length - 1]!.close;
  
  // Generate Bearish Divergence period (2028-01-01 onwards)
  // Realistic pattern: Multiple higher highs with weakening momentum → gradual decline
  console.log('📉 Generating Bearish Divergence scenario...');
  console.log('   Pattern: 3 higher highs with weakening momentum → gradual 25% decline');
  const bearishStart = new Date('2028-01-01T00:00:00Z');
  const bearishCandles = generateBearishDivergenceScenarioFromPrice(bearishStart, lastWarmupPrice);
  const lastBearishPrice = bearishCandles[bearishCandles.length - 1]!.close;
  const bearishStartPrice = bearishCandles[0]!.close;
  const bearishHigh = Math.max(...bearishCandles.map(c => c.close));
  console.log(`   ${bearishCandles.length} candles: $${bearishStartPrice.toFixed(2)} → High: $${bearishHigh.toFixed(2)} → $${lastBearishPrice.toFixed(2)}`);
  
  // Generate some neutral/consolidation (bridging period ~20 candles)
  console.log('\n⚪ Generating consolidation bridge...');
  const lastBearishTime = bearishCandles[bearishCandles.length - 1]!.timestamp;
  const bridgeCandles: Candle[] = [];
  let bridgePrice = lastBearishPrice;
  let bridgeTime = lastBearishTime + INTERVAL_MS;
  for (let i = 0; i < 20; i++) {
    bridgePrice *= 1 + (Math.random() - 0.5) * 0.01;
    bridgeCandles.push(generateCandle(bridgeTime, bridgePrice, 0.01));
    bridgeTime += INTERVAL_MS;
  }
  const lastBridgePrice = bridgeCandles[bridgeCandles.length - 1]!.close;
  console.log(`   ${bridgeCandles.length} candles: $${bridgeCandles[0]!.close.toFixed(2)} → $${lastBridgePrice.toFixed(2)}`);
  
  // Generate Bullish Divergence period
  // Realistic pattern: Multiple lower lows with improving momentum → gradual recovery
  console.log('\n📈 Generating Bullish Divergence scenario...');
  console.log('   Pattern: 3 lower lows with improving momentum → gradual 40% recovery');
  const bullishStart = new Date(bridgeTime);
  const bullishStartPrice = lastBridgePrice * 1.3; // Start higher to allow room for decline
  const bullishCandles = generateBullishDivergenceScenarioFromPrice(bullishStart, bullishStartPrice);
  const bullishLow = Math.min(...bullishCandles.map(c => c.close));
  const bullishEndPrice = bullishCandles[bullishCandles.length - 1]!.close;
  console.log(`   ${bullishCandles.length} candles: $${bullishCandles[0]!.close.toFixed(2)} → Low: $${bullishLow.toFixed(2)} → $${bullishEndPrice.toFixed(2)}`);
  
  // Combine all candles
  const allCandles = [
    ...warmupCandles,
    ...bearishCandles,
    ...bridgeCandles,
    ...bullishCandles,
  ];
  
  // Save as 2028 full year synthetic data
  const outputFile = `${outputDir}/ethusdt_8h_2028-01-01_2028-12-31.json.gz`;
  writeFileSync(outputFile, gzipSync(JSON.stringify(allCandles)));
  
  console.log(`\n✅ Saved ${allCandles.length} total candles to ${outputFile}`);
  console.log(`   Time range: ${new Date(allCandles[0]!.timestamp).toISOString().split('T')[0]} to ${new Date(allCandles[allCandles.length-1]!.timestamp).toISOString().split('T')[0]}`);
  console.log(`   Price range: $${allCandles[0]!.close.toFixed(2)} → $${allCandles[allCandles.length-1]!.close.toFixed(2)}`);
  
  console.log('\n📋 Divergence Test Scenarios:');
  console.log('  1. Bearish Divergence: Price makes higher highs, momentum fades → crash');
  console.log('  2. Bullish Divergence: Price makes lower lows, momentum recovers → rally');
  console.log('\n⚠️  Run backfill test to compare with/without divergence detection:');
  console.log('  npx tsx scripts/backfill-test.ts 2025');
}

/**
 * Generate realistic bearish divergence: Multiple higher highs with weakening momentum
 * 
 * Pattern:
 * 1. Strong uptrend to first high (good momentum)
 * 2. Pullback
 * 3. Second higher high (weaker momentum) - DIVERGENCE STARTS
 * 4. Pullback
 * 5. Third higher high (very weak momentum) - CLEAR DIVERGENCE
 * 6. Gradual decline (not instant crash)
 */
function generateBearishDivergenceScenarioFromPrice(startDate: Date, startPrice: number): Candle[] {
  const candles: Candle[] = [];
  let timestamp = startDate.getTime();
  let price = startPrice;
  
  // Phase 1: Strong uptrend to first high (40 candles = ~13 days)
  // This establishes the initial trend with good momentum
  const firstHighTarget = startPrice * 1.35; // 35% gain
  for (let i = 0; i < 40; i++) {
    const progress = i / 40;
    const targetPrice = startPrice + (firstHighTarget - startPrice) * progress;
    price = price * 0.98 + targetPrice * 0.02; // Smooth approach
    price *= 1 + (Math.random() - 0.4) * 0.015; // Strong positive bias
    candles.push(generateCandle(timestamp, price, 0.02));
    timestamp += INTERVAL_MS;
  }
  const firstHigh = price;
  
  // Phase 2: Pullback from first high (20 candles)
  const pullbackTarget = firstHigh * 0.92; // 8% pullback
  for (let i = 0; i < 20; i++) {
    const progress = i / 20;
    const targetPrice = firstHigh + (pullbackTarget - firstHigh) * progress;
    price = price * 0.97 + targetPrice * 0.03;
    price *= 1 + (Math.random() - 0.6) * 0.01; // Slight negative bias
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  const pullbackLow = price;
  
  // Phase 3: Second higher high with WEAKER momentum (50 candles = ~17 days)
  // This is where divergence becomes visible - price goes higher but momentum is weaker
  const secondHighTarget = firstHigh * 1.08; // 8% above first high
  for (let i = 0; i < 50; i++) {
    const progress = i / 50;
    const targetPrice = pullbackLow + (secondHighTarget - pullbackLow) * progress;
    price = price * 0.99 + targetPrice * 0.01;
    // WEAKER momentum: smaller gains, more choppy
    const weakenedGain = 0.006 - (i * 0.0001); // Gains shrink from 0.6% to 0.1%
    price *= 1 + Math.max(0.0005, weakenedGain) + (Math.random() - 0.5) * 0.008;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  const secondHigh = price;
  
  // Phase 4: Another pullback (15 candles)
  const secondPullbackTarget = secondHigh * 0.94; // 6% pullback
  for (let i = 0; i < 15; i++) {
    const progress = i / 15;
    const targetPrice = secondHigh + (secondPullbackTarget - secondHigh) * progress;
    price = price * 0.98 + targetPrice * 0.02;
    price *= 1 + (Math.random() - 0.55) * 0.01;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  const secondPullbackLow = price;
  
  // Phase 5: Third higher high with VERY WEAK momentum (40 candles)
  // Clear divergence - price makes new high but momentum is exhausted
  const thirdHighTarget = secondHigh * 1.05; // 5% above second high
  for (let i = 0; i < 40; i++) {
    const progress = i / 40;
    const targetPrice = secondPullbackLow + (thirdHighTarget - secondPullbackLow) * progress;
    price = price * 0.995 + targetPrice * 0.005;
    // VERY WEAK momentum: tiny gains, lots of noise
    price *= 1 + (Math.random() - 0.45) * 0.004; // Very small positive bias
    candles.push(generateCandle(timestamp, price, 0.01));
    timestamp += INTERVAL_MS;
  }
  const thirdHigh = price;
  
  // Phase 6: Gradual decline (not instant crash) - 60 candles = ~20 days
  // This gives divergence time to help exit before major losses
  const declineTarget = thirdHigh * 0.75; // 25% decline over 20 days
  for (let i = 0; i < 60; i++) {
    const progress = i / 60;
    const targetPrice = thirdHigh + (declineTarget - thirdHigh) * progress;
    price = price * 0.98 + targetPrice * 0.02;
    // Gradual decline: 0.3-0.5% per candle
    price *= 0.996 - Math.random() * 0.002;
    candles.push(generateCandle(timestamp, price, 0.02));
    timestamp += INTERVAL_MS;
  }
  
  // Phase 7: Stabilization (20 candles)
  for (let i = 0; i < 20; i++) {
    price *= 1 + (Math.random() - 0.5) * 0.01;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  
  return candles;
}

/**
 * Generate realistic bullish divergence: Multiple lower lows with improving momentum
 * 
 * Pattern:
 * 1. Strong downtrend to first low (strong selling)
 * 2. Bounce
 * 3. Second lower low (weaker selling) - DIVERGENCE STARTS
 * 4. Bounce
 * 5. Third lower low (very weak selling) - CLEAR DIVERGENCE
 * 6. Gradual recovery (not instant rally)
 */
function generateBullishDivergenceScenarioFromPrice(startDate: Date, startPrice: number): Candle[] {
  const candles: Candle[] = [];
  let timestamp = startDate.getTime();
  let price = startPrice;
  
  // Phase 1: Strong downtrend to first low (40 candles = ~13 days)
  // This establishes the initial decline with strong selling pressure
  const firstLowTarget = startPrice * 0.70; // 30% decline
  for (let i = 0; i < 40; i++) {
    const progress = i / 40;
    const targetPrice = startPrice + (firstLowTarget - startPrice) * progress;
    price = price * 0.98 + targetPrice * 0.02; // Smooth approach
    price *= 1 + (Math.random() - 0.6) * 0.015; // Strong negative bias
    candles.push(generateCandle(timestamp, price, 0.02));
    timestamp += INTERVAL_MS;
  }
  const firstLow = price;
  
  // Phase 2: Bounce from first low (20 candles)
  const bounceTarget = firstLow * 1.12; // 12% bounce
  for (let i = 0; i < 20; i++) {
    const progress = i / 20;
    const targetPrice = firstLow + (bounceTarget - firstLow) * progress;
    price = price * 0.97 + targetPrice * 0.03;
    price *= 1 + (Math.random() - 0.4) * 0.01; // Slight positive bias
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  const bounceHigh = price;
  
  // Phase 3: Second lower low with WEAKER selling (50 candles = ~17 days)
  // This is where divergence becomes visible - price goes lower but selling is weaker
  const secondLowTarget = firstLow * 0.92; // 8% below first low
  for (let i = 0; i < 50; i++) {
    const progress = i / 50;
    const targetPrice = bounceHigh + (secondLowTarget - bounceHigh) * progress;
    price = price * 0.99 + targetPrice * 0.01;
    // WEAKER selling: smaller drops, more choppy
    const weakenedDrop = -0.006 + (i * 0.0001); // Drops shrink from -0.6% to -0.1%
    price *= 1 + Math.min(-0.0005, weakenedDrop) + (Math.random() - 0.5) * 0.008;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  const secondLow = price;
  
  // Phase 4: Another bounce (15 candles)
  const secondBounceTarget = secondLow * 1.08; // 8% bounce
  for (let i = 0; i < 15; i++) {
    const progress = i / 15;
    const targetPrice = secondLow + (secondBounceTarget - secondLow) * progress;
    price = price * 0.98 + targetPrice * 0.02;
    price *= 1 + (Math.random() - 0.45) * 0.01;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  const secondBounceHigh = price;
  
  // Phase 5: Third lower low with VERY WEAK selling (40 candles)
  // Clear divergence - price makes new low but selling is exhausted
  const thirdLowTarget = secondLow * 0.95; // 5% below second low
  for (let i = 0; i < 40; i++) {
    const progress = i / 40;
    const targetPrice = secondBounceHigh + (thirdLowTarget - secondBounceHigh) * progress;
    price = price * 0.995 + targetPrice * 0.005;
    // VERY WEAK selling: tiny drops, lots of noise
    price *= 1 + (Math.random() - 0.55) * 0.004; // Very small negative bias
    candles.push(generateCandle(timestamp, price, 0.01));
    timestamp += INTERVAL_MS;
  }
  const thirdLow = price;
  
  // Phase 6: Gradual recovery (not instant rally) - 60 candles = ~20 days
  // This gives divergence time to help enter before major gains
  const recoveryTarget = thirdLow * 1.40; // 40% recovery over 20 days
  for (let i = 0; i < 60; i++) {
    const progress = i / 60;
    const targetPrice = thirdLow + (recoveryTarget - thirdLow) * progress;
    price = price * 0.98 + targetPrice * 0.02;
    // Gradual recovery: 0.4-0.6% per candle
    price *= 1.004 + Math.random() * 0.002;
    candles.push(generateCandle(timestamp, price, 0.02));
    timestamp += INTERVAL_MS;
  }
  
  // Phase 7: Stabilization (20 candles)
  for (let i = 0; i < 20; i++) {
    price *= 1 + (Math.random() - 0.5) * 0.01;
    candles.push(generateCandle(timestamp, price, 0.015));
    timestamp += INTERVAL_MS;
  }
  
  return candles;
}

main().catch(console.error);

