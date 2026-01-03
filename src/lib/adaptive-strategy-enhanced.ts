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
  maxDrawdownExitThreshold?: number; // Critical drawdown to force exit all positions (default: 0.25 = 25%)
  maxPositionHoldPeriods?: number; // Maximum periods to hold a losing position (default: 50, ~17 days for 8h timeframe)
  // Entry criteria tuning
  entryThresholdMultiplier?: number; // Multiplier for buy threshold to require stronger signals (default: 1.0 = no increase)
  // Position size limits
  minPositionSize?: number; // Minimum trade size in USDC (default: 10)
  maxPositionSize?: number; // Maximum trade size in USDC (default: unlimited, uses maxPositionPct instead)
  maxPositionConcentration?: number; // Maximum position concentration in single asset (default: 0.95 = 95%)
  // Price validation
  priceValidationThreshold?: number; // Maximum price movement since signal to allow trade (default: 0.02 = 2%)
  // Correlation-based adjustments (ML-optimizable)
  correlationAdjustments?: {
    enabled: boolean; // Enable correlation-based threshold adjustments (default: true)
    lowRiskThresholdMultiplier?: number; // Multiplier for confidence threshold when correlation risk is low (default: 0.9)
    highRiskThresholdMultiplier?: number; // Multiplier for confidence threshold when correlation risk is high (default: 1.3)
    lowRiskPositionMultiplier?: number; // Position size multiplier for low correlation risk (default: 1.1)
    highRiskPositionMultiplier?: number; // Position size multiplier for high correlation risk (default: 0.8)
    contradictingAlignmentMultiplier?: number; // Position size multiplier when correlation contradicts regime (default: 0.85)
    contradictingAlignmentThreshold?: number; // Alignment threshold below which to reduce position (default: -0.3)
  };
  // Dynamic position sizing adjustments (ML-optimizable)
  dynamicPositionSizingConfig?: {
    minPositionMultiplier?: number; // Minimum position as multiplier of base (default: 0.7 = 70%)
    maxPositionMultiplier?: number; // Maximum position as multiplier of base (default: 1.0 = 100%)
  };
  // Volatility calculation (ML-optimizable)
  volatilityConfig?: {
    lookbackPeriod?: number; // Periods to calculate volatility (default: 20)
  };
  // Momentum detection (ML-optimizable)
  momentumConfig?: {
    macdFastPeriod?: number; // MACD fast period (default: 12)
    macdSlowPeriod?: number; // MACD slow period (default: 26)
    macdSignalPeriod?: number; // MACD signal period (default: 9)
    rsiPeriod?: number; // RSI period (default: 14)
    priceMomentumLookback?: number; // Price momentum lookback periods (default: 20)
  };
  // Circuit breaker adjustments (ML-optimizable)
  circuitBreakerConfig?: {
    minTradesRequired?: number; // Minimum trades before checking circuit breaker (default: 5)
  };
  // Bull market participation improvements (ML-optimizable)
  bullMarketParticipation?: {
    enabled: boolean; // Enable enhanced bull market participation (default: true)
    exitThresholdMultiplier?: number; // Multiplier for sell threshold in bull markets (default: 1.0 = no change, <1.0 = stay in longer)
    positionSizeMultiplier?: number; // Multiplier for position size in strong bull markets (default: 1.0 = no change, >1.0 = larger positions)
    trendStrengthThreshold?: number; // Minimum trend strength to apply bull market settings (default: 0.6)
    useTrailingStops?: boolean; // Use trailing stops instead of fixed exits in bull markets (default: false)
    trailingStopATRMultiplier?: number; // ATR multiplier for trailing stops in bull markets (default: 2.0)
  };
  // Regime transition filters (ML-optimizable)
  regimeTransitionFilter?: {
    enabled: boolean; // Enable regime transition filtering (default: true)
    transitionPeriods?: number; // Number of periods to be cautious during transitions (default: 3)
    positionSizeReduction?: number; // Reduce position size during transitions (default: 0.5 = 50% of normal)
    minConfidenceDuringTransition?: number; // Minimum confidence required during transitions (default: 0.3)
    stayOutDuringTransition?: boolean; // Completely stay out during transitions (default: false)
  };
  // Adaptive position sizing for uncertain periods (ML-optimizable)
  adaptivePositionSizing?: {
    enabled: boolean; // Enable adaptive position sizing (default: true)
    highFrequencySwitchDetection?: boolean; // Detect and reduce sizing during high-frequency switches (default: true)
    switchFrequencyPeriods?: number; // Periods to check for high-frequency switches (default: 5)
    maxSwitchesAllowed?: number; // Maximum regime switches before reducing position size (default: 3)
    uncertainPeriodMultiplier?: number; // Position size multiplier during uncertain periods (default: 0.5 = 50% of normal)
    lowConfidenceMultiplier?: number; // Position size multiplier when confidence is low (default: 0.7 = 70% of normal)
    confidenceThreshold?: number; // Confidence threshold below which to reduce position size (default: 0.4)
    highFrequencySwitchPositionMultiplier?: number; // Position size multiplier during high-frequency switches (0.0 = stay out, 1.0 = no reduction, default: 0.5)
  };
  // Low volatility / consolidation filter (ML-optimizable)
  lowVolatilityFilter?: {
    enabled: boolean; // Enable low volatility filter (default: false)
    minVolatilityThreshold?: number; // Minimum volatility to allow trading (default: 0.01 = 1% daily)
    lookbackPeriods?: number; // Periods to calculate volatility (default: 20)
    signalStrengthMultiplier?: number; // Multiplier for required signal strength during low volatility (1.0 = no change, >1.0 = stronger signals required, default: 1.5)
    volatilitySqueezePositionMultiplier?: number; // Position size multiplier during volatility squeeze (0.0 = stay out, 1.0 = no reduction, default: 0.5)
  };
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
  period: number = 20,
  config?: EnhancedAdaptiveStrategyConfig
): number {
  const lookbackPeriod = config?.volatilityConfig?.lookbackPeriod ?? period;
  if (currentIndex < lookbackPeriod) return 0;
  
  const prices = candles.map(c => c.close);
  const returns: number[] = [];
  
  for (let i = currentIndex - lookbackPeriod + 1; i <= currentIndex; i++) {
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
  lookback: number = 10,
  minTradesRequired: number = 5
): boolean {
  const trades = recentTradeResults.get(sessionId) || [];
  if (trades.length < minTradesRequired) return false;
  
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
 * Check if we're in a regime transition period
 */
function checkRegimeTransition(
  candles: PriceCandle[],
  currentIndex: number,
  sessionId: string | undefined,
  currentRegime: 'bullish' | 'bearish' | 'neutral',
  transitionPeriods: number = 3
): boolean {
  if (!sessionId) return false; // Can't track transitions without session ID
  
  const history = regimeHistory.get(sessionId) || [];
  
  if (history.length < transitionPeriods) return false;
  
  // Check if regime has changed in recent periods (including current)
  const recent = [...history.slice(-transitionPeriods), currentRegime];
  const uniqueRegimes = new Set(recent);
  
  // If we have multiple regimes in recent history, we're in transition
  return uniqueRegimes.size > 1;
}

/**
 * Detect high-frequency regime switches
 */
function detectHighFrequencySwitches(
  candles: PriceCandle[],
  currentIndex: number,
  sessionId: string | undefined,
  config: NonNullable<EnhancedAdaptiveStrategyConfig['adaptivePositionSizing']>
): boolean {
  if (!sessionId) return false;
  
  const history = regimeHistory.get(sessionId) || [];
  const checkPeriods = config.switchFrequencyPeriods ?? 5;
  const maxSwitches = config.maxSwitchesAllowed ?? 3;
  
  if (history.length < checkPeriods) return false;
  
  const recent = history.slice(-checkPeriods);
  let switches = 0;
  
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] !== recent[i - 1]) {
      switches++;
    }
  }
  
  return switches > maxSwitches;
}

/**
 * Check if momentum is strong enough to confirm bullish regime
 */
function hasStrongMomentum(
  candles: PriceCandle[],
  currentIndex: number,
  threshold: number = 0.3,
  config?: EnhancedAdaptiveStrategyConfig
): boolean {
  const momentumConfig = config?.momentumConfig;
  const macdFast = momentumConfig?.macdFastPeriod ?? 12;
  const macdSlow = momentumConfig?.macdSlowPeriod ?? 26;
  const macdSignal = momentumConfig?.macdSignalPeriod ?? 9;
  const rsiPeriod = momentumConfig?.rsiPeriod ?? 14;
  const priceLookback = momentumConfig?.priceMomentumLookback ?? 20;
  
  // Need enough data for the longest indicator
  const minIndex = Math.max(macdSlow + macdSignal, rsiPeriod, priceLookback);
  if (currentIndex < minIndex) return false;

  const prices = candles.map(c => c.close);
  
  const { macd, signal, histogram } = calculateMACD(prices, macdFast, macdSlow, macdSignal);
  const macdValue = getLatestIndicatorValue(macd, currentIndex, macdSlow + macdSignal);
  const signalValue = getLatestIndicatorValue(signal, currentIndex, macdSlow + macdSignal);
  const histogramValue = getLatestIndicatorValue(histogram, currentIndex, macdSlow + macdSignal);
  
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
  
  const rsi = calculateRSI(prices, rsiPeriod);
  const rsiValue = getLatestIndicatorValue(rsi, currentIndex, rsiPeriod);
  if (rsiValue !== null && rsiValue > 50) {
    momentumScore += 1;
    momentumSignals++;
  }
  
  if (currentIndex >= priceLookback) {
    const priceLookbackAgo = prices[currentIndex - priceLookback];
    const priceMomentum = (prices[currentIndex] - priceLookbackAgo) / priceLookbackAgo;
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
  const minMultiplier = config.dynamicPositionSizingConfig?.minPositionMultiplier ?? 0.7;
  const minPosition = basePositionSize * minMultiplier;
  
  if (regime.regime === 'bullish') {
    // Scale from minPosition to maxPosition based on confidence
    const confidenceBoost = regime.confidence * (maxPosition - minPosition);
    let position = Math.min(maxPosition, minPosition + confidenceBoost);
    
    // Apply correlation-based adjustments
    if (correlationContext) {
      const { signal: correlationSignal, riskLevel } = correlationContext;
      
      // High correlation (low risk) = can take larger positions
      // Low correlation (high risk) = reduce position size
      const correlationConfig = config.correlationAdjustments;
      if (correlationConfig?.enabled !== false) { // Default to enabled if not specified
        const lowRiskMultiplier = correlationConfig?.lowRiskPositionMultiplier ?? 1.1;
        const highRiskMultiplier = correlationConfig?.highRiskPositionMultiplier ?? 0.8;
        const contradictingMultiplier = correlationConfig?.contradictingAlignmentMultiplier ?? 0.85;
        const contradictingThreshold = correlationConfig?.contradictingAlignmentThreshold ?? -0.3;
        
        if (riskLevel === 'low') {
          position = Math.min(maxPosition, position * lowRiskMultiplier);
        } else if (riskLevel === 'high') {
          position = Math.max(minPosition, position * highRiskMultiplier);
        }
        
        // If correlation signal contradicts regime, reduce position size further
        const regimeSignal = 1; // bullish
        const alignment = correlationSignal * regimeSignal;
        
        if (alignment < contradictingThreshold) {
          // Correlation contradicts regime - reduce position size
          position = Math.max(minPosition, position * contradictingMultiplier);
        }
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
  const currentVolatility = calculateVolatility(candles, currentIndex, 20, config);
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
    const minTradesRequired = config.circuitBreakerConfig?.minTradesRequired ?? 5;
    if (checkCircuitBreaker(sessionId, minWinRate, lookback, minTradesRequired)) {
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
  if (correlationContext && config.correlationAdjustments?.enabled !== false) {
    const correlationConfig = config.correlationAdjustments;
    const lowRiskMultiplier = correlationConfig?.lowRiskThresholdMultiplier ?? 0.9;
    const highRiskMultiplier = correlationConfig?.highRiskThresholdMultiplier ?? 1.3;
    
    if (correlationContext.riskLevel === 'low') {
      // High correlation - can be more confident, lower threshold slightly
      effectiveConfidenceThreshold = confidenceThreshold * lowRiskMultiplier;
    } else if (correlationContext.riskLevel === 'high') {
      // Low correlation - need higher confidence, raise threshold
      effectiveConfidenceThreshold = confidenceThreshold * highRiskMultiplier;
    }
  }
  
  // 4. Require stronger signals for entry (improve win rate)
  // Increase effective buy threshold by configurable amount to require stronger signals
  // Default: 1.0 (no increase) - baseline configuration for maximum returns/win rate
  let buyThresholdMultiplier = config.entryThresholdMultiplier ?? 1.0; // Default: no increase (baseline)
  
  if (regime.regime === 'bullish' && regime.confidence >= effectiveConfidenceThreshold) {
    // Check momentum confirmation
    momentumConfirmed = hasStrongMomentum(candles, currentIndex, momentumThreshold, config);
    
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

  // Check for regime transition (recent regime change)
  const isRegimeTransition = checkRegimeTransition(candles, currentIndex, sessionId, regime.regime, 
    config.regimeTransitionFilter?.transitionPeriods ?? 3);
  
  // Check for high-frequency switches
  const isHighFrequencySwitch = config.adaptivePositionSizing?.enabled && 
    config.adaptivePositionSizing?.highFrequencySwitchDetection &&
    detectHighFrequencySwitches(candles, currentIndex, sessionId, config.adaptivePositionSizing);
  
  // Apply regime transition filter
  if (config.regimeTransitionFilter?.enabled && isRegimeTransition) {
    const transitionConfig = config.regimeTransitionFilter;
    const minConfidence = transitionConfig.minConfidenceDuringTransition ?? 0.3;
    
    // Stay out completely if configured
    if (transitionConfig.stayOutDuringTransition && regime.confidence < minConfidence) {
      return {
        timestamp: candles[currentIndex]!.timestamp,
        signal: 0,
        confidence: 0,
        indicators: {},
        action: 'hold',
        regime,
        activeStrategy: config.bearishStrategy,
        momentumConfirmed: false,
        positionSizeMultiplier: 0,
      };
    }
    
    // Reduce position size during transitions
    const transitionMultiplier = transitionConfig.positionSizeReduction ?? 0.5;
    positionSizeMultiplier *= transitionMultiplier;
  }
  
  // Apply adaptive position sizing for uncertain periods
  if (config.adaptivePositionSizing?.enabled) {
    const adaptiveConfig = config.adaptivePositionSizing;
    
    // Apply position size multiplier during high-frequency switches
    if (isHighFrequencySwitch) {
      const hfMultiplier = adaptiveConfig.highFrequencySwitchPositionMultiplier ?? 0.5;
      if (hfMultiplier === 0) {
        // Stay out completely
        return {
          timestamp: candles[currentIndex]!.timestamp,
          signal: 0,
          confidence: 0,
          indicators: {},
          action: 'hold',
          regime,
          activeStrategy: config.bearishStrategy,
          momentumConfirmed: false,
          positionSizeMultiplier: 0,
        };
      }
      // Apply multiplier (0.0-1.0 range)
      positionSizeMultiplier *= hfMultiplier;
    }
    
    // Reduce position size when confidence is low
    const confidenceThreshold = adaptiveConfig.confidenceThreshold ?? 0.4;
    if (regime.confidence < confidenceThreshold) {
      positionSizeMultiplier *= (adaptiveConfig.lowConfidenceMultiplier ?? 0.7);
    }
  }
  
  // Check for low volatility / consolidation (volatility squeeze)
  if (config.lowVolatilityFilter?.enabled) {
    const lowVolConfig = config.lowVolatilityFilter;
    const lookbackPeriods = lowVolConfig.lookbackPeriods ?? 20;
    const minVolatility = lowVolConfig.minVolatilityThreshold ?? 0.01; // 1% daily
    
    const currentVolatility = calculateVolatility(candles, currentIndex, lookbackPeriods, config);
    const isLowVolatility = currentVolatility < minVolatility;
    
    if (isLowVolatility) {
      // Apply position size multiplier during volatility squeeze
      const squeezeMultiplier = lowVolConfig.volatilitySqueezePositionMultiplier ?? 0.5;
      if (squeezeMultiplier === 0) {
        // Stay out completely
        return {
          timestamp: candles[currentIndex]!.timestamp,
          signal: 0,
          confidence: 0,
          indicators: {},
          action: 'hold',
          regime,
          activeStrategy: config.bearishStrategy,
          momentumConfirmed: false,
          positionSizeMultiplier: 0,
        };
      }
      // Apply multiplier (0.0-1.0 range)
      positionSizeMultiplier *= squeezeMultiplier;
      
      // Require stronger signals during low volatility (always active if multiplier > 1.0)
      const signalStrengthMultiplier = lowVolConfig.signalStrengthMultiplier ?? 1.5;
      if (signalStrengthMultiplier > 1.0) {
        // This will be applied after signal generation
        // We'll adjust the buy threshold multiplier
        buyThresholdMultiplier *= signalStrengthMultiplier;
      }
    }
  }

  // Generate signal using the active strategy
  const signal = generateSignal(candles, activeStrategy, currentIndex);
  
  // Apply entry criteria based on config (baseline: no filtering)
  const adjustedSignal = { ...signal };
  if (signal.action === 'buy' && buyThresholdMultiplier > 1.0) {
    // Only apply stricter entry criteria if multiplier > 1.0
    const effectiveBuyThreshold = activeStrategy.buyThreshold * buyThresholdMultiplier;
    if (signal.signal < effectiveBuyThreshold) {
      adjustedSignal.action = 'hold'; // Block weak buy signals
    }
  }
  
  // Apply bull market participation improvements
  if (config.bullMarketParticipation?.enabled && 
      activeStrategy === config.bullishStrategy && 
      momentumConfirmed &&
      regime.confidence >= (config.bullMarketParticipation.trendStrengthThreshold ?? 0.6)) {
    const bullConfig = config.bullMarketParticipation;
    
    // Adjust exit threshold (lower = stay in longer)
    if (bullConfig.exitThresholdMultiplier && bullConfig.exitThresholdMultiplier < 1.0) {
      // Make sell threshold less negative (harder to exit)
      const originalSellThreshold = activeStrategy.sellThreshold;
      const adjustedSellThreshold = originalSellThreshold * bullConfig.exitThresholdMultiplier;
      // Note: This affects the signal generation, but we can't modify the strategy here
      // Instead, we'll adjust the signal action after generation
      if (signal.action === 'sell' && signal.signal > adjustedSellThreshold) {
        adjustedSignal.action = 'hold'; // Don't exit yet in strong bull markets
      }
    }
    
    // Increase position size in strong bull markets
    if (bullConfig.positionSizeMultiplier && bullConfig.positionSizeMultiplier > 1.0) {
      positionSizeMultiplier *= bullConfig.positionSizeMultiplier;
    }
  }
  
  // Apply position size multiplier if using bullish strategy
  if (activeStrategy === config.bullishStrategy && momentumConfirmed) {
    adjustedSignal.signal = Math.min(1, signal.signal * positionSizeMultiplier);
  }

  // Update regime history for transition detection (only if sessionId provided)
  if (sessionId) {
    const cacheKey = sessionId;
    if (!regimeHistory.has(cacheKey)) {
      regimeHistory.set(cacheKey, []);
    }
    const history = regimeHistory.get(cacheKey)!;
    history.push(regime.regime);
    // Keep only last 20 periods to avoid memory growth
    if (history.length > 20) {
      history.shift();
    }
    regimeHistory.set(cacheKey, history);
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

