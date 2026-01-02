#!/usr/bin/env npx tsx
/**
 * ML-Based Strategy Optimizer using TensorFlow.js
 * 
 * Uses backfill test results to train a model that predicts optimal strategy parameters.
 * Iteratively improves strategy by learning from historical performance.
 * 
 * Usage:
 *   pnpm tsx scripts/ml-strategy-optimizer.ts [asset] [years]
 * 
 * Examples:
 *   pnpm tsx scripts/ml-strategy-optimizer.ts eth
 *     → Tests ALL periods (maximum robustness)
 *   
 *   pnpm tsx scripts/ml-strategy-optimizer.ts eth 2026
 *     → Tests all 2026 periods (bull runs, crashes, bear markets, whipsaw, etc.)
 *   
 *   pnpm tsx scripts/ml-strategy-optimizer.ts eth 2025,2026,2027
 *     → Tests all periods in 2025, 2026, and 2027
 * 
 * Note: By default (no years specified), tests ALL periods for maximum robustness
 * across all market conditions (bull, bear, crash, whipsaw, etc.)
 */

import * as tf from '@tensorflow/tfjs';
import * as os from 'os';
import { runBacktest } from './backfill-test';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingAsset } from '@/lib/asset-config';
import { getAssetConfig } from '@/lib/asset-config';
import * as fs from 'fs';
import * as path from 'path';

interface OptimizationResult {
  config: EnhancedAdaptiveStrategyConfig;
  metrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
  score: number; // Combined fitness score
}

interface TrainingData {
  features: number[][]; // Strategy parameters as features
  labels: number[]; // Performance scores as labels
}

/**
 * Generate a short config name from strategy parameters
 * Format: B{buyThresh}-S{sellThresh}|Be{buyThresh}-S{sellThresh}|R{regimeConf}|K{kelly}|A{atr}
 * Example: B0.41-S0.45|Be0.65-S0.25|R0.22|K0.25|A2.0
 */
function getConfigShortName(config: EnhancedAdaptiveStrategyConfig): string {
  const bullBuy = config.bullishStrategy.buyThreshold.toFixed(2);
  const bullSell = Math.abs(config.bullishStrategy.sellThreshold).toFixed(2);
  const bearBuy = config.bearishStrategy.buyThreshold.toFixed(2);
  const bearSell = Math.abs(config.bearishStrategy.sellThreshold).toFixed(2);
  const regime = (config.regimeConfidenceThreshold ?? 0.22).toFixed(2);
  const kelly = config.kellyCriterion?.fractionalMultiplier?.toFixed(2) ?? '0.25';
  const atr = config.stopLoss?.atrMultiplier?.toFixed(1) ?? '2.0';
  
  return `B${bullBuy}-S${bullSell}|Be${bearBuy}-S${bearSell}|R${regime}|K${kelly}|A${atr}`;
}

/**
 * Get all test periods (same as backfill-test.ts)
 * This ensures ML optimization tests robustness across ALL market conditions
 */
export function getAllTestPeriods(): Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }> {
  const historicalPeriods = [
    { name: 'Bullish Period', startDate: '2025-04-01', endDate: '2025-08-23', isSynthetic: false },
    { name: 'Bearish Period', startDate: '2025-01-01', endDate: '2025-06-01', isSynthetic: false },
    { name: 'Full Year 2025', startDate: '2025-01-01', endDate: '2025-12-27', isSynthetic: false },
  ];
  
  const synthetic2026Periods = [
    { name: '2026 Full Year', startDate: '2026-01-01', endDate: '2026-12-31', isSynthetic: true },
    { name: '2026 Q1 (Bull Run)', startDate: '2026-01-01', endDate: '2026-03-31', isSynthetic: true },
    { name: '2026 Q2 (Crash→Recovery)', startDate: '2026-04-01', endDate: '2026-06-30', isSynthetic: true },
    { name: '2026 Q3 (Bear Market)', startDate: '2026-07-01', endDate: '2026-09-30', isSynthetic: true },
    { name: '2026 Q4 (Bull Recovery)', startDate: '2026-10-01', endDate: '2026-12-31', isSynthetic: true },
    { name: '2026 Bull Run Period', startDate: '2026-03-01', endDate: '2026-04-30', isSynthetic: true },
    { name: '2026 Crash Period', startDate: '2026-05-01', endDate: '2026-05-15', isSynthetic: true },
    { name: '2026 Bear Market', startDate: '2026-07-01', endDate: '2026-08-31', isSynthetic: true },
    { name: '2026 Whipsaw Period', startDate: '2026-09-01', endDate: '2026-09-30', isSynthetic: true },
  ];
  
  const synthetic2027Periods = [
    { name: '2027 Full Year', startDate: '2027-01-01', endDate: '2027-12-31', isSynthetic: true },
    { name: '2027 Q1 (False Breakout→Bull)', startDate: '2027-01-01', endDate: '2027-03-31', isSynthetic: true },
    { name: '2027 Q2 (Volatility Squeeze→Breakout)', startDate: '2027-04-01', endDate: '2027-06-30', isSynthetic: true },
    { name: '2027 Q3 (Extended Bear Market)', startDate: '2027-07-01', endDate: '2027-09-30', isSynthetic: true },
    { name: '2027 Q4 (Slow Grind→Recovery)', startDate: '2027-10-01', endDate: '2027-12-31', isSynthetic: true },
    { name: '2027 False Bull Breakout', startDate: '2027-01-01', endDate: '2027-01-31', isSynthetic: true },
    { name: '2027 Extended Consolidation', startDate: '2027-02-01', endDate: '2027-02-28', isSynthetic: true },
    { name: '2027 Extended Bull Run', startDate: '2027-03-01', endDate: '2027-04-30', isSynthetic: true },
    { name: '2027 Volatility Squeeze', startDate: '2027-05-01', endDate: '2027-05-31', isSynthetic: true },
    { name: '2027 Explosive Breakout', startDate: '2027-06-01', endDate: '2027-06-30', isSynthetic: true },
    { name: '2027 Extended Bear Market', startDate: '2027-07-01', endDate: '2027-09-30', isSynthetic: true },
    { name: '2027 Slow Grind Down', startDate: '2027-10-01', endDate: '2027-10-31', isSynthetic: true },
    { name: '2027 False Bear Breakout', startDate: '2027-11-01', endDate: '2027-11-15', isSynthetic: true },
    { name: '2027 Recovery Rally', startDate: '2027-11-16', endDate: '2027-12-31', isSynthetic: true },
  ];
  
  const multiYearPeriods = [
    { name: '2025-2026 (2 Years)', startDate: '2025-01-01', endDate: '2026-12-31', isSynthetic: false },
    { name: '2026-2027 (2 Years Synthetic)', startDate: '2026-01-01', endDate: '2027-12-31', isSynthetic: true },
    { name: '2025-2027 (3 Years)', startDate: '2025-01-01', endDate: '2027-12-31', isSynthetic: false },
  ];
  
  const divergenceTestPeriods = [
    { name: '2028 Bearish Divergence (Top→Crash)', startDate: '2028-01-01', endDate: '2028-02-10', isSynthetic: true },
    { name: '2028 Bullish Divergence (Bottom→Rally)', startDate: '2028-02-15', endDate: '2028-03-17', isSynthetic: true },
    { name: '2028 Full Divergence Test', startDate: '2028-01-01', endDate: '2028-03-17', isSynthetic: true },
  ];
  
  return [
    ...historicalPeriods,
    ...synthetic2026Periods,
    ...synthetic2027Periods,
    ...multiYearPeriods,
    ...divergenceTestPeriods,
  ];
}

/**
 * Get test periods filtered by year(s) and asset availability
 */
export function getTestPeriodsForYears(years?: number[], asset: TradingAsset = 'eth'): Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }> {
  const allPeriods = getAllTestPeriods();
  
  // Filter out periods that don't have data for the asset
  // BTC doesn't have 2025 historical data (only ETH does)
  let filteredPeriods = allPeriods.filter(period => {
    if (asset === 'btc') {
      // BTC doesn't have 2025 historical data - skip non-synthetic 2025 periods
      const periodStartYear = parseInt(period.startDate.split('-')[0]!, 10);
      if (periodStartYear === 2025 && !period.isSynthetic) {
        return false; // Skip 2025 historical periods for BTC
      }
    }
    return true;
  });
  
  if (!years || years.length === 0) {
    return filteredPeriods;
  }
  
  // Filter periods that overlap with requested years
  return filteredPeriods.filter(period => {
    // Parse year directly from date string to avoid timezone issues
    // Date strings like '2026-01-01' are parsed as UTC, which can cause getFullYear() to return wrong year in some timezones
    const periodStartYear = parseInt(period.startDate.split('-')[0]!, 10);
    const periodEndYear = parseInt(period.endDate.split('-')[0]!, 10);
    
    return years.some(year => 
      year >= periodStartYear && year <= periodEndYear
    );
  });
}

/**
 * Extract features from strategy config for ML model
 */
function configToFeatures(config: EnhancedAdaptiveStrategyConfig): number[] {
  return [
    // Bullish strategy parameters
    config.bullishStrategy.buyThreshold,
    config.bullishStrategy.sellThreshold,
    config.bullishStrategy.maxPositionPct,
    // Bullish indicator weights (normalized)
    ...(config.bullishStrategy.indicators.map(i => i.weight)),
    
    // Bearish strategy parameters
    config.bearishStrategy.buyThreshold,
    config.bearishStrategy.sellThreshold,
    config.bearishStrategy.maxPositionPct,
    // Bearish indicator weights
    ...(config.bearishStrategy.indicators.map(i => i.weight)),
    
    // Regime detection parameters
    config.regimeConfidenceThreshold ?? 0.22,
    config.momentumConfirmationThreshold ?? 0.26,
    config.regimePersistencePeriods ?? 1,
    config.bullishPositionMultiplier ?? 1.0,
    config.maxBullishPosition ?? 0.90,
    
    // Kelly Criterion
    config.kellyCriterion?.fractionalMultiplier ?? 0.25,
    
    // Stop Loss
    config.stopLoss?.atrMultiplier ?? 2.0,
  ];
}

// Default config baseline (set during optimization)
let DEFAULT_BASELINE_RETURN: number | null = null;

/**
 * Calculate fitness score from backtest results
 * Higher score = better strategy
 * 
 * Updated weights (Jan 2026):
 * - Increased return weight from 40% to 60% (prioritize profitability)
 * - Reduced drawdown penalty from 20% to 10% (less conservative)
 * - Added minimum return threshold to avoid overly conservative configs
 * - Added bonus for beating default config baseline
 */
function calculateFitnessScore(metrics: OptimizationResult['metrics'], defaultBaseline?: number): number {
  // Use default baseline if provided, otherwise use minimum threshold
  const baseline = defaultBaseline ?? DEFAULT_BASELINE_RETURN ?? 5.0;
  
  // AGGRESSIVE: Heavy penalty for not beating baseline - we MUST beat the default
  const baselinePenalty = metrics.totalReturn < baseline
    ? (metrics.totalReturn - baseline) * 10 // Very heavy penalty (10x) - strongly discourage underperforming
    : 0;
  
  // AGGRESSIVE: Large bonus for beating baseline - reward improvements heavily
  const beatBaselineBonus = defaultBaseline && metrics.totalReturn > defaultBaseline
    ? (metrics.totalReturn - defaultBaseline) * 5 // Large bonus (5x) - strongly reward beating baseline
    : 0;
  
  // AGGRESSIVE: Prioritize returns heavily - we want to beat the default's 22.80% average
  const returnScore = metrics.totalReturn * 0.6; // 60% weight on returns (prioritize profitability)
  const sharpeScore = metrics.sharpeRatio * 10 * 0.20; // 20% weight on risk-adjusted returns
  const drawdownPenalty = -Math.abs(metrics.maxDrawdown) * 0.10; // 10% penalty for drawdown
  const winRateScore = metrics.winRate * 100 * 0.10; // 10% weight on win rate
  
  // Encourage reasonable trade frequency
  const tradeFrequencyBonus = metrics.totalTrades > 15 && metrics.totalTrades < 250 
    ? 5 
    : -Math.abs(metrics.totalTrades - 100) * 0.03;
  
  return returnScore + sharpeScore + drawdownPenalty + winRateScore + tradeFrequencyBonus + baselinePenalty + beatBaselineBonus;
}

/**
 * Generate random strategy config within reasonable bounds
 */
function generateRandomConfig(baseConfig: EnhancedAdaptiveStrategyConfig): EnhancedAdaptiveStrategyConfig {
  const random = () => Math.random();
  const randomRange = (min: number, max: number) => min + random() * (max - min);
  
  return {
    ...baseConfig,
    bullishStrategy: {
      ...baseConfig.bullishStrategy,
      // ADJUSTED: Narrower range closer to default (0.41) to avoid overly conservative configs
      buyThreshold: randomRange(0.25, 0.50), // Reduced max from 0.55 to 0.50
      sellThreshold: randomRange(-0.6, -0.3),
      maxPositionPct: randomRange(0.75, 0.95),
    },
    bearishStrategy: {
      ...baseConfig.bearishStrategy,
      // ADJUSTED: Narrower range closer to default (0.65) to avoid overly conservative configs
      buyThreshold: randomRange(0.5, 0.75), // Reduced max from 0.85 to 0.75
      sellThreshold: randomRange(-0.4, -0.15),
      maxPositionPct: randomRange(0.15, 0.4),
    },
    // ADJUSTED: Narrower range closer to default (0.22) to avoid overly conservative configs
    regimeConfidenceThreshold: randomRange(0.15, 0.30), // Reduced max from 0.35 to 0.30
    momentumConfirmationThreshold: randomRange(0.2, 0.35),
    regimePersistencePeriods: Math.floor(randomRange(1, 4)),
    bullishPositionMultiplier: randomRange(0.9, 1.2),
    maxBullishPosition: randomRange(0.85, 0.95),
    kellyCriterion: {
      enabled: true,
      fractionalMultiplier: randomRange(0.15, 0.35),
      minTrades: 10,
      lookbackPeriod: 50,
    },
    stopLoss: {
      enabled: true,
      // ADJUSTED: Narrower range closer to default (2.0) to avoid overly tight stops
      atrMultiplier: randomRange(1.8, 3.0), // Increased min from 1.5 to 1.8
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    },
  };
}

/**
 * Mutate a config slightly (for local search)
 * AGGRESSIVE: Increased mutation rate and step size for more exploration
 */
function mutateConfig(config: EnhancedAdaptiveStrategyConfig, mutationRate: number = 0.2): EnhancedAdaptiveStrategyConfig {
  const mutate = (value: number, min: number, max: number) => {
    if (Math.random() < mutationRate) {
      // Increased mutation step size from 0.1 to 0.15 for more aggressive exploration
      return Math.max(min, Math.min(max, value + (Math.random() - 0.5) * 0.15));
    }
    return value;
  };
  
  return {
    ...config,
    bullishStrategy: {
      ...config.bullishStrategy,
      buyThreshold: mutate(config.bullishStrategy.buyThreshold, 0.25, 0.55),
      sellThreshold: mutate(config.bullishStrategy.sellThreshold, -0.6, -0.3),
      maxPositionPct: mutate(config.bullishStrategy.maxPositionPct, 0.75, 0.95),
    },
    bearishStrategy: {
      ...config.bearishStrategy,
      buyThreshold: mutate(config.bearishStrategy.buyThreshold, 0.5, 0.85),
      sellThreshold: mutate(config.bearishStrategy.sellThreshold, -0.4, -0.15),
      maxPositionPct: mutate(config.bearishStrategy.maxPositionPct, 0.15, 0.4),
    },
    regimeConfidenceThreshold: mutate(config.regimeConfidenceThreshold ?? 0.22, 0.15, 0.35),
    momentumConfirmationThreshold: mutate(config.momentumConfirmationThreshold ?? 0.26, 0.2, 0.35),
    regimePersistencePeriods: Math.floor(mutate(config.regimePersistencePeriods ?? 1, 1, 4)),
    bullishPositionMultiplier: mutate(config.bullishPositionMultiplier ?? 1.0, 0.9, 1.2),
    maxBullishPosition: mutate(config.maxBullishPosition ?? 0.90, 0.85, 0.95),
    kellyCriterion: {
      enabled: true,
      fractionalMultiplier: mutate(config.kellyCriterion?.fractionalMultiplier ?? 0.25, 0.15, 0.35),
      minTrades: 10,
      lookbackPeriod: 50,
    },
    stopLoss: {
      enabled: true,
      atrMultiplier: mutate(config.stopLoss?.atrMultiplier ?? 2.0, 1.5, 3.0),
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    },
  };
}

/**
 * Test a strategy config across multiple periods
 */
async function testConfig(
  config: EnhancedAdaptiveStrategyConfig,
  asset: TradingAsset,
  periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean }>,
  bestScoreSoFar: number = -Infinity,
  defaultReturn?: number
): Promise<OptimizationResult['metrics']> {
  const results: Array<{
    startDate: string;
    endDate: string;
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    winTrades: number;
    lossTrades: number;
    totalReturn: number;
    totalReturnPct: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    finalPortfolio: { usdc: number; eth: number; initialCapital: number };
    periods: any[];
    usdcHold: { finalValue: number; return: number; returnPct: number };
    ethHold: { finalValue: number; return: number; returnPct: number; maxDrawdown: number; maxDrawdownPct: number; sharpeRatio: number };
  }> = [];
  
  // OPTIMIZATION: Early termination - test a subset first, skip remaining if clearly bad
  // ADJUSTED: Test more periods before early termination (was 30%, now 50%)
  // This prevents cutting off configs that might perform well on later periods
  const earlyTerminationThreshold = Math.max(5, Math.floor(periods.length * 0.5)); // Test at least 50% of periods
  // ADJUSTED: Less aggressive early termination threshold (was 50%, now 30% of best)
  // This allows more configs to complete testing, finding better generalizers
  const earlyTerminationMinScore = bestScoreSoFar * 0.3; // If score is less than 30% of best, likely won't improve
  
  // OPTIMIZATION: Test periods in parallel (each backtest is independent)
  // Use a reasonable concurrency limit to avoid overwhelming the system
  const periodConcurrency = Math.min(4, periods.length); // Test up to 4 periods in parallel
  
  const testPeriod = async (period: { startDate: string; endDate: string; isSynthetic: boolean }, index: number) => {
    try {
      const result = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        config,
        undefined, // kellyMultiplier (use config default)
        undefined, // atrMultiplier (use config default)
        asset,
        undefined, // timeframe (use default)
        asset === 'btc' // useCorrelation
      );
      return {
        index,
        result: {
          ...result,
          finalPortfolio: {
            usdc: result.finalPortfolio.usdcBalance,
            eth: result.finalPortfolio.ethBalance,
            initialCapital: result.finalPortfolio.initialCapital,
          },
        },
        error: null,
      };
    } catch (error) {
      console.error(`Error testing period ${period.startDate}:`, error);
      return {
        index,
        result: {
          startDate: period.startDate,
          endDate: period.endDate,
          totalTrades: 0,
          buyTrades: 0,
          sellTrades: 0,
          winTrades: 0,
          lossTrades: 0,
          totalReturn: 0,
          totalReturnPct: 0,
          maxDrawdown: 0,
          maxDrawdownPct: 0,
          sharpeRatio: 0,
          finalPortfolio: { usdc: 1000, eth: 0, initialCapital: 1000 },
          periods: [],
          usdcHold: { finalValue: 1000, return: 0, returnPct: 0 },
          ethHold: { finalValue: 1000, return: 0, returnPct: 0, maxDrawdown: 0, maxDrawdownPct: 0, sharpeRatio: 0 },
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
  
  // Process periods in batches for parallel execution with early termination
  for (let i = 0; i < periods.length; i += periodConcurrency) {
    const batch = periods.slice(i, i + periodConcurrency);
    const batchResults = await Promise.all(
      batch.map((period, batchIndex) => testPeriod(period, i + batchIndex))
    );
    
    // Add results in order
    for (const { result } of batchResults) {
      results.push(result);
    }
    
    // OPTIMIZATION: Early termination check after each batch
    if (i + periodConcurrency >= earlyTerminationThreshold && i + periodConcurrency < periods.length) {
      // Calculate intermediate score
      const intermediateResults = results.length > 0 ? results : [];
      const intermediateReturn = intermediateResults.reduce((sum, r) => sum + r.totalReturnPct, 0) / intermediateResults.length;
      const intermediateSharpe = intermediateResults.reduce((sum, r) => sum + r.sharpeRatio, 0) / intermediateResults.length;
      const intermediateDrawdown = Math.max(...intermediateResults.map(r => r.maxDrawdownPct));
      const intermediateTrades = intermediateResults.reduce((sum, r) => sum + r.totalTrades, 0);
      const intermediateWins = intermediateResults.reduce((sum, r) => sum + r.winTrades, 0);
      const intermediateWinRate = intermediateTrades > 0 ? intermediateWins / intermediateTrades : 0;
      
      const intermediateMetrics = {
        totalReturn: intermediateReturn,
        sharpeRatio: intermediateSharpe,
        maxDrawdown: intermediateDrawdown,
        winRate: intermediateWinRate,
        totalTrades: intermediateTrades,
      };
      // Ensure defaultReturn is accessible (handle optional parameter)
      const baselineReturn = typeof defaultReturn !== 'undefined' ? defaultReturn : undefined;
      const intermediateScore = calculateFitnessScore(intermediateMetrics, baselineReturn);
      
      // If intermediate score is much worse than best, skip remaining periods
      if (bestScoreSoFar !== -Infinity && intermediateScore < earlyTerminationMinScore) {
        // Use pessimistic estimates for remaining periods (assume same performance)
        const remainingPeriods = periods.length - (i + periodConcurrency);
        for (let j = 0; j < remainingPeriods; j++) {
          results.push({
            startDate: periods[i + periodConcurrency + j]!.startDate,
            endDate: periods[i + periodConcurrency + j]!.endDate,
            totalTrades: 0,
            buyTrades: 0,
            sellTrades: 0,
            winTrades: 0,
            lossTrades: 0,
            totalReturn: 0,
            totalReturnPct: intermediateReturn, // Use same average return
            maxDrawdown: intermediateDrawdown,
            maxDrawdownPct: intermediateDrawdown,
            sharpeRatio: intermediateSharpe,
            finalPortfolio: { usdc: 1000, eth: 0, initialCapital: 1000 },
            periods: [],
            usdcHold: { finalValue: 1000, return: 0, returnPct: 0 },
            ethHold: { finalValue: 1000, return: 0, returnPct: 0, maxDrawdown: 0, maxDrawdownPct: 0, sharpeRatio: 0 },
          });
        }
        break; // Skip remaining periods
      }
    }
  }
  
  // Aggregate results across periods
  const totalReturn = results.reduce((sum, r) => sum + r.totalReturnPct, 0) / results.length;
  const sharpeRatio = results.reduce((sum, r) => sum + r.sharpeRatio, 0) / results.length;
  const maxDrawdown = Math.max(...results.map(r => r.maxDrawdownPct));
  const totalTrades = results.reduce((sum, r) => sum + r.totalTrades, 0);
  const winTrades = results.reduce((sum, r) => sum + r.winTrades, 0);
  const winRate = totalTrades > 0 ? winTrades / totalTrades : 0;
  
  return {
    totalReturn,
    sharpeRatio,
    maxDrawdown,
    winRate,
    totalTrades,
  };
}

/**
 * Train TensorFlow model to predict strategy performance
 */
async function trainModel(trainingData: TrainingData): Promise<tf.LayersModel> {
  const features = tf.tensor2d(trainingData.features);
  const labels = tf.tensor1d(trainingData.labels);
  
  // Normalize features
  const mean = features.mean(0);
  const std = features.sub(mean).square().mean(0).sqrt();
  const normalizedFeatures = features.sub(mean).div(std.add(1e-7));
  
  // Create model
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: [trainingData.features[0]!.length],
        units: 64,
        activation: 'relu',
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 32, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.1 }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 1, activation: 'linear' }), // Predict score
    ],
  });
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
  });
  
  // Train with more epochs for extended runs (better model learning)
  await model.fit(normalizedFeatures, labels, {
    epochs: 200, // Increased from 100 to 200 for extended runs
    batchSize: 32,
    validationSplit: 0.2,
    verbose: 0,
  });
  
  return model;
}

/**
 * Use model to predict best config
 */
function predictBestConfig(
  model: tf.LayersModel,
  baseConfig: EnhancedAdaptiveStrategyConfig,
  numCandidates: number = 200 // AGGRESSIVE: Increased from 100 to 200 for more exploration
): EnhancedAdaptiveStrategyConfig {
  // Generate candidate configs - more candidates = better chance of finding good config
  const candidates = Array.from({ length: numCandidates }, () => 
    generateRandomConfig(baseConfig)
  );
  
  // Predict scores for all candidates
  const features = candidates.map(configToFeatures);
  const mean = tf.tensor1d(features[0]!.map((_, i) => 
    features.reduce((sum, f) => sum + f[i]!, 0) / features.length
  ));
  const std = tf.tensor1d(features[0]!.map((_, i) => {
    const avg = features.reduce((sum, f) => sum + f[i]!, 0) / features.length;
    return Math.sqrt(features.reduce((sum, f) => sum + Math.pow(f[i]! - avg, 2), 0) / features.length);
  }));
  
  const normalizedFeatures = tf.tensor2d(features)
    .sub(mean)
    .div(std.add(1e-7));
  
  const predictions = model.predict(normalizedFeatures) as tf.Tensor;
  const scores = Array.from(predictions.dataSync());
  
  // Return config with highest predicted score
  const bestIndex = scores.indexOf(Math.max(...scores));
  return candidates[bestIndex]!;
}

/**
 * Main optimization loop
 */
async function optimizeStrategy(
  asset: TradingAsset,
  periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>,
  iterations: number = 10,
  populationSize: number = 20
): Promise<EnhancedAdaptiveStrategyConfig> {
  console.log(`🚀 Starting ML-based strategy optimization for ${asset.toUpperCase()}\n`);
  console.log(`   Testing ${periods.length} periods across various market conditions:`);
  console.log(`   - ${periods.filter(p => p.name.includes('Bull')).length} bullish periods`);
  console.log(`   - ${periods.filter(p => p.name.includes('Bear')).length} bearish periods`);
  console.log(`   - ${periods.filter(p => p.name.includes('Crash')).length} crash periods`);
  console.log(`   - ${periods.filter(p => p.name.includes('Whipsaw')).length} whipsaw periods`);
  console.log(`   - ${periods.filter(p => p.name.includes('Year')).length} full year periods`);
  console.log(`   - ${periods.filter(p => p.name.includes('Q')).length} quarterly periods`);
  console.log(`   Iterations: ${iterations}`);
  console.log(`   Population size: ${populationSize}`);
  console.log(`   Total tests per iteration: ${periods.length * populationSize}\n`);
  
  // Get base config
  const baseConfig: EnhancedAdaptiveStrategyConfig = {
    bullishStrategy: {
      name: 'Bullish-Hybrid',
      timeframe: '8h',
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
      timeframe: '8h',
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
    regimePersistencePeriods: 1,
    bullishPositionMultiplier: 1.0,
    maxBullishPosition: 0.90,
    kellyCriterion: {
      enabled: true,
      fractionalMultiplier: 0.25,
      minTrades: 10,
      lookbackPeriod: 50,
    },
    stopLoss: {
      enabled: true,
      atrMultiplier: 2.0,
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    },
  };
  
  // Test default config first to establish baseline
  console.log(`📊 Testing default config to establish baseline...`);
  const defaultMetrics = await testConfig(baseConfig, asset, periods, -Infinity, undefined);
  const defaultScore = calculateFitnessScore(defaultMetrics);
  const defaultReturn = defaultMetrics.totalReturn;
  console.log(`   Default config baseline: ${defaultReturn.toFixed(2)}% return, score: ${defaultScore.toFixed(2)}`);
  console.log(`   🎯 Target: Beat ${defaultReturn.toFixed(2)}% return\n`);
  
  let bestConfig = baseConfig;
  let bestScore = defaultScore;
  const trainingData: TrainingData = { features: [], labels: [] };
  
  // Add default config to training data
  trainingData.features.push(configToFeatures(baseConfig));
  trainingData.labels.push(defaultScore);
  
  const startTime = Date.now();
  
  for (let iteration = 0; iteration < iterations; iteration++) {
    const iterationStartTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Iteration ${iteration + 1}/${iterations}`);
    console.log(`${'='.repeat(60)}`);
    
    // Generate population of configs
    const population: EnhancedAdaptiveStrategyConfig[] = [
      bestConfig, // Always include current best
      ...Array.from({ length: populationSize - 1 }, () => 
        Math.random() < 0.7 // AGGRESSIVE: Increased from 0.5 to 0.7 - favor random exploration
          ? generateRandomConfig(baseConfig)
          : mutateConfig(bestConfig, 0.25) // AGGRESSIVE: Increased mutation rate from 0.2 to 0.25
      ),
    ];
    
    // Test all configs in parallel (utilizes multiple CPU cores)
    const numCores = os.cpus().length;
    const concurrency = Math.min(numCores, population.length); // Use all cores, but don't exceed population size
    console.log(`   Testing ${population.length} configurations across ${periods.length} periods...`);
    console.log(`   🚀 Running ${concurrency} tests in parallel (using ${numCores} CPU cores)`);
    console.log(`   (Total: ${population.length * periods.length} backtests)`);
    const results: OptimizationResult[] = [];
    
    // Process configs in batches for parallel execution
    const processBatch = async (batch: EnhancedAdaptiveStrategyConfig[], batchIndex: number) => {
      const batchResults = await Promise.all(
        batch.map(async (config, index) => {
          const globalIndex = batchIndex * concurrency + index;
          const configName = getConfigShortName(config);
          try {
            // OPTIMIZATION: Pass bestScoreSoFar for early termination
            const metrics = await testConfig(config, asset, periods, bestScore, defaultReturn);
            const score = calculateFitnessScore(metrics, defaultReturn);
            
            if ((globalIndex + 1) % 5 === 0 || globalIndex === 0) {
              console.log(`   Progress: ${globalIndex + 1}/${population.length} configs tested...`);
            }
            
            return { config, metrics, score, success: true, configName };
          } catch (error) {
            console.error(`   ❌ Error testing config ${globalIndex + 1} (${configName}):`, error instanceof Error ? error.message : error);
            return { config, metrics: null, score: -Infinity, success: false, configName };
          }
        })
      );
      
      return batchResults;
    };
    
    // Process all configs in parallel batches
    for (let i = 0; i < population.length; i += concurrency) {
      const batch = population.slice(i, i + concurrency);
      const batchResults = await processBatch(batch, Math.floor(i / concurrency));
      
      // Process results
      for (const result of batchResults) {
        if (result.success && result.metrics) {
          results.push({ config: result.config, metrics: result.metrics, score: result.score });
          
          // Add to training data
          trainingData.features.push(configToFeatures(result.config));
          trainingData.labels.push(result.score);
          
          if (result.score > bestScore) {
            bestScore = result.score;
            bestConfig = result.config;
            const configName = getConfigShortName(result.config);
            console.log(`   ✅ New best score: ${result.score.toFixed(2)} (Return: ${result.metrics.totalReturn.toFixed(2)}%, Sharpe: ${result.metrics.sharpeRatio.toFixed(2)})`);
            console.log(`      Config: ${configName}`);
          }
        }
      }
    }
    
    // Train model on accumulated data
    if (trainingData.features.length >= 20) {
      console.log(`   🧠 Training ML model on ${trainingData.features.length} samples...`);
      try {
        const model = await trainModel(trainingData);
        
        // Use model to suggest better config
        const suggestedConfig = predictBestConfig(model, bestConfig, 100); // AGGRESSIVE: Increased from 50 to 100
        console.log(`   🔮 ML suggested new config, testing...`);
        
        const suggestedMetrics = await testConfig(suggestedConfig, asset, periods, bestScore, defaultReturn);
        const suggestedScore = calculateFitnessScore(suggestedMetrics, defaultReturn);
        
        if (suggestedScore > bestScore) {
          bestScore = suggestedScore;
          bestConfig = suggestedConfig;
          console.log(`   🎯 ML suggestion improved score to ${suggestedScore.toFixed(2)}!`);
        }
        
        model.dispose();
      } catch (error) {
        console.error(`   ⚠️  ML training failed:`, error instanceof Error ? error.message : error);
      }
    }
    
    // Print top 3 results
    results.sort((a, b) => b.score - a.score);
    const iterationTime = ((Date.now() - iterationStartTime) / 1000 / 60).toFixed(1);
    console.log(`\n   Top 3 configurations:`);
    results.slice(0, 3).forEach((r, i) => {
      const configName = getConfigShortName(r.config);
      console.log(`   ${i + 1}. Score: ${r.score.toFixed(2)} | Return: ${r.metrics.totalReturn.toFixed(2)}% | Sharpe: ${r.metrics.sharpeRatio.toFixed(2)} | Drawdown: ${r.metrics.maxDrawdown.toFixed(2)}%`);
      console.log(`      Config: ${configName}`);
    });
    console.log(`   ⏱️  Iteration ${iteration + 1} completed in ${iterationTime} minutes`);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const remaining = ((Date.now() - startTime) / (iteration + 1) * (iterations - iteration - 1) / 1000 / 60).toFixed(1);
    console.log(`   ⏱️  Total elapsed: ${elapsed} minutes | Estimated remaining: ${remaining} minutes`);
  }
  
  console.log(`\n✅ Optimization complete!`);
  console.log(`   Best score: ${bestScore.toFixed(2)}`);
  console.log(`   Best config saved to output file\n`);
  
  return bestConfig;
}

/**
 * Save optimized config
 */
function saveConfig(config: EnhancedAdaptiveStrategyConfig, asset: TradingAsset): void {
  const outputDir = path.join(process.cwd(), 'data', 'optimized-configs');
  fs.mkdirSync(outputDir, { recursive: true });
  
  const filename = `ml-optimized-${asset}-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(outputDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(config, null, 2));
  console.log(`💾 Saved optimized config to: ${filepath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const asset = (args[0] as TradingAsset) || 'eth';
  const periodArg = args[1];
  
  // Parse periods - use ALL test periods by default, or filter by years
  let periods: Array<{ startDate: string; endDate: string; isSynthetic: boolean; name: string }>;
  
  if (periodArg) {
    const years = periodArg.split(',').map(y => parseInt(y.trim(), 10));
    periods = getTestPeriodsForYears(years, asset);
    console.log(`📅 Filtering to periods in years: ${years.join(', ')}`);
  } else {
    // Use ALL periods by default for maximum robustness (filtered by asset availability)
    periods = getTestPeriodsForYears(undefined, asset);
    const skippedCount = getAllTestPeriods().length - periods.length;
    if (skippedCount > 0) {
      console.log(`📅 Using ${periods.length} test periods (skipped ${skippedCount} periods without data for ${asset.toUpperCase()})`);
    } else {
      console.log(`📅 Using ALL test periods for maximum robustness across market conditions`);
    }
  }
  
  if (periods.length === 0) {
    console.error('❌ No test periods found for the specified years');
    process.exit(1);
  }
  
  // EXTENDED RUN: 2-3x longer for deeper optimization and better profit dialing
  // More iterations = more chances to find better configs
  // Larger population = more diversity, less likely to get stuck in local optima
  // 
  // Current settings: 30 iterations, 60 population (2x the previous 15,30)
  // This allows much more thorough exploration of parameter space
  const optimizedConfig = await optimizeStrategy(asset, periods, 30, 60); // Extended: 2x iterations (30) and 2x population (60)
  
  // Save result
  saveConfig(optimizedConfig, asset);
  
  // Print final config summary
  console.log('\n📋 Optimized Configuration Summary:');
  console.log(`   Tested across ${periods.length} periods (${periods.filter(p => !p.isSynthetic).length} historical, ${periods.filter(p => p.isSynthetic).length} synthetic)`);
  console.log(`   Bullish Buy Threshold: ${optimizedConfig.bullishStrategy.buyThreshold.toFixed(3)}`);
  console.log(`   Bullish Sell Threshold: ${optimizedConfig.bullishStrategy.sellThreshold.toFixed(3)}`);
  console.log(`   Bearish Buy Threshold: ${optimizedConfig.bearishStrategy.buyThreshold.toFixed(3)}`);
  console.log(`   Regime Confidence: ${optimizedConfig.regimeConfidenceThreshold?.toFixed(3)}`);
  console.log(`   Momentum Threshold: ${optimizedConfig.momentumConfirmationThreshold?.toFixed(3)}`);
  console.log(`   Kelly Fraction: ${optimizedConfig.kellyCriterion?.fractionalMultiplier.toFixed(3)}`);
  console.log(`   ATR Multiplier: ${optimizedConfig.stopLoss?.atrMultiplier.toFixed(2)}`);
  console.log(`\n✅ This configuration is optimized for robustness across:`);
  console.log(`   - Bull markets, bear markets, crashes, and whipsaw conditions`);
  console.log(`   - Short-term volatility and long-term trends`);
  console.log(`   - Various market regimes and transitions`);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 ML OPTIMIZATION COMPLETE!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Completed at: ${new Date().toLocaleString()}`);
  console.log(`   Total periods tested: ${periods.length}`);
  console.log(`   Total iterations: 30 (extended run for deeper optimization)`);
  console.log(`   Total configurations tested: ~600+ (extended run)`);
  console.log(`   Optimized config saved to: data/optimized-configs/`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Explicitly exit to ensure script completes
  process.exit(0);
}

// Only run main() if this script is executed directly (not when imported)
// Check if this file is being run directly by comparing the script path
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('ml-strategy-optimizer.ts') ||
  process.argv[1].endsWith('ml-strategy-optimizer.js') ||
  require.main === module
);

if (isMainModule) {
  main().catch(console.error);
}

