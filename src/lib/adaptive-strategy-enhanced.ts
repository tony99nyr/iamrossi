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
import { calculateMACD, calculateRSI, getLatestIndicatorValue } from './indicators';
// Config validation is used in paper-trading-enhanced.ts, not here

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
  // Risk management features
  maxVolatility?: number; // Maximum daily volatility to allow trading (default: 0.05 = 5%)
  circuitBreakerWinRate?: number; // Minimum win rate to continue trading (default: 0.2 = 20%)
  circuitBreakerLookback?: number; // Number of recent trades to check (default: 10)
  whipsawDetectionPeriods?: number; // Number of periods to check for whipsaw (default: 5)
  whipsawMaxChanges?: number; // Maximum regime changes to allow (default: 3)
  // Advanced position sizing and risk management
  kellyCriterion?: {
    enabled: boolean;
    fractionalMultiplier: number; // Fraction of full Kelly to use (default: 0.25 = 25%)
    minTrades: number; // Minimum completed trades before activating (default: 10)
    lookbackPeriod: number; // Number of recent trades to analyze (default: 50)
  };
  stopLoss?: {
    enabled: boolean;
    atrMultiplier: number; // Stop loss distance in ATR units (default: 2.0)
    trailing: boolean; // Enable trailing stop loss (default: true)
    useEMA: boolean; // Use EMA for ATR calculation (default: true)
    atrPeriod: number; // ATR calculation period (default: 14)
  };
  // Maximum drawdown protection
  maxDrawdownThreshold?: number; // Maximum drawdown before pausing trading (default: 0.20 = 20%)
  // Position size limits
  minPositionSize?: number; // Minimum trade size in USDC (default: 10)
  maxPositionSize?: number; // Maximum trade size in USDC (default: unlimited, uses maxPositionPct instead)
  maxPositionConcentration?: number; // Maximum position concentration in single asset (default: 0.95 = 95%)
  // Price validation
  priceValidationThreshold?: number; // Maximum price movement since signal to allow trade (default: 0.02 = 2%)
}

// Track regime history for persistence
const regimeHistory: Map<string, Array<'bullish' | 'bearish' | 'neutral'>> = new Map();
// Track recent trades for circuit breaker (sessionId -> recent trade results)
const recentTradeResults: Map<string, Array<{ profitable: boolean }>> = new Map();
// Track peak portfolio values for drawdown calculation (sessionId -> peak value)
const peakPortfolioValues: Map<string, number> = new Map();

/**
 * Calculate daily volatility (standard deviation of returns)
 */
function calculateVolatility(
  candles: PriceCandle[],
  currentIndex: number,
  period: number = 20
): number {
  if (currentIndex < period) return 0;
  
  const prices = candles.map(c => c.close);
  const returns: number[] = [];
  
  for (let i = currentIndex - period + 1; i <= currentIndex; i++) {
    if (i > 0 && prices[i - 1] > 0) {
      returns.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
    }
  }
  
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

/**
 * Check for whipsaw conditions (rapid regime changes)
 */
function detectWhipsaw(
  sessionId: string,
  currentRegime: 'bullish' | 'bearish' | 'neutral',
  maxChanges: number = 3
): boolean {
  const history = regimeHistory.get(sessionId) || [];
  if (history.length < 5) return false;
  
  const recent = history.slice(-5);
  recent.push(currentRegime);
  
  let changes = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] !== recent[i - 1]) {
      changes++;
    }
  }
  
  return changes > maxChanges;
}

/**
 * Check circuit breaker (stop trading if win rate too low)
 */
function checkCircuitBreaker(
  sessionId: string,
  minWinRate: number = 0.2,
  lookback: number = 10
): boolean {
  const trades = recentTradeResults.get(sessionId) || [];
  if (trades.length < 5) return false; // Need at least 5 trades
  
  const recent = trades.slice(-lookback);
  const wins = recent.filter(t => t.profitable).length;
  const winRate = wins / recent.length;
  
  return winRate < minWinRate;
}

/**
 * Calculate current drawdown percentage
 * Returns drawdown as positive percentage (e.g., 0.15 = 15% drawdown)
 */
export function calculateDrawdown(
  currentValue: number,
  peakValue: number
): number {
  if (peakValue <= 0) return 0;
  if (currentValue >= peakValue) return 0;
  
  return (peakValue - currentValue) / peakValue;
}

/**
 * Update peak portfolio value for drawdown tracking
 */
export function updatePeakPortfolioValue(
  sessionId: string,
  currentValue: number
): void {
  const currentPeak = peakPortfolioValues.get(sessionId) || 0;
  if (currentValue > currentPeak) {
    peakPortfolioValues.set(sessionId, currentValue);
  }
}

/**
 * Get current peak portfolio value
 */
export function getPeakPortfolioValue(sessionId: string): number {
  return peakPortfolioValues.get(sessionId) || 0;
}

/**
 * Check if drawdown exceeds threshold (circuit breaker)
 * Returns true if trading should be paused due to excessive drawdown
 */
export function checkDrawdownCircuitBreaker(
  sessionId: string,
  currentValue: number,
  threshold: number = 0.20
): { shouldPause: boolean; drawdown: number; peakValue: number } {
  updatePeakPortfolioValue(sessionId, currentValue);
  const peakValue = getPeakPortfolioValue(sessionId);
  const drawdown = calculateDrawdown(currentValue, peakValue);
  
  return {
    shouldPause: drawdown >= threshold,
    drawdown,
    peakValue,
  };
}

/**
 * Reset drawdown tracking (useful when starting new session or manually resetting)
 */
export function resetDrawdownTracking(sessionId: string, initialValue: number): void {
  peakPortfolioValues.set(sessionId, initialValue);
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
  config: EnhancedAdaptiveStrategyConfig,
  correlationContext?: {
    signal: number;
    riskLevel: 'low' | 'medium' | 'high';
  }
): number {
  if (!config.dynamicPositionSizing) {
    return basePositionSize;
  }
  
  const maxPosition = config.maxBullishPosition || 0.95;
  const minPosition = basePositionSize * 0.7; // Minimum 70% of base
  
  if (regime.regime === 'bullish') {
    // Scale from minPosition to maxPosition based on confidence
    const confidenceBoost = regime.confidence * (maxPosition - minPosition);
    let position = Math.min(maxPosition, minPosition + confidenceBoost);
    
    // Apply correlation-based adjustments
    if (correlationContext) {
      const { signal: correlationSignal, riskLevel } = correlationContext;
      
      // High correlation (low risk) = can take larger positions
      // Low correlation (high risk) = reduce position size
      if (riskLevel === 'low') {
        position = Math.min(maxPosition, position * 1.1);
      } else if (riskLevel === 'high') {
        position = Math.max(minPosition, position * 0.8);
      }
      
      // If correlation signal contradicts regime, reduce position size further
      const regimeSignal = 1; // bullish
      const alignment = correlationSignal * regimeSignal;
      
      if (alignment < -0.3) {
        // Correlation contradicts regime - reduce position size
        position = Math.max(minPosition, position * 0.85);
      }
    }
    
    return position;
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
  sessionId?: string,
  correlationContext?: {
    signal: number;
    riskLevel: 'low' | 'medium' | 'high';
  }
): TradingSignal & { 
  regime: MarketRegimeSignal; 
  activeStrategy: TradingConfig; 
  momentumConfirmed: boolean;
  positionSizeMultiplier: number;
} {
  const regime = detectMarketRegime(candles, currentIndex, correlationContext);
  
  const confidenceThreshold = config.regimeConfidenceThreshold || 0.2;
  const momentumThreshold = config.momentumConfirmationThreshold || 0.25;
  const persistencePeriods = config.regimePersistencePeriods || 2;
  
  // 1. Volatility Filter - Block trading if volatility too high
  const maxVolatility = config.maxVolatility || 0.05; // 5% daily volatility
  const currentVolatility = calculateVolatility(candles, currentIndex, 20);
  if (currentVolatility > maxVolatility) {
    // Return hold signal if volatility too high
    return {
      timestamp: candles[currentIndex]!.timestamp,
      signal: 0,
      confidence: 0,
      indicators: {},
      action: 'hold',
      regime,
      activeStrategy: config.bearishStrategy, // Fallback
      momentumConfirmed: false,
      positionSizeMultiplier: 1.0,
    };
  }
  
  // 2. Whipsaw Detection - Block trading if rapid regime changes detected
  if (sessionId) {
    const whipsawMaxChanges = config.whipsawMaxChanges || 3;
    if (detectWhipsaw(sessionId, regime.regime, whipsawMaxChanges)) {
      return {
        timestamp: candles[currentIndex]!.timestamp,
        signal: 0,
        confidence: 0,
        indicators: {},
        action: 'hold',
        regime,
        activeStrategy: config.bearishStrategy,
        momentumConfirmed: false,
        positionSizeMultiplier: 1.0,
      };
    }
  }
  
  // 3. Circuit Breaker - Stop trading if recent win rate too low
  if (sessionId) {
    const minWinRate = config.circuitBreakerWinRate || 0.2;
    const lookback = config.circuitBreakerLookback || 10;
    if (checkCircuitBreaker(sessionId, minWinRate, lookback)) {
      return {
        timestamp: candles[currentIndex]!.timestamp,
        signal: 0,
        confidence: 0,
        indicators: {},
        action: 'hold',
        regime,
        activeStrategy: config.bearishStrategy,
        momentumConfirmed: false,
        positionSizeMultiplier: 1.0,
      };
    }
  }
  
  // Determine which strategy to use with persistence check
  let activeStrategy: TradingConfig;
  let momentumConfirmed = false;
  let positionSizeMultiplier = 1.0;
  
  // Adjust confidence threshold based on correlation risk level
  // Lower threshold when correlation is high (more confident), higher when low (less confident)
  let effectiveConfidenceThreshold = confidenceThreshold;
  if (correlationContext) {
    if (correlationContext.riskLevel === 'low') {
      // High correlation - can be more confident, lower threshold slightly
      effectiveConfidenceThreshold = confidenceThreshold * 0.9;
    } else if (correlationContext.riskLevel === 'high') {
      // Low correlation - need higher confidence, raise threshold
      effectiveConfidenceThreshold = confidenceThreshold * 1.3;
    }
  }
  
  if (regime.regime === 'bullish' && regime.confidence >= effectiveConfidenceThreshold) {
    // Check momentum confirmation
    momentumConfirmed = hasStrongMomentum(candles, currentIndex, momentumThreshold);
    
    // Check regime persistence (require bullish for N periods)
    const regimePersisted = checkRegimePersistence(candles, currentIndex, persistencePeriods, 'bullish', sessionId);
    
    if (momentumConfirmed && regimePersisted) {
      activeStrategy = config.bullishStrategy;
      // Calculate dynamic position size multiplier
      const basePosition = config.bullishStrategy.maxPositionPct || 0.75;
      const dynamicPosition = calculateDynamicPositionSize(basePosition, regime, config, correlationContext);
      positionSizeMultiplier = dynamicPosition / basePosition;
    } else {
      // Bullish regime but weak momentum or not persisted - use neutral/bearish
      activeStrategy = config.neutralStrategy || config.bearishStrategy;
    }
  } else if (regime.regime === 'bearish' && regime.confidence >= effectiveConfidenceThreshold) {
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
 * Record trade result for circuit breaker
 */
export function recordTradeResult(
  sessionId: string,
  profitable: boolean
): void {
  if (!sessionId) return;
  
  let trades = recentTradeResults.get(sessionId) || [];
  trades.push({ profitable });
  
  // Keep only recent trades (last 20)
  if (trades.length > 20) {
    trades = trades.slice(-20);
  }
  
  recentTradeResults.set(sessionId, trades);
}

/**
 * Clear regime history (useful for new backtests)
 */
export function clearRegimeHistory(): void {
  regimeHistory.clear();
  recentTradeResults.clear();
}

/**
 * Clear regime history for a specific session (useful when stopping paper trading)
 */
export function clearRegimeHistoryForSession(sessionId: string): void {
  regimeHistory.delete(sessionId);
  recentTradeResults.delete(sessionId);
  peakPortfolioValues.delete(sessionId);
}

