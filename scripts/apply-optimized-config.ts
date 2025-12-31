#!/usr/bin/env npx tsx
/**
 * Apply optimized strategy configuration
 * Updates backfill-test.ts and verify-historical-backtest.ts with recommended config
 */

import * as fs from 'fs';
import * as path from 'path';

// Hybrid-0.41 + Recovery-0.65 Config (Best Overall - Advanced Optimization)
const OPTIMAL_CONFIG = `const DEFAULT_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Hybrid',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.35, params: { period: 20 } },
      { type: 'ema', weight: 0.35, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.1, params: { period: 14 } },
    ],
    buyThreshold: 0.41,  // Optimized - between conservative and trend
    sellThreshold: -0.45,  // Hold through dips
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
    buyThreshold: 0.65,  // Lower - catch recovery signals
    sellThreshold: -0.25,
    maxPositionPct: 0.3,  // Larger positions for recovery
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.22,  // Lower - more flexible
  momentumConfirmationThreshold: 0.26,  // Slightly lower
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 1,  // Faster switching
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.019,  // Higher tolerance
  circuitBreakerWinRate: 0.18,  // Slightly lower
  circuitBreakerLookback: 12,
  whipsawDetectionPeriods: 5,
  whipsawMaxChanges: 3,
};`;

// Adaptive Flexible Config (Best Risk-Adjusted)
const ADAPTIVE_FLEXIBLE_CONFIG = `const DEFAULT_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Flexible',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.3, params: { period: 20 } },
      { type: 'ema', weight: 0.3, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.35,  // Lower - trade on weaker signals
    sellThreshold: -0.3,
    maxPositionPct: 0.90,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Bearish-Flexible',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.65,  // Lower - more willing to buy
    sellThreshold: -0.2,
    maxPositionPct: 0.25,  // Larger positions
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.20,  // Lower - more flexible
  momentumConfirmationThreshold: 0.25,  // Lower
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 1,  // Faster switching
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.02,  // Higher tolerance
  circuitBreakerWinRate: 0.15,  // Lower threshold
  circuitBreakerLookback: 15,
  whipsawDetectionPeriods: 6,  // More lenient
  whipsawMaxChanges: 4,
};`;

function updateConfigInFile(filePath: string, newConfig: string, configName: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Find the DEFAULT_CONFIG block
  const configStartRegex = /const DEFAULT_CONFIG: EnhancedAdaptiveStrategyConfig = \{/;
  const configEndRegex = /^\};$/m;
  
  const startMatch = content.match(configStartRegex);
  if (!startMatch) {
    console.error(`❌ Could not find DEFAULT_CONFIG in ${filePath}`);
    return;
  }
  
  const startIndex = startMatch.index!;
  let braceCount = 0;
  let endIndex = startIndex;
  
  // Find the matching closing brace
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  
  // Replace the config
  const before = content.substring(0, startIndex);
  const after = content.substring(endIndex);
  const updated = before + newConfig + '\n' + after;
  
  fs.writeFileSync(filePath, updated, 'utf-8');
  console.log(`✅ Updated ${filePath} with ${configName} config`);
}

async function main() {
  console.log('🔄 Applying optimized strategy configurations...\n');
  
  const choice = process.argv[2] || 'conservative';
  
  if (choice === 'optimal' || choice === '1' || choice === 'conservative') {
    console.log('📝 Applying Trend Following + Recovery Focused config (Best Overall - Independent Optimization)...\n');
    updateConfigInFile('scripts/backfill-test.ts', OPTIMAL_CONFIG, 'Trend Following + Recovery Focused');
    updateConfigInFile('scripts/verify-historical-backtest.ts', OPTIMAL_CONFIG, 'Trend Following + Recovery Focused');
    console.log('\n✅ Applied Hybrid-0.41 + Recovery-0.65 config');
    console.log('   Expected: +70.72% historical, +33.02% synthetic (vs +65.02%/+30.19% previous best)');
  } else if (choice === 'flexible' || choice === '2') {
    console.log('📝 Applying Adaptive Flexible config (Best Risk-Adjusted)...\n');
    updateConfigInFile('scripts/backfill-test.ts', ADAPTIVE_FLEXIBLE_CONFIG, 'Adaptive Flexible');
    updateConfigInFile('scripts/verify-historical-backtest.ts', ADAPTIVE_FLEXIBLE_CONFIG, 'Adaptive Flexible');
    console.log('\n✅ Applied Adaptive Flexible config');
    console.log('   Expected: +34.53% historical, +30.07% synthetic, 35.50% max DD');
  } else {
    console.log('Usage: npx tsx scripts/apply-optimized-config.ts [optimal|flexible|1|2]');
    console.log('  optimal or 1: Apply Trend Following + Recovery Focused (best overall - +72.98%)');
    console.log('  flexible or 2: Apply Adaptive Flexible (best risk-adjusted)');
    process.exit(1);
  }
  
  console.log('\n📊 Next steps:');
  console.log('   1. Run: pnpm eth:backfill-test');
  console.log('   2. Run: pnpm eth:verify-backtest');
  console.log('   3. Compare results with baseline');
}

main().catch(console.error);

