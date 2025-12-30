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
  console.log('💾 Saving Optimized Enhanced Adaptive Strategy Config to Redis\n');
  console.log('📊 Using Option 1 (Best Risk-Adjusted) with all improvements:\n');
  console.log('   • Volatility Filter (5% daily threshold)');
  console.log('   • Circuit Breaker (20% win rate minimum)');
  console.log('   • Whipsaw Detection (max 3 changes in 5 periods)');
  console.log('   • Tighter Bearish Strategy (0.8 buy threshold, 0.2 max position)\n');

  // Option 1: Best Risk-Adjusted Strategy (Config-26-MaxPos0.95)
  // Full Year Return: +34.44%, vs ETH: +46.64%, Risk-Adjusted Return: 2.14
  const bullishStrategy: TradingConfig = {
    name: 'Bullish-Balanced',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.3, params: { period: 20 } },
      { type: 'ema', weight: 0.3, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.4,        // Moderate threshold
    sellThreshold: -0.35,     // Hold through moderate dips
    maxPositionPct: 0.95,    // Use almost all capital (KEY DIFFERENCE)
    initialCapital: 1000,
  };

  // Tighter Bearish Strategy (with improvements)
  const bearishStrategy: TradingConfig = {
    name: 'Bearish-Conservative',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.8,       // Very high threshold - almost never buy (IMPROVED from 0.65)
    sellThreshold: -0.2,     // Easier to exit (IMPROVED from -0.3)
    maxPositionPct: 0.2,     // Smaller positions (IMPROVED from 0.4)
    initialCapital: 1000,
  };

  // Enhanced config with all improvements
  const enhancedConfig: EnhancedAdaptiveStrategyConfig = {
    bullishStrategy,
    bearishStrategy,
    regimeConfidenceThreshold: 0.25,
    momentumConfirmationThreshold: 0.3,
    bullishPositionMultiplier: 1.0,
    regimePersistencePeriods: 3, // Require 3 out of 5 periods
    dynamicPositionSizing: false, // Fixed position sizing (top performers use this)
    maxBullishPosition: 0.95,
    // Risk management improvements
    maxVolatility: 0.05,              // Block trading if volatility > 5% daily
    circuitBreakerWinRate: 0.2,       // Stop trading if win rate < 20%
    circuitBreakerLookback: 10,       // Check last 10 trades
    whipsawDetectionPeriods: 5,       // Check last 5 periods
    whipsawMaxChanges: 3,             // Max 3 regime changes in 5 periods
  };

  try {
    await saveAdaptiveStrategyConfig(enhancedConfig);
    console.log('✅ Successfully saved optimized enhanced adaptive strategy config to Redis\n');
    console.log('📊 Configuration Summary:');
    console.log(`   Bullish Strategy: ${bullishStrategy.name}`);
    console.log(`     • Buy Threshold: ${bullishStrategy.buyThreshold}`);
    console.log(`     • Sell Threshold: ${bullishStrategy.sellThreshold}`);
    console.log(`     • Max Position: ${bullishStrategy.maxPositionPct * 100}%`);
    console.log(`   Bearish Strategy: ${bearishStrategy.name}`);
    console.log(`     • Buy Threshold: ${bearishStrategy.buyThreshold} (very conservative)`);
    console.log(`     • Sell Threshold: ${bearishStrategy.sellThreshold}`);
    console.log(`     • Max Position: ${bearishStrategy.maxPositionPct * 100}%`);
    console.log(`   Regime Settings:`);
    console.log(`     • Confidence Threshold: ${enhancedConfig.regimeConfidenceThreshold}`);
    console.log(`     • Momentum Threshold: ${enhancedConfig.momentumConfirmationThreshold}`);
    console.log(`     • Persistence: ${enhancedConfig.regimePersistencePeriods} out of 5 periods`);
    console.log(`   Risk Management:`);
    console.log(`     • Max Volatility: ${(enhancedConfig.maxVolatility || 0.05) * 100}% daily`);
    console.log(`     • Circuit Breaker: ${(enhancedConfig.circuitBreakerWinRate || 0.2) * 100}% win rate (last ${enhancedConfig.circuitBreakerLookback || 10} trades)`);
    console.log(`     • Whipsaw Detection: Max ${enhancedConfig.whipsawMaxChanges || 3} changes in ${enhancedConfig.whipsawDetectionPeriods || 5} periods`);
    console.log(`   Position Sizing: Fixed (${enhancedConfig.maxBullishPosition ? enhancedConfig.maxBullishPosition * 100 : 95}% max)`);
  } catch (error) {
    console.error('❌ Failed to save config:', error);
    process.exit(1);
  }
}

main().catch(console.error);



