/**
 * Optimized Adaptive Strategy with Momentum Filters
 * Enhanced version with:
 * - Lower confidence thresholds for faster switching
 * - Momentum confirmation before switching to bullish
 * - Higher position sizing for bullish markets
 */

import type { PriceCandle, TradingConfig, TradingSignal } from '@/types';
import { detectMarketRegimeCached as detectMarketRegime, type MarketRegimeSignal } from './market-regime-detector-cached';
import { generateSignal } from './trading-signals';
import { calculateMACD, calculateRSI, getLatestIndicatorValue } from './indicators';

export interface OptimizedAdaptiveStrategyConfig {
  bullishStrategy: TradingConfig;
  bearishStrategy: TradingConfig;
  neutralStrategy?: TradingConfig;
  regimeLookback?: number;
  regimeConfidenceThreshold?: number; // Lower default (0.2) for faster switching
  momentumConfirmationThreshold?: number; // Require strong momentum before bullish (default: 0.3)
  bullishPositionMultiplier?: number; // Multiply bullish position size (default: 1.0)
}

/**
 * Check if momentum is strong enough to confirm bullish regime
 */
function hasStrongMomentum(
  candles: PriceCandle[],
  currentIndex: number,
  threshold: number = 0.3
): boolean {
  if (currentIndex < 50) return false;

  const prices = candles.map(c => c.close);
  
  // Check MACD momentum
  const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);
  const macdValue = getLatestIndicatorValue(macd, currentIndex, 34);
  const signalValue = getLatestIndicatorValue(signal, currentIndex, 34);
  const histogramValue = getLatestIndicatorValue(histogram, currentIndex, 34);
  
  let momentumScore = 0;
  let momentumSignals = 0;
  
  // MACD above signal = bullish momentum
  if (macdValue !== null && signalValue !== null) {
    if (macdValue > signalValue) {
      momentumScore += 1;
    } else {
      momentumScore -= 1;
    }
    momentumSignals++;
  }
  
  // MACD histogram positive = increasing momentum
  if (histogramValue !== null && histogramValue > 0) {
    momentumScore += 1;
    momentumSignals++;
  }
  
  // RSI momentum
  const rsi = calculateRSI(prices, 14);
  const rsiValue = getLatestIndicatorValue(rsi, currentIndex, 14);
  if (rsiValue !== null && rsiValue > 50) {
    momentumScore += 1;
    momentumSignals++;
  }
  
  // Price momentum (20-period)
  if (currentIndex >= 20) {
    const price20PeriodsAgo = prices[currentIndex - 20];
    const priceMomentum = (prices[currentIndex] - price20PeriodsAgo) / price20PeriodsAgo;
    if (priceMomentum > 0) {
      momentumScore += 1;
      momentumSignals++;
    }
  }
  
  const momentumStrength = momentumSignals > 0 ? momentumScore / momentumSignals : 0;
  return momentumStrength >= threshold;
}

/**
 * Generate optimized adaptive trading signal with momentum filters
 */
export function generateOptimizedAdaptiveSignal(
  candles: PriceCandle[],
  config: OptimizedAdaptiveStrategyConfig,
  currentIndex: number
): TradingSignal & { regime: MarketRegimeSignal; activeStrategy: TradingConfig; momentumConfirmed: boolean } {
  // Detect current market regime
  const regime = detectMarketRegime(candles, currentIndex);
  
  const confidenceThreshold = config.regimeConfidenceThreshold || 0.2; // Lower default
  const momentumThreshold = config.momentumConfirmationThreshold || 0.3;
  
  // Determine which strategy to use
  let activeStrategy: TradingConfig;
  let momentumConfirmed = false;
  
  if (regime.regime === 'bullish' && regime.confidence >= confidenceThreshold) {
    // Require momentum confirmation for bullish strategy
    momentumConfirmed = hasStrongMomentum(candles, currentIndex, momentumThreshold);
    
    if (momentumConfirmed) {
      activeStrategy = config.bullishStrategy;
    } else {
      // Bullish regime but weak momentum - use neutral/bearish
      activeStrategy = config.neutralStrategy || config.bearishStrategy;
    }
  } else if (regime.regime === 'bearish' && regime.confidence >= confidenceThreshold) {
    activeStrategy = config.bearishStrategy;
  } else {
    // Neutral or low confidence - use neutral strategy or fallback to bearish
    activeStrategy = config.neutralStrategy || config.bearishStrategy;
  }

  // Generate signal using the active strategy
  const signal = generateSignal(candles, activeStrategy, currentIndex);
  
  // Apply bullish position multiplier if using bullish strategy and momentum confirmed
  const adjustedSignal = { ...signal };
  if (activeStrategy === config.bullishStrategy && momentumConfirmed) {
    const multiplier = config.bullishPositionMultiplier || 1.0;
    // Increase signal strength for bullish positions
    adjustedSignal.signal = Math.min(1, signal.signal * multiplier);
  }

  return {
    ...adjustedSignal,
    regime,
    activeStrategy,
    momentumConfirmed,
  };
}



