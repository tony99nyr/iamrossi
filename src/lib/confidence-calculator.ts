import type { TradingSignal, PriceCandle } from '@/types';
import { calculateSMA } from './indicators';

/**
 * Calculate confidence score (0-1) for a trading signal
 * Combines multiple factors:
 * - Signal strength
 * - Indicator agreement
 * - Volatility (lower = higher confidence)
 * - Trend strength (momentum)
 */
export function calculateConfidence(
  signal: TradingSignal,
  candles: PriceCandle[],
  currentIndex: number
): number {
  if (candles.length === 0 || currentIndex >= candles.length) return 0;

  const prices = candles.map(c => c.close);
  const currentPrice = prices[currentIndex];

  // Factor 1: Signal strength (0-1)
  const signalStrength = Math.abs(signal.signal);

  // Factor 2: Indicator agreement (0-1)
  // How many indicators agree on the direction
  const indicatorValues = Object.values(signal.indicators);
  if (indicatorValues.length === 0) return 0;

  const positiveIndicators = indicatorValues.filter(v => v > 0).length;
  const negativeIndicators = indicatorValues.filter(v => v < 0).length;
  const agreement =
    signal.signal > 0
      ? positiveIndicators / indicatorValues.length
      : negativeIndicators / indicatorValues.length;

  // Factor 3: Volatility (lower volatility = higher confidence)
  // Calculate recent volatility (standard deviation of returns)
  const lookback = Math.min(20, currentIndex);
  if (lookback < 2) return signalStrength * 0.5; // Not enough data

  const recentPrices = prices.slice(currentIndex - lookback, currentIndex + 1);
  const returns = [];
  for (let i = 1; i < recentPrices.length; i++) {
    if (recentPrices[i - 1] > 0) {
      returns.push((recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1]);
    }
  }

  if (returns.length === 0) return signalStrength * 0.5;

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance);

  // Normalize volatility (assume max 10% daily volatility for crypto)
  const normalizedVolatility = Math.min(1, volatility / 0.1);
  const volatilityConfidence = 1 - normalizedVolatility;

  // Factor 4: Trend strength (momentum)
  // Compare current price to moving average
  const smaPeriod = Math.min(20, currentIndex + 1);
  if (smaPeriod < 5) return signalStrength * 0.5;

  const sma = calculateSMA(prices.slice(0, currentIndex + 1), smaPeriod);
  if (sma.length === 0) return signalStrength * 0.5;

  const smaValue = sma[sma.length - 1];
  const priceDeviation = Math.abs((currentPrice - smaValue) / smaValue);
  // Higher deviation from SMA = stronger trend = higher confidence
  const trendStrength = Math.min(1, priceDeviation * 10);

  // Factor 5: Volume confirmation (if available)
  // Higher volume = higher confidence
  let volumeConfidence = 0.5; // Default if no volume data
  if (candles[currentIndex].volume > 0) {
    const recentVolumes = candles
      .slice(Math.max(0, currentIndex - 20), currentIndex + 1)
      .map(c => c.volume);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    if (avgVolume > 0) {
      const volumeRatio = candles[currentIndex].volume / avgVolume;
      volumeConfidence = Math.min(1, volumeRatio / 2); // Normalize to 0-1
    }
  }

  // Combine factors with weights
  const weights = {
    signalStrength: 0.3,
    agreement: 0.25,
    volatility: 0.2,
    trendStrength: 0.15,
    volume: 0.1,
  };

  const confidence =
    signalStrength * weights.signalStrength +
    agreement * weights.agreement +
    volatilityConfidence * weights.volatility +
    trendStrength * weights.trendStrength +
    volumeConfidence * weights.volume;

  return Math.max(0, Math.min(1, confidence));
}


