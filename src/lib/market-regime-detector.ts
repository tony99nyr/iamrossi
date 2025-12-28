/**
 * Market Regime Detector
 * Determines if the market is bullish, bearish, or neutral
 * Uses multiple technical indicators for robust detection
 */

import type { PriceCandle } from '@/types';
import { calculateSMA, calculateEMA, calculateMACD, calculateRSI, getLatestIndicatorValue } from './indicators';

export type MarketRegime = 'bullish' | 'bearish' | 'neutral';

export interface MarketRegimeSignal {
  regime: MarketRegime;
  confidence: number; // 0-1, how confident we are in the regime
  indicators: {
    trend: number; // -1 to +1, overall trend direction
    momentum: number; // -1 to +1, momentum strength
    volatility: number; // 0-1, current volatility level
  };
}

/**
 * Detect market regime using multiple indicators
 */
export function detectMarketRegime(
  candles: PriceCandle[],
  currentIndex: number
): MarketRegimeSignal {
  // Need at least 50 periods for basic indicators
  // 200-day SMA is optional (only used if available)
  if (currentIndex < 50) {
    return {
      regime: 'neutral',
      confidence: 0,
      indicators: {
        trend: 0,
        momentum: 0,
        volatility: 0,
      },
    };
  }

  const prices = candles.map(c => c.close);
  const currentPrice = prices[currentIndex];

  // 1. Trend Detection using established indicators
  // Golden Cross / Death Cross: 50-day vs 200-day SMA (most reliable)
  // Calculate indicators efficiently (only calculate what we need)
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  // Only calculate 200-day SMA if we have enough data (expensive calculation)
  const sma200 = currentIndex >= 199 ? calculateSMA(prices, 200) : null;
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  const sma20Value = getLatestIndicatorValue(sma20, currentIndex, 19);
  const sma50Value = getLatestIndicatorValue(sma50, currentIndex, 49);
  const sma200Value = sma200 ? getLatestIndicatorValue(sma200, currentIndex, 199) : null;
  const ema12Value = getLatestIndicatorValue(ema12, currentIndex, 11);
  const ema26Value = getLatestIndicatorValue(ema26, currentIndex, 25);

  let trendScore = 0;
  let trendSignals = 0;
  let trendStrength = 0; // Track how strong the trend is

  // Price vs SMA 20 (short-term trend)
  if (sma20Value !== null) {
    const priceVsSMA20 = (currentPrice - sma20Value) / sma20Value;
    const signal = Math.max(-1, Math.min(1, priceVsSMA20 * 10));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // Price vs SMA 50 (medium-term trend)
  if (sma50Value !== null) {
    const priceVsSMA50 = (currentPrice - sma50Value) / sma50Value;
    const signal = Math.max(-1, Math.min(1, priceVsSMA50 * 10));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // Price vs SMA 200 (long-term trend) - CRITICAL for Golden/Death Cross
  if (sma200Value !== null) {
    const priceVsSMA200 = (currentPrice - sma200Value) / sma200Value;
    const signal = Math.max(-1, Math.min(1, priceVsSMA200 * 8)); // Slightly less sensitive
    trendScore += signal * 1.5; // Weight long-term trend more heavily
    trendStrength += Math.abs(signal) * 1.5;
    trendSignals++;
  }

  // Golden Cross / Death Cross: SMA 50 vs SMA 200 (most reliable signal)
  if (sma50Value !== null && sma200Value !== null) {
    const goldenCross = (sma50Value - sma200Value) / sma200Value;
    const signal = Math.max(-1, Math.min(1, goldenCross * 30)); // Strong weight for this signal
    trendScore += signal * 2.0; // Double weight for Golden/Death Cross
    trendStrength += Math.abs(signal) * 2.0;
    trendSignals++;
  }

  // SMA 20 vs SMA 50 (short-term cross)
  if (sma20Value !== null && sma50Value !== null) {
    const smaCross = (sma20Value - sma50Value) / sma50Value;
    const signal = Math.max(-1, Math.min(1, smaCross * 20));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // EMA 12 vs EMA 26 (MACD-style crossover)
  if (ema12Value !== null && ema26Value !== null) {
    const emaCross = (ema12Value - ema26Value) / ema26Value;
    const signal = Math.max(-1, Math.min(1, emaCross * 20));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // Trend alignment: Check if all MAs are aligned (bullish: price > SMA20 > SMA50 > SMA200)
  if (sma20Value !== null && sma50Value !== null && sma200Value !== null) {
    const alignedBullish = currentPrice > sma20Value && sma20Value > sma50Value && sma50Value > sma200Value;
    const alignedBearish = currentPrice < sma20Value && sma20Value < sma50Value && sma50Value < sma200Value;
    if (alignedBullish) {
      trendScore += 0.5; // Strong bullish alignment bonus
      trendStrength += 0.5;
      trendSignals++;
    } else if (alignedBearish) {
      trendScore -= 0.5; // Strong bearish alignment bonus
      trendStrength += 0.5;
      trendSignals++;
    }
  }

  const trend = trendSignals > 0 ? trendScore / trendSignals : 0;
  const avgTrendStrength = trendSignals > 0 ? trendStrength / trendSignals : 0;

  // 2. Momentum Detection (MACD and RSI) - Established indicators
  const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);
  const rsi = calculateRSI(prices, 14);

  let momentumScore = 0;
  let momentumSignals = 0;
  let momentumStrength = 0;

  // MACD Histogram (trend momentum) - Strong indicator
  const histogramValue = getLatestIndicatorValue(histogram, currentIndex, 34);
  if (histogramValue !== null) {
    // Normalize histogram better
    const priceRange = Math.max(...prices.slice(-50)) - Math.min(...prices.slice(-50));
    const scale = priceRange > 0 ? priceRange / 100 : 1;
    const signal = Math.max(-1, Math.min(1, histogramValue / scale));
    momentumScore += signal * 1.5; // Weight MACD histogram more
    momentumStrength += Math.abs(signal) * 1.5;
    momentumSignals++;
  }

  // MACD vs Signal Line (established bullish/bearish signal)
  const macdValue = getLatestIndicatorValue(macd, currentIndex, 34);
  const signalValue = getLatestIndicatorValue(signal, currentIndex, 34);
  if (macdValue !== null && signalValue !== null) {
    // MACD above signal = bullish, below = bearish
    const macdSignal = macdValue > signalValue ? 1 : -1;
    const macdStrength = Math.abs(macdValue - signalValue) / Math.abs(signalValue || 1);
    momentumScore += macdSignal * Math.min(1, macdStrength * 10);
    momentumStrength += Math.min(1, macdStrength * 10);
    momentumSignals++;
    
    // MACD above zero = bullish momentum, below = bearish
    if (macdValue > 0) {
      momentumScore += 0.3; // Bullish momentum bonus
      momentumStrength += 0.3;
    } else {
      momentumScore -= 0.3; // Bearish momentum bonus
      momentumStrength += 0.3;
    }
    momentumSignals++;
  }

  // RSI - Established overbought/oversold indicator
  const rsiValue = getLatestIndicatorValue(rsi, currentIndex, 14);
  if (rsiValue !== null) {
    // RSI > 70 = overbought (bearish), RSI < 30 = oversold (bullish)
    // RSI 50-70 = bullish momentum, RSI 30-50 = bearish momentum
    let rsiSignal = 0;
    if (rsiValue > 70) {
      rsiSignal = -((rsiValue - 70) / 30); // Overbought = bearish
    } else if (rsiValue < 30) {
      rsiSignal = (30 - rsiValue) / 30; // Oversold = bullish
    } else if (rsiValue > 50) {
      rsiSignal = (rsiValue - 50) / 20; // Bullish momentum zone
    } else {
      rsiSignal = -(50 - rsiValue) / 20; // Bearish momentum zone
    }
    momentumScore += rsiSignal;
    momentumStrength += Math.abs(rsiSignal);
    momentumSignals++;
  }

  // Price momentum - Multiple timeframes for robustness
  // 20-period momentum (short-term)
  if (currentIndex >= 20) {
    const price20PeriodsAgo = prices[currentIndex - 20];
    const priceMomentum20 = (currentPrice - price20PeriodsAgo) / price20PeriodsAgo;
    const signal = Math.max(-1, Math.min(1, priceMomentum20 * 5));
    momentumScore += signal;
    momentumStrength += Math.abs(signal);
    momentumSignals++;
  }

  // 50-period momentum (medium-term)
  if (currentIndex >= 50) {
    const price50PeriodsAgo = prices[currentIndex - 50];
    const priceMomentum50 = (currentPrice - price50PeriodsAgo) / price50PeriodsAgo;
    const signal = Math.max(-1, Math.min(1, priceMomentum50 * 3));
    momentumScore += signal * 1.2; // Weight medium-term more
    momentumStrength += Math.abs(signal) * 1.2;
    momentumSignals++;
  }

  const momentum = momentumSignals > 0 ? momentumScore / momentumSignals : 0;
  const avgMomentumStrength = momentumSignals > 0 ? momentumStrength / momentumSignals : 0;

  // 3. Volatility Detection (recent price swings)
  const lookback = Math.min(20, currentIndex);
  const recentPrices = prices.slice(currentIndex - lookback, currentIndex + 1);
  const returns = [];
  for (let i = 1; i < recentPrices.length; i++) {
    if (recentPrices[i - 1] > 0) {
      returns.push(Math.abs((recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1]));
    }
  }
  const avgVolatility = returns.length > 0
    ? returns.reduce((a, b) => a + b, 0) / returns.length
    : 0;
  const volatility = Math.min(1, avgVolatility * 20); // Normalize to 0-1

  // Combine trend and momentum - Increased momentum weight as recommended
  // Use 50/50 split for better momentum detection
  const combinedSignal = (trend * 0.5 + momentum * 0.5);
  
  // Use lower thresholds for better sensitivity (0.1 instead of 0.2)
  // Also consider trend/momentum strength
  const signalStrength = (avgTrendStrength + avgMomentumStrength) / 2;
  
  // Determine regime with confidence - Lower thresholds for better detection
  let regime: MarketRegime;
  let confidence: number;
  
  // Lower threshold: 0.05 for bullish, -0.05 for bearish (more sensitive)
  // But require minimum strength to avoid false signals
  const bullishThreshold = 0.05; // Even more sensitive
  const bearishThreshold = -0.05;
  const minStrength = 0.1; // Lower minimum strength requirement

  if (combinedSignal > bullishThreshold && signalStrength > minStrength) {
    regime = 'bullish';
    // Confidence based on signal strength and agreement
    confidence = Math.min(1, Math.abs(combinedSignal) * 0.7 + signalStrength * 0.3);
  } else if (combinedSignal < bearishThreshold && signalStrength > minStrength) {
    regime = 'bearish';
    confidence = Math.min(1, Math.abs(combinedSignal) * 0.7 + signalStrength * 0.3);
  } else {
    regime = 'neutral';
    confidence = Math.max(0, 1 - Math.abs(combinedSignal) - signalStrength);
  }

  // Increase confidence if trend and momentum agree strongly
  if ((trend > 0 && momentum > 0) || (trend < 0 && momentum < 0)) {
    const agreement = Math.min(Math.abs(trend), Math.abs(momentum));
    confidence = Math.min(1, confidence * (1 + agreement * 0.5));
  }

  // Boost confidence if Golden/Death Cross is present
  if (sma50Value !== null && sma200Value !== null) {
    const crossSignal = (sma50Value - sma200Value) / sma200Value;
    if (Math.abs(crossSignal) > 0.02) { // Significant cross
      confidence = Math.min(1, confidence * 1.3);
    }
  }

  return {
    regime,
    confidence,
    indicators: {
      trend,
      momentum,
      volatility,
    },
  };
}

/**
 * Get market regime for a specific date range (for backtesting)
 */
export function getMarketRegimeForPeriod(
  candles: PriceCandle[],
  startIndex: number,
  endIndex: number
): { regime: MarketRegime; percentage: number } {
  const regimes: MarketRegime[] = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    const signal = detectMarketRegime(candles, i);
    regimes.push(signal.regime);
  }

  const bullishCount = regimes.filter(r => r === 'bullish').length;
  const bearishCount = regimes.filter(r => r === 'bearish').length;
  const neutralCount = regimes.filter(r => r === 'neutral').length;

  const total = regimes.length;
  const bullishPct = bullishCount / total;
  const bearishPct = bearishCount / total;
  const neutralPct = neutralCount / total;

  // Determine dominant regime
  if (bullishPct > bearishPct && bullishPct > neutralPct) {
    return { regime: 'bullish', percentage: bullishPct };
  } else if (bearishPct > bullishPct && bearishPct > neutralPct) {
    return { regime: 'bearish', percentage: bearishPct };
  } else {
    return { regime: 'neutral', percentage: neutralPct };
  }
}

