#!/usr/bin/env tsx
/**
 * Save Enhanced Adaptive Strategy Config to Redis
 * Initializes the favorite strategy configuration for paper trading
 */

import * as dotenv from 'dotenv';
import path from 'path';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingConfig } from '@/types';
import { saveAdaptiveStrategyConfig, disconnectRedis } from '@/lib/kv';
import { validateStrategyConfig } from '@/lib/config-validator';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  // Configurable timeframe - default to 8h
  const TIMEFRAME = (process.env.TIMEFRAME as '8h' | '12h' | '1d') || '8h';
  
  console.log('💾 Saving Optimized Enhanced Adaptive Strategy Config to Redis\n');
  console.log(`📊 Using Hybrid-0.41 + Recovery-0.65 (Best Overall) optimized for ${TIMEFRAME} timeframe:\n`);
  console.log(`   • Timeframe: ${TIMEFRAME}`);
  console.log(`   • Bullish: Hybrid (buyThreshold: 0.41, sellThreshold: -0.45)`);
  console.log(`   • Bearish: Recovery (buyThreshold: 0.65, sellThreshold: -0.25)`);
  console.log(`   • Volatility Filter (${TIMEFRAME === '8h' ? '1.9% per 8H' : '5% daily'} threshold)`);
  console.log('   • Circuit Breaker (18% win rate minimum)');
  console.log('   • Whipsaw Detection (max 3 changes in 5 periods)');
  console.log('   • Expected: +70.72% historical, +33.02% synthetic\n');

  // Hybrid-0.41 + Recovery-0.65 Strategy (Best Overall - Advanced Optimization)
  // Tested 42 combinations (7 bullish × 6 bearish) - Score: 53.20
  const bullishStrategy: TradingConfig = {
    name: 'Bullish-Hybrid',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.35, params: { period: 20 } },  // Balanced with EMA
      { type: 'ema', weight: 0.35, params: { period: 12 } },  // Balanced with SMA
      { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.1, params: { period: 14 } },  // Reduced weight
    ],
    buyThreshold: 0.41,        // Optimized - between conservative and trend
    sellThreshold: -0.45,      // Hold through dips
    maxPositionPct: 0.90,     // 90% for 8h
    initialCapital: 1000,
  };

  // Recovery-Focused Bearish Strategy (optimized for catching recovery signals)
  const bearishStrategy: TradingConfig = {
    name: 'Bearish-Recovery',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.65,       // Lower - catch recovery signals
    sellThreshold: -0.25,     // Moderate
    maxPositionPct: 0.3,     // Larger positions for recovery
    initialCapital: 1000,
  };

  // Enhanced config with all improvements (optimized for 8h)
  const enhancedConfig: EnhancedAdaptiveStrategyConfig = {
    bullishStrategy,
    bearishStrategy,
    regimeConfidenceThreshold: 0.22,        // Lower - more flexible (optimized)
    momentumConfirmationThreshold: 0.26,     // Slightly lower (optimized)
    bullishPositionMultiplier: 1.0,
    regimePersistencePeriods: 1,            // Faster switching (optimized)
    dynamicPositionSizing: false,            // Fixed position sizing (top performers use this)
    maxBullishPosition: 0.90,               // 90% for 8h
    // Risk management improvements (scaled for 8h)
    maxVolatility: 0.019,                    // Higher tolerance (optimized)
    circuitBreakerWinRate: 0.18,             // Slightly lower (optimized)
    circuitBreakerLookback: 12,              // Increased lookback (optimized)
    whipsawDetectionPeriods: 5,              // Check last 5 periods
    whipsawMaxChanges: 3,                   // Max 3 regime changes in 5 periods
    // Advanced position sizing and risk management
    kellyCriterion: {
      enabled: true,
      fractionalMultiplier: 0.25,           // 25% fractional Kelly (optimal for current config)
      minTrades: 10,                         // Activate after 10 completed trades
      lookbackPeriod: 50,                    // Analyze last 50 trades
    },
    stopLoss: {
      enabled: true,
      atrMultiplier: 2.0,                    // 2.0x ATR stop loss (optimal for current config)
      trailing: true,                         // Enable trailing stops
      useEMA: true,                          // Use EMA for smoother ATR
      atrPeriod: 14,                         // 14-period ATR
    },
  };

  try {
    // Validate config before saving
    const validation = validateStrategyConfig(enhancedConfig);
    if (!validation.isValid) {
      console.error('❌ Config validation failed:');
      for (const error of validation.errors) {
        console.error(`   • ${error}`);
      }
      process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Config validation warnings:');
      for (const warning of validation.warnings) {
        console.warn(`   • ${warning}`);
      }
    }
    
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
    if (enhancedConfig.kellyCriterion) {
      console.log(`   Kelly Criterion: ${enhancedConfig.kellyCriterion.enabled ? 'Enabled' : 'Disabled'}`);
      if (enhancedConfig.kellyCriterion.enabled) {
        console.log(`     • Fractional Multiplier: ${(enhancedConfig.kellyCriterion.fractionalMultiplier * 100).toFixed(0)}%`);
        console.log(`     • Min Trades: ${enhancedConfig.kellyCriterion.minTrades}`);
        console.log(`     • Lookback Period: ${enhancedConfig.kellyCriterion.lookbackPeriod}`);
      }
    }
    if (enhancedConfig.stopLoss) {
      console.log(`   ATR Stop Loss: ${enhancedConfig.stopLoss.enabled ? 'Enabled' : 'Disabled'}`);
      if (enhancedConfig.stopLoss.enabled) {
        console.log(`     • ATR Multiplier: ${enhancedConfig.stopLoss.atrMultiplier.toFixed(1)}x`);
        console.log(`     • Trailing Stop: ${enhancedConfig.stopLoss.trailing ? 'Yes' : 'No'}`);
        console.log(`     • ATR Period: ${enhancedConfig.stopLoss.atrPeriod}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to save config:', error);
    process.exit(1);
  }
}

main()
  .then(async () => {
    await disconnectRedis();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Error:', error);
    await disconnectRedis();
    process.exit(1);
  });



