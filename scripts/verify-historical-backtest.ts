#!/usr/bin/env npx tsx
/**
 * Historical Backtest Verification Script
 * Runs comprehensive historical backtests to verify functionality after big changes
 * Compares results against baseline metrics to detect regressions
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '../src/lib/market-regime-detector-cached';
import { calculateStrategyResults, calculateRiskMetrics } from '../src/lib/risk-metrics';
import type { PriceCandle, Portfolio, Trade, PortfolioSnapshot } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import { v4 as uuidv4 } from 'uuid';

// Configurable timeframe - default to 8h
const TIMEFRAME = (process.env.TIMEFRAME as '8h' | '12h' | '1d') || '8h';

interface TestPeriod {
  name: string;
  startDate: string;
  endDate: string;
  synthetic?: boolean;
}

interface VerificationResult {
  period: string;
  startDate: string;
  endDate: string;
  passed: boolean;
  synthetic?: boolean;
  skipped?: boolean;
  skipReason?: string;
  metrics: {
    return: number;
    vsEthHold: number;
    sharpeRatio: number;
    maxDrawdown: number;
    tradeCount: number;
    winRate: number;
  };
  baseline?: {
    return: number;
    vsEthHold: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  regression?: {
    return: number;
    vsEthHold: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
}

interface BaselineMetrics {
  [timeframe: string]: {
    [period: string]: {
      return: number;
      vsEthHold: number;
      sharpeRatio: number;
      maxDrawdown: number;
      tradeCount: number;
      winRate: number;
    };
  };
}

// Default config (optimized for 8h)
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
;
;
;

// Test periods - Historical 2025
const HISTORICAL_PERIODS: TestPeriod[] = [
  { name: 'Full Year 2025', startDate: '2025-01-01', endDate: '2025-12-27' },
  { name: 'Bullish Period 2025', startDate: '2025-04-01', endDate: '2025-08-23' },
  { name: 'Bearish Period 2025', startDate: '2025-01-01', endDate: '2025-06-01' },
];

// Test periods - Synthetic 2026 (various market conditions)
const SYNTHETIC_2026_PERIODS: TestPeriod[] = [
  { name: '2026 Full Year', startDate: '2026-01-01', endDate: '2026-12-31', synthetic: true },
  { name: '2026 Q1 (Bull Run)', startDate: '2026-01-01', endDate: '2026-03-31', synthetic: true },
  { name: '2026 Q2 (Crash→Recovery)', startDate: '2026-04-01', endDate: '2026-06-30', synthetic: true },
  { name: '2026 Q3 (Bear Market)', startDate: '2026-07-01', endDate: '2026-09-30', synthetic: true },
  { name: '2026 Q4 (Bull Recovery)', startDate: '2026-10-01', endDate: '2026-12-31', synthetic: true },
  { name: '2026 Bull Run Period', startDate: '2026-03-01', endDate: '2026-04-30', synthetic: true },
  { name: '2026 Crash Period', startDate: '2026-05-01', endDate: '2026-05-15', synthetic: true },
  { name: '2026 Bear Market', startDate: '2026-07-01', endDate: '2026-08-31', synthetic: true },
  { name: '2026 Whipsaw Period', startDate: '2026-09-01', endDate: '2026-09-30', synthetic: true },
  { name: '2026 Bull→Crash (Stress)', startDate: '2026-03-01', endDate: '2026-05-31', synthetic: true },
  { name: '2026 Bear→Whipsaw (Worst)', startDate: '2026-07-01', endDate: '2026-09-30', synthetic: true },
  { name: '2026 Whipsaw→Bull (Recovery)', startDate: '2026-09-01', endDate: '2026-11-30', synthetic: true },
];

const TEST_PERIODS: TestPeriod[] = [...HISTORICAL_PERIODS, ...SYNTHETIC_2026_PERIODS];

const BASELINE_FILE = path.join(process.cwd(), 'data', 'trading-baselines', 'baseline-metrics.json');
const REGRESSION_THRESHOLD = 0.05; // 5% drop in returns is considered a regression

/**
 * Load baseline metrics
 */
function loadBaseline(): BaselineMetrics | null {
  try {
    if (fs.existsSync(BASELINE_FILE)) {
      const data = fs.readFileSync(BASELINE_FILE, 'utf-8');
      return JSON.parse(data) as BaselineMetrics;
    }
  } catch (error) {
    console.warn('⚠️  Could not load baseline metrics:', error);
  }
  return null;
}

/**
 * Save baseline metrics
 */
function saveBaseline(baseline: BaselineMetrics): void {
  const dir = path.dirname(BASELINE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`✅ Saved baseline metrics to ${BASELINE_FILE}`);
}

/**
 * Load synthetic 2026 data
 */
function loadSynthetic2026Data(): PriceCandle[] {
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  
  // Try to load the appropriate timeframe data
  let filepathToUse: string | null = null;
  
  // First, try the exact timeframe match
  const exactMatch = path.join(dataDir, `ethusdt_${TIMEFRAME}_2026-01-01_2026-12-30.json.gz`);
  if (fs.existsSync(exactMatch)) {
    filepathToUse = exactMatch;
  } else if (TIMEFRAME === '8h') {
    // For 8h, try 8h file first, then fall back to 1d
    const filepath8h = path.join(dataDir, 'ethusdt_8h_2026-01-01_2026-12-30.json.gz');
    if (fs.existsSync(filepath8h)) {
      filepathToUse = filepath8h;
    } else {
      const filepath1d = path.join(dataDir, 'ethusdt_1d_2026-01-01_2026-12-30.json.gz');
      if (fs.existsSync(filepath1d)) {
        console.warn('⚠️  Using 1d synthetic data for 8h timeframe. Consider running convert-synthetic-to-8h.ts');
        filepathToUse = filepath1d;
      }
    }
  } else {
    // For other timeframes, try 1d as fallback
    const filepath1d = path.join(dataDir, 'ethusdt_1d_2026-01-01_2026-12-30.json.gz');
    if (fs.existsSync(filepath1d)) {
      filepathToUse = filepath1d;
    }
  }
  
  if (!filepathToUse || !fs.existsSync(filepathToUse)) {
    throw new Error(`Synthetic 2026 data not found. Run 'pnpm eth:generate-2026' first, and 'npx tsx scripts/convert-synthetic-to-8h.ts' for 8h data.`);
  }
  
  const compressed = fs.readFileSync(filepathToUse);
  const decompressed = gunzipSync(compressed);
  const candles = JSON.parse(decompressed.toString()) as PriceCandle[];
  
  console.log(`   📊 Loaded ${candles.length} ${TIMEFRAME} synthetic candles from ${path.basename(filepathToUse)}`);
  return candles;
}

/**
 * Run backtest for a period
 */
async function runBacktest(
  startDate: string,
  endDate: string,
  config: EnhancedAdaptiveStrategyConfig,
  isSynthetic: boolean = false
): Promise<{
  return: number;
  vsEthHold: number;
  sharpeRatio: number;
  maxDrawdown: number;
  tradeCount: number;
  winRate: number;
  skipped?: boolean;
  skipReason?: string;
}> {
  clearRegimeHistory();
  clearIndicatorCache();

  let candles: PriceCandle[];
  
  if (isSynthetic) {
    // Load synthetic 2026 data
    candles = loadSynthetic2026Data();
    
    // Filter to requested date range
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
    
    // For very short periods, we need at least 20 candles (reduced from 50)
    // But we still need enough for basic indicators
    // For extremely short periods (< 20 candles), we'll skip them
    const minCandles = 20;
    if (candles.length < minCandles) {
      // Return a special result indicating the period was skipped
      return {
        return: 0,
        vsEthHold: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        tradeCount: 0,
        winRate: 0,
        skipped: true,
        skipReason: `Period too short: only ${candles.length} candles (need at least ${minCandles})`,
      } as any;
    }
    
    // Note: If synthetic data is 1d but we need 8h, we'd need to convert it
    // For now, we'll use what we have and adjust the startIndex accordingly
  } else {
    // Fetch historical candles
    const historyStartDate = new Date(startDate);
    historyStartDate.setDate(historyStartDate.getDate() - 200);
    const historyStart = historyStartDate.toISOString().split('T')[0];
    const minHistoryDate = '2025-01-01';
    const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;

    candles = await fetchPriceCandles('ETHUSDT', TIMEFRAME, actualHistoryStart, endDate);
    if (candles.length < 50) {
      throw new Error(`Not enough candles: ${candles.length}`);
    }
  }

  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  
  // For short periods, use a smaller minimum (20 instead of 50)
  // This allows testing very short periods like crash periods
  const minIndex = Math.min(50, Math.max(20, Math.floor(candles.length * 0.3)));
  if (startIndex < minIndex && candles.length >= minIndex) {
    startIndex = minIndex;
  }
  
  // If we still don't have enough candles after adjusting, use what we have
  if (startIndex >= candles.length) {
    startIndex = Math.max(0, candles.length - 10); // Use last 10 candles at minimum
  }
  
  // Safety check
  if (startIndex >= candles.length || candles.length === 0) {
    throw new Error(`Invalid candle data: startIndex=${startIndex}, length=${candles.length}`);
  }

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
  const portfolioHistory: PortfolioSnapshot[] = [];
  const sessionId = `verify-${startDate}`;

  // Preload regime history
  const regimeHistory: Array<'bullish' | 'bearish' | 'neutral'> = [];
  for (let i = Math.max(0, startIndex - 10); i < startIndex; i++) {
    const regime = await import('../src/lib/market-regime-detector-cached').then(m => 
      m.detectMarketRegimeCached(candles, i)
    );
    regimeHistory.push(regime.regime);
  }

  // Run backtest
  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle) {
      console.warn(`Warning: Missing candle at index ${i}, skipping`);
      continue;
    }
    
    let signal;
    let confidence = 0;
    try {
      signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
      confidence = calculateConfidence(signal, candles, i);
    } catch (error) {
      // If signal generation fails (e.g., not enough data), skip this candle
      console.warn(`Warning: Could not generate signal for index ${i}:`, error);
      continue;
    }

    // Execute trades (simplified - same logic as backfill-test.ts)
    if (signal.action === 'buy' && portfolio.usdcBalance > 0 && signal.signal > 0) {
      const maxPositionPct = signal.activeStrategy.maxPositionPct || 0.75;
      const positionSize = portfolio.usdcBalance * confidence * maxPositionPct;
      const ethAmount = positionSize / candle.close;

      if (ethAmount > 0) {
        portfolio.usdcBalance -= positionSize;
        portfolio.ethBalance += ethAmount;
        portfolio.tradeCount++;

        trades.push({
          id: uuidv4(),
          timestamp: candle.timestamp,
          type: 'buy',
          ethPrice: candle.close,
          ethAmount,
          usdcAmount: positionSize,
          signal: signal.signal,
          confidence,
          portfolioValue: portfolio.usdcBalance + portfolio.ethBalance * candle.close,
          costBasis: positionSize,
        });
      }
    }

    if (signal.action === 'sell' && portfolio.ethBalance > 0 && signal.signal < 0) {
      const positionSize = portfolio.ethBalance * Math.abs(signal.signal);
      const usdcAmount = positionSize * candle.close;

      if (positionSize > 0) {
        // Calculate P&L
        const buyTrades = trades.filter(t => t.type === 'buy' && !t.fullySold);
        let totalCostBasis = 0;
        let totalAmount = 0;

        for (const buyTrade of buyTrades) {
          if (totalAmount < positionSize) {
            const remaining = positionSize - totalAmount;
            const used = Math.min(remaining, buyTrade.ethAmount);
            totalCostBasis += (buyTrade.costBasis || 0) * (used / buyTrade.ethAmount);
            totalAmount += used;
            if (used >= buyTrade.ethAmount) {
              buyTrade.fullySold = true;
            }
          }
        }

        const avgCost = totalAmount > 0 ? totalCostBasis / totalAmount : candle.close;
        const pnl = usdcAmount - (positionSize * avgCost);

        portfolio.ethBalance -= positionSize;
        portfolio.usdcBalance += usdcAmount;
        portfolio.tradeCount++;
        if (pnl > 0) portfolio.winCount++;

        trades.push({
          id: uuidv4(),
          timestamp: candle.timestamp,
          type: 'sell',
          ethPrice: candle.close,
          ethAmount: positionSize,
          usdcAmount,
          signal: signal.signal,
          confidence,
          portfolioValue: portfolio.usdcBalance + portfolio.ethBalance * candle.close,
          costBasis: totalCostBasis,
          pnl,
        });
      }
    }

    // Update portfolio value
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * candle.close;
    portfolio.totalReturn = ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;

    portfolioHistory.push({
      timestamp: candle.timestamp,
      usdcBalance: portfolio.usdcBalance,
      ethBalance: portfolio.ethBalance,
      totalValue: portfolio.totalValue,
      ethPrice: candle.close,
    });
  }

  // Calculate ETH hold return
  const initialEthPrice = candles[startIndex].close;
  const finalEthPrice = candles[candles.length - 1].close;
  const ethHoldReturn = ((finalEthPrice - initialEthPrice) / initialEthPrice) * 100;
  const vsEthHold = portfolio.totalReturn - ethHoldReturn;

  // Calculate metrics
  const strategyResults = calculateStrategyResults(trades, portfolio.initialCapital, portfolio.totalValue);
  const riskMetrics = calculateRiskMetrics(trades, portfolioHistory, portfolio.initialCapital);

  return {
    return: portfolio.totalReturn,
    vsEthHold,
    sharpeRatio: riskMetrics.sharpeRatio,
    maxDrawdown: riskMetrics.maxDrawdown,
    tradeCount: trades.length,
    winRate: strategyResults.winRate,
  };
}

/**
 * Verify against baseline
 */
function verifyAgainstBaseline(
  result: VerificationResult,
  baseline: BaselineMetrics
): VerificationResult {
  const baselineMetrics = baseline[TIMEFRAME]?.[result.period];
  if (!baselineMetrics) {
    result.passed = true; // No baseline to compare against
    return result;
  }

  result.baseline = {
    return: baselineMetrics.return,
    vsEthHold: baselineMetrics.vsEthHold,
    sharpeRatio: baselineMetrics.sharpeRatio,
    maxDrawdown: baselineMetrics.maxDrawdown,
  };

  // Check for regressions
  const returnRegression = baselineMetrics.return - result.metrics.return;
  const vsEthRegression = baselineMetrics.vsEthHold - result.metrics.vsEthHold;

  result.regression = {
    return: returnRegression,
    vsEthHold: vsEthRegression,
    sharpeRatio: result.metrics.sharpeRatio - baselineMetrics.sharpeRatio,
    maxDrawdown: result.metrics.maxDrawdown - baselineMetrics.maxDrawdown,
  };

  // Pass if no significant regression (within threshold)
  result.passed = 
    returnRegression <= (baselineMetrics.return * REGRESSION_THRESHOLD) &&
    vsEthRegression <= (Math.abs(baselineMetrics.vsEthHold) * REGRESSION_THRESHOLD);

  return result;
}

/**
 * Generate verification report
 */
function generateReport(results: VerificationResult[]): string {
  const allPassed = results.every(r => r.passed);
  const timestamp = new Date().toISOString();

  let report = `# Historical Backtest Verification Report\n\n`;
  report += `**Timeframe**: ${TIMEFRAME}\n`;
  report += `**Date**: ${timestamp}\n`;
  report += `**Status**: ${allPassed ? '✅ PASSED' : '❌ FAILED'}\n\n`;

  report += `## Summary\n\n`;
  report += `- **Periods Tested**: ${results.length}\n`;
  report += `  - Historical: ${results.filter(r => !r.synthetic).length}\n`;
  report += `  - Synthetic 2026: ${results.filter(r => r.synthetic).length}\n`;
  report += `- **Passed**: ${results.filter(r => r.passed && !r.skipped).length}\n`;
  report += `- **Skipped**: ${results.filter(r => r.skipped).length}\n`;
  report += `- **Failed**: ${results.filter(r => !r.passed && !r.skipped).length}\n\n`;

  report += `## Results\n\n`;
  for (const result of results) {
    const periodType = result.synthetic ? '🧪 Synthetic 2026' : '📊 Historical';
    report += `### ${periodType}: ${result.period}\n\n`;
    report += `**Period**: ${result.startDate} to ${result.endDate}\n`;
    if (result.skipped) {
      report += `**Status**: ⏭️ SKIPPED - ${result.skipReason || 'Period too short'}\n\n`;
      continue;
    }
    report += `**Status**: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;

    report += `**Current Metrics**:\n`;
    report += `- Return: ${result.metrics.return.toFixed(2)}%\n`;
    report += `- vs ETH Hold: ${result.metrics.vsEthHold.toFixed(2)}%\n`;
    report += `- Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}\n`;
    report += `- Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%\n`;
    report += `- Trade Count: ${result.metrics.tradeCount}\n`;
    report += `- Win Rate: ${result.metrics.winRate.toFixed(2)}%\n\n`;

    if (result.baseline) {
      report += `**Baseline Metrics**:\n`;
      report += `- Return: ${result.baseline.return.toFixed(2)}%\n`;
      report += `- vs ETH Hold: ${result.baseline.vsEthHold.toFixed(2)}%\n`;
      report += `- Sharpe Ratio: ${result.baseline.sharpeRatio.toFixed(2)}\n`;
      report += `- Max Drawdown: ${result.baseline.maxDrawdown.toFixed(2)}%\n\n`;

      if (result.regression) {
        report += `**Regression Analysis**:\n`;
        report += `- Return Change: ${result.regression.return > 0 ? '+' : ''}${result.regression.return.toFixed(2)}%\n`;
        report += `- vs ETH Hold Change: ${result.regression.vsEthHold > 0 ? '+' : ''}${result.regression.vsEthHold.toFixed(2)}%\n`;
        report += `- Sharpe Ratio Change: ${result.regression.sharpeRatio > 0 ? '+' : ''}${result.regression.sharpeRatio.toFixed(2)}\n`;
        report += `- Max Drawdown Change: ${result.regression.maxDrawdown > 0 ? '+' : ''}${result.regression.maxDrawdown.toFixed(2)}%\n\n`;
      }
    }
  }

  return report;
}

/**
 * Main function
 */
async function main() {
  console.log(`🔄 Running historical backtest verification for ${TIMEFRAME} timeframe...\n`);

  const baseline = loadBaseline();
  const results: VerificationResult[] = [];

  for (const period of TEST_PERIODS) {
    const isSynthetic = period.synthetic === true;
    const periodType = isSynthetic ? '🧪 Synthetic' : '📊 Historical';
    console.log(`${periodType} Testing ${period.name} (${period.startDate} to ${period.endDate})...`);
    
    try {
      const metrics = await runBacktest(period.startDate, period.endDate, DEFAULT_CONFIG, isSynthetic);
      
      // Handle skipped periods
      if (metrics.skipped) {
        console.log(`   ⏭️  SKIPPED: ${metrics.skipReason || 'Period too short'}`);
        results.push({
          period: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          passed: true, // Skipped periods don't fail verification
          synthetic: isSynthetic,
          metrics: {
            return: 0,
            vsEthHold: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            tradeCount: 0,
            winRate: 0,
          },
          skipped: true,
          skipReason: metrics.skipReason,
        });
        continue;
      }
      
      const result: VerificationResult = {
        period: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        passed: true,
        synthetic: isSynthetic,
        metrics,
      };

      if (baseline) {
        verifyAgainstBaseline(result, baseline);
      }

      results.push(result);
      console.log(`   ✅ Return: ${metrics.return.toFixed(2)}%, vs ETH: ${metrics.vsEthHold.toFixed(2)}%`);
      if (!result.passed) {
        console.log(`   ⚠️  REGRESSION DETECTED`);
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
      results.push({
        period: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        passed: false,
        synthetic: isSynthetic,
        metrics: {
          return: 0,
          vsEthHold: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          tradeCount: 0,
          winRate: 0,
        },
      });
    }
  }

  // Generate report
  const report = generateReport(results);
  console.log('\n' + report);

  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'trading-baselines', 'verification-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `verification-${TIMEFRAME}-${Date.now()}.md`);
  fs.writeFileSync(reportFile, report);
  console.log(`\n✅ Report saved to ${reportFile}`);

  // Update baseline if all tests passed and user requested it
  if (process.argv.includes('--update-baseline') && results.every(r => r.passed)) {
    const newBaseline: BaselineMetrics = baseline || {};
    if (!newBaseline[TIMEFRAME]) {
      newBaseline[TIMEFRAME] = {};
    }
    for (const result of results) {
      newBaseline[TIMEFRAME]![result.period] = result.metrics;
    }
    saveBaseline(newBaseline);
  }

  // Exit with error code if any test failed
  if (!results.every(r => r.passed)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});

