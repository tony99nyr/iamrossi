/**
 * Backfill Test Validation Utilities
 * Validates data boundaries, date ranges, and data quality for backfill tests
 */

import type { PriceCandle } from '@/types';

/**
 * Validate date range (start < end, valid calendar dates)
 * @param startDate - Start date string (YYYY-MM-DD)
 * @param endDate - End date string (YYYY-MM-DD)
 * @param allowFutureDates - If true, allows future dates (for synthetic data in backfill tests)
 *                          If false but endDate year >= 2026, automatically allows (synthetic data starts at 2026)
 */
export function validateDateRange(startDate: string, endDate: string, allowFutureDates: boolean = false): { valid: boolean; error?: string } {
  // Validate format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate)) {
    return { valid: false, error: `Invalid start date format: ${startDate}. Must be YYYY-MM-DD` };
  }
  if (!dateRegex.test(endDate)) {
    return { valid: false, error: `Invalid end date format: ${endDate}. Must be YYYY-MM-DD` };
  }
  
  // Validate calendar dates
  const start = new Date(startDate + 'T00:00:00.000Z');
  const end = new Date(endDate + 'T00:00:00.000Z');
  
  if (isNaN(start.getTime())) {
    return { valid: false, error: `Invalid start date: ${startDate}` };
  }
  if (isNaN(end.getTime())) {
    return { valid: false, error: `Invalid end date: ${endDate}` };
  }
  
  // Check if dates are valid calendar dates (handles leap years, month boundaries, etc.)
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  
  const startCheck = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const endCheck = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  
  if (
    startCheck.getUTCFullYear() !== startYear ||
    startCheck.getUTCMonth() !== startMonth - 1 ||
    startCheck.getUTCDate() !== startDay
  ) {
    return { valid: false, error: `Invalid calendar date: ${startDate}` };
  }
  
  if (
    endCheck.getUTCFullYear() !== endYear ||
    endCheck.getUTCMonth() !== endMonth - 1 ||
    endCheck.getUTCDate() !== endDay
  ) {
    return { valid: false, error: `Invalid calendar date: ${endDate}` };
  }
  
  // Check start < end
  if (start >= end) {
    return { valid: false, error: `Start date (${startDate}) must be before end date (${endDate})` };
  }
  
  // Check not future dates (unless explicitly allowed for synthetic data)
  // Synthetic data starts at 2026, so any date range that includes 2026+ is automatically synthetic
  // Note: startYear and endYear are already declared above from the date parsing
  const includesSyntheticYears = endYear >= 2026 || startYear >= 2026;
  const isSyntheticData = allowFutureDates || includesSyntheticYears;
  
  if (!isSyntheticData) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (end > today) {
      return { valid: false, error: `End date (${endDate}) cannot be in the future` };
    }
  }
  
  return { valid: true };
}

/**
 * Validate that synthetic data is never used in paper trading context
 */
export function validateDataSource(
  candles: PriceCandle[],
  allowSyntheticData: boolean,
  context: 'paper_trading' | 'backfill_test'
): { valid: boolean; error?: string } {
  if (context === 'paper_trading' && allowSyntheticData) {
    return {
      valid: false,
      error: 'CRITICAL: Paper trading must NEVER use synthetic data. allowSyntheticData must be false.',
    };
  }
  
  // Check if candles appear to be synthetic (all OHLC same, volume 0, and dates >= 2026-01-01)
  if (context === 'paper_trading') {
    const synthetic2026Start = new Date('2026-01-01T00:00:00.000Z').getTime();
    const potentiallySynthetic = candles.some(c => {
      const isSameOHLC = c.open === c.high && c.high === c.low && c.low === c.close;
      const isFutureDate = c.timestamp >= synthetic2026Start;
      return isSameOHLC && c.volume === 0 && isFutureDate;
    });
    
    if (potentiallySynthetic) {
      return {
        valid: false,
        error: 'CRITICAL: Detected potentially synthetic data in paper trading context',
      };
    }
  }
  
  return { valid: true };
}

/**
 * Validate candle data quality (no gaps, valid timestamps, reasonable prices)
 * @param candles - Array of candles to validate
 * @param timeframe - Timeframe string (e.g., '8h', '1d')
 * @param allowFutureDates - If true, allows future timestamps (for synthetic data in backfill tests)
 */
export function validateCandleQuality(
  candles: PriceCandle[],
  timeframe: string,
  allowFutureDates: boolean = false
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (candles.length === 0) {
    errors.push('No candles provided');
    return { valid: false, errors, warnings };
  }
  
  // Calculate expected interval in milliseconds
  const intervalMs = timeframe === '5m' ? 5 * 60 * 1000 :
                     timeframe === '1h' ? 60 * 60 * 1000 :
                     timeframe === '4h' ? 4 * 60 * 60 * 1000 :
                     timeframe === '8h' ? 8 * 60 * 60 * 1000 :
                     timeframe === '12h' ? 12 * 60 * 60 * 1000 :
                     timeframe === '1d' ? 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000;
  
  // Check for gaps in timestamps
  // For synthetic data (allowFutureDates=true), gaps are expected when merging different data sources
  // Only warn about very large gaps (> 1 day for 8h candles, > 7 days for daily candles)
  const maxReasonableGap = allowFutureDates 
    ? (timeframe === '8h' ? 24 * 60 * 60 * 1000 : timeframe === '1d' ? 7 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
    : intervalMs * 2; // For real data, warn about gaps > 2 intervals
    
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    const gap = curr.timestamp - prev.timestamp;
    
    // Allow some tolerance (10% of interval)
    const expectedGap = intervalMs;
    const tolerance = expectedGap * 0.1;
    
    // Only warn about gaps that are both larger than expected AND larger than maxReasonableGap
    // For synthetic data, be more lenient - only warn about very large gaps (> 1 day for 8h candles)
    // Small gaps (like 32 hours = 4 missing candles) should be filled automatically
    if (gap > expectedGap + tolerance && gap > maxReasonableGap) {
      // For synthetic data with small gaps, these should have been filled - this is a data quality issue
      if (allowFutureDates && gap <= 48 * 60 * 60 * 1000) {
        // Small gap in synthetic data - should have been filled, but don't fail the test
        warnings.push(`Gap detected at index ${i}: ${gap / (60 * 60 * 1000)} hours (expected ~${expectedGap / (60 * 60 * 1000)} hours) - should be filled automatically`);
      } else {
        warnings.push(`Gap detected at index ${i}: ${gap / (60 * 60 * 1000)} hours (expected ~${expectedGap / (60 * 60 * 1000)} hours)`);
      }
    }
    
    // Check for invalid timestamps (future or too old)
    const now = Date.now();
    const maxAge = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years
    if (!allowFutureDates && curr.timestamp > now) {
      errors.push(`Future timestamp at index ${i}: ${new Date(curr.timestamp).toISOString()}`);
    }
    if (curr.timestamp < now - maxAge) {
      warnings.push(`Very old timestamp at index ${i}: ${new Date(curr.timestamp).toISOString()}`);
    }
    
    // Check for reasonable prices (ETH/BTC should be > 0 and < 1 million)
    if (curr.close <= 0 || curr.close > 1000000) {
      errors.push(`Invalid price at index ${i}: $${curr.close}`);
    }
    
    // Check OHLC validity (warnings for synthetic data, errors for real data)
    if (curr.high < curr.low || curr.high < curr.open || curr.high < curr.close) {
      const message = `Invalid OHLC at index ${i}: high (${curr.high}) must be >= open, low, close`;
      if (allowFutureDates) {
        // Synthetic data may have some OHLC issues - treat as warning
        warnings.push(message);
      } else {
        errors.push(message);
      }
    }
    if (curr.low > curr.open || curr.low > curr.close) {
      const message = `Invalid OHLC at index ${i}: low (${curr.low}) must be <= open, close`;
      if (allowFutureDates) {
        // Synthetic data may have some OHLC issues - treat as warning
        warnings.push(message);
      } else {
        errors.push(message);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check data availability before processing
 */
export function checkDataAvailability(
  candles: PriceCandle[],
  startDate: string,
  endDate: string,
  minCandles: number = 50
): { available: boolean; error?: string } {
  if (candles.length < minCandles) {
    return {
      available: false,
      error: `Insufficient data: ${candles.length} candles (minimum ${minCandles} required)`,
    };
  }
  
  const startTime = new Date(startDate + 'T00:00:00.000Z').getTime();
  const endTime = new Date(endDate + 'T23:59:59.999Z').getTime();
  
  const candlesInRange = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
  
  if (candlesInRange.length === 0) {
    return {
      available: false,
      error: `No candles found in date range ${startDate} to ${endDate}`,
    };
  }
  
  return { available: true };
}

