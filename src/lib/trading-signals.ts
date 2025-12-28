import type { PriceCandle, TradingSignal, TradingConfig } from '@/types';
import {
  calculateSMA,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateBollingerBands,
  getLatestIndicatorValue,
} from './indicators';

/**
 * Calculate individual indicator signal value (-1 to +1)
 */
function calculateIndicatorSignal(
  indicatorType: string,
  params: Record<string, number>,
  prices: number[],
  currentIndex: number
): number {
  switch (indicatorType) {
    case 'sma': {
      const period = params.period || 20;
      const sma = calculateSMA(prices, period);
      const smaValue = getLatestIndicatorValue(sma, currentIndex, period - 1);
      if (smaValue === null) return 0;

      const currentPrice = prices[currentIndex];
      // Signal: positive if price > SMA (bullish), negative if price < SMA (bearish)
      const diff = (currentPrice - smaValue) / smaValue;
      return Math.max(-1, Math.min(1, diff * 10)); // Scale to -1 to +1
    }

    case 'ema': {
      const period = params.period || 20;
      const ema = calculateEMA(prices, period);
      const emaValue = getLatestIndicatorValue(ema, currentIndex, period - 1);
      if (emaValue === null) return 0;

      const currentPrice = prices[currentIndex];
      const diff = (currentPrice - emaValue) / emaValue;
      return Math.max(-1, Math.min(1, diff * 10));
    }

    case 'macd': {
      const fastPeriod = params.fastPeriod || 12;
      const slowPeriod = params.slowPeriod || 26;
      const signalPeriod = params.signalPeriod || 9;
      const { macd, signal, histogram } = calculateMACD(prices, fastPeriod, slowPeriod, signalPeriod);

      if (macd.length === 0 || signal.length === 0) return 0;

      // Use histogram for signal (MACD - Signal)
      const histogramValue = getLatestIndicatorValue(
        histogram,
        currentIndex,
        slowPeriod + signalPeriod - 1
      );
      if (histogramValue === null) return 0;

      // Normalize histogram to -1 to +1 range
      // Use a scaling factor based on price volatility
      const priceRange = Math.max(...prices.slice(-20)) - Math.min(...prices.slice(-20));
      const scale = priceRange > 0 ? priceRange / 100 : 1;
      return Math.max(-1, Math.min(1, histogramValue / scale));
    }

    case 'rsi': {
      const period = params.period || 14;
      const rsi = calculateRSI(prices, period);
      const rsiValue = getLatestIndicatorValue(rsi, currentIndex, period);
      if (rsiValue === null) return 0;

      // RSI is 0-100, convert to -1 to +1
      // RSI > 70 = overbought (bearish signal = -1)
      // RSI < 30 = oversold (bullish signal = +1)
      if (rsiValue > 70) {
        return -((rsiValue - 70) / 30); // -1 at 100
      } else if (rsiValue < 30) {
        return (30 - rsiValue) / 30; // +1 at 0
      }
      return 0; // Neutral zone
    }

    case 'bollinger': {
      const period = params.period || 20;
      const stdDev = params.stdDev || 2;
      const bands = calculateBollingerBands(prices, period, stdDev);
      const upper = getLatestIndicatorValue(bands.upper, currentIndex, period - 1);
      const middle = getLatestIndicatorValue(bands.middle, currentIndex, period - 1);
      const lower = getLatestIndicatorValue(bands.lower, currentIndex, period - 1);

      if (upper === null || middle === null || lower === null) return 0;

      const currentPrice = prices[currentIndex];
      const bandWidth = upper - lower;

      if (bandWidth === 0) return 0;

      // Signal based on position relative to bands
      // Price near upper band = bearish, near lower band = bullish
      if (currentPrice >= upper) {
        return -1; // Overbought
      } else if (currentPrice <= lower) {
        return 1; // Oversold
      } else {
        // Normalize position within bands
        const position = (currentPrice - lower) / bandWidth;
        return (position - 0.5) * 2; // -1 to +1
      }
    }

    default:
      return 0;
  }
}

/**
 * Generate trading signal from price data and indicator configuration
 */
export function generateSignal(
  candles: PriceCandle[],
  config: TradingConfig,
  currentIndex: number
): TradingSignal {
  if (currentIndex >= candles.length) {
    throw new Error('Current index out of range');
  }

  const prices = candles.map(c => c.close);
  const currentCandle = candles[currentIndex];
  const indicators: Record<string, number> = {};

  // Calculate weighted signal from all indicators
  let weightedSignal = 0;
  let totalWeight = 0;

  for (const indicator of config.indicators) {
    const indicatorSignal = calculateIndicatorSignal(
      indicator.type,
      indicator.params,
      prices,
      currentIndex
    );

    indicators[`${indicator.type}_${JSON.stringify(indicator.params)}`] = indicatorSignal;
    weightedSignal += indicatorSignal * indicator.weight;
    totalWeight += indicator.weight;
  }

  // Normalize by total weight
  const signal = totalWeight > 0 ? weightedSignal / totalWeight : 0;

  // Determine action based on thresholds
  let action: 'buy' | 'sell' | 'hold' = 'hold';
  if (signal > config.buyThreshold) {
    action = 'buy';
  } else if (signal < config.sellThreshold) {
    action = 'sell';
  }

  return {
    timestamp: currentCandle.timestamp,
    signal,
    confidence: Math.abs(signal), // Confidence is absolute value of signal strength
    indicators,
    action,
  };
}

