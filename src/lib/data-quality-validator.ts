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
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
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
  
  // For 8h candles, check if the last candle is from the current 8h period
  if (timeframe === '8h') {
    const nowDate = new Date(now);
    const hours = nowDate.getUTCHours();
    const currentPeriod = Math.floor(hours / 8); // 0, 1, or 2
    const currentPeriodStart = new Date(nowDate);
    currentPeriodStart.setUTCHours(currentPeriod * 8, 0, 0, 0);
    currentPeriodStart.setUTCMinutes(0, 0, 0);
    const currentPeriodStartTime = currentPeriodStart.getTime();
    
    const lastCandleDate = new Date(lastCandle.timestamp);
    const lastCandleHours = lastCandleDate.getUTCHours();
    const lastCandlePeriod = Math.floor(lastCandleHours / 8);
    const lastCandlePeriodStart = new Date(lastCandleDate);
    lastCandlePeriodStart.setUTCHours(lastCandlePeriod * 8, 0, 0, 0);
    lastCandlePeriodStart.setUTCMinutes(0, 0, 0);
    const lastCandlePeriodStartTime = lastCandlePeriodStart.getTime();
    
    // Check if last candle is from the current 8h period
    if (lastCandlePeriodStartTime === currentPeriodStartTime) {
      // It's the current period's candle - calculate age from start of period
      const lastCandleAge = now - lastCandlePeriodStartTime;
      return {
        isValid: true,
        lastCandleAge, // Age from start of period
      };
    } else {
      // Last candle is from a previous period
      // Calculate actual time difference (accounting for days, not just periods)
      const actualTimeDiff = now - lastCandle.timestamp;
      const hoursOld = Math.floor(actualTimeDiff / (60 * 60 * 1000));
      const daysOld = Math.floor(hoursOld / 24);
      const hoursRemainder = hoursOld % 24;
      
      // For 8h candles, if the last candle is less than 16 hours old (2 periods), it's acceptable
      // This allows for the current period to not have a candle yet (it might still be in progress)
      // But flags if we're missing multiple periods (more than 16 hours)
      if (hoursOld < 16) {
        return {
          isValid: true,
          lastCandleAge: actualTimeDiff,
        };
      }
      
      // Format age message
      let ageMessage = '';
      if (daysOld > 0) {
        ageMessage = `${daysOld} day(s)`;
        if (hoursRemainder > 0) {
          ageMessage += ` ${hoursRemainder}h`;
        }
      } else {
        ageMessage = `${hoursOld}h`;
      }
      
      return {
        isValid: false,
        lastCandleAge: actualTimeDiff,
        issue: `Last candle is from ${ageMessage} ago (expected current 8h period)`,
      };
    }
  }
  
  // For 12h candles, check if the last candle is from the current 12h period
  if (timeframe === '12h') {
    const nowDate = new Date(now);
    const hours = nowDate.getUTCHours();
    const currentPeriod = Math.floor(hours / 12); // 0 or 1
    const currentPeriodStart = new Date(nowDate);
    currentPeriodStart.setUTCHours(currentPeriod * 12, 0, 0, 0);
    currentPeriodStart.setUTCMinutes(0, 0, 0);
    const currentPeriodStartTime = currentPeriodStart.getTime();
    
    const lastCandleDate = new Date(lastCandle.timestamp);
    const lastCandleHours = lastCandleDate.getUTCHours();
    const lastCandlePeriod = Math.floor(lastCandleHours / 12);
    const lastCandlePeriodStart = new Date(lastCandleDate);
    lastCandlePeriodStart.setUTCHours(lastCandlePeriod * 12, 0, 0, 0);
    lastCandlePeriodStart.setUTCMinutes(0, 0, 0);
    const lastCandlePeriodStartTime = lastCandlePeriodStart.getTime();
    
    // Check if last candle is from the current 12h period
    if (lastCandlePeriodStartTime === currentPeriodStartTime) {
      // It's the current period's candle - calculate age from start of period
      const lastCandleAge = now - lastCandlePeriodStartTime;
      return {
        isValid: true,
        lastCandleAge, // Age from start of period
      };
    } else {
      // Last candle is from a previous period
      const periodsOld = Math.floor((currentPeriodStartTime - lastCandlePeriodStartTime) / (12 * 60 * 60 * 1000));
      const daysOld = Math.floor(periodsOld / 2); // 2 periods per day
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
      // Calculate how many candles are missing
      const missingCount = Math.floor((timeDiff - tolerance) / expectedInterval) - 1;
      let actualMissingCount = 0;
      
      for (let j = 1; j <= missingCount; j++) {
        const expectedTimestamp = prev.timestamp + expectedInterval * j;
        if (expectedTimestamp >= startTime && expectedTimestamp <= endTime) {
          const now = Date.now();
          // Only exclude if the period hasn't started yet (future period) or just started (within 1 minute tolerance)
          // If the period has started and it's been more than 1 minute, we should have the candle
          let shouldExclude = false;
          
          if (timeframe === '8h' || timeframe === '12h') {
            const nowDate = new Date(now);
            const hours = nowDate.getUTCHours();
            const periodHours = timeframe === '8h' ? 8 : 12;
            const currentPeriod = Math.floor(hours / periodHours);
            const currentPeriodStartDate = new Date(nowDate);
            currentPeriodStartDate.setUTCHours(currentPeriod * periodHours, 0, 0, 0);
            currentPeriodStartDate.setUTCMinutes(0, 0, 0);
            const currentPeriodStart = currentPeriodStartDate.getTime();
            
            const expectedDate = new Date(expectedTimestamp);
            const expectedHours = expectedDate.getUTCHours();
            const expectedPeriod = Math.floor(expectedHours / periodHours);
            const expectedPeriodStartDate = new Date(expectedDate);
            expectedPeriodStartDate.setUTCHours(expectedPeriod * periodHours, 0, 0, 0);
            expectedPeriodStartDate.setUTCMinutes(0, 0, 0);
            const expectedPeriodStart = expectedPeriodStartDate.getTime();
            
            // Only exclude if it's the current period AND it just started (within 1 minute)
            // If the period has been going for more than 1 minute, we should have the candle
            if (expectedPeriodStart === currentPeriodStart) {
              const timeSincePeriodStart = now - currentPeriodStart;
              shouldExclude = timeSincePeriodStart < 60 * 1000; // 1 minute tolerance
            } else if (expectedPeriodStart > currentPeriodStart) {
              // Future period - exclude it
              shouldExclude = true;
            }
          } else if (timeframe === '1d') {
            const today = new Date(now);
            today.setUTCHours(0, 0, 0, 0);
            const todayStart = today.getTime();
            const expectedDate = new Date(expectedTimestamp);
            expectedDate.setUTCHours(0, 0, 0, 0);
            const expectedDayStart = expectedDate.getTime();
            
            // Only exclude if it's today AND it just started (within 1 minute)
            if (expectedDayStart === todayStart) {
              const timeSinceDayStart = now - todayStart;
              shouldExclude = timeSinceDayStart < 60 * 1000; // 1 minute tolerance
            } else if (expectedDayStart > todayStart) {
              // Future day - exclude it
              shouldExclude = true;
            }
          }
          
          // Add if it's not excluded (i.e., it's a past period or current period that's been going for >1 minute)
          if (!shouldExclude) {
            missingCandles.push({
              expected: expectedTimestamp,
              actual: null,
            });
            actualMissingCount++;
          }
        }
      }
      
      // Only increment gapCount if there are actual missing candles (not just the current period)
      if (actualMissingCount > 0) {
        gapCount++;
      }
    }
  }

  // Check for missing candles at the start
  // Only report missing candles if they're recent (within last 30 days)
  // This prevents false positives when we request data from 2020 but only have data from 2025
  const firstCandle = sortedCandles[0]!;
  const now = Date.now();
  const recentCutoff = now - (30 * 24 * 60 * 60 * 1000); // Last 30 days
  
  // Only check for missing candles at the start if the first candle is recent
  // Don't penalize for missing historical data before our data starts
  if (firstCandle.timestamp > recentCutoff + expectedInterval) {
    const missingAtStart = Math.floor((firstCandle.timestamp - recentCutoff) / expectedInterval);
    // Limit to reasonable number
    const maxMissingToCheck = timeframe === '8h' ? 10 : timeframe === '1d' ? 30 : 20;
    for (let j = 1; j <= Math.min(missingAtStart, maxMissingToCheck); j++) {
      const expectedTimestamp = recentCutoff + expectedInterval * j;
      if (expectedTimestamp < firstCandle.timestamp && expectedTimestamp >= recentCutoff) {
        missingCandles.push({
          expected: expectedTimestamp,
          actual: null,
        });
      }
    }
  }

  // Check for missing candles at the end
  // Only check for missing candles up to the current period (not future periods)
  const lastCandle = sortedCandles[sortedCandles.length - 1]!;
  
  // For 8h candles, calculate the current period start
  // Only flag missing candles if they're from completed periods
  let currentPeriodStart = now;
  if (timeframe === '8h') {
    const nowDate = new Date(now);
    const hours = nowDate.getUTCHours();
    const currentPeriod = Math.floor(hours / 8);
    const currentPeriodStartDate = new Date(nowDate);
    currentPeriodStartDate.setUTCHours(currentPeriod * 8, 0, 0, 0);
    currentPeriodStartDate.setUTCMinutes(0, 0, 0);
    currentPeriodStart = currentPeriodStartDate.getTime();
  } else if (timeframe === '12h') {
    const nowDate = new Date(now);
    const hours = nowDate.getUTCHours();
    const currentPeriod = Math.floor(hours / 12);
    const currentPeriodStartDate = new Date(nowDate);
    currentPeriodStartDate.setUTCHours(currentPeriod * 12, 0, 0, 0);
    currentPeriodStartDate.setUTCMinutes(0, 0, 0);
    currentPeriodStart = currentPeriodStartDate.getTime();
  } else if (timeframe === '1d') {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    currentPeriodStart = today.getTime();
  }
  
  // Check for missing candles at the end
  // Include the current period if it has started and been going for more than 1 minute
  const timeSinceCurrentPeriodStart = now - currentPeriodStart;
  
  // Calculate how many periods we're missing
  const periodsSinceLastCandle = Math.floor((now - lastCandle.timestamp) / expectedInterval);
  
  // We should have candles for all periods that have started and been going for >1 minute
  // Don't count future periods
  const maxMissingToCheck = timeframe === '8h' ? 3 : timeframe === '1d' ? 7 : 10;
  for (let j = 1; j <= Math.min(periodsSinceLastCandle, maxMissingToCheck); j++) {
    const expectedTimestamp = lastCandle.timestamp + expectedInterval * j;
    
    // Check if this is a future period
    if (timeframe === '8h' || timeframe === '12h') {
      const expectedDate = new Date(expectedTimestamp);
      const expectedHours = expectedDate.getUTCHours();
      const periodHours = timeframe === '8h' ? 8 : 12;
      const expectedPeriod = Math.floor(expectedHours / periodHours);
      const expectedPeriodStartDate = new Date(expectedDate);
      expectedPeriodStartDate.setUTCHours(expectedPeriod * periodHours, 0, 0, 0);
      expectedPeriodStartDate.setUTCMinutes(0, 0, 0);
      const expectedPeriodStart = expectedPeriodStartDate.getTime();
      
      // Skip if it's a future period (hasn't started yet)
      if (expectedPeriodStart > currentPeriodStart) {
        continue;
      }
      
      // Skip if it's the current period and it just started (<1 minute)
      if (expectedPeriodStart === currentPeriodStart && timeSinceCurrentPeriodStart < 60 * 1000) {
        continue;
      }
    } else if (timeframe === '1d') {
      const expectedDate = new Date(expectedTimestamp);
      expectedDate.setUTCHours(0, 0, 0, 0);
      const expectedDayStart = expectedDate.getTime();
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      
      // Skip if it's a future day
      if (expectedDayStart > todayStart) {
        continue;
      }
      
      // Skip if it's today and it just started (<1 minute)
      if (expectedDayStart === todayStart && timeSinceCurrentPeriodStart < 60 * 1000) {
        continue;
      }
    }
    
    // Add missing candle if it's within the requested range
    if (expectedTimestamp >= startTime && expectedTimestamp <= endTime) {
      missingCandles.push({
        expected: expectedTimestamp,
        actual: null,
      });
    }
  }

  // Calculate coverage
  // Use actual data range (first to last candle) instead of requested range
  // This prevents false low coverage when we request data from 2020 but only have data from 2025
  const actualStartTime = sortedCandles[0]!.timestamp;
  const actualEndTime = sortedCandles[sortedCandles.length - 1]!.timestamp;
  const expectedCount = Math.floor((actualEndTime - actualStartTime) / expectedInterval) + 1;
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
  } else {
    // Warn if data is getting stale
    // For daily candles: warn if > 24 hours old
    // For 8h/12h candles: only warn if > full period (8h or 12h) - a 5h old 8h candle is normal
    // For hourly/5m candles: warn if > 50% of max age
    const isDailyCandle = timeframe === '1d';
    const isLongPeriodCandle = timeframe === '8h' || timeframe === '12h';
    
    let shouldWarn = false;
    if (isDailyCandle) {
      shouldWarn = freshness.lastCandleAge > 24 * 60 * 60 * 1000; // More than 24 hours old
    } else if (isLongPeriodCandle) {
      // For 8h/12h candles, only warn if we've missed a full period
      shouldWarn = freshness.lastCandleAge > maxAgeMinutes * 60 * 1000; // Full period
    } else {
      shouldWarn = freshness.lastCandleAge > maxAgeMinutes * 60 * 1000 * 0.5; // 50% for short intervals
    }
    
    if (shouldWarn) {
      warnings.push(`Data is getting stale: ${(freshness.lastCandleAge / (60 * 60 * 1000)).toFixed(1)}h old`);
    }
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

/**
 * Detect price anomalies (unusual price moves)
 * Returns true if price move is anomalous (>10% in single period)
 */
export function detectPriceAnomaly(
  candles: PriceCandle[],
  currentIndex: number,
  threshold: number = 0.10 // Default 10% threshold
): { isAnomaly: boolean; priceChange: number; previousPrice: number; currentPrice: number } {
  if (currentIndex < 1 || currentIndex >= candles.length) {
    return {
      isAnomaly: false,
      priceChange: 0,
      previousPrice: 0,
      currentPrice: 0,
    };
  }

  const currentCandle = candles[currentIndex]!;
  const previousCandle = candles[currentIndex - 1]!;
  
  const previousPrice = previousCandle.close;
  const currentPrice = currentCandle.close;
  
  if (previousPrice <= 0) {
    return {
      isAnomaly: false,
      priceChange: 0,
      previousPrice,
      currentPrice,
    };
  }

  const priceChange = Math.abs((currentPrice - previousPrice) / previousPrice);
  
  return {
    isAnomaly: priceChange > threshold,
    priceChange,
    previousPrice,
    currentPrice,
  };
}

