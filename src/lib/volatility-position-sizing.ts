/**
 * Volatility-Adjusted Position Sizing
 * 
 * Reduces position size when volatility is high to manage risk.
 * Uses ATR (Average True Range) to measure volatility.
 */

import type { PriceCandle } from '@/types';
import { getATRValue } from './indicators';

export interface VolatilityPositionSizingConfig {
  enabled: boolean;
  baseATRPeriod: number; // Period for ATR calculation (default: 14)
  highVolatilityThreshold: number; // ATR multiplier threshold for high volatility (default: 2.0)
  maxPositionReduction: number; // Maximum reduction in position size (default: 0.5 = 50% reduction)
  useEMA: boolean; // Use EMA for ATR (default: true)
}

const DEFAULT_CONFIG: VolatilityPositionSizingConfig = {
  enabled: true,
  baseATRPeriod: 14,
  highVolatilityThreshold: 2.0,
  maxPositionReduction: 0.5,
  useEMA: true,
};

/**
 * Calculate volatility-adjusted position size multiplier
 * Returns a multiplier between (1 - maxPositionReduction) and 1.0
 * 
 * @param candles - Price candles for ATR calculation
 * @param currentIndex - Current candle index
 * @param config - Volatility position sizing configuration
 * @returns Position size multiplier (0.5 to 1.0 by default)
 */
export function calculateVolatilityMultiplier(
  candles: PriceCandle[],
  currentIndex: number,
  config: VolatilityPositionSizingConfig = DEFAULT_CONFIG
): number {
  if (!config.enabled) {
    return 1.0;
  }

  // Get current ATR
  const currentATR = getATRValue(
    candles,
    currentIndex,
    config.baseATRPeriod,
    config.useEMA
  );

  if (!currentATR || currentIndex < config.baseATRPeriod) {
    return 1.0; // Not enough data, use full position
  }

  // Calculate ATR as percentage of current price
  const currentPrice = candles[currentIndex]?.close;
  if (!currentPrice || currentPrice === 0) {
    return 1.0;
  }

  const atrPercent = (currentATR / currentPrice) * 100;

  // Calculate average ATR over longer period for comparison
  // Use last 30 candles to get average ATR
  const lookbackPeriod = Math.min(30, currentIndex);
  const atrValues: number[] = [];
  
  for (let i = currentIndex - lookbackPeriod + 1; i <= currentIndex; i++) {
    if (i >= config.baseATRPeriod) {
      const atr = getATRValue(candles, i, config.baseATRPeriod, config.useEMA);
      if (atr && candles[i]?.close) {
        atrValues.push((atr / candles[i]!.close) * 100);
      }
    }
  }

  if (atrValues.length === 0) {
    return 1.0;
  }

  const avgATRPercent = atrValues.reduce((sum, val) => sum + val, 0) / atrValues.length;

  // Calculate volatility ratio (current ATR vs average ATR)
  const volatilityRatio = avgATRPercent > 0 ? atrPercent / avgATRPercent : 1.0;

  // If volatility is below threshold, use full position
  if (volatilityRatio <= config.highVolatilityThreshold) {
    return 1.0;
  }

  // Reduce position size based on how much volatility exceeds threshold
  // Linear reduction from threshold to 2x threshold
  const excessVolatility = volatilityRatio - config.highVolatilityThreshold;
  const maxExcess = config.highVolatilityThreshold; // Reduce to 50% at 2x threshold
  const reductionRatio = Math.min(1.0, excessVolatility / maxExcess);
  const multiplier = 1.0 - (reductionRatio * config.maxPositionReduction);

  return Math.max(1.0 - config.maxPositionReduction, multiplier);
}

/**
 * Get volatility status for display
 */
export function getVolatilityStatus(
  candles: PriceCandle[],
  currentIndex: number,
  config: VolatilityPositionSizingConfig = DEFAULT_CONFIG
): {
  atr: number | null;
  atrPercent: number | null;
  volatilityRatio: number | null;
  multiplier: number;
  status: 'low' | 'normal' | 'high';
} {
  const currentATR = getATRValue(
    candles,
    currentIndex,
    config.baseATRPeriod,
    config.useEMA
  );

  if (!currentATR || currentIndex < config.baseATRPeriod) {
    return {
      atr: null,
      atrPercent: null,
      volatilityRatio: null,
      multiplier: 1.0,
      status: 'normal',
    };
  }

  const currentPrice = candles[currentIndex]?.close;
  if (!currentPrice || currentPrice === 0) {
    return {
      atr: null,
      atrPercent: null,
      volatilityRatio: null,
      multiplier: 1.0,
      status: 'normal',
    };
  }

  const atrPercent = (currentATR / currentPrice) * 100;

  // Calculate average ATR
  const lookbackPeriod = Math.min(30, currentIndex);
  const atrValues: number[] = [];
  
  for (let i = currentIndex - lookbackPeriod + 1; i <= currentIndex; i++) {
    if (i >= config.baseATRPeriod) {
      const atr = getATRValue(candles, i, config.baseATRPeriod, config.useEMA);
      if (atr && candles[i]?.close) {
        atrValues.push((atr / candles[i]!.close) * 100);
      }
    }
  }

  const avgATRPercent = atrValues.length > 0
    ? atrValues.reduce((sum, val) => sum + val, 0) / atrValues.length
    : atrPercent;

  const volatilityRatio = avgATRPercent > 0 ? atrPercent / avgATRPercent : 1.0;
  const multiplier = calculateVolatilityMultiplier(candles, currentIndex, config);

  let status: 'low' | 'normal' | 'high';
  if (volatilityRatio < 0.8) {
    status = 'low';
  } else if (volatilityRatio > config.highVolatilityThreshold) {
    status = 'high';
  } else {
    status = 'normal';
  }

  return {
    atr: currentATR,
    atrPercent,
    volatilityRatio,
    multiplier,
    status,
  };
}






