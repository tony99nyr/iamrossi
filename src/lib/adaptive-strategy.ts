/**
 * Adaptive Strategy
 * Switches between different strategies based on market regime
 */

import type { PriceCandle, TradingConfig, TradingSignal } from '@/types';
import { detectMarketRegimeCached as detectMarketRegime, type MarketRegimeSignal } from './market-regime-detector-cached';
import { generateSignal } from './trading-signals';
import { calculateConfidence } from './confidence-calculator';

export interface AdaptiveStrategyConfig {
  bullishStrategy: TradingConfig;
  bearishStrategy: TradingConfig;
  neutralStrategy?: TradingConfig; // Optional, defaults to bearish if not provided
  regimeLookback?: number; // How many periods to look back for regime detection (default: 1)
  regimeConfidenceThreshold?: number; // Minimum confidence to switch strategies (default: 0.3)
}

/**
 * Generate adaptive trading signal that switches strategies based on market regime
 */
export function generateAdaptiveSignal(
  candles: PriceCandle[],
  config: AdaptiveStrategyConfig,
  currentIndex: number
): TradingSignal & { regime: MarketRegimeSignal; activeStrategy: TradingConfig } {
  // Detect current market regime
  const regime = detectMarketRegime(candles, currentIndex);

  // Determine which strategy to use
  let activeStrategy: TradingConfig;
  
  if (regime.regime === 'bullish' && regime.confidence >= (config.regimeConfidenceThreshold || 0.3)) {
    activeStrategy = config.bullishStrategy;
  } else if (regime.regime === 'bearish' && regime.confidence >= (config.regimeConfidenceThreshold || 0.3)) {
    activeStrategy = config.bearishStrategy;
  } else {
    // Neutral or low confidence - use neutral strategy or fallback to bearish
    activeStrategy = config.neutralStrategy || config.bearishStrategy;
  }

  // Generate signal using the active strategy
  const signal = generateSignal(candles, activeStrategy, currentIndex);

  return {
    ...signal,
    regime,
    activeStrategy,
  };
}

/**
 * Get strategy statistics for a period
 */
export function getStrategyUsageStats(
  candles: PriceCandle[],
  config: AdaptiveStrategyConfig,
  startIndex: number,
  endIndex: number
): {
  bullishUsage: number;
  bearishUsage: number;
  neutralUsage: number;
  regimeDistribution: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
} {
  let bullishUsage = 0;
  let bearishUsage = 0;
  let neutralUsage = 0;
  const regimeCounts = { bullish: 0, bearish: 0, neutral: 0 };

  for (let i = startIndex; i <= endIndex; i++) {
    const regime = detectMarketRegime(candles, i);
    regimeCounts[regime.regime]++;

    if (regime.regime === 'bullish' && regime.confidence >= (config.regimeConfidenceThreshold || 0.3)) {
      bullishUsage++;
    } else if (regime.regime === 'bearish' && regime.confidence >= (config.regimeConfidenceThreshold || 0.3)) {
      bearishUsage++;
    } else {
      neutralUsage++;
    }
  }

  const total = endIndex - startIndex + 1;
  const regimeDistribution = {
    bullish: regimeCounts.bullish / total,
    bearish: regimeCounts.bearish / total,
    neutral: regimeCounts.neutral / total,
  };

  return {
    bullishUsage: bullishUsage / total,
    bearishUsage: bearishUsage / total,
    neutralUsage: neutralUsage / total,
    regimeDistribution,
  };
}

