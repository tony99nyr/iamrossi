/**
 * Correlation Analysis Module
 * 
 * Calculates rolling correlation between ETH and BTC prices.
 * High correlation means ETH follows BTC closely.
 * Divergence from typical correlation can signal ETH-specific opportunities.
 */

import type { PriceCandle } from '@/types';

export interface CorrelationResult {
  correlation: number; // Pearson correlation coefficient (-1 to 1)
  period: number; // Number of periods used
  strength: 'strong' | 'moderate' | 'weak' | 'none'; // Interpretation
  timestamp: number; // Timestamp of the latest candle
}

export interface RollingCorrelation {
  correlations: CorrelationResult[];
  averageCorrelation: number;
  currentCorrelation: number;
  trend: 'increasing' | 'decreasing' | 'stable'; // Correlation trend
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * 
 * @param x First array of values
 * @param y Second array of values
 * @returns Correlation coefficient between -1 and 1
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }

  const n = x.length;
  
  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  // Calculate covariance and standard deviations
  let covariance = 0;
  let varX = 0;
  let varY = 0;
  
  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    covariance += diffX * diffY;
    varX += diffX * diffX;
    varY += diffY * diffY;
  }
  
  const stdX = Math.sqrt(varX / n);
  const stdY = Math.sqrt(varY / n);
  
  if (stdX === 0 || stdY === 0) {
    return 0; // No variance in one or both series
  }
  
  return covariance / (n * stdX * stdY);
}

/**
 * Calculate rolling correlation between two price series
 * 
 * @param ethPrices ETH closing prices
 * @param btcPrices BTC closing prices (must be aligned with ETH)
 * @param period Rolling window size (default: 30 periods)
 * @returns Array of correlation values
 */
export function calculateRollingCorrelation(
  ethPrices: number[],
  btcPrices: number[],
  period: number = 30
): number[] {
  if (ethPrices.length !== btcPrices.length) {
    throw new Error('Price arrays must have the same length');
  }

  if (ethPrices.length < period) {
    return [];
  }

  const correlations: number[] = [];

  // Calculate returns instead of raw prices for better correlation
  const ethReturns: number[] = [];
  const btcReturns: number[] = [];
  
  for (let i = 1; i < ethPrices.length; i++) {
    ethReturns.push((ethPrices[i] - ethPrices[i - 1]) / ethPrices[i - 1]);
    btcReturns.push((btcPrices[i] - btcPrices[i - 1]) / btcPrices[i - 1]);
  }

  // Calculate rolling correlation on returns
  for (let i = period - 1; i < ethReturns.length; i++) {
    const ethWindow = ethReturns.slice(i - period + 1, i + 1);
    const btcWindow = btcReturns.slice(i - period + 1, i + 1);
    
    const correlation = calculatePearsonCorrelation(ethWindow, btcWindow);
    correlations.push(correlation);
  }

  return correlations;
}

/**
 * Interpret correlation strength
 */
function getCorrelationStrength(correlation: number): 'strong' | 'moderate' | 'weak' | 'none' {
  const absCorr = Math.abs(correlation);
  if (absCorr >= 0.7) return 'strong';
  if (absCorr >= 0.4) return 'moderate';
  if (absCorr >= 0.2) return 'weak';
  return 'none';
}

/**
 * Calculate correlation signal for trading
 * 
 * @param correlation Current correlation value
 * @param historicalAverage Historical average correlation
 * @returns Signal between -1 and 1
 *          - Positive: ETH outperforming typical correlation (bullish signal)
 *          - Negative: ETH underperforming typical correlation (bearish signal)
 */
export function getCorrelationSignal(
  correlation: number,
  historicalAverage: number = 0.7
): number {
  // When correlation drops significantly below historical average,
  // it could mean ETH is diverging from BTC (opportunity or risk)
  const deviation = correlation - historicalAverage;
  
  // Normalize to -1 to 1 range
  // Large positive deviation (higher than normal correlation) = 0 to 0.5
  // Large negative deviation (lower than normal correlation) = -0.5 to 0.5
  return Math.max(-1, Math.min(1, deviation * 2));
}

/**
 * Full correlation analysis between ETH and BTC candles
 * 
 * @param ethCandles ETH price candles
 * @param btcCandles BTC price candles (aligned by timestamp)
 * @param period Rolling period for correlation calculation
 * @returns Comprehensive correlation analysis
 */
export function analyzeCorrelation(
  ethCandles: PriceCandle[],
  btcCandles: PriceCandle[],
  period: number = 30
): RollingCorrelation {
  if (ethCandles.length !== btcCandles.length) {
    throw new Error('Candle arrays must have the same length');
  }

  const ethPrices = ethCandles.map(c => c.close);
  const btcPrices = btcCandles.map(c => c.close);
  
  const rollingCorrelations = calculateRollingCorrelation(ethPrices, btcPrices, period);
  
  if (rollingCorrelations.length === 0) {
    return {
      correlations: [],
      averageCorrelation: 0,
      currentCorrelation: 0,
      trend: 'stable',
    };
  }

  // Build correlation results with metadata
  const correlationResults: CorrelationResult[] = [];
  const startOffset = period; // Account for return calculation + rolling window
  
  for (let i = 0; i < rollingCorrelations.length; i++) {
    const candleIndex = startOffset + i;
    if (candleIndex < ethCandles.length) {
      correlationResults.push({
        correlation: rollingCorrelations[i],
        period,
        strength: getCorrelationStrength(rollingCorrelations[i]),
        timestamp: ethCandles[candleIndex].timestamp,
      });
    }
  }

  // Calculate average correlation
  const avgCorrelation = rollingCorrelations.reduce((a, b) => a + b, 0) / rollingCorrelations.length;
  
  // Get current correlation
  const currentCorrelation = rollingCorrelations[rollingCorrelations.length - 1];
  
  // Determine trend (compare recent to older correlations)
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (rollingCorrelations.length >= 10) {
    const recent = rollingCorrelations.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const older = rollingCorrelations.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    
    if (recent - older > 0.1) {
      trend = 'increasing';
    } else if (older - recent > 0.1) {
      trend = 'decreasing';
    }
  }

  return {
    correlations: correlationResults,
    averageCorrelation: avgCorrelation,
    currentCorrelation,
    trend,
  };
}

/**
 * Get a trading context from correlation analysis
 * 
 * @param analysis Correlation analysis result
 * @returns Object with trading-relevant insights
 */
export function getCorrelationContext(analysis: RollingCorrelation): {
  signal: number;
  context: string;
  riskLevel: 'low' | 'medium' | 'high';
} {
  const { currentCorrelation, averageCorrelation, trend } = analysis;
  
  const signal = getCorrelationSignal(currentCorrelation, averageCorrelation);
  
  // Determine context message
  let context: string;
  let riskLevel: 'low' | 'medium' | 'high';
  
  if (currentCorrelation > 0.8) {
    context = 'ETH and BTC are highly correlated. Market moves together.';
    riskLevel = 'low';
  } else if (currentCorrelation > 0.5) {
    context = 'Normal correlation. ETH may have some independent movement.';
    riskLevel = 'medium';
  } else if (currentCorrelation > 0) {
    context = 'Low correlation. ETH is moving independently from BTC.';
    riskLevel = 'medium';
  } else {
    context = 'Negative correlation. ETH is moving opposite to BTC.';
    riskLevel = 'high';
  }

  // Add trend context
  if (trend === 'decreasing') {
    context += ' Correlation is decreasing - watch for divergence.';
    riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
  } else if (trend === 'increasing') {
    context += ' Correlation is increasing - converging with BTC.';
  }

  return { signal, context, riskLevel };
}

