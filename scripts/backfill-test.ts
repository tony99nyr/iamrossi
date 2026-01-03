#!/usr/bin/env npx tsx
/**
 * Backfill test for specific date ranges
 * Tests the new smoothed regime detection method
 * Supports both historical data and synthetic 2026 data
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal, clearRegimeHistory, resetDrawdownTracking } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearIndicatorCache, detectMarketRegimeCached } from '../src/lib/market-regime-detector-cached';
import { executeTrade } from '../src/lib/trade-executor';
import { updateStopLoss } from '../src/lib/atr-stop-loss';
// ATR is now pre-calculated, so we don't need to import getATRValue
import { disconnectRedis } from '../src/lib/kv';
import { getAssetConfig, getStrategyConfigKey, type TradingAsset } from '../src/lib/asset-config';
import { analyzeCorrelation, getCorrelationContext } from '../src/lib/correlation-analysis';
import { fetchAlignedCandles } from '../src/lib/btc-price-service';
import type { PriceCandle, Portfolio, Trade, PortfolioSnapshot } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { StopLossConfig, OpenPosition } from '../src/lib/atr-stop-loss';
import { validateDateRange, validateDataSource, validateCandleQuality, checkDataAvailability } from '../src/lib/backfill-validation';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';

interface PeriodAnalysis {
  timestamp: number;
  price: number;
  regime: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  signal: number;
  trade: Trade | null;
}

interface BacktestResult {
  startDate: string;
  endDate: string;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  winTrades: number;
  lossTrades: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  finalPortfolio: Portfolio;
  periods: PeriodAnalysis[];
  // Buy and hold comparisons
  usdcHold: {
    finalValue: number;
    return: number;
    returnPct: number;
  };
  ethHold: {
    finalValue: number;
    return: number;
    returnPct: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
  };
}

// Configurable timeframe - default to 8h
const TIMEFRAME = (process.env.TIMEFRAME as '8h' | '12h' | '1d') || '8h';

const DEFAULT_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Hybrid',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.35, params: { period: 20 } },
      { type: 'ema', weight: 0.35, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 9, slowPeriod: 19, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.1, params: { period: 14 } },
    ],
    buyThreshold: 0.41,  // Optimized - between conservative and trend
    sellThreshold: -0.45,  // Hold through dips
    maxPositionPct: 0.90,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Bearish-Recovery',
    timeframe: TIMEFRAME,
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.65,  // Lower - catch recovery signals
    sellThreshold: -0.25,
    maxPositionPct: 0.3,  // Larger positions for recovery
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.22,  // Lower - more flexible
  momentumConfirmationThreshold: 0.26,  // Slightly lower
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 1,  // Faster switching
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.019,  // Higher tolerance
  circuitBreakerWinRate: 0.18,  // Slightly lower
  circuitBreakerLookback: 12,
  whipsawDetectionPeriods: 5,
  whipsawMaxChanges: 3,
  // New ML-optimizable parameters (disabled by default to maintain baseline)
  bullMarketParticipation: {
    enabled: false, // Disabled by default - maintain baseline
    exitThresholdMultiplier: 1.0, // 1.0 = no change, <1.0 = stay in longer
    positionSizeMultiplier: 1.0, // 1.0 = no change, >1.0 = larger positions
    trendStrengthThreshold: 0.6, // Minimum confidence to apply bull market settings
    useTrailingStops: false, // Use trailing stops in bull markets
    trailingStopATRMultiplier: 2.0, // ATR multiplier for trailing stops
  },
  regimeTransitionFilter: {
    enabled: false, // Disabled by default - maintain baseline
    transitionPeriods: 3, // Periods to be cautious during transitions
    positionSizeReduction: 0.5, // Reduce to 50% of normal during transitions
    minConfidenceDuringTransition: 0.3, // Minimum confidence required
    stayOutDuringTransition: false, // Completely stay out during transitions
  },
  adaptivePositionSizing: {
    enabled: false, // Disabled by default - maintain baseline
    highFrequencySwitchDetection: true, // Detect high-frequency switches
    switchFrequencyPeriods: 5, // Periods to check for switches
    maxSwitchesAllowed: 3, // Max switches before reducing position size
    uncertainPeriodMultiplier: 0.5, // Reduce to 50% during uncertain periods
    lowConfidenceMultiplier: 0.7, // Reduce to 70% when confidence is low
    confidenceThreshold: 0.4, // Confidence threshold below which to reduce sizing
    highFrequencySwitchPositionMultiplier: 0.5, // 0.0 = stay out, 1.0 = no reduction (default: 0.5 = 50% reduction)
  },
  lowVolatilityFilter: {
    enabled: false, // Disabled by default - maintain baseline
    minVolatilityThreshold: 0.01, // Minimum 1% daily volatility to allow trading
    lookbackPeriods: 20, // Periods to calculate volatility
    signalStrengthMultiplier: 1.5, // 1.0 = no change, >1.0 = stronger signals required (default: 1.5)
    volatilitySqueezePositionMultiplier: 0.5, // 0.0 = stay out, 1.0 = no reduction (default: 0.5 = 50% reduction)
  },
};

/**
 * Generate a short config name from strategy parameters
 * Format: B{buyThresh}-S{sellThresh}|Be{buyThresh}-S{sellThresh}|R{regimeConf}|K{kelly}|A{atr}|HF{hfMultiplier}|VS{volSqueezeMultiplier}|SS{signalStrengthMultiplier}
 * Example: B0.41-S0.45|Be0.65-S0.25|R0.22|K0.25|A2.0|HF0.5|VS0.5|SS1.5
 */
function getConfigShortName(config: EnhancedAdaptiveStrategyConfig): string {
  const bullBuy = config.bullishStrategy.buyThreshold.toFixed(2);
  const bullSell = Math.abs(config.bullishStrategy.sellThreshold).toFixed(2);
  const bearBuy = config.bearishStrategy.buyThreshold.toFixed(2);
  const bearSell = Math.abs(config.bearishStrategy.sellThreshold).toFixed(2);
  const regime = (config.regimeConfidenceThreshold ?? 0.22).toFixed(2);
  const kelly = config.kellyCriterion?.fractionalMultiplier?.toFixed(2) ?? '0.25';
  const atr = config.stopLoss?.atrMultiplier?.toFixed(1) ?? '2.0';
  const hfMultiplier = config.adaptivePositionSizing?.highFrequencySwitchPositionMultiplier?.toFixed(2) ?? '0.5';
  const volSqueezeMultiplier = config.lowVolatilityFilter?.volatilitySqueezePositionMultiplier?.toFixed(2) ?? '0.5';
  const signalStrengthMultiplier = config.lowVolatilityFilter?.signalStrengthMultiplier?.toFixed(2) ?? '1.5';
  
  return `B${bullBuy}-S${bullSell}|Be${bearBuy}-S${bearSell}|R${regime}|K${kelly}|A${atr}|HF${hfMultiplier}|VS${volSqueezeMultiplier}|SS${signalStrengthMultiplier}`;
}

// Trade execution is now handled by unified executor in src/lib/trade-executor.ts

/**
 * Load synthetic data for a given year, asset, and timeframe
 */
export function loadSyntheticData(year: number, asset: TradingAsset = 'eth', timeframe: string = '8h'): PriceCandle[] {
  const assetConfig = getAssetConfig(asset);
  const symbol = assetConfig.symbol.toLowerCase();
  const syntheticDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const assetDir = path.join(process.cwd(), 'data', 'historical-prices', symbol, timeframe);
  
  // Try multiple file paths in order of preference
  // First check for divergence files (for correlation testing), then regular files
  const possiblePaths = [
    // Divergence files (preferred for correlation testing)
    path.join(syntheticDir, `${symbol}_${timeframe}_${year}-01-01_${year}-12-31_divergence.json.gz`),
    path.join(syntheticDir, `${symbol}_${timeframe}_${year}-01-01_${year}-12-30_divergence.json.gz`),
    // Regular full year synthetic data
    path.join(syntheticDir, `${symbol}_${timeframe}_${year}-01-01_${year}-12-31.json.gz`),
    path.join(syntheticDir, `${symbol}_${timeframe}_${year}-01-01_${year}-12-30.json.gz`),
  ];
  
  // Check for files in synthetic dir
  let filepath: string | null = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      filepath = testPath;
      if (testPath.includes('divergence')) {
        // Removed verbose divergence data log
      }
      break;
    }
  }
  
  // If not found, try to find any file matching the year and symbol in synthetic dir
  if (!filepath && fs.existsSync(syntheticDir)) {
    const files = fs.readdirSync(syntheticDir);
    // Prefer divergence files for correlation testing, but fall back to regular files
    const divergenceFile = files.find(f => 
      f.includes(`${symbol}_${timeframe}`) && 
      (f.includes(`_${year}-`) || f.includes(`-${year}-`) || (year === 2028 && f.includes('2027-10'))) &&
      f.includes('divergence') &&
      f.endsWith('.json.gz')
    );
    const regularFile = files.find(f => 
      f.includes(`${symbol}_${timeframe}`) && 
      (f.includes(`_${year}-`) || f.includes(`-${year}-`) || (year === 2028 && f.includes('2027-10'))) &&
      !f.includes('divergence') &&
      f.endsWith('.json.gz')
    );
    if (divergenceFile) {
      filepath = path.join(syntheticDir, divergenceFile);
      // Removed verbose divergence data log
    } else if (regularFile) {
      filepath = path.join(syntheticDir, regularFile);
    }
  }
  
  // CRITICAL: Do NOT fall back to asset-specific directory (ethusdt/8h/, btcusdt/8h/)
  // Those directories contain REAL historical data, not synthetic data
  // Synthetic data MUST ONLY come from the synthetic/ directory
  // This ensures backfill tests use synthetic data and paper trading uses real data
  
  if (!filepath || !fs.existsSync(filepath)) {
    throw new Error(`Synthetic ${timeframe} data not found for ${assetConfig.displayName} (${symbol}) ${year} in synthetic/ directory. Run 'npx tsx scripts/generate-btc-synthetic-data.ts ${year} ${timeframe}' first.`);
  }
  
  const compressed = fs.readFileSync(filepath);
  const decompressed = gunzipSync(compressed);
  const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
  
  // Removed verbose candle loading log - not useful for debugging
  return candles;
}

/**
 * Apply timeout to backtest execution
 */
async function withBacktestTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5 * 60 * 1000 // 5 minutes default
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Backtest timed out after ${timeoutMs / 1000} seconds`)), timeoutMs);
    }),
  ]);
}

export async function runBacktest(
  startDate: string,
  endDate: string,
  isSynthetic: boolean = false,
  configOverride?: EnhancedAdaptiveStrategyConfig,
  kellyMultiplier?: number,
  atrMultiplier?: number,
  asset: TradingAsset = 'eth',
  timeframe?: string,
  useCorrelation: boolean = false
): Promise<BacktestResult> {
  // Wrap entire backtest in timeout
  return withBacktestTimeout(
    runBacktestInternal(startDate, endDate, isSynthetic, configOverride, kellyMultiplier, atrMultiplier, asset, timeframe, useCorrelation),
    5 * 60 * 1000 // 5 minutes timeout
  );
}

async function runBacktestInternal(
  startDate: string,
  endDate: string,
  isSynthetic: boolean = false,
  configOverride?: EnhancedAdaptiveStrategyConfig,
  kellyMultiplier?: number,
  atrMultiplier?: number,
  asset: TradingAsset = 'eth',
  timeframe?: string,
  useCorrelation: boolean = false
): Promise<BacktestResult> {
  // Validate date range first (allow future dates for synthetic data)
  const dateValidation = validateDateRange(startDate, endDate, isSynthetic);
  if (!dateValidation.valid) {
    throw new Error(`Invalid date range: ${dateValidation.error}`);
  }
  
  const assetConfig = getAssetConfig(asset);
  const symbol = assetConfig.symbol;
  const effectiveTimeframe = timeframe || process.env.TIMEFRAME || assetConfig.defaultTimeframe;
  // Parse year directly from date string to avoid timezone issues
  // Date strings like '2026-01-01' are parsed as UTC, which can cause getFullYear() to return wrong year in some timezones
  const startYear = parseInt(startDate.split('-')[0]!, 10);
  const endYear = parseInt(endDate.split('-')[0]!, 10);
  const config = configOverride || DEFAULT_CONFIG;
  const configShortName = getConfigShortName(config);
  const configKey = getStrategyConfigKey(asset);
  const configSource = configOverride ? 'custom' : 'default';
  
  // Format year label for multi-year periods
  const yearLabel = startYear === endYear 
    ? (isSynthetic ? ` (Synthetic ${startYear})` : ` (${startYear})`)
    : (isSynthetic ? ` (Synthetic ${startYear}-${endYear})` : ` (${startYear}-${endYear})`);
  
  console.log(`\n📊 Running backtest: ${startDate} to ${endDate}${yearLabel} - ${assetConfig.displayName} (${effectiveTimeframe})`);
  console.log(`   Config: ${configKey} [${configSource}] - ${configShortName}`);
  
  // Clear caches
  clearRegimeHistory();
  clearIndicatorCache();
  
  let candles: PriceCandle[];
  
  if (isSynthetic) {
    // For multi-year periods, load and combine multiple years
    // Use already-calculated startYear/endYear from above (parsed from date string to avoid timezone issues)
    
    if (startYear === endYear) {
      // Single year
      try {
        candles = loadSyntheticData(startYear, asset, effectiveTimeframe);
      } catch (error) {
        // If synthetic data doesn't exist for this asset/year, throw a more helpful error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Synthetic') && errorMessage.includes('not found')) {
          throw new Error(`Synthetic data not available for ${asset.toUpperCase()} ${startYear}. This period should be filtered out before testing.`);
        }
        throw error;
      }
    } else {
      // Multi-year: load and combine
      candles = [];
      for (let year = startYear; year <= endYear; year++) {
        try {
          const yearCandles = loadSyntheticData(year, asset, effectiveTimeframe);
          candles.push(...yearCandles);
        } catch (error) {
          // If synthetic data doesn't exist, skip this year (might be expected for some assets)
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('Synthetic') && errorMessage.includes('not found')) {
            // This is expected for some assets/years - skip silently
            continue;
          }
          console.warn(`⚠️  Could not load synthetic data for ${year}: ${error}`);
        }
      }
      // Sort by timestamp and deduplicate
      candles.sort((a, b) => a.timestamp - b.timestamp);
      const { deduplicateCandles, fillGapsInCandles, fixOHLCRelationships } = await import('../src/lib/historical-file-utils');
      candles = deduplicateCandles(candles);
      
      // Fix OHLC relationships before gap filling
      candles = fixOHLCRelationships(candles);
      
      // Fill gaps in synthetic data (can have gaps between years or within years)
      // For synthetic data, don't fetch from API (it's synthetic, so interpolate)
      const beforeFill = candles.length;
      candles = await fillGapsInCandles(candles, effectiveTimeframe, symbol, false);
      const afterFill = candles.length;
      if (afterFill > beforeFill) {
        // Removed verbose gap-filling log (gaps are filled automatically, no need to log every time)
      }
    }
    
    // DON'T filter to requested date range - we need warmup candles for indicators
    // Instead, we'll use startIndex in the main loop to start trading from the right point
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    
    // Filter only the END of the range (keep all warmup candles at the start)
    candles = candles.filter(c => c.timestamp <= endTime);
    
    // Find how many candles are within the test period
    const candlesInPeriod = candles.filter(c => c.timestamp >= startTime).length;
    
    if (candles.length < 50) {
      throw new Error(`Not enough synthetic candles: ${candles.length}. Need at least 50 for indicators.`);
    }
    
    // Removed verbose candle loading log - not useful for debugging
  } else {
    // For multi-year historical periods, we need to handle them specially
    // Use already-calculated startYear/endYear from above (parsed from date string to avoid timezone issues)
    
    if (startYear === endYear && startYear === 2025) {
      // Single year 2025 - use existing logic
      // BTC doesn't have 2025 historical data (only ETH does)
      if (asset === 'btc') {
        console.warn(`⚠️ No candles in requested range (${startDate} to ${endDate})`);
        // Return empty array - will be caught by availability check
        candles = [];
      } else {
        const historyStartDate = new Date(startDate + 'T00:00:00.000Z');
        historyStartDate.setUTCDate(historyStartDate.getUTCDate() - 200); // Get 200 days before for indicators
        const historyStart = historyStartDate.toISOString().split('T')[0];
        
        // Use available historical data (starts at 2025-01-01)
        const minHistoryDate = '2025-01-01';
        const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
        
        candles = await fetchPriceCandles(symbol, effectiveTimeframe, actualHistoryStart, endDate, undefined, true, true); // skipAPIFetch=true, allowSyntheticData=true for backfill tests
        
        // Filter to requested date range (use UTC to match checkDataAvailability)
        const startTime = new Date(startDate + 'T00:00:00.000Z').getTime();
        const endTime = new Date(endDate + 'T23:59:59.999Z').getTime();
        candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
        
        // Fill gaps after filtering (in case filtering created gaps)
        const { fillGapsInCandles: fillGapsAfterFilter } = await import('../src/lib/historical-file-utils');
        const beforeFill = candles.length;
        candles = await fillGapsAfterFilter(candles, effectiveTimeframe, symbol, true); // isHistoricalData=true for 2025
        const afterFill = candles.length;
        if (afterFill > beforeFill) {
          console.log(`🔧 Filled ${afterFill - beforeFill} missing candles after filtering`);
        }
      }
      
      // Removed verbose candle loading log - not useful for debugging
    } else {
      // Multi-year: combine historical 2025 with synthetic 2026/2027
      candles = [];
      
      // Load 2025 historical (only for ETH - BTC doesn't have 2025 historical data)
      if (startYear <= 2025 && endYear >= 2025 && asset === 'eth') {
        const history2025 = await fetchPriceCandles(symbol, effectiveTimeframe, '2025-01-01', '2025-12-31', undefined, true, true); // skipAPIFetch=true, allowSyntheticData=true for backfill tests
        candles.push(...history2025);
      }
      
      // Load synthetic years
      for (let year = Math.max(2026, startYear); year <= endYear; year++) {
        try {
          const yearCandles = loadSyntheticData(year, asset, effectiveTimeframe);
          candles.push(...yearCandles);
        } catch (error) {
          console.warn(`⚠️  Could not load synthetic data for ${year}: ${error}`);
        }
      }
      
      // Sort by timestamp and deduplicate
      candles.sort((a, b) => a.timestamp - b.timestamp);
      const { deduplicateCandles, fillGapsInCandles, fixOHLCRelationships } = await import('../src/lib/historical-file-utils');
      candles = deduplicateCandles(candles);
      
      // Fix OHLC relationships before gap filling
      const beforeOHLCFix = candles.length;
      candles = fixOHLCRelationships(candles);
      const afterOHLCFix = candles.length;
      if (afterOHLCFix !== beforeOHLCFix) {
        console.log(`🔧 Fixed OHLC relationships in ${beforeOHLCFix} candles`);
      }
      
      // Fill gaps at year boundaries and within data (e.g., between 2025 and 2026, or gaps in historical data)
      // Try to fetch from API for historical gaps, interpolate for future/synthetic gaps
      const isHistoricalData = endYear <= new Date().getFullYear();
      const beforeFill = candles.length;
      candles = await fillGapsInCandles(candles, effectiveTimeframe, symbol, isHistoricalData && !isSynthetic);
      const afterFill = candles.length;
      if (afterFill > beforeFill) {
        // Removed verbose gap-filling log (gaps are filled automatically, no need to log every time)
      }
      
      // Filter to requested date range (use UTC to match checkDataAvailability)
      const startTime = new Date(startDate + 'T00:00:00.000Z').getTime();
      const endTime = new Date(endDate + 'T23:59:59.999Z').getTime();
      candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
      
      // Fill gaps again after filtering (in case filtering removed some candles and created new gaps)
      const { fillGapsInCandles: fillGapsAgain } = await import('../src/lib/historical-file-utils');
      const beforeRefill = candles.length;
      candles = await fillGapsInCandles(candles, effectiveTimeframe, symbol, isHistoricalData && !isSynthetic);
      const afterRefill = candles.length;
      if (afterRefill > beforeRefill) {
        // Removed verbose gap-filling log (gaps are filled automatically, no need to log every time)
      }
      
      // Removed verbose candle loading log - not useful for debugging
    }
  }
  
  // Validate data availability
  const availabilityCheck = checkDataAvailability(candles, startDate, endDate, 50);
  if (!availabilityCheck.available) {
    throw new Error(`Data availability check failed: ${availabilityCheck.error}`);
  }
  
  // Validate data source (ensure synthetic data is only used in backfill tests, never in paper trading)
  const dataSourceValidation = validateDataSource(candles, isSynthetic, 'backfill_test');
  if (!dataSourceValidation.valid) {
    throw new Error(`Data source validation failed: ${dataSourceValidation.error}`);
  }
  
  // Fix OHLC relationships before validation (in case they weren't fixed during loading)
  const { fixOHLCRelationships } = await import('../src/lib/historical-file-utils');
  candles = fixOHLCRelationships(candles);
  
  // Fill gaps one final time before validation to ensure all gaps are filled
  const { fillGapsInCandles: fillGapsFinal } = await import('../src/lib/historical-file-utils');
  candles = await fillGapsFinal(candles, effectiveTimeframe, symbol, !isSynthetic);
  
  // Validate candle quality (allow future dates if synthetic data is present or if endDate is in the future)
  // Check if candles contain future dates (for indicator warmup data that extends beyond test period)
  const hasFutureDates = candles.some(c => c.timestamp > Date.now());
  const allowFutureDates = isSynthetic || hasFutureDates || parseInt(endDate.split('-')[0]!, 10) > new Date().getFullYear();
  const qualityValidation = validateCandleQuality(candles, effectiveTimeframe, allowFutureDates);
  if (!qualityValidation.valid) {
    console.error('Candle quality errors:', qualityValidation.errors);
    throw new Error(`Candle quality validation failed: ${qualityValidation.errors.join(', ')}`);
  }
  if (qualityValidation.warnings.length > 0) {
    console.warn('Candle quality warnings:', qualityValidation.warnings);
  }
  
  if (candles.length < 50) {
    throw new Error(`Not enough candles loaded: ${candles.length}. Need at least 50 for indicators.`);
  }
  
  // Calculate correlation context if enabled
  let correlationContextMap: Map<number, { signal: number; riskLevel: 'low' | 'medium' | 'high'; context: string }> = new Map();
  
  if (useCorrelation) {
    try {
      const otherAsset = asset === 'eth' ? 'btc' : 'eth';
      const otherAssetConfig = getAssetConfig(otherAsset);
      const otherSymbol = otherAssetConfig.symbol;
      
      // Load other asset's candles
      let otherCandles: PriceCandle[];
      if (isSynthetic) {
        // Use the same year range as the main asset (already calculated above)
        otherCandles = [];
        for (let year = startYear; year <= endYear; year++) {
          try {
            const yearCandles = loadSyntheticData(year, otherAsset, effectiveTimeframe);
            otherCandles.push(...yearCandles);
          } catch (error) {
            // Only warn if the year is actually in the requested range
            // This prevents warnings for years that aren't needed
            if (year >= startYear && year <= endYear) {
              console.warn(`⚠️  Could not load ${otherAsset} synthetic data for ${year}: ${error}`);
            }
          }
        }
        otherCandles.sort((a, b) => a.timestamp - b.timestamp);
      } else {
        // For real data, try to fetch aligned candles
        const aligned = await fetchAlignedCandles(candles, effectiveTimeframe);
        otherCandles = asset === 'eth' ? aligned.btc : aligned.eth;
      }
      
      // OPTIMIZATION: Align candles by timestamp using Map for O(1) lookups
      // Use tolerance window for alignment (within timeframe interval) to handle slight timestamp differences
      const alignedCandles: { eth: PriceCandle[]; btc: PriceCandle[] } = { eth: [], btc: [] };
      const candleMap = new Map<number, PriceCandle>();
      candles.forEach(c => candleMap.set(c.timestamp, c));
      
      // Calculate tolerance window (half the timeframe interval)
      const intervalMs = effectiveTimeframe === '5m' ? 5 * 60 * 1000 :
                         effectiveTimeframe === '1h' ? 60 * 60 * 1000 :
                         effectiveTimeframe === '4h' ? 4 * 60 * 60 * 1000 :
                         effectiveTimeframe === '8h' ? 8 * 60 * 60 * 1000 :
                         effectiveTimeframe === '12h' ? 12 * 60 * 60 * 1000 :
                         effectiveTimeframe === '1d' ? 24 * 60 * 60 * 1000 :
                         8 * 60 * 60 * 1000; // Default to 8h
      const tolerance = intervalMs / 2; // Allow alignment within half the interval
      
      // OPTIMIZATION: Create reverse map for faster timestamp-to-index lookup
      const timestampToIndexMap = new Map<number, number>();
      candles.forEach((c, idx) => timestampToIndexMap.set(c.timestamp, idx));
      
      // Sort other candles by timestamp for efficient matching
      const sortedOtherCandles = [...otherCandles].sort((a, b) => a.timestamp - b.timestamp);
      
      for (const otherCandle of sortedOtherCandles) {
        // Try exact match first
        let matchingCandle = candleMap.get(otherCandle.timestamp);
        
        // If no exact match, try to find closest candle within tolerance
        if (!matchingCandle) {
          let closestCandle: PriceCandle | null = null;
          let closestDiff = Infinity;
          
          for (const [timestamp, candle] of candleMap.entries()) {
            const diff = Math.abs(timestamp - otherCandle.timestamp);
            if (diff <= tolerance && diff < closestDiff) {
              closestDiff = diff;
              closestCandle = candle;
            }
          }
          
          if (closestCandle) {
            matchingCandle = closestCandle;
          }
        }
        
        if (matchingCandle) {
          if (asset === 'eth') {
            alignedCandles.eth.push(matchingCandle);
            alignedCandles.btc.push(otherCandle);
          } else {
            alignedCandles.eth.push(otherCandle);
            alignedCandles.btc.push(matchingCandle);
          }
        }
      }
      
      if (alignedCandles.eth.length >= 30 && alignedCandles.btc.length >= 30) {
        // OPTIMIZATION: Calculate rolling correlation in batch, use Map for index lookup
        for (let i = 30; i < alignedCandles.eth.length; i++) {
          const ethWindow = alignedCandles.eth.slice(Math.max(0, i - 30), i + 1);
          const btcWindow = alignedCandles.btc.slice(Math.max(0, i - 30), i + 1);
          
          if (ethWindow.length === btcWindow.length && ethWindow.length >= 30) {
            const correlationAnalysis = await analyzeCorrelation(ethWindow, btcWindow, 30, false); // Disable cache for backfill tests
            const context = getCorrelationContext(correlationAnalysis);
            
            // OPTIMIZATION: Use Map lookup instead of findIndex (O(1) vs O(n))
            const timestamp = alignedCandles.eth[i]!.timestamp;
            const originalIndex = timestampToIndexMap.get(timestamp);
            
            if (originalIndex !== undefined && originalIndex >= 0) {
              // For BTC, reverse the signal perspective
              if (asset === 'btc') {
                correlationContextMap.set(originalIndex, {
                  signal: -context.signal,
                  riskLevel: context.riskLevel,
                  context: context.context,
                });
              } else {
                correlationContextMap.set(originalIndex, context);
              }
            }
          }
        }
        // Removed verbose correlation context log (calculated once per backtest, not per candle)
      } else {
        // Provide more helpful warning message
        const mainAssetCount = asset === 'eth' ? alignedCandles.eth.length : alignedCandles.btc.length;
        const otherAssetCount = asset === 'eth' ? alignedCandles.btc.length : alignedCandles.eth.length;
        console.warn(`⚠️  Not enough aligned candles for correlation (${mainAssetCount} ${asset.toUpperCase()} + ${otherAssetCount} ${otherAsset.toUpperCase()} aligned, need 30+ each)`);
        console.warn(`   This may occur when using divergence data for one asset but not the other, or when timestamps don't align.`);
        console.warn(`   Correlation will be skipped for this backtest.`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not calculate correlation: ${error}`);
    }
  }
  
  // Config already set above for logging (line 217)
  // Find start index (need at least 50 candles for indicators)
  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  if (startIndex < 50) startIndex = 50;
  
  // Initialize portfolio
  const portfolio: Portfolio = {
    usdcBalance: config.bullishStrategy.initialCapital,
    ethBalance: 0,
    totalValue: config.bullishStrategy.initialCapital,
    initialCapital: config.bullishStrategy.initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };
  
  const trades: Trade[] = [];
  const openPositions: OpenPosition[] = [];
  const periods: PeriodAnalysis[] = [];
  
  // Use provided multipliers or defaults (baseline configuration)
  const effectiveKellyMultiplier = kellyMultiplier ?? 0.25;
  const effectiveATRMultiplier = atrMultiplier ?? 2.0; // Baseline (2.0x ATR)
  
  // Create stop loss config with provided multiplier
  const effectiveStopLossConfig: StopLossConfig = {
    enabled: true,
    atrMultiplier: effectiveATRMultiplier,
    trailing: true,
    useEMA: true,
    atrPeriod: 14,
  };
  
  // OPTIMIZATION: Pre-calculate all indicators upfront to avoid repeated calculations
  // This forces the indicator cache to be populated once before the main loop
  // Force indicator cache initialization by calling detectMarketRegimeCached once
  // This pre-calculates all indicators (SMA, EMA, MACD, RSI) for the entire dataset
  if (candles.length > 50) {
    detectMarketRegimeCached(candles, Math.min(50, candles.length - 1));
  }
  
  // OPTIMIZATION: Pre-calculate ATR values for all candles to avoid repeated calculations
  // ATR is used frequently in the loop for stop loss calculations
  const { calculateATR } = await import('../src/lib/indicators');
  const precalculatedATR = calculateATR(candles, effectiveStopLossConfig.atrPeriod, effectiveStopLossConfig.useEMA);
  const getPrecalculatedATR = (index: number): number | null => {
    if (index < 1 || precalculatedATR.length === 0) return null;
    const atrIndex = index - 1;
    if (atrIndex >= 0 && atrIndex < precalculatedATR.length) {
      return precalculatedATR[atrIndex]!;
    }
    return null;
  };
  
  // Track regime history manually for persistence
  const regimeHistory: Array<'bullish' | 'bearish' | 'neutral'> = [];
  const historyPreloadStartIndex = Math.max(0, startIndex - 10);
  const sessionId = `backtest-${startDate}`;
  
  // Initialize drawdown tracking with initial capital
  resetDrawdownTracking(sessionId, portfolio.initialCapital);
  
  // OPTIMIZATION: Batch preload regime history instead of sequential calls
  const regimePreloadPromises: Promise<void>[] = [];
  for (let i = historyPreloadStartIndex; i < startIndex; i++) {
    regimePreloadPromises.push(
      Promise.resolve().then(() => {
        const regime = detectMarketRegimeCached(candles, i);
        regimeHistory.push(regime.regime);
        if (regimeHistory.length > 10) regimeHistory.shift();
      })
    );
  }
  await Promise.all(regimePreloadPromises);
  
  // Calculate buy-and-hold baselines
  // CRITICAL: candles array contains data for the asset being tested (ETH or BTC)
  // startPrice and endPrice are from the asset's candles, so this is the correct asset hold comparison
  const startPrice = candles[startIndex]!.close;
  const endPrice = candles[candles.length - 1]!.close;
  const initialCapital = config.bullishStrategy.initialCapital;
  
  // Validate we're using the correct asset's price data
  // Note: assetConfig is already declared at the start of runBacktestInternal (line 277)
  if (candles.length > 0) {
    const samplePrice = candles[Math.floor(candles.length / 2)]!.close;
    // BTC prices are typically 15-20x ETH prices, so validate we have the right asset
    // Using wider ranges to account for historical highs and future price movements
    const expectedPriceRange = asset === 'btc' 
      ? { min: 20000, max: 300000 } // BTC price range (historical: ~$3k-$69k, allowing for future growth)
      : { min: 500, max: 50000 }; // ETH price range (historical: ~$100-$4.8k, allowing for future growth)
    
    // Only warn if price is significantly outside expected range (more than 2x outside)
    const isSignificantlyOutside = samplePrice < expectedPriceRange.min * 0.5 || samplePrice > expectedPriceRange.max * 2;
    if (isSignificantlyOutside) {
      console.warn(`⚠️  WARNING: Price ${samplePrice.toFixed(2)} seems unusual for ${assetConfig.displayName}. Expected range: ${expectedPriceRange.min}-${expectedPriceRange.max}`);
      console.warn(`   This might indicate wrong asset data is being used.`);
    }
  }
  
  // USDC hold (just keep cash)
  const usdcHoldValue = initialCapital;
  const usdcHoldReturn = 0;
  
  // Asset hold (buy at start, hold until end) - this is ETH hold when asset='eth', BTC hold when asset='btc'
  const assetAmount = initialCapital / startPrice;
  const assetHoldFinalValue = assetAmount * endPrice;
  const assetHoldReturn = assetHoldFinalValue - initialCapital;
  
  // Track asset hold drawdown and returns for risk metrics
  // Note: Variable names use "ethHold" for backward compatibility with BacktestResult interface
  // but the values are calculated from the asset being tested (ETH or BTC)
  let ethHoldMaxValue = assetHoldFinalValue;
  let ethHoldMaxDrawdown = 0;
  const ethHoldReturns: number[] = [];
  
  // Process each period
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  let returns: number[] = [];
  
  for (let i = startIndex; i < candles.length; i++) {
    try {
      const candle = candles[i]!;
      const currentPrice = candle.close;

    // Update open positions (for trailing stops)
    // OPTIMIZATION: Use pre-calculated ATR instead of recalculating
    if (openPositions.length > 0) {
      const currentATR = getPrecalculatedATR(i);
      for (const position of openPositions) {
        updateStopLoss(position, currentPrice, currentATR, effectiveStopLossConfig);
      }
    }
    
    // Get correlation context for this candle index
    const correlationContext = useCorrelation ? correlationContextMap.get(i) : undefined;
    
    // Generate signal
    // OPTIMIZATION: Indicators are already cached, so this is fast
    const signal = generateEnhancedAdaptiveSignal(
      candles,
      config, // Use provided config, not DEFAULT_CONFIG
      i,
      sessionId,
      correlationContext
    );
    
    // OPTIMIZATION: Confidence calculation uses cached indicators
    const confidence = calculateConfidence(signal, candles, i);
    
    // Build portfolio history snapshot
    const portfolioSnapshot: PortfolioSnapshot = {
      timestamp: candle.timestamp,
      usdcBalance: portfolio.usdcBalance,
      ethBalance: portfolio.ethBalance,
      totalValue: portfolio.totalValue,
      ethPrice: currentPrice,
    };
    const portfolioHistory: PortfolioSnapshot[] = periods.map(p => ({
      timestamp: p.timestamp,
      usdcBalance: portfolio.usdcBalance, // Approximate
      ethBalance: portfolio.ethBalance, // Approximate
      totalValue: portfolio.totalValue,
      ethPrice: p.price,
    }));
    portfolioHistory.push(portfolioSnapshot);

    // Execute trade using unified executor
    const trade = executeTrade(
      signal,
      confidence,
      currentPrice,
      portfolio,
      {
        candles,
        candleIndex: i,
        portfolioHistory,
        config,
        trades,
        openPositions,
        sessionId, // Pass session ID for drawdown tracking
        useKellyCriterion: effectiveKellyMultiplier > 0,
        useStopLoss: effectiveStopLossConfig.enabled,
        kellyFractionalMultiplier: effectiveKellyMultiplier,
        stopLossConfig: effectiveStopLossConfig,
        generateAudit: true, // Generate audit data for backfill tests
      }
    );
    
    // Update portfolio value
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;
    
    // Track drawdown
    if (portfolio.totalValue > maxValue) maxValue = portfolio.totalValue;
    const drawdown = maxValue - portfolio.totalValue;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    // Track returns for Sharpe ratio (trading strategy)
    if (i > startIndex) {
      const prevValue = periods[periods.length - 1] 
        ? (periods[periods.length - 1]!.trade 
          ? portfolio.totalValue 
          : portfolio.totalValue)
        : initialCapital;
      const periodReturn = (portfolio.totalValue - prevValue) / prevValue;
      returns.push(periodReturn);
    }
    
    // Track asset hold value and drawdown (ETH when asset='eth', BTC when asset='btc')
    const assetHoldCurrentValue = assetAmount * currentPrice;
    if (assetHoldCurrentValue > ethHoldMaxValue) ethHoldMaxValue = assetHoldCurrentValue;
    const assetHoldDrawdown = ethHoldMaxValue - assetHoldCurrentValue;
    if (assetHoldDrawdown > ethHoldMaxDrawdown) ethHoldMaxDrawdown = assetHoldDrawdown;
    
    if (i > startIndex) {
      const prevAssetValue = assetAmount * candles[i - 1]!.close;
      const assetPeriodReturn = (assetHoldCurrentValue - prevAssetValue) / prevAssetValue;
      ethHoldReturns.push(assetPeriodReturn);
    }
    
    periods.push({
      timestamp: candle.timestamp,
      price: currentPrice,
      regime: signal.regime.regime,
      confidence: signal.regime.confidence,
      signal: signal.signal,
      trade,
    });
    } catch (error) {
      // Log error but continue processing (graceful degradation)
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing period at index ${i}: ${errorMessage}`);
      
      // Add period with error state
      periods.push({
        timestamp: candles[i]!.timestamp,
        price: candles[i]!.close,
        regime: 'neutral',
        confidence: 0,
        signal: 0,
        trade: null,
      });
      
      // Continue to next period (don't break the entire backtest)
      continue;
    }
  }
  
  // Calculate ETH hold Sharpe ratio
  const ethHoldAvgReturn = ethHoldReturns.length > 0 ? ethHoldReturns.reduce((a, b) => a + b, 0) / ethHoldReturns.length : 0;
  const ethHoldVariance = ethHoldReturns.length > 0 
    ? ethHoldReturns.reduce((sum, r) => sum + Math.pow(r - ethHoldAvgReturn, 2), 0) / ethHoldReturns.length 
    : 0;
  const ethHoldStdDev = Math.sqrt(ethHoldVariance);
  const ethHoldSharpeRatio = ethHoldStdDev > 0 ? (ethHoldAvgReturn / ethHoldStdDev) * Math.sqrt(252) : 0;
  
  // Calculate Sharpe ratio
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
  
  const buyTrades = trades.filter(t => t.type === 'buy').length;
  const sellTrades = trades.filter(t => t.type === 'sell').length;
  const lossTrades = sellTrades - portfolio.winCount;
  
  return {
    startDate,
    endDate,
    totalTrades: trades.length,
    buyTrades,
    sellTrades,
    winTrades: portfolio.winCount,
    lossTrades,
    totalReturn: portfolio.totalReturn,
    totalReturnPct: (portfolio.totalReturn / initialCapital) * 100,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / initialCapital) * 100,
    sharpeRatio,
    finalPortfolio: portfolio,
    periods,
    usdcHold: {
      finalValue: usdcHoldValue,
      return: usdcHoldReturn,
      returnPct: 0,
    },
    ethHold: {
      // Note: Despite the name "ethHold", this contains hold comparison for the asset being tested
      // When asset='eth', this is ETH hold. When asset='btc', this is BTC hold.
      finalValue: assetHoldFinalValue,
      return: assetHoldReturn,
      returnPct: (assetHoldReturn / initialCapital) * 100,
      maxDrawdown: ethHoldMaxDrawdown,
      maxDrawdownPct: (ethHoldMaxDrawdown / initialCapital) * 100,
      sharpeRatio: ethHoldSharpeRatio,
    },
  };
}

function generateReport(
  result: BacktestResult,
  periodName: string,
  asset: TradingAsset = 'eth'
): string {
  const assetConfig = getAssetConfig(asset);
  const assetHoldLabel = `${assetConfig.displayName} Hold`; // "ETH Hold" or "Bitcoin Hold"
  
  const regimeCounts = {
    bullish: result.periods.filter(p => p.regime === 'bullish').length,
    bearish: result.periods.filter(p => p.regime === 'bearish').length,
    neutral: result.periods.filter(p => p.regime === 'neutral').length,
  };
  
  const initialCapital = result.finalPortfolio.initialCapital;
  
  // Determine best strategy
  const strategies = [
    { name: 'Trading Strategy', return: result.totalReturnPct, value: result.finalPortfolio.totalValue },
    { name: assetHoldLabel, return: result.ethHold.returnPct, value: result.ethHold.finalValue },
    { name: 'USDC Hold', return: result.usdcHold.returnPct, value: result.usdcHold.finalValue },
  ];
  const bestStrategy = strategies.reduce((best, current) => 
    current.return > best.return ? current : best
  );
  
  return `# Backfill Test Report: ${periodName}
**Period**: ${result.startDate} to ${result.endDate}
**Generated**: ${new Date().toISOString()}
**Initial Capital**: $${initialCapital.toFixed(2)}

## Strategy Comparison

| Strategy | Final Value | Return | Return % | Max Drawdown | Sharpe Ratio | Risk-Adjusted Return |
|----------|-----------|--------|----------|--------------|--------------|---------------------|
| **Trading Strategy** | $${result.finalPortfolio.totalValue.toFixed(2)} | $${result.totalReturn.toFixed(2)} | ${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct.toFixed(2)}% | ${result.maxDrawdownPct.toFixed(2)}% | ${result.sharpeRatio.toFixed(3)} | ${(result.totalReturnPct / Math.max(result.maxDrawdownPct, 1)).toFixed(2)} |
| **${assetHoldLabel}** | $${result.ethHold.finalValue.toFixed(2)} | $${result.ethHold.return.toFixed(2)} | ${result.ethHold.returnPct >= 0 ? '+' : ''}${result.ethHold.returnPct.toFixed(2)}% | ${result.ethHold.maxDrawdownPct.toFixed(2)}% | ${result.ethHold.sharpeRatio.toFixed(3)} | ${(result.ethHold.returnPct / Math.max(result.ethHold.maxDrawdownPct, 1)).toFixed(2)} |
| **USDC Hold** | $${result.usdcHold.finalValue.toFixed(2)} | $${result.usdcHold.return.toFixed(2)} | ${result.usdcHold.returnPct.toFixed(2)}% | 0.00% | N/A | N/A |

**Best Strategy**: ${bestStrategy.name} (${bestStrategy.return >= 0 ? '+' : ''}${bestStrategy.return.toFixed(2)}%)

## Trading Strategy Details

| Metric | Value |
|--------|-------|
| **Total Trades** | ${result.totalTrades} |
| **Buy Trades** | ${result.buyTrades} |
| **Sell Trades** | ${result.sellTrades} |
| **Win Rate** | ${result.sellTrades > 0 ? ((result.winTrades / result.sellTrades) * 100).toFixed(1) : '0'}% |
| **Total Return** | $${result.totalReturn.toFixed(2)} |
| **Total Return %** | ${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct.toFixed(2)}% |
| **Max Drawdown** | $${result.maxDrawdown.toFixed(2)} |
| **Max Drawdown %** | ${result.maxDrawdownPct.toFixed(2)}% |
| **Sharpe Ratio** | ${result.sharpeRatio.toFixed(3)} |

## Risk Analysis

### Trading Strategy
- **Risk-Adjusted Return**: ${(result.totalReturnPct / Math.max(result.maxDrawdownPct, 1)).toFixed(2)}
- **Volatility**: ${result.maxDrawdownPct.toFixed(2)}% max drawdown
- **Sharpe Ratio**: ${result.sharpeRatio.toFixed(3)} ${result.sharpeRatio > 1 ? '(Good)' : result.sharpeRatio > 0 ? '(Acceptable)' : '(Poor)'}

### ${assetHoldLabel}
- **Risk-Adjusted Return**: ${(result.ethHold.returnPct / Math.max(result.ethHold.maxDrawdownPct, 1)).toFixed(2)}
- **Volatility**: ${result.ethHold.maxDrawdownPct.toFixed(2)}% max drawdown
- **Sharpe Ratio**: ${result.ethHold.sharpeRatio.toFixed(3)} ${result.ethHold.sharpeRatio > 1 ? '(Good)' : result.ethHold.sharpeRatio > 0 ? '(Acceptable)' : '(Poor)'}

### USDC Hold
- **Risk**: None (stable value)
- **Return**: 0% (no growth, no loss)

## Regime Distribution

- **Bullish**: ${regimeCounts.bullish} periods (${((regimeCounts.bullish / result.periods.length) * 100).toFixed(1)}%)
- **Bearish**: ${regimeCounts.bearish} periods (${((regimeCounts.bearish / result.periods.length) * 100).toFixed(1)}%)
- **Neutral**: ${regimeCounts.neutral} periods (${((regimeCounts.neutral / result.periods.length) * 100).toFixed(1)}%)

## Final Portfolio (Trading Strategy)

- **USDC**: $${result.finalPortfolio.usdcBalance.toFixed(2)}
- **${assetConfig.displayName}**: ${result.finalPortfolio.ethBalance.toFixed(6)}
- **Total Value**: $${result.finalPortfolio.totalValue.toFixed(2)}

## Performance vs Buy-and-Hold

- **vs ${assetHoldLabel}**: ${result.totalReturnPct - result.ethHold.returnPct >= 0 ? '+' : ''}${(result.totalReturnPct - result.ethHold.returnPct).toFixed(2)}% ${result.totalReturnPct > result.ethHold.returnPct ? '(Outperformed)' : '(Underperformed)'}
- **vs USDC Hold**: ${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct.toFixed(2)}% ${result.totalReturnPct > 0 ? '(Outperformed)' : '(Underperformed)'}

---
*Using new smoothed regime detection with hysteresis*
`;
}

async function main() {
  // Get asset from command line args or environment, default to 'eth'
  const assetArg = process.argv[2];
  const asset = (assetArg === 'eth' || assetArg === 'btc' ? assetArg : (process.env.ASSET as TradingAsset)) || 'eth';
  const assetConfig = getAssetConfig(asset);
  
  console.log(`🔄 Running backfill tests for ${assetConfig.displayName} (${asset.toUpperCase()})...\n`);
  
  const historicalPeriods = [
    { name: 'Bullish Period', start: '2025-04-01', end: '2025-08-23', synthetic: false },
    { name: 'Bearish Period', start: '2025-01-01', end: '2025-06-01', synthetic: false },
    { name: 'Full Year 2025', start: '2025-01-01', end: '2025-12-27', synthetic: false },
  ];
  
  const synthetic2026Periods = [
    { name: '2026 Full Year', start: '2026-01-01', end: '2026-12-31', synthetic: true },
    { name: '2026 Q1 (Bull Run)', start: '2026-01-01', end: '2026-03-31', synthetic: true },
    { name: '2026 Q2 (Crash→Recovery)', start: '2026-04-01', end: '2026-06-30', synthetic: true },
    { name: '2026 Q3 (Bear Market)', start: '2026-07-01', end: '2026-09-30', synthetic: true },
    { name: '2026 Q4 (Bull Recovery)', start: '2026-10-01', end: '2026-12-31', synthetic: true },
    { name: '2026 Bull Run Period', start: '2026-03-01', end: '2026-04-30', synthetic: true },
    { name: '2026 Crash Period', start: '2026-05-01', end: '2026-05-15', synthetic: true },
    { name: '2026 Bear Market', start: '2026-07-01', end: '2026-08-31', synthetic: true },
    { name: '2026 Whipsaw Period', start: '2026-09-01', end: '2026-09-30', synthetic: true },
  ];
  
  const synthetic2027Periods = [
    { name: '2027 Full Year', start: '2027-01-01', end: '2027-12-31', synthetic: true },
    { name: '2027 Q1 (False Breakout→Bull)', start: '2027-01-01', end: '2027-03-31', synthetic: true },
    { name: '2027 Q2 (Volatility Squeeze→Breakout)', start: '2027-04-01', end: '2027-06-30', synthetic: true },
    { name: '2027 Q3 (Extended Bear Market)', start: '2027-07-01', end: '2027-09-30', synthetic: true },
    { name: '2027 Q4 (Slow Grind→Recovery)', start: '2027-10-01', end: '2027-12-31', synthetic: true },
    { name: '2027 False Bull Breakout', start: '2027-01-01', end: '2027-01-31', synthetic: true },
    { name: '2027 Extended Consolidation', start: '2027-02-01', end: '2027-02-28', synthetic: true },
    { name: '2027 Extended Bull Run', start: '2027-03-01', end: '2027-04-30', synthetic: true },
    { name: '2027 Volatility Squeeze', start: '2027-05-01', end: '2027-05-31', synthetic: true },
    { name: '2027 Explosive Breakout', start: '2027-06-01', end: '2027-06-30', synthetic: true },
    { name: '2027 Extended Bear Market', start: '2027-07-01', end: '2027-09-30', synthetic: true },
    { name: '2027 Slow Grind Down', start: '2027-10-01', end: '2027-10-31', synthetic: true },
    { name: '2027 False Bear Breakout', start: '2027-11-01', end: '2027-11-15', synthetic: true },
    { name: '2027 Recovery Rally', start: '2027-11-16', end: '2027-12-31', synthetic: true },
  ];
  
  // Multi-year periods
  const multiYearPeriods = [
    { name: '2025-2026 (2 Years)', start: '2025-01-01', end: '2026-12-31', synthetic: false }, // Mix historical + synthetic
    { name: '2026-2027 (2 Years Synthetic)', start: '2026-01-01', end: '2027-12-31', synthetic: true },
    { name: '2025-2027 (3 Years)', start: '2025-01-01', end: '2027-12-31', synthetic: false }, // Mix historical + synthetic
  ];
  
  // Divergence test periods (2028) - synthetic data with clear divergence patterns
  // Data includes 250 candle warmup, then bearish divergence (100), bridge (30), bullish divergence (100)
  const divergenceTestPeriods = [
    { name: '2028 Bearish Divergence (Top→Crash)', start: '2028-01-01', end: '2028-02-10', synthetic: true },
    { name: '2028 Bullish Divergence (Bottom→Rally)', start: '2028-02-15', end: '2028-03-17', synthetic: true },
    { name: '2028 Full Divergence Test', start: '2028-01-01', end: '2028-03-17', synthetic: true },
  ];
  
  // New synthetic periods (2029-2031) for expanded validation
  const synthetic2029Periods = [
    { name: '2029 Full Year', start: '2029-01-01', end: '2029-12-31', synthetic: true },
    { name: '2029 Q1 (Hyper-Volatility→Sideways)', start: '2029-01-01', end: '2029-03-31', synthetic: true },
    { name: '2029 Q2 (Bull Run→Flash Crash→Recovery)', start: '2029-04-01', end: '2029-06-30', synthetic: true },
    { name: '2029 Q3 (Recovery→Bear Market)', start: '2029-07-01', end: '2029-09-30', synthetic: true },
    { name: '2029 Q4 (False Breakout→Volatility Squeeze)', start: '2029-10-01', end: '2029-12-31', synthetic: true },
    { name: '2029 Hyper-Volatility Period', start: '2029-01-01', end: '2029-01-31', synthetic: true },
    { name: '2029 Extended Sideways', start: '2029-02-01', end: '2029-03-31', synthetic: true },
    { name: '2029 Flash Crash', start: '2029-06-01', end: '2029-06-15', synthetic: true },
    { name: '2029 False Bull Breakout', start: '2029-10-01', end: '2029-10-31', synthetic: true },
  ];
  
  const synthetic2030Periods = [
    { name: '2030 Full Year', start: '2030-01-01', end: '2030-12-31', synthetic: true },
    { name: '2030 Q1 (High-Frequency Switches→Bull)', start: '2030-01-01', end: '2030-03-31', synthetic: true },
    { name: '2030 Q2 (Consolidation→Bear Market)', start: '2030-04-01', end: '2030-06-30', synthetic: true },
    { name: '2030 Q3 (Bear Market→False Breakout)', start: '2030-07-01', end: '2030-09-30', synthetic: true },
    { name: '2030 Q4 (Recovery→Volatility Squeeze→Explosion)', start: '2030-10-01', end: '2030-12-31', synthetic: true },
    { name: '2030 High-Frequency Switches', start: '2030-01-01', end: '2030-02-28', synthetic: true },
    { name: '2030 Extended Consolidation', start: '2030-04-01', end: '2030-05-31', synthetic: true },
    { name: '2030 False Bear Breakout', start: '2030-08-01', end: '2030-08-31', synthetic: true },
    { name: '2030 Volatility Squeeze', start: '2030-11-01', end: '2030-11-30', synthetic: true },
  ];
  
  const synthetic2031Periods = [
    { name: '2031 Full Year', start: '2031-01-01', end: '2031-12-31', synthetic: true },
    { name: '2031 Q1 (Bull Run→Flash Crash→Recovery)', start: '2031-01-01', end: '2031-03-31', synthetic: true },
    { name: '2031 Q2 (Recovery→Sideways)', start: '2031-04-01', end: '2031-06-30', synthetic: true },
    { name: '2031 Q3 (Sideways→Extended Bear Market)', start: '2031-07-01', end: '2031-09-30', synthetic: true },
    { name: '2031 Q4 (False Breakout→Volatility Squeeze)', start: '2031-10-01', end: '2031-12-31', synthetic: true },
    { name: '2031 Flash Crash', start: '2031-03-01', end: '2031-03-15', synthetic: true },
    { name: '2031 Extended Sideways', start: '2031-05-01', end: '2031-06-30', synthetic: true },
    { name: '2031 Extended Bear Market', start: '2031-07-01', end: '2031-09-30', synthetic: true },
    { name: '2031 False Bull Breakout', start: '2031-10-01', end: '2031-10-31', synthetic: true },
  ];
  
  const testPeriods = [
    ...historicalPeriods,
    ...synthetic2026Periods,
    ...synthetic2027Periods,
    ...multiYearPeriods,
    ...divergenceTestPeriods,
    ...synthetic2029Periods,
    ...synthetic2030Periods,
    ...synthetic2031Periods,
  ];
  
  const reports: string[] = [];
  const historicalResults: BacktestResult[] = [];
  const syntheticResults: BacktestResult[] = [];
  
  for (const period of testPeriods) {
    console.log(`\n${'='.repeat(60)}`);
    // Parse year directly from date string to avoid timezone issues
    const periodYear = parseInt(period.start.split('-')[0]!, 10);
    const periodType = period.synthetic 
      ? `[Synthetic ${periodYear}]` 
      : period.start.startsWith('2025') && period.end.startsWith('2025')
        ? '[Historical 2025]'
        : '[Multi-Year]';
    console.log(`Testing: ${period.name} (${period.start} to ${period.end}) ${periodType}`);
    console.log('='.repeat(60));
    
    try {
      const result = await runBacktest(period.start, period.end, period.synthetic, undefined, undefined, undefined, asset);
      
      const report = generateReport(result, period.name, asset);
      reports.push(report);
      
      // Categorize results
      if (period.synthetic) {
        syntheticResults.push(result);
      } else {
        historicalResults.push(result);
      }
      
      console.log(`\n✅ Completed: ${period.name}`);
      console.log(`   ${result.totalTrades} trades, $${result.totalReturn.toFixed(2)} return (${result.totalReturnPct.toFixed(2)}%)`);
    } catch (error) {
      console.error(`\n❌ Failed: ${period.name}`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Calculate summary statistics
  const historicalAvgReturn = historicalResults.length > 0
    ? historicalResults.reduce((sum, r) => sum + r.totalReturnPct, 0) / historicalResults.length
    : 0;
  const syntheticAvgReturn = syntheticResults.length > 0
    ? syntheticResults.reduce((sum, r) => sum + r.totalReturnPct, 0) / syntheticResults.length
    : 0;
  
  // Combine all reports
  const fullReport = `# Backfill Test Results - Historical 2025, Synthetic 2026-2031 Periods

This report shows backfill test results using the **baseline configuration** with expanded validation set (2029-2031).

## Test Periods

${testPeriods.map((p, i) => `${i + 1}. ${p.name}: ${p.start} to ${p.end}`).join('\n')}

---

${reports.join('\n\n---\n\n')}

## Overall Summary

The new smoothed regime detection method uses:
- **Signal Smoothing**: 5-period moving average of combined signals
- **Hysteresis**: Different thresholds for entering (0.05/-0.05) vs exiting (0.02/-0.02) regimes

This reduces whipsaw and provides more stable regime detection.
`;
  
  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `backfill-test-${timestamp}.md`);
  fs.writeFileSync(reportPath, fullReport, 'utf-8');
  
  console.log(`\n✅ All tests complete!`);
  console.log(`📄 Report saved to: ${reportPath}`);
}

// Only run main() if this file is executed directly (not imported)
if (require.main === module) {
  main()
    .then(async () => {
      // Close Redis connection to allow script to exit
      try {
        await disconnectRedis();
      } catch (error) {
        // Ignore disconnect errors
      }
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Error:', error);
      try {
        await disconnectRedis();
      } catch {
        // Ignore disconnect errors
      }
      process.exit(1);
    });
}

