#!/usr/bin/env npx tsx
/**
 * Backfill test for specific date ranges
 * Tests the new smoothed regime detection method
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '../src/lib/market-regime-detector-cached';
import type { PriceCandle, Portfolio, Trade } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';

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

const DEFAULT_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Conservative',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.3, params: { period: 20 } },
      { type: 'ema', weight: 0.3, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.35,
    sellThreshold: -0.3,
    maxPositionPct: 0.75,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Strategy1',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.45,
    sellThreshold: -0.2,
    maxPositionPct: 0.5,
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.2,
  momentumConfirmationThreshold: 0.25,
  bullishPositionMultiplier: 1.1,
  regimePersistencePeriods: 2,
  dynamicPositionSizing: true,
  maxBullishPosition: 0.95,
};

function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[]
): Trade | null {
  // Use signal.action instead of signal.signal to respect buy/sell thresholds
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  // Calculate position size
  const basePositionSize = portfolio.usdcBalance * (activeStrategy.maxPositionPct || 0.75);
  const positionSize = signal.positionSizeMultiplier * basePositionSize * confidence;

  if (isBuy && portfolio.usdcBalance >= positionSize) {
    const ethAmount = positionSize / currentPrice;
    const fee = positionSize * 0.001; // 0.1% fee
    const totalCost = positionSize + fee;

    if (portfolio.usdcBalance >= totalCost) {
      portfolio.usdcBalance -= totalCost;
      portfolio.ethBalance += ethAmount;
      portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
      portfolio.tradeCount++;
      portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;

      const trade: Trade = {
        id: `trade-${Date.now()}-${Math.random()}`,
        type: 'buy',
        timestamp: Date.now(),
        ethPrice: currentPrice,
        ethAmount: ethAmount,
        usdcAmount: positionSize,
        signal: signal.signal,
        confidence,
        portfolioValue: portfolio.totalValue,
      };

      trades.push(trade);
      return trade;
    }
  } else if (!isBuy && portfolio.ethBalance > 0) {
    const ethToSell = Math.min(portfolio.ethBalance, (portfolio.ethBalance * activeStrategy.maxPositionPct));
    const saleValue = ethToSell * currentPrice;
    const fee = saleValue * 0.001;
    const netProceeds = saleValue - fee;

    // Check if this was a winning trade BEFORE updating portfolio
    const lastBuyTrade = [...trades].reverse().find(t => t.type === 'buy');
    if (lastBuyTrade) {
      const buyCost = lastBuyTrade.usdcAmount;
      const sellProceeds = saleValue - fee;
      const profit = sellProceeds - buyCost;
      if (profit > 0) portfolio.winCount++;
    }

    portfolio.ethBalance -= ethToSell;
    portfolio.usdcBalance += netProceeds;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;
    portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;

    const trade: Trade = {
      id: `trade-${Date.now()}-${Math.random()}`,
      type: 'sell',
      timestamp: Date.now(),
      ethPrice: currentPrice,
      ethAmount: ethToSell,
      usdcAmount: saleValue,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
    };

    trades.push(trade);
    return trade;
  }

  return null;
}

async function runBacktest(
  startDate: string,
  endDate: string
): Promise<BacktestResult> {
  console.log(`\n📊 Running backtest: ${startDate} to ${endDate}`);
  
  // Clear caches
  clearRegimeHistory();
  clearIndicatorCache();
  
  // Fetch candles (need extra history for indicators, but use available data)
  const historyStartDate = new Date(startDate);
  historyStartDate.setDate(historyStartDate.getDate() - 200); // Get 200 days before for indicators
  const historyStart = historyStartDate.toISOString().split('T')[0];
  
  // Use available historical data (starts at 2025-01-01)
  const minHistoryDate = '2025-01-01';
  const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
  
  const candles = await fetchPriceCandles('ETHUSDT', '1d', actualHistoryStart, endDate);
  console.log(`📈 Loaded ${candles.length} candles from ${actualHistoryStart} to ${endDate}`);
  
  if (candles.length < 50) {
    throw new Error(`Not enough candles loaded: ${candles.length}. Need at least 50 for indicators.`);
  }
  
  // Find start index (need at least 50 candles for indicators)
  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  if (startIndex < 50) startIndex = 50;
  
  // Initialize portfolio
  const portfolio: Portfolio = {
    usdcBalance: DEFAULT_CONFIG.bullishStrategy.initialCapital,
    ethBalance: 0,
    totalValue: DEFAULT_CONFIG.bullishStrategy.initialCapital,
    initialCapital: DEFAULT_CONFIG.bullishStrategy.initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };
  
  const trades: Trade[] = [];
  const periods: PeriodAnalysis[] = [];
  
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
  const initialCapital = DEFAULT_CONFIG.bullishStrategy.initialCapital;
  
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
    
    // Generate signal
    const signal = generateEnhancedAdaptiveSignal(
      candles,
      DEFAULT_CONFIG,
      i,
      sessionId
    );
    
    const confidence = calculateConfidence(signal, candles, i);
    
    // Execute trade
    const trade = executeTrade(signal, confidence, currentPrice, portfolio, trades);
    
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
  
  const testPeriods = [
    { name: 'Bullish Period', start: '2025-04-01', end: '2025-08-23' },
    { name: 'Bearish Period', start: '2025-01-01', end: '2025-06-01' },
    { name: 'Full Year 2025', start: '2025-01-01', end: '2025-12-27' }, // Use available data end date
  ];
  
  const reports: string[] = [];
  
  for (const period of testPeriods) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${period.name} (${period.start} to ${period.end})`);
    console.log('='.repeat(60));
    
    const result = await runBacktest(period.start, period.end);
    
    const report = generateReport(result, period.name);
    reports.push(report);
    
    console.log(`\n✅ Completed: ${period.name}`);
    console.log(`   ${result.totalTrades} trades, $${result.totalReturn.toFixed(2)} return (${result.totalReturnPct.toFixed(2)}%)`);
  }
  
  // Combine all reports
  const fullReport = `# Backfill Test Results - 2025 Periods

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

main().catch(console.error);

