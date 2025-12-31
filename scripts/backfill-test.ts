#!/usr/bin/env npx tsx
/**
 * Backfill test for specific date ranges
 * Tests the new smoothed regime detection method
 * Supports both historical data and synthetic 2026 data
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '../src/lib/market-regime-detector-cached';
import { executeTrade } from '../src/lib/trade-executor';
import { updateStopLoss } from '../src/lib/atr-stop-loss';
import { getATRValue } from '../src/lib/indicators';
import { disconnectRedis } from '../src/lib/kv';
import type { PriceCandle, Portfolio, Trade, PortfolioSnapshot } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { StopLossConfig, OpenPosition } from '../src/lib/atr-stop-loss';
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
};

// Trade execution is now handled by unified executor in src/lib/trade-executor.ts

/**
 * Load synthetic data for a given year
 */
function loadSyntheticData(year: number): PriceCandle[] {
  const syntheticDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const ethDir = path.join(process.cwd(), 'data', 'historical-prices', 'ethusdt', '8h');
  
  // Try multiple file paths in order of preference
  const possiblePaths = [
    // Full year synthetic data
    path.join(syntheticDir, `ethusdt_8h_${year}-01-01_${year}-12-31.json.gz`),
    path.join(syntheticDir, `ethusdt_8h_${year}-01-01_${year}-12-30.json.gz`),
  ];
  
  // Check for files in synthetic dir
  let filepath: string | null = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      filepath = testPath;
      break;
    }
  }
  
  // If not found, try to find any file matching the year in synthetic dir
  if (!filepath && fs.existsSync(syntheticDir)) {
    const files = fs.readdirSync(syntheticDir);
    const matchingFile = files.find(f => f.includes(`${year}`) && f.endsWith('.json.gz'));
    if (matchingFile) {
      filepath = path.join(syntheticDir, matchingFile);
    }
  }
  
  // If still not found, check ethusdt/8h directory for partial year files (divergence test data)
  if (!filepath) {
    const allCandles: PriceCandle[] = [];
    if (fs.existsSync(ethDir)) {
      const files = fs.readdirSync(ethDir);
      const yearFiles = files.filter(f => f.includes(`${year}`) && f.endsWith('.json.gz'));
      
      for (const file of yearFiles) {
        const filePath = path.join(ethDir, file);
        const compressed = fs.readFileSync(filePath);
        const decompressed = gunzipSync(compressed);
        const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
        console.log(`📊 Loaded ${candles.length} synthetic 8h candles from ${file}`);
        allCandles.push(...candles);
      }
      
      if (allCandles.length > 0) {
        // Sort by timestamp and return
        allCandles.sort((a, b) => a.timestamp - b.timestamp);
        return allCandles;
      }
    }
  }
  
  if (!filepath || !fs.existsSync(filepath)) {
    throw new Error(`Synthetic 8h data not found for ${year}. Run 'npx tsx scripts/generate-synthetic-${year}-data-enhanced.ts' first.`);
  }
  
  const compressed = fs.readFileSync(filepath);
  const decompressed = gunzipSync(compressed);
  const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
  
  console.log(`📊 Loaded ${candles.length} synthetic 8h candles from ${path.basename(filepath)}`);
  return candles;
}

export async function runBacktest(
  startDate: string,
  endDate: string,
  isSynthetic: boolean = false,
  configOverride?: EnhancedAdaptiveStrategyConfig,
  kellyMultiplier?: number,
  atrMultiplier?: number
): Promise<BacktestResult> {
  const year = new Date(startDate).getFullYear();
  console.log(`\n📊 Running backtest: ${startDate} to ${endDate}${isSynthetic ? ` (Synthetic ${year})` : ''}`);
  
  // Clear caches
  clearRegimeHistory();
  clearIndicatorCache();
  
  let candles: PriceCandle[];
  
  if (isSynthetic) {
    // For multi-year periods, load and combine multiple years
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    
    if (startYear === endYear) {
      // Single year
      candles = loadSyntheticData(startYear);
    } else {
      // Multi-year: load and combine
      candles = [];
      for (let year = startYear; year <= endYear; year++) {
        try {
          const yearCandles = loadSyntheticData(year);
          candles.push(...yearCandles);
        } catch (error) {
          console.warn(`⚠️  Could not load synthetic data for ${year}: ${error}`);
        }
      }
      // Sort by timestamp
      candles.sort((a, b) => a.timestamp - b.timestamp);
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
    
    console.log(`📈 Loaded ${candles.length} candles (${candlesInPeriod} in test period ${startDate} to ${endDate})`);
  } else {
    // For multi-year historical periods, we need to handle them specially
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    
    if (startYear === endYear && startYear === 2025) {
      // Single year 2025 - use existing logic
      const historyStartDate = new Date(startDate);
      historyStartDate.setDate(historyStartDate.getDate() - 200); // Get 200 days before for indicators
      const historyStart = historyStartDate.toISOString().split('T')[0];
      
      // Use available historical data (starts at 2025-01-01)
      const minHistoryDate = '2025-01-01';
      const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
      
      candles = await fetchPriceCandles('ETHUSDT', TIMEFRAME, actualHistoryStart, endDate, undefined, true); // skipAPIFetch=true for backfill tests
      console.log(`📈 Loaded ${candles.length} candles from ${actualHistoryStart} to ${endDate}`);
    } else {
      // Multi-year: combine historical 2025 with synthetic 2026/2027
      candles = [];
      
      // Load 2025 historical
      if (startYear <= 2025 && endYear >= 2025) {
        const history2025 = await fetchPriceCandles('ETHUSDT', TIMEFRAME, '2025-01-01', '2025-12-31', undefined, true); // skipAPIFetch=true for backfill tests
        candles.push(...history2025);
      }
      
      // Load synthetic years
      for (let year = Math.max(2026, startYear); year <= endYear; year++) {
        try {
          const yearCandles = loadSyntheticData(year);
          candles.push(...yearCandles);
        } catch (error) {
          console.warn(`⚠️  Could not load synthetic data for ${year}: ${error}`);
        }
      }
      
      // Sort by timestamp
      candles.sort((a, b) => a.timestamp - b.timestamp);
      
      // Filter to requested date range
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate).getTime();
      candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
      
      console.log(`📈 Loaded ${candles.length} candles (multi-year: ${startYear}-${endYear})`);
    }
  }
  
  if (candles.length < 50) {
    throw new Error(`Not enough candles loaded: ${candles.length}. Need at least 50 for indicators.`);
  }
  
  // Use provided config override or default
  const config = configOverride || DEFAULT_CONFIG;

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
  
  // Use provided multipliers or defaults
  const effectiveKellyMultiplier = kellyMultiplier ?? 0.25;
  const effectiveATRMultiplier = atrMultiplier ?? 2.0;
  
  // Create stop loss config with provided multiplier
  const effectiveStopLossConfig: StopLossConfig = {
    enabled: true,
    atrMultiplier: effectiveATRMultiplier,
    trailing: true,
    useEMA: true,
    atrPeriod: 14,
  };
  
  // Track regime history manually for persistence
  const regimeHistory: Array<'bullish' | 'bearish' | 'neutral'> = [];
  const historyPreloadStartIndex = Math.max(0, startIndex - 10);
  const sessionId = `backtest-${startDate}`;
  
  for (let i = historyPreloadStartIndex; i < startIndex; i++) {
    const regime = await import('../src/lib/market-regime-detector-cached').then(m => 
      m.detectMarketRegimeCached(candles, i)
    );
    regimeHistory.push(regime.regime);
    if (regimeHistory.length > 10) regimeHistory.shift();
  }
  
  // Calculate buy-and-hold baselines
  const startPrice = candles[startIndex]!.close;
  const endPrice = candles[candles.length - 1]!.close;
  const initialCapital = config.bullishStrategy.initialCapital;
  
  // USDC hold (just keep cash)
  const usdcHoldValue = initialCapital;
  const usdcHoldReturn = 0;
  
  // ETH hold (buy at start, hold until end)
  const ethAmount = initialCapital / startPrice;
  const ethHoldFinalValue = ethAmount * endPrice;
  const ethHoldReturn = ethHoldFinalValue - initialCapital;
  
  // Track ETH hold drawdown and returns for risk metrics
  let ethHoldMaxValue = ethHoldFinalValue;
  let ethHoldMaxDrawdown = 0;
  const ethHoldReturns: number[] = [];
  
  // Process each period
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  let returns: number[] = [];
  
  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;

    // Update open positions (for trailing stops)
    if (openPositions.length > 0) {
      const currentATR = getATRValue(candles, i, effectiveStopLossConfig.atrPeriod, effectiveStopLossConfig.useEMA);
      for (const position of openPositions) {
        updateStopLoss(position, currentPrice, currentATR, effectiveStopLossConfig);
      }
    }
    
    // Generate signal
    const signal = generateEnhancedAdaptiveSignal(
      candles,
      config, // Use provided config, not DEFAULT_CONFIG
      i,
      sessionId
    );
    
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
    
    // Track ETH hold value and drawdown
    const ethHoldCurrentValue = ethAmount * currentPrice;
    if (ethHoldCurrentValue > ethHoldMaxValue) ethHoldMaxValue = ethHoldCurrentValue;
    const ethHoldDrawdown = ethHoldMaxValue - ethHoldCurrentValue;
    if (ethHoldDrawdown > ethHoldMaxDrawdown) ethHoldMaxDrawdown = ethHoldDrawdown;
    
    if (i > startIndex) {
      const prevEthValue = ethAmount * candles[i - 1]!.close;
      const ethPeriodReturn = (ethHoldCurrentValue - prevEthValue) / prevEthValue;
      ethHoldReturns.push(ethPeriodReturn);
    }
    
    periods.push({
      timestamp: candle.timestamp,
      price: currentPrice,
      regime: signal.regime.regime,
      confidence: signal.regime.confidence,
      signal: signal.signal,
      trade,
    });
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
      finalValue: ethHoldFinalValue,
      return: ethHoldReturn,
      returnPct: (ethHoldReturn / initialCapital) * 100,
      maxDrawdown: ethHoldMaxDrawdown,
      maxDrawdownPct: (ethHoldMaxDrawdown / initialCapital) * 100,
      sharpeRatio: ethHoldSharpeRatio,
    },
  };
}

function generateReport(
  result: BacktestResult,
  periodName: string
): string {
  const regimeCounts = {
    bullish: result.periods.filter(p => p.regime === 'bullish').length,
    bearish: result.periods.filter(p => p.regime === 'bearish').length,
    neutral: result.periods.filter(p => p.regime === 'neutral').length,
  };
  
  const initialCapital = result.finalPortfolio.initialCapital;
  
  // Determine best strategy
  const strategies = [
    { name: 'Trading Strategy', return: result.totalReturnPct, value: result.finalPortfolio.totalValue },
    { name: 'ETH Hold', return: result.ethHold.returnPct, value: result.ethHold.finalValue },
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
| **ETH Hold** | $${result.ethHold.finalValue.toFixed(2)} | $${result.ethHold.return.toFixed(2)} | ${result.ethHold.returnPct >= 0 ? '+' : ''}${result.ethHold.returnPct.toFixed(2)}% | ${result.ethHold.maxDrawdownPct.toFixed(2)}% | ${result.ethHold.sharpeRatio.toFixed(3)} | ${(result.ethHold.returnPct / Math.max(result.ethHold.maxDrawdownPct, 1)).toFixed(2)} |
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

### ETH Hold
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
- **ETH**: ${result.finalPortfolio.ethBalance.toFixed(6)}
- **Total Value**: $${result.finalPortfolio.totalValue.toFixed(2)}

## Performance vs Buy-and-Hold

- **vs ETH Hold**: ${result.totalReturnPct - result.ethHold.returnPct >= 0 ? '+' : ''}${(result.totalReturnPct - result.ethHold.returnPct).toFixed(2)}% ${result.totalReturnPct > result.ethHold.returnPct ? '(Outperformed)' : '(Underperformed)'}
- **vs USDC Hold**: ${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct.toFixed(2)}% ${result.totalReturnPct > 0 ? '(Outperformed)' : '(Underperformed)'}

---
*Using new smoothed regime detection with hysteresis*
`;
}

async function main() {
  console.log('🔄 Running backfill tests for specific periods...\n');
  
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
  
  const testPeriods = [
    ...historicalPeriods,
    ...synthetic2026Periods,
    ...synthetic2027Periods,
    ...multiYearPeriods,
    ...divergenceTestPeriods,
  ];
  
  const reports: string[] = [];
  const historicalResults: BacktestResult[] = [];
  const syntheticResults: BacktestResult[] = [];
  
  for (const period of testPeriods) {
    console.log(`\n${'='.repeat(60)}`);
    const periodYear = new Date(period.start).getFullYear();
    const periodType = period.synthetic 
      ? `[Synthetic ${periodYear}]` 
      : period.start.startsWith('2025') && period.end.startsWith('2025')
        ? '[Historical 2025]'
        : '[Multi-Year]';
    console.log(`Testing: ${period.name} (${period.start} to ${period.end}) ${periodType}`);
    console.log('='.repeat(60));
    
    try {
      const result = await runBacktest(period.start, period.end, period.synthetic);
      
      const report = generateReport(result, period.name);
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
  const fullReport = `# Backfill Test Results - Historical 2025, Synthetic 2026 & 2027 Periods

This report shows backfill test results using the **new smoothed regime detection with hysteresis**.

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

