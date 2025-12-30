/**
 * Optimized Market Regime Detector with Cached Indicators
 * Caches indicator calculations to avoid recalculating on every call
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

// Cache for indicator calculations
interface IndicatorCache {
  sma20: number[] | null;
  sma50: number[] | null;
  sma200: number[] | null;
  ema12: number[] | null;
  ema26: number[] | null;
  macd: { macd: number[]; signal: number[]; histogram: number[] } | null;
  rsi: number[] | null;
  prices: number[] | null;
  smoothedCombinedSignal: number[] | null; // EMA-smoothed combined signal for regime detection
  lastRegime: 'bullish' | 'bearish' | 'neutral' | null; // Track last regime for hysteresis
  lastCandleCount: number;
}

let indicatorCache: IndicatorCache = {
  sma20: null,
  sma50: null,
  sma200: null,
  ema12: null,
  ema26: null,
  macd: null,
  rsi: null,
  prices: null,
  smoothedCombinedSignal: null,
  lastRegime: null,
  lastCandleCount: 0,
};

/**
 * Initialize or update indicator cache
 */
function ensureIndicatorsCached(candles: PriceCandle[]): void {
  const prices = candles.map(c => c.close);
  
  // Only recalculate if candles changed
  if (indicatorCache.prices === null || 
      indicatorCache.lastCandleCount !== candles.length ||
      indicatorCache.prices.length !== prices.length ||
      indicatorCache.prices[indicatorCache.prices.length - 1] !== prices[prices.length - 1]) {
    
    // Recalculate all indicators
    indicatorCache.prices = prices;
    indicatorCache.sma20 = calculateSMA(prices, 20);
    indicatorCache.sma50 = calculateSMA(prices, 50);
    indicatorCache.sma200 = prices.length >= 200 ? calculateSMA(prices, 200) : null;
    indicatorCache.ema12 = calculateEMA(prices, 12);
    indicatorCache.ema26 = calculateEMA(prices, 26);
    indicatorCache.macd = calculateMACD(prices, 12, 26, 9);
    indicatorCache.rsi = calculateRSI(prices, 14);
    // Reset smoothed signal cache when candles change (new dataset)
    indicatorCache.smoothedCombinedSignal = null;
    indicatorCache.lastRegime = null;
    indicatorCache.lastCandleCount = candles.length;
  }
}

/**
 * Optimized market regime detection with cached indicators
 */
export function detectMarketRegimeCached(
  candles: PriceCandle[],
  currentIndex: number
): MarketRegimeSignal {
  // Ensure indicators are cached
  ensureIndicatorsCached(candles);
  
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

  const prices = indicatorCache.prices!;
  const currentPrice = prices[currentIndex];

  // Use cached indicators
  const sma20 = indicatorCache.sma20!;
  const sma50 = indicatorCache.sma50!;
  const sma200 = indicatorCache.sma200;
  const ema12 = indicatorCache.ema12!;
  const ema26 = indicatorCache.ema26!;
  const { macd, signal, histogram } = indicatorCache.macd!;
  const rsi = indicatorCache.rsi!;

  const sma20Value = getLatestIndicatorValue(sma20, currentIndex, 19);
  const sma50Value = getLatestIndicatorValue(sma50, currentIndex, 49);
  const sma200Value = sma200 ? getLatestIndicatorValue(sma200, currentIndex, 199) : null;
  const ema12Value = getLatestIndicatorValue(ema12, currentIndex, 11);
  const ema26Value = getLatestIndicatorValue(ema26, currentIndex, 25);

  let trendScore = 0;
  let trendSignals = 0;
  let trendStrength = 0;

  // Price vs SMA 20
  if (sma20Value !== null) {
    const priceVsSMA20 = (currentPrice - sma20Value) / sma20Value;
    const signal = Math.max(-1, Math.min(1, priceVsSMA20 * 10));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // Price vs SMA 50
  if (sma50Value !== null) {
    const priceVsSMA50 = (currentPrice - sma50Value) / sma50Value;
    const signal = Math.max(-1, Math.min(1, priceVsSMA50 * 10));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // Price vs SMA 200
  if (sma200Value !== null) {
    const priceVsSMA200 = (currentPrice - sma200Value) / sma200Value;
    const signal = Math.max(-1, Math.min(1, priceVsSMA200 * 8));
    trendScore += signal * 1.5;
    trendStrength += Math.abs(signal) * 1.5;
    trendSignals++;
  }

  // Golden Cross / Death Cross
  if (sma50Value !== null && sma200Value !== null) {
    const goldenCross = (sma50Value - sma200Value) / sma200Value;
    const signal = Math.max(-1, Math.min(1, goldenCross * 30));
    trendScore += signal * 2.0;
    trendStrength += Math.abs(signal) * 2.0;
    trendSignals++;
  }

  // SMA 20 vs SMA 50
  if (sma20Value !== null && sma50Value !== null) {
    const smaCross = (sma20Value - sma50Value) / sma50Value;
    const signal = Math.max(-1, Math.min(1, smaCross * 20));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // EMA 12 vs EMA 26
  if (ema12Value !== null && ema26Value !== null) {
    const emaCross = (ema12Value - ema26Value) / ema26Value;
    const signal = Math.max(-1, Math.min(1, emaCross * 20));
    trendScore += signal;
    trendStrength += Math.abs(signal);
    trendSignals++;
  }

  // Trend alignment
  if (sma20Value !== null && sma50Value !== null && sma200Value !== null) {
    const alignedBullish = currentPrice > sma20Value && sma20Value > sma50Value && sma50Value > sma200Value;
    const alignedBearish = currentPrice < sma20Value && sma20Value < sma50Value && sma50Value < sma200Value;
    if (alignedBullish) {
      trendScore += 0.5;
      trendStrength += 0.5;
      trendSignals++;
    } else if (alignedBearish) {
      trendScore -= 0.5;
      trendStrength += 0.5;
      trendSignals++;
    }
  }

  const trend = trendSignals > 0 ? trendScore / trendSignals : 0;
  const avgTrendStrength = trendSignals > 0 ? trendStrength / trendSignals : 0;

  // Momentum Detection
  let momentumScore = 0;
  let momentumSignals = 0;
  let momentumStrength = 0;

  // MACD Histogram
  const histogramValue = getLatestIndicatorValue(histogram, currentIndex, 34);
  if (histogramValue !== null) {
    const priceRange = Math.max(...prices.slice(-50)) - Math.min(...prices.slice(-50));
    const scale = priceRange > 0 ? priceRange / 100 : 1;
    const signal = Math.max(-1, Math.min(1, histogramValue / scale));
    momentumScore += signal * 1.5;
    momentumStrength += Math.abs(signal) * 1.5;
    momentumSignals++;
  }

  // MACD vs Signal
  const macdValue = getLatestIndicatorValue(macd, currentIndex, 34);
  const signalValue = getLatestIndicatorValue(signal, currentIndex, 34);
  if (macdValue !== null && signalValue !== null) {
    const macdSignal = macdValue > signalValue ? 1 : -1;
    const macdStrength = Math.abs(macdValue - signalValue) / Math.abs(signalValue || 1);
    momentumScore += macdSignal * Math.min(1, macdStrength * 10);
    momentumStrength += Math.min(1, macdStrength * 10);
    momentumSignals++;
    
    if (macdValue > 0) {
      momentumScore += 0.3;
      momentumStrength += 0.3;
    } else {
      momentumScore -= 0.3;
      momentumStrength += 0.3;
    }
    momentumSignals++;
  }

  // RSI
  const rsiValue = getLatestIndicatorValue(rsi, currentIndex, 14);
  if (rsiValue !== null) {
    let rsiSignal = 0;
    if (rsiValue > 70) {
      rsiSignal = -((rsiValue - 70) / 30);
    } else if (rsiValue < 30) {
      rsiSignal = (30 - rsiValue) / 30;
    } else if (rsiValue > 50) {
      rsiSignal = (rsiValue - 50) / 20;
    } else {
      rsiSignal = -(50 - rsiValue) / 20;
    }
    momentumScore += rsiSignal;
    momentumStrength += Math.abs(rsiSignal);
    momentumSignals++;
  }

  // Price momentum
  if (currentIndex >= 20) {
    const price20PeriodsAgo = prices[currentIndex - 20];
    const priceMomentum20 = (currentPrice - price20PeriodsAgo) / price20PeriodsAgo;
    const signal = Math.max(-1, Math.min(1, priceMomentum20 * 5));
    momentumScore += signal;
    momentumStrength += Math.abs(signal);
    momentumSignals++;
  }

  if (currentIndex >= 50) {
    const price50PeriodsAgo = prices[currentIndex - 50];
    const priceMomentum50 = (currentPrice - price50PeriodsAgo) / price50PeriodsAgo;
    const signal = Math.max(-1, Math.min(1, priceMomentum50 * 3));
    momentumScore += signal * 1.2;
    momentumStrength += Math.abs(signal) * 1.2;
    momentumSignals++;
  }

  const momentum = momentumSignals > 0 ? momentumScore / momentumSignals : 0;
  const avgMomentumStrength = momentumSignals > 0 ? momentumStrength / momentumSignals : 0;

  // Volatility
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
  const volatility = Math.min(1, avgVolatility * 20);

  // Combine trend and momentum
  const rawCombinedSignal = (trend * 0.5 + momentum * 0.5);
  const signalStrength = (avgTrendStrength + avgMomentumStrength) / 2;
  
  // Apply smoothing to reduce noise (financial professionals use this)
  // Calculate simple moving average of recent raw signals for this index
  // This works for both sequential (paper trading) and historical (chart) calculations
  const smoothingPeriod = 5;
  let combinedSignal = rawCombinedSignal;
  
  if (currentIndex >= 50 + smoothingPeriod - 1) {
    // Calculate raw signals for recent periods and average them
    const recentRawSignals: number[] = [rawCombinedSignal];
    for (let i = 1; i < smoothingPeriod && currentIndex - i >= 50; i++) {
      const prevIdx = currentIndex - i;
      const prevPrice = prices[prevIdx]!;
      
      // Recalculate trend for previous index
      const prevSma20 = getLatestIndicatorValue(sma20, prevIdx, 19);
      const prevSma50 = getLatestIndicatorValue(sma50, prevIdx, 49);
      const prevSma200 = sma200 ? getLatestIndicatorValue(sma200, prevIdx, 199) : null;
      const prevEma12 = getLatestIndicatorValue(ema12, prevIdx, 11);
      const prevEma26 = getLatestIndicatorValue(ema26, prevIdx, 25);
      
      let prevTrendScore = 0;
      let prevTrendSignals = 0;
      if (prevSma20 !== null) {
        prevTrendScore += Math.max(-1, Math.min(1, ((prevPrice - prevSma20) / prevSma20) * 10));
        prevTrendSignals++;
      }
      if (prevSma50 !== null) {
        prevTrendScore += Math.max(-1, Math.min(1, ((prevPrice - prevSma50) / prevSma50) * 10));
        prevTrendSignals++;
      }
      if (prevSma200 !== null) {
        prevTrendScore += Math.max(-1, Math.min(1, ((prevPrice - prevSma200) / prevSma200) * 8)) * 1.5;
        prevTrendSignals++;
      }
      if (prevSma50 !== null && prevSma200 !== null) {
        prevTrendScore += Math.max(-1, Math.min(1, ((prevSma50 - prevSma200) / prevSma200) * 30)) * 2.0;
        prevTrendSignals++;
      }
      if (prevSma20 !== null && prevSma50 !== null) {
        prevTrendScore += Math.max(-1, Math.min(1, ((prevSma20 - prevSma50) / prevSma50) * 20));
        prevTrendSignals++;
      }
      if (prevEma12 !== null && prevEma26 !== null) {
        prevTrendScore += Math.max(-1, Math.min(1, ((prevEma12 - prevEma26) / prevEma26) * 20));
        prevTrendSignals++;
      }
      const prevTrend = prevTrendSignals > 0 ? prevTrendScore / prevTrendSignals : 0;
      
      // Recalculate momentum for previous index
      const prevHistogram = getLatestIndicatorValue(histogram, prevIdx, 34);
      const prevMacd = getLatestIndicatorValue(macd, prevIdx, 34);
      const prevSignal = getLatestIndicatorValue(signal, prevIdx, 34);
      const prevRsi = getLatestIndicatorValue(rsi, prevIdx, 14);
      
      let prevMomentumScore = 0;
      let prevMomentumSignals = 0;
      if (prevHistogram !== null) {
        const priceRange = Math.max(...prices.slice(Math.max(0, prevIdx - 50), prevIdx + 1)) - Math.min(...prices.slice(Math.max(0, prevIdx - 50), prevIdx + 1));
        const scale = priceRange > 0 ? priceRange / 100 : 1;
        prevMomentumScore += Math.max(-1, Math.min(1, prevHistogram / scale)) * 1.5;
        prevMomentumSignals++;
      }
      if (prevMacd !== null && prevSignal !== null) {
        const macdSignal = prevMacd > prevSignal ? 1 : -1;
        prevMomentumScore += macdSignal * Math.min(1, Math.abs(prevMacd - prevSignal) / Math.abs(prevSignal || 1) * 10);
        prevMomentumSignals++;
        prevMomentumScore += (prevMacd > 0 ? 0.3 : -0.3);
        prevMomentumSignals++;
      }
      if (prevRsi !== null) {
        let rsiSignal = 0;
        if (prevRsi > 70) rsiSignal = -((prevRsi - 70) / 30);
        else if (prevRsi < 30) rsiSignal = (30 - prevRsi) / 30;
        else if (prevRsi > 50) rsiSignal = (prevRsi - 50) / 20;
        else rsiSignal = -(50 - prevRsi) / 20;
        prevMomentumScore += rsiSignal;
        prevMomentumSignals++;
      }
      if (prevIdx >= 20) {
        const price20Ago = prices[prevIdx - 20]!;
        prevMomentumScore += Math.max(-1, Math.min(1, ((prevPrice - price20Ago) / price20Ago) * 5));
        prevMomentumSignals++;
      }
      const prevMomentum = prevMomentumSignals > 0 ? prevMomentumScore / prevMomentumSignals : 0;
      
      recentRawSignals.push((prevTrend * 0.5 + prevMomentum * 0.5));
    }
    
    // Use simple average (SMA) for smoothing - more stable than EMA for historical calculations
    combinedSignal = recentRawSignals.reduce((a, b) => a + b, 0) / recentRawSignals.length;
  }
  
  // Hysteresis: Different thresholds for entering vs exiting regimes
  // This prevents whipsaw - once in a regime, you need stronger signal to exit
  // Financial professionals use this to reduce false signals
  const bullishEntryThreshold = 0.05;  // Threshold to enter bullish
  const bullishExitThreshold = 0.02;   // Lower threshold to exit bullish (hysteresis)
  const bearishEntryThreshold = -0.05; // Threshold to enter bearish
  const bearishExitThreshold = -0.02;  // Higher threshold to exit bearish (hysteresis)
  const minStrength = 0.1;

  let regime: MarketRegime;
  let confidence: number;
  
  // Determine previous regime for hysteresis (check 1 period ago)
  let previousRegime: 'bullish' | 'bearish' | 'neutral' | null = null;
  if (currentIndex > 50) {
    const prevIdx = currentIndex - 1;
    const prevPrice = prices[prevIdx]!;
    const prevSma20 = getLatestIndicatorValue(sma20, prevIdx, 19);
    const prevSma50 = getLatestIndicatorValue(sma50, prevIdx, 49);
    const prevSma200 = sma200 ? getLatestIndicatorValue(sma200, prevIdx, 199) : null;
    const prevEma12 = getLatestIndicatorValue(ema12, prevIdx, 11);
    const prevEma26 = getLatestIndicatorValue(ema26, prevIdx, 25);
    const prevHistogram = getLatestIndicatorValue(histogram, prevIdx, 34);
    const prevMacd = getLatestIndicatorValue(macd, prevIdx, 34);
    const prevSignal = getLatestIndicatorValue(signal, prevIdx, 34);
    const prevRsi = getLatestIndicatorValue(rsi, prevIdx, 14);
    
    // Quick calculation of previous signal
    let prevTrendScore = 0;
    let prevTrendSignals = 0;
    if (prevSma20 !== null) { prevTrendScore += Math.max(-1, Math.min(1, ((prevPrice - prevSma20) / prevSma20) * 10)); prevTrendSignals++; }
    if (prevSma50 !== null) { prevTrendScore += Math.max(-1, Math.min(1, ((prevPrice - prevSma50) / prevSma50) * 10)); prevTrendSignals++; }
    if (prevSma200 !== null) { prevTrendScore += Math.max(-1, Math.min(1, ((prevPrice - prevSma200) / prevSma200) * 8)) * 1.5; prevTrendSignals++; }
    if (prevSma50 !== null && prevSma200 !== null) { prevTrendScore += Math.max(-1, Math.min(1, ((prevSma50 - prevSma200) / prevSma200) * 30)) * 2.0; prevTrendSignals++; }
    const prevTrend = prevTrendSignals > 0 ? prevTrendScore / prevTrendSignals : 0;
    
    let prevMomentumScore = 0;
    let prevMomentumSignals = 0;
    if (prevHistogram !== null) {
      const priceRange = Math.max(...prices.slice(Math.max(0, prevIdx - 50), prevIdx + 1)) - Math.min(...prices.slice(Math.max(0, prevIdx - 50), prevIdx + 1));
      const scale = priceRange > 0 ? priceRange / 100 : 1;
      prevMomentumScore += Math.max(-1, Math.min(1, prevHistogram / scale)) * 1.5;
      prevMomentumSignals++;
    }
    if (prevMacd !== null && prevSignal !== null) {
      const macdSignal = prevMacd > prevSignal ? 1 : -1;
      prevMomentumScore += macdSignal * Math.min(1, Math.abs(prevMacd - prevSignal) / Math.abs(prevSignal || 1) * 10);
      prevMomentumSignals++;
      prevMomentumScore += (prevMacd > 0 ? 0.3 : -0.3);
      prevMomentumSignals++;
    }
    if (prevRsi !== null) {
      let rsiSignal = 0;
      if (prevRsi > 70) rsiSignal = -((prevRsi - 70) / 30);
      else if (prevRsi < 30) rsiSignal = (30 - prevRsi) / 30;
      else if (prevRsi > 50) rsiSignal = (prevRsi - 50) / 20;
      else rsiSignal = -(50 - prevRsi) / 20;
      prevMomentumScore += rsiSignal;
      prevMomentumSignals++;
    }
    const prevMomentum = prevMomentumSignals > 0 ? prevMomentumScore / prevMomentumSignals : 0;
    const prevRawSignal = (prevTrend * 0.5 + prevMomentum * 0.5);
    
    if (prevRawSignal > bullishEntryThreshold) {
      previousRegime = 'bullish';
    } else if (prevRawSignal < bearishEntryThreshold) {
      previousRegime = 'bearish';
    }
  }
  
  // Use hysteresis: if we're already in a regime, use exit threshold; otherwise use entry threshold
  const isCurrentlyBullish = previousRegime === 'bullish';
  const isCurrentlyBearish = previousRegime === 'bearish';
  
  const bullishThreshold = isCurrentlyBullish ? bullishExitThreshold : bullishEntryThreshold;
  const bearishThreshold = isCurrentlyBearish ? bearishExitThreshold : bearishEntryThreshold;

  if (combinedSignal > bullishThreshold && signalStrength > minStrength) {
    regime = 'bullish';
    confidence = Math.min(1, Math.abs(combinedSignal) * 0.7 + signalStrength * 0.3);
  } else if (combinedSignal < bearishThreshold && signalStrength > minStrength) {
    regime = 'bearish';
    confidence = Math.min(1, Math.abs(combinedSignal) * 0.7 + signalStrength * 0.3);
  } else {
    regime = 'neutral';
    confidence = Math.max(0, 1 - Math.abs(combinedSignal) - signalStrength);
  }
  
  // Update last regime for next calculation
  indicatorCache.lastRegime = regime;

  // Increase confidence if trend and momentum agree
  if ((trend > 0 && momentum > 0) || (trend < 0 && momentum < 0)) {
    const agreement = Math.min(Math.abs(trend), Math.abs(momentum));
    confidence = Math.min(1, confidence * (1 + agreement * 0.5));
  }

  // Boost confidence for Golden/Death Cross
  if (sma50Value !== null && sma200Value !== null) {
    const crossSignal = (sma50Value - sma200Value) / sma200Value;
    if (Math.abs(crossSignal) > 0.02) {
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
 * Clear the indicator cache (useful for testing or when switching datasets)
 */
export function clearIndicatorCache(): void {
  indicatorCache = {
    sma20: null,
    sma50: null,
    sma200: null,
    ema12: null,
    ema26: null,
    macd: null,
    rsi: null,
    prices: null,
    smoothedCombinedSignal: null,
    lastRegime: null,
    lastCandleCount: 0,
  };
}

