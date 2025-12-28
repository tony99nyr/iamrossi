/**
 * Technical indicator calculations for trading signals
 */

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];

  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }

  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];

  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for first value
  const firstSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(firstSMA);

  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const currentEMA = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(currentEMA);
  }

  return ema;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  // MACD line = fast EMA - slow EMA
  const macd: number[] = [];
  const offset = slowPeriod - fastPeriod;
  for (let i = 0; i < slowEMA.length; i++) {
    if (i + offset < fastEMA.length) {
      macd.push(fastEMA[i + offset] - slowEMA[i]);
    }
  }

  // Signal line = EMA of MACD
  const signal = calculateEMA(macd, signalPeriod);

  // Histogram = MACD - Signal
  const histogram: number[] = [];
  const signalOffset = macd.length - signal.length;
  for (let i = 0; i < signal.length; i++) {
    histogram.push(macd[i + signalOffset] - signal[i]);
  }

  return { macd, signal, histogram };
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];

  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  // Calculate first RSI
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  // Calculate subsequent RSI values using Wilder's smoothing
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const sma = calculateSMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < sma.length; i++) {
    const startIdx = i;
    const endIdx = startIdx + period;
    const slice = prices.slice(startIdx, endIdx);

    // Calculate standard deviation
    const mean = sma[i];
    const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
    const standardDev = Math.sqrt(variance);

    upper.push(mean + stdDev * standardDev);
    lower.push(mean - stdDev * standardDev);
  }

  return { upper, middle: sma, lower };
}

/**
 * Get the latest value from an indicator array (handles alignment with price data)
 */
export function getLatestIndicatorValue(
  indicatorValues: number[],
  priceIndex: number,
  indicatorOffset: number = 0
): number | null {
  const index = priceIndex - indicatorOffset;
  if (index >= 0 && index < indicatorValues.length) {
    return indicatorValues[index];
  }
  return null;
}


