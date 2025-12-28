#!/usr/bin/env tsx
/**
 * Save Enhanced Adaptive Strategy Config to Redis
 * Initializes the favorite strategy configuration for paper trading
 */

import * as dotenv from 'dotenv';
import path from 'path';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingConfig } from '@/types';
import { saveAdaptiveStrategyConfig } from '@/lib/kv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  console.log('💾 Saving Enhanced Adaptive Strategy Config to Redis\n');

  // Conservative-Bullish strategy (best full-year performer)
  const conservativeBullish: TradingConfig = {
    name: 'Bullish-Conservative',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.3, params: { period: 20 } },
      { type: 'ema', weight: 0.3, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.35,
    sellThreshold: -0.3,
    maxPositionPct: 0.75,
    initialCapital: 1000,
  };

  const bearishStrategy: TradingConfig = {
    name: 'Strategy1',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.45,
    sellThreshold: -0.2,
    maxPositionPct: 0.5,
    initialCapital: 1000,
  };

  // Enhanced config with fixed persistence
  const enhancedConfig: EnhancedAdaptiveStrategyConfig = {
    bullishStrategy: conservativeBullish,
    bearishStrategy,
    regimeConfidenceThreshold: 0.2,
    momentumConfirmationThreshold: 0.25,
    bullishPositionMultiplier: 1.1,
    regimePersistencePeriods: 2, // Uses majority rule (2 out of 5)
    dynamicPositionSizing: true,
    maxBullishPosition: 0.95,
  };

  try {
    await saveAdaptiveStrategyConfig(enhancedConfig);
    console.log('✅ Successfully saved enhanced adaptive strategy config to Redis\n');
    console.log('📊 Configuration:');
    console.log(`   Bullish Strategy: ${conservativeBullish.name}`);
    console.log(`   Bearish Strategy: ${bearishStrategy.name}`);
    console.log(`   Regime Confidence Threshold: ${enhancedConfig.regimeConfidenceThreshold}`);
    console.log(`   Momentum Confirmation Threshold: ${enhancedConfig.momentumConfirmationThreshold}`);
    console.log(`   Regime Persistence: ${enhancedConfig.regimePersistencePeriods} out of 5 periods`);
    console.log(`   Max Bullish Position: ${(enhancedConfig.maxBullishPosition || 0.95) * 100}%`);
  } catch (error) {
    console.error('❌ Failed to save config:', error);
    process.exit(1);
  }
}

main().catch(console.error);

