/**
 * Enhanced Adaptive Strategy with Regime Persistence and Dynamic Position Sizing
 * Features:
 * - Regime persistence filter (require N periods before switching)
 * - Dynamic position sizing based on regime strength
 * - Increased bullish position sizing (up to 95%)
 */

import type { PriceCandle, TradingConfig, TradingSignal } from '@/types';
import { detectMarketRegimeCached as detectMarketRegime, type MarketRegimeSignal } from './market-regime-detector-cached';
import { generateSignal } from './trading-signals';
import { calculateConfidence } from './confidence-calculator';
import { calculateMACD, calculateRSI, getLatestIndicatorValue } from './indicators';

export interface EnhancedAdaptiveStrategyConfig {
  bullishStrategy: TradingConfig;
  bearishStrategy: TradingConfig;
  neutralStrategy?: TradingConfig;
  regimeLookback?: number;
  regimeConfidenceThreshold?: number;
  momentumConfirmationThreshold?: number;
  bullishPositionMultiplier?: number;
  // New features
  regimePersistencePeriods?: number; // Require N periods of same regime before switching (default: 3)
  dynamicPositionSizing?: boolean; // Scale position with regime confidence (default: true)
  maxBullishPosition?: number; // Maximum bullish position size (default: 0.95)
}

// Track regime history for persistence
const regimeHistory: Map<string, Array<'bullish' | 'bearish' | 'neutral'>> = new Map();

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
  
  const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);
  const macdValue = getLatestIndicatorValue(macd, currentIndex, 34);
  const signalValue = getLatestIndicatorValue(signal, currentIndex, 34);
  const histogramValue = getLatestIndicatorValue(histogram, currentIndex, 34);
  
  let momentumScore = 0;
  let momentumSignals = 0;
  
  if (macdValue !== null && signalValue !== null) {
    if (macdValue > signalValue) {
      momentumScore += 1;
    } else {
      momentumScore -= 1;
    }
    momentumSignals++;
  }
  
  if (histogramValue !== null && histogramValue > 0) {
    momentumScore += 1;
    momentumSignals++;
  }
  
  const rsi = calculateRSI(prices, 14);
  const rsiValue = getLatestIndicatorValue(rsi, currentIndex, 14);
  if (rsiValue !== null && rsiValue > 50) {
    momentumScore += 1;
    momentumSignals++;
  }
  
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
 * Check if regime has persisted using majority rule (N out of last 5 periods)
 * For paper trading, uses sessionId to maintain history across updates
 * For backtests, uses candles length as cache key
 */
function checkRegimePersistence(
  candles: PriceCandle[],
  currentIndex: number,
  requiredPeriods: number,
  targetRegime: 'bullish' | 'bearish' | 'neutral',
  sessionId?: string
): boolean {
  // Use sessionId for paper trading, candles length for backtests
  const cacheKey = sessionId || `${candles.length}`;
  
  // Initialize history if needed
  if (!regimeHistory.has(cacheKey)) {
    regimeHistory.set(cacheKey, []);
  }
  
  const history = regimeHistory.get(cacheKey)!;
  
  // Detect current regime
  const regime = detectMarketRegime(candles, currentIndex);
  
  // For paper trading with sessionId, append to history (rolling window)
  // For backtests, track by index
  if (sessionId) {
    // Paper trading: append new regime, keep last 10 periods for rolling window
    history.push(regime.regime);
    if (history.length > 10) {
      history.shift(); // Keep only last 10 periods
    }
  } else {
    // Backtest: track by index
    if (history.length <= currentIndex) {
      history.push(regime.regime);
    } else {
      // Update existing entry
      history[currentIndex] = regime.regime;
    }
  }
  
  // Need at least 5 periods in history for majority rule
  if (history.length < 5) {
    return false;
  }
  
  // Use majority rule: require N out of last 5 periods (instead of consecutive)
  const recentRegimes = history.slice(-5);
  const targetCount = recentRegimes.filter(r => r === targetRegime).length;
  
  // Require at least requiredPeriods out of last 5
  return targetCount >= requiredPeriods;
}

/**
 * Calculate dynamic position size based on regime confidence
 */
function calculateDynamicPositionSize(
  basePositionSize: number,
  regime: MarketRegimeSignal,
  config: EnhancedAdaptiveStrategyConfig
): number {
  if (!config.dynamicPositionSizing) {
    return basePositionSize;
  }
  
  const maxPosition = config.maxBullishPosition || 0.95;
  const minPosition = basePositionSize * 0.7; // Minimum 70% of base
  
  if (regime.regime === 'bullish') {
    // Scale from minPosition to maxPosition based on confidence
    const confidenceBoost = regime.confidence * (maxPosition - minPosition);
    return Math.min(maxPosition, minPosition + confidenceBoost);
  }
  
  return basePositionSize;
}

/**
 * Generate enhanced adaptive trading signal with persistence and dynamic sizing
 * @param sessionId Optional session ID for paper trading (maintains regime history across updates)
 */
export function generateEnhancedAdaptiveSignal(
  candles: PriceCandle[],
  config: EnhancedAdaptiveStrategyConfig,
  currentIndex: number,
  sessionId?: string
): TradingSignal & { 
  regime: MarketRegimeSignal; 
  activeStrategy: TradingConfig; 
  momentumConfirmed: boolean;
  positionSizeMultiplier: number;
} {
  const regime = detectMarketRegime(candles, currentIndex);
  
  const confidenceThreshold = config.regimeConfidenceThreshold || 0.2;
  const momentumThreshold = config.momentumConfirmationThreshold || 0.25; // Lowered from 0.3
  const persistencePeriods = config.regimePersistencePeriods || 2; // Reduced from 3
  
  // Determine which strategy to use with persistence check
  let activeStrategy: TradingConfig;
  let momentumConfirmed = false;
  let positionSizeMultiplier = 1.0;
  
  if (regime.regime === 'bullish' && regime.confidence >= confidenceThreshold) {
    // Check momentum confirmation
    momentumConfirmed = hasStrongMomentum(candles, currentIndex, momentumThreshold);
    
    // Check regime persistence (require bullish for N periods)
    const regimePersisted = checkRegimePersistence(candles, currentIndex, persistencePeriods, 'bullish', sessionId);
    
    if (momentumConfirmed && regimePersisted) {
      activeStrategy = config.bullishStrategy;
      // Calculate dynamic position size multiplier
      const basePosition = config.bullishStrategy.maxPositionPct || 0.75;
      const dynamicPosition = calculateDynamicPositionSize(basePosition, regime, config);
      positionSizeMultiplier = dynamicPosition / basePosition;
    } else {
      // Bullish regime but weak momentum or not persisted - use neutral/bearish
      activeStrategy = config.neutralStrategy || config.bearishStrategy;
    }
  } else if (regime.regime === 'bearish' && regime.confidence >= confidenceThreshold) {
    // Check regime persistence for bearish
    const regimePersisted = checkRegimePersistence(candles, currentIndex, persistencePeriods, 'bearish', sessionId);
    
    if (regimePersisted) {
      activeStrategy = config.bearishStrategy;
    } else {
      // Not persisted yet - keep previous strategy or use neutral
      activeStrategy = config.neutralStrategy || config.bearishStrategy;
    }
  } else {
    // Neutral or low confidence - use neutral strategy or fallback to bearish
    activeStrategy = config.neutralStrategy || config.bearishStrategy;
  }

  // Generate signal using the active strategy
  const signal = generateSignal(candles, activeStrategy, currentIndex);
  
  // Apply position size multiplier if using bullish strategy
  const adjustedSignal = { ...signal };
  if (activeStrategy === config.bullishStrategy && momentumConfirmed) {
    adjustedSignal.signal = Math.min(1, signal.signal * positionSizeMultiplier);
  }

  return {
    ...adjustedSignal,
    regime,
    activeStrategy,
    momentumConfirmed,
    positionSizeMultiplier,
  };
}

/**
 * Clear regime history (useful for new backtests)
 */
export function clearRegimeHistory(): void {
  regimeHistory.clear();
}

/**
 * Clear regime history for a specific session (useful when stopping paper trading)
 */
export function clearRegimeHistoryForSession(sessionId: string): void {
  regimeHistory.delete(sessionId);
}

