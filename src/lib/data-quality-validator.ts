/**
 * Data Quality Validation Utilities
 * Validates historical price data for gaps, freshness, and look-ahead bias
 */

import type { PriceCandle } from '@/types';

export interface DataQualityReport {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  lastCandleAge: number; // Age of last candle in milliseconds
  gapCount: number;
  missingCandles: Array<{ expected: number; actual: number | null }>;
  coverage: number; // Percentage of expected candles present
}

/**
 * Calculate expected interval between candles based on timeframe
 */
function getExpectedInterval(timeframe: string): number {
  const intervals: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return intervals[timeframe] || 24 * 60 * 60 * 1000; // Default to 1d
}

/**
 * Validate data freshness - check if last candle is recent enough
 * For daily candles, the timestamp is the start of the day, so we check if it's today's candle
 */
export function validateDataFreshness(
  candles: PriceCandle[],
  timeframe: string,
  maxAgeMinutes: number = 60
): { isValid: boolean; lastCandleAge: number; issue?: string } {
  if (candles.length === 0) {
    return {
      isValid: false,
      lastCandleAge: Infinity,
      issue: 'No candles available',
    };
  }

  const lastCandle = candles[candles.length - 1]!;
  const now = Date.now();
  
  // For daily candles, check if the last candle is from today (timestamp at start of today)
  if (timeframe === '1d') {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    
    const lastCandleDate = new Date(lastCandle.timestamp);
    lastCandleDate.setUTCHours(0, 0, 0, 0);
    const lastCandleDayStart = lastCandleDate.getTime();
    
    // Check if last candle is from today
    if (lastCandleDayStart === todayStart) {
      // It's today's candle - calculate age from start of day (this is expected for daily candles)
      const lastCandleAge = now - lastCandleDayStart;
      // For daily candles, being from today is considered fresh (even if 20+ hours into the day)
      // But we should warn if it's been more than 24 hours since the candle was created
      // Actually, for daily candles, the timestamp being from today is sufficient
      return {
        isValid: true,
        lastCandleAge, // Age from start of day
      };
    } else {
      // Last candle is from a previous day
      const daysOld = Math.floor((todayStart - lastCandleDayStart) / (24 * 60 * 60 * 1000));
      return {
        isValid: false,
        lastCandleAge: now - lastCandle.timestamp,
        issue: `Last candle is from ${daysOld} day(s) ago (expected today's candle)`,
      };
    }
  }
  
  // For non-daily timeframes, use the original logic
  const lastCandleAge = now - lastCandle.timestamp;
  const maxAge = maxAgeMinutes * 60 * 1000;

  if (lastCandleAge > maxAge) {
    const ageHours = lastCandleAge / (60 * 60 * 1000);
    return {
      isValid: false,
      lastCandleAge,
      issue: `Last candle is ${ageHours.toFixed(1)} hours old (max: ${maxAge / (60 * 60 * 1000)}h)`,
    };
  }

  return {
    isValid: true,
    lastCandleAge,
  };
}

/**
 * Detect gaps in historical data
 */
export function detectGaps(
  candles: PriceCandle[],
  timeframe: string,
  startTime: number,
  endTime: number
): {
  gapCount: number;
  missingCandles: Array<{ expected: number; actual: number | null }>;
  coverage: number;
} {
  if (candles.length === 0) {
    return {
      gapCount: 0,
      missingCandles: [],
      coverage: 0,
    };
  }

  const expectedInterval = getExpectedInterval(timeframe);
  const sortedCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const missingCandles: Array<{ expected: number; actual: number | null }> = [];
  let gapCount = 0;

  // Check for gaps between candles
  for (let i = 1; i < sortedCandles.length; i++) {
    const prev = sortedCandles[i - 1]!;
    const curr = sortedCandles[i]!;
    const timeDiff = curr.timestamp - prev.timestamp;

    // Allow some tolerance (10% of expected interval)
    const tolerance = expectedInterval * 0.1;
    if (timeDiff > expectedInterval + tolerance) {
      gapCount++;
      // Calculate how many candles are missing
      const missingCount = Math.floor((timeDiff - tolerance) / expectedInterval) - 1;
      for (let j = 1; j <= missingCount; j++) {
        const expectedTimestamp = prev.timestamp + expectedInterval * j;
        if (expectedTimestamp >= startTime && expectedTimestamp <= endTime) {
          missingCandles.push({
            expected: expectedTimestamp,
            actual: null,
          });
        }
      }
    }
  }

  // Check for missing candles at the start
  const firstCandle = sortedCandles[0]!;
  if (firstCandle.timestamp > startTime + expectedInterval) {
    const missingAtStart = Math.floor((firstCandle.timestamp - startTime) / expectedInterval);
    for (let j = 1; j <= missingAtStart; j++) {
      const expectedTimestamp = startTime + expectedInterval * j;
      if (expectedTimestamp < firstCandle.timestamp) {
        missingCandles.push({
          expected: expectedTimestamp,
          actual: null,
        });
      }
    }
  }

  // Check for missing candles at the end
  const lastCandle = sortedCandles[sortedCandles.length - 1]!;
  if (lastCandle.timestamp < endTime - expectedInterval) {
    const missingAtEnd = Math.floor((endTime - lastCandle.timestamp) / expectedInterval);
    for (let j = 1; j <= missingAtEnd; j++) {
      const expectedTimestamp = lastCandle.timestamp + expectedInterval * j;
      if (expectedTimestamp <= endTime) {
        missingCandles.push({
          expected: expectedTimestamp,
          actual: null,
        });
      }
    }
  }

  // Calculate coverage
  const expectedCount = Math.floor((endTime - startTime) / expectedInterval) + 1;
  const actualCount = candles.length;
  // Cap coverage at 100% (can exceed if we have more candles than expected, e.g., multiple sources)
  const coverage = expectedCount > 0 ? Math.min(100, (actualCount / expectedCount) * 100) : 0;

  return {
    gapCount,
    missingCandles,
    coverage,
  };
}

/**
 * Validate that signal generation doesn't use look-ahead bias
 * Checks that currentIndex doesn't exceed candles.length - 1
 */
export function validateNoLookAheadBias(
  candles: PriceCandle[],
  currentIndex: number
): { isValid: boolean; issue?: string } {
  if (currentIndex >= candles.length) {
    return {
      isValid: false,
      issue: `currentIndex (${currentIndex}) >= candles.length (${candles.length}) - look-ahead bias detected`,
    };
  }

  if (currentIndex < 0) {
    return {
      isValid: false,
      issue: `currentIndex (${currentIndex}) is negative`,
    };
  }

  return { isValid: true };
}

/**
 * Comprehensive data quality validation
 */
export function validateDataQuality(
  candles: PriceCandle[],
  timeframe: string,
  startTime: number,
  endTime: number,
  currentIndex: number,
  maxAgeMinutes: number = 60
): DataQualityReport {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Validate freshness
  const freshness = validateDataFreshness(candles, timeframe, maxAgeMinutes);
  if (!freshness.isValid && freshness.issue) {
    issues.push(freshness.issue);
  } else if (freshness.lastCandleAge > maxAgeMinutes * 60 * 1000 * 0.5) {
    // Warn if data is getting stale (50% of max age)
    warnings.push(`Data is getting stale: ${(freshness.lastCandleAge / (60 * 60 * 1000)).toFixed(1)}h old`);
  }

  // Detect gaps
  const gapInfo = detectGaps(candles, timeframe, startTime, endTime);
  if (gapInfo.gapCount > 0) {
    issues.push(`Found ${gapInfo.gapCount} gap(s) in historical data`);
  }
  if (gapInfo.coverage < 95) {
    warnings.push(`Data coverage is ${gapInfo.coverage.toFixed(1)}% (expected: 95%+)`);
  }

  // Validate no look-ahead bias
  const lookAheadCheck = validateNoLookAheadBias(candles, currentIndex);
  if (!lookAheadCheck.isValid && lookAheadCheck.issue) {
    issues.push(lookAheadCheck.issue);
  }

  // Check for minimum required candles
  if (candles.length < 50) {
    warnings.push(`Only ${candles.length} candles available (minimum 50 recommended for indicators)`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    lastCandleAge: freshness.lastCandleAge,
    gapCount: gapInfo.gapCount,
    missingCandles: gapInfo.missingCandles,
    coverage: gapInfo.coverage,
  };
}

