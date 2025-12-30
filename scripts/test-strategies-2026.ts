#!/usr/bin/env npx tsx
/**
 * Test Strategy Options 1 and 2 Against Synthetic 2026 Data
 * Tests various time periods to ensure profitability in all scenarios
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal, recordTradeResult, clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearIndicatorCache } from '../src/lib/market-regime-detector-cached';
import type { PriceCandle, Portfolio, Trade } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

interface TestResult {
  periodName: string;
  startDate: string;
  endDate: string;
  option1: PeriodMetrics;
  option2: PeriodMetrics;
  ethHold: PeriodMetrics;
  usdcHold: PeriodMetrics;
}

interface PeriodMetrics {
  finalValue: number;
  return: number;
  returnPct: number;
  maxDrawdownPct: number;
  totalTrades: number;
  winRate: number;
  sharpeRatio: number;
}

// Strategy Option 1: Best Risk-Adjusted (with improvements)
const OPTION1_CONFIG: EnhancedAdaptiveStrategyConfig = {
  bullishStrategy: {
    name: 'Bullish-Optimized',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.3, params: { period: 20 } },
      { type: 'ema', weight: 0.3, params: { period: 12 } },
      { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: 'rsi', weight: 0.2, params: { period: 14 } },
    ],
    buyThreshold: 0.4,
    sellThreshold: -0.35,
    maxPositionPct: 0.95,
    initialCapital: 1000,
  },
  bearishStrategy: {
    name: 'Bearish-Conservative',
    timeframe: '1d',
    indicators: [
      { type: 'sma', weight: 0.5, params: { period: 20 } },
      { type: 'ema', weight: 0.5, params: { period: 12 } },
    ],
    buyThreshold: 0.8, // 4. Tightened from 0.65 to 0.8
    sellThreshold: -0.2, // 4. Easier to exit (from -0.3)
    maxPositionPct: 0.2, // 4. Smaller positions (from 0.4)
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.25,
  momentumConfirmationThreshold: 0.3,
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 3,
  dynamicPositionSizing: false,
  maxBullishPosition: 0.95,
  // 1. Volatility Filter
  maxVolatility: 0.05, // 5% daily volatility threshold
  // 2. Circuit Breaker
  circuitBreakerWinRate: 0.2, // Stop if win rate < 20%
  circuitBreakerLookback: 10, // Check last 10 trades
  // 3. Whipsaw Detection
  whipsawDetectionPeriods: 5, // Check last 5 periods
  whipsawMaxChanges: 3, // Max 3 regime changes in 5 periods
};

// Strategy Option 2: Highest Returns (with improvements)
const OPTION2_CONFIG: EnhancedAdaptiveStrategyConfig = {
  ...OPTION1_CONFIG,
  bullishStrategy: {
    ...OPTION1_CONFIG.bullishStrategy,
    buyThreshold: 0.35,
    maxPositionPct: 0.85,
  },
};

const TEST_PERIODS = [
  // Standard quarters
  { name: 'Q1 (Jan-Mar)', start: '2026-01-01', end: '2026-03-31' },
  { name: 'Q2 (Apr-Jun)', start: '2026-04-01', end: '2026-06-30' },
  { name: 'Q3 (Jul-Sep)', start: '2026-07-01', end: '2026-09-30' },
  { name: 'Q4 (Oct-Dec)', start: '2026-10-01', end: '2026-12-31' },
  
  // Half years
  { name: 'H1 (Jan-Jun)', start: '2026-01-01', end: '2026-06-30' },
  { name: 'H2 (Jul-Dec)', start: '2026-07-01', end: '2026-12-31' },
  { name: 'Full Year', start: '2026-01-01', end: '2026-12-31' },
  
  // Specific market events
  { name: 'Bull Run Period', start: '2026-03-01', end: '2026-04-30' },
  { name: 'Crash Period', start: '2026-05-01', end: '2026-05-15' },
  { name: 'Bear Market', start: '2026-07-01', end: '2026-08-31' },
  { name: 'Whipsaw Period', start: '2026-09-01', end: '2026-09-30' },
  
  // 3-Month Combined Scenarios (Realistic)
  { name: 'Jan-Mar (Bull→Consolidation)', start: '2026-01-01', end: '2026-03-31' }, // Bull run + consolidation
  { name: 'Feb-Apr (Consolidation→Bull)', start: '2026-02-01', end: '2026-04-30' }, // Consolidation + mega bull
  { name: 'Mar-May (Bull→Crash)', start: '2026-03-01', end: '2026-05-31' }, // Mega bull + crash
  { name: 'Apr-Jun (Crash→Recovery)', start: '2026-04-01', end: '2026-06-30' }, // Crash + recovery
  { name: 'May-Jul (Recovery→Bear)', start: '2026-05-01', end: '2026-07-31' }, // Recovery + bear market
  { name: 'Jun-Aug (Bear→Bear)', start: '2026-06-01', end: '2026-08-31' }, // Extended bear market
  { name: 'Jul-Sep (Bear→Whipsaw)', start: '2026-07-01', end: '2026-09-30' }, // Bear + whipsaw (worst case)
  { name: 'Aug-Oct (Whipsaw→Bull)', start: '2026-08-01', end: '2026-10-31' }, // Whipsaw + bull recovery
  { name: 'Sep-Nov (Whipsaw→Bull→Bull)', start: '2026-09-01', end: '2026-11-30' }, // Whipsaw + extended bull
  { name: 'Oct-Dec (Bull→Correction)', start: '2026-10-01', end: '2026-12-31' }, // Bull + correction
  
  // 3-Month Edge Cases (Stress Tests)
  { name: 'Jan-Mar-Apr (Bull→Consolidation→Bull)', start: '2026-01-01', end: '2026-04-30' }, // Mixed bull periods
  { name: 'May-Jun-Jul (Crash→Recovery→Bear)', start: '2026-05-01', end: '2026-07-31' }, // Volatile transition
  { name: 'Aug-Sep-Oct (Bear→Whipsaw→Bull)', start: '2026-08-01', end: '2026-10-31' }, // Worst to best transition
  { name: 'Sep-Oct-Nov (Whipsaw→Bull→Bull)', start: '2026-09-01', end: '2026-11-30' }, // Recovery from whipsaw
  { name: 'Oct-Nov-Dec (Bull→Bull→Correction)', start: '2026-10-01', end: '2026-12-31' }, // Bull with correction end
  
  // 3-Month Optimal Strategy Tests
  { name: 'Optimal: Bull Start (Jan-Mar)', start: '2026-01-01', end: '2026-03-31' }, // Should capture bull run
  { name: 'Optimal: Volatile Mix (Mar-May)', start: '2026-03-01', end: '2026-05-31' }, // Bull + crash (should avoid crash)
  { name: 'Optimal: Recovery Period (May-Jul)', start: '2026-05-01', end: '2026-07-31' }, // Recovery + bear (should exit bear)
  { name: 'Optimal: Worst Case (Jul-Sep)', start: '2026-07-01', end: '2026-09-30' }, // Bear + whipsaw (should protect)
  { name: 'Optimal: Recovery Test (Sep-Nov)', start: '2026-09-01', end: '2026-11-30' }, // Whipsaw + bull (should capture recovery)
];

function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[]
): Trade | null {
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  const basePositionSize = portfolio.usdcBalance * (activeStrategy.maxPositionPct || 0.75);
  const positionSize = signal.positionSizeMultiplier * basePositionSize * confidence;

  if (isBuy && portfolio.usdcBalance >= positionSize) {
    const ethAmount = positionSize / currentPrice;
    const fee = positionSize * 0.001;
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

async function testStrategy(
  config: EnhancedAdaptiveStrategyConfig,
  candles: PriceCandle[],
  startDate: string,
  endDate: string,
  configName: string
): Promise<PeriodMetrics> {
  clearRegimeHistory();
  clearIndicatorCache();
  
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  if (startIndex < 50) startIndex = 50;
  
  let endIndex = candles.findIndex(c => c.timestamp > endTime);
  if (endIndex === -1) endIndex = candles.length;
  
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
  const sessionId = `test-2026-${configName}-${startDate}`;
  
  // Preload regime history
  const historyPreloadStartIndex = Math.max(0, startIndex - 10);
  for (let i = historyPreloadStartIndex; i < startIndex; i++) {
    const { detectMarketRegimeCached } = await import('../src/lib/market-regime-detector-cached');
    const regime = detectMarketRegimeCached(candles, i);
  }
  
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  const returns: number[] = [];
  
  for (let i = startIndex; i < endIndex && i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;
    
    const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    const trade = executeTrade(signal, confidence, currentPrice, portfolio, trades);
    
    // Record trade result for circuit breaker
    if (trade && sessionId && trade.type === 'sell') {
      const lastBuy = [...trades].slice(0, -1).reverse().find(t => t.type === 'buy');
      if (lastBuy) {
        const profit = trade.usdcAmount - lastBuy.usdcAmount;
        recordTradeResult(sessionId, profit > 0);
      }
    }
    
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;
    
    if (portfolio.totalValue > maxValue) maxValue = portfolio.totalValue;
    const drawdown = maxValue - portfolio.totalValue;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    if (i > startIndex) {
      const prevValue = i === startIndex + 1 ? portfolio.initialCapital : portfolio.totalValue;
      const periodReturn = (portfolio.totalValue - prevValue) / prevValue;
      returns.push(periodReturn);
    }
  }
  
  // Calculate Sharpe ratio
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  const sellTrades = trades.filter(t => t.type === 'sell').length;
  const winRate = sellTrades > 0 ? (portfolio.winCount / sellTrades) * 100 : 0;
  
  return {
    finalValue: portfolio.totalValue,
    return: portfolio.totalReturn,
    returnPct: (portfolio.totalReturn / portfolio.initialCapital) * 100,
    maxDrawdownPct: (maxDrawdown / portfolio.initialCapital) * 100,
    totalTrades: trades.length,
    winRate,
    sharpeRatio,
  };
}

async function calculateHoldMetrics(
  candles: PriceCandle[],
  startDate: string,
  endDate: string,
  initialCapital: number
): Promise<{ ethHold: PeriodMetrics; usdcHold: PeriodMetrics }> {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  
  const startCandle = candles.find(c => c.timestamp >= startTime);
  const endCandle = candles.filter(c => c.timestamp <= endTime).pop();
  
  if (!startCandle || !endCandle) {
    throw new Error(`Could not find candles for period ${startDate} to ${endDate}`);
  }
  
  const startPrice = startCandle.close;
  const endPrice = endCandle.close;
  
  // ETH Hold
  const ethAmount = initialCapital / startPrice;
  const ethFinalValue = ethAmount * endPrice;
  const ethReturn = ethFinalValue - initialCapital;
  
  // Calculate ETH hold drawdown
  let ethMaxValue = ethFinalValue;
  let ethMaxDrawdown = 0;
  const startIndex = candles.findIndex(c => c.timestamp >= startTime);
  const endIndex = candles.findIndex(c => c.timestamp > endTime);
  
  for (let i = startIndex; i < endIndex && i < candles.length; i++) {
    const currentValue = ethAmount * candles[i]!.close;
    if (currentValue > ethMaxValue) ethMaxValue = currentValue;
    const drawdown = ethMaxValue - currentValue;
    if (drawdown > ethMaxDrawdown) ethMaxDrawdown = drawdown;
  }
  
  // USDC Hold
  const usdcFinalValue = initialCapital;
  
  return {
    ethHold: {
      finalValue: ethFinalValue,
      return: ethReturn,
      returnPct: (ethReturn / initialCapital) * 100,
      maxDrawdownPct: (ethMaxDrawdown / initialCapital) * 100,
      totalTrades: 0,
      winRate: 0,
      sharpeRatio: 0,
    },
    usdcHold: {
      finalValue: usdcFinalValue,
      return: 0,
      returnPct: 0,
      maxDrawdownPct: 0,
      totalTrades: 0,
      winRate: 0,
      sharpeRatio: 0,
    },
  };
}

async function main() {
  console.log('🧪 Testing Strategy Options Against Synthetic 2026 Data\n');
  
  // Load synthetic 2026 data directly from file (in synthetic folder)
  console.log('📊 Loading synthetic 2026 data...');
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  const filepath = path.join(dataDir, 'ethusdt_1d_2026-01-01_2026-12-30.json.gz');
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Synthetic 2026 data not found at ${filepath}. Run 'pnpm eth:generate-2026' first.`);
  }
  
  const compressed = fs.readFileSync(filepath);
  const decompressed = zlib.gunzipSync(compressed);
  const candles: PriceCandle[] = JSON.parse(decompressed.toString());
  
  console.log(`✅ Loaded ${candles.length} candles from synthetic 2026 data\n`);
  
  const results: TestResult[] = [];
  
  for (const period of TEST_PERIODS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${period.name} (${period.start} to ${period.end})`);
    console.log('='.repeat(60));
    
    try {
      const option1 = await testStrategy(OPTION1_CONFIG, candles, period.start, period.end, 'option1');
      const option2 = await testStrategy(OPTION2_CONFIG, candles, period.start, period.end, 'option2');
      const { ethHold, usdcHold } = await calculateHoldMetrics(candles, period.start, period.end, 1000);
      
      results.push({
        periodName: period.name,
        startDate: period.start,
        endDate: period.end,
        option1,
        option2,
        ethHold,
        usdcHold,
      });
      
      console.log(`\nOption 1 (Risk-Adjusted):`);
      console.log(`  Return: ${option1.returnPct >= 0 ? '+' : ''}${option1.returnPct.toFixed(2)}%`);
      console.log(`  vs ETH: ${(option1.returnPct - ethHold.returnPct) >= 0 ? '+' : ''}${(option1.returnPct - ethHold.returnPct).toFixed(2)}%`);
      console.log(`  vs USDC: ${option1.returnPct >= 0 ? '+' : ''}${option1.returnPct.toFixed(2)}%`);
      console.log(`  Trades: ${option1.totalTrades}, Win Rate: ${option1.winRate.toFixed(1)}%`);
      
      console.log(`\nOption 2 (Highest Returns):`);
      console.log(`  Return: ${option2.returnPct >= 0 ? '+' : ''}${option2.returnPct.toFixed(2)}%`);
      console.log(`  vs ETH: ${(option2.returnPct - ethHold.returnPct) >= 0 ? '+' : ''}${(option2.returnPct - ethHold.returnPct).toFixed(2)}%`);
      console.log(`  vs USDC: ${option2.returnPct >= 0 ? '+' : ''}${option2.returnPct.toFixed(2)}%`);
      console.log(`  Trades: ${option2.totalTrades}, Win Rate: ${option2.winRate.toFixed(1)}%`);
      
      console.log(`\nETH Hold: ${ethHold.returnPct >= 0 ? '+' : ''}${ethHold.returnPct.toFixed(2)}%`);
      console.log(`USDC Hold: ${usdcHold.returnPct.toFixed(2)}%`);
      
    } catch (error) {
      console.error(`❌ Error testing ${period.name}:`, error);
    }
  }
  
  // Generate report
  const report = generateReport(results);
  
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `strategy-test-2026-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');
  
  console.log(`\n✅ Testing complete!`);
  console.log(`📄 Report saved to: ${reportPath}`);
}

function generateReport(results: TestResult[]): string {
  return `# Strategy Testing Results - Synthetic 2026 Data

**Generated**: ${new Date().toISOString()}
**Purpose**: Test strategy options against various market scenarios in 2026

## Summary

| Period | Option 1 Return | Option 1 vs ETH | Option 2 Return | Option 2 vs ETH | ETH Hold | USDC Hold |
|--------|----------------|-----------------|-----------------|-----------------|----------|-----------|
${results.map(r => `| ${r.periodName} | ${r.option1.returnPct >= 0 ? '+' : ''}${r.option1.returnPct.toFixed(2)}% | ${(r.option1.returnPct - r.ethHold.returnPct) >= 0 ? '+' : ''}${(r.option1.returnPct - r.ethHold.returnPct).toFixed(2)}% | ${r.option2.returnPct >= 0 ? '+' : ''}${r.option2.returnPct.toFixed(2)}% | ${(r.option2.returnPct - r.ethHold.returnPct) >= 0 ? '+' : ''}${(r.option2.returnPct - r.ethHold.returnPct).toFixed(2)}% | ${r.ethHold.returnPct >= 0 ? '+' : ''}${r.ethHold.returnPct.toFixed(2)}% | ${r.usdcHold.returnPct.toFixed(2)}% |`).join('\n')}

## Detailed Results

${results.map(r => `
### ${r.periodName} (${r.startDate} to ${r.endDate})

**Option 1 (Risk-Adjusted):**
- Return: ${r.option1.returnPct >= 0 ? '+' : ''}${r.option1.returnPct.toFixed(2)}%
- vs ETH Hold: ${(r.option1.returnPct - r.ethHold.returnPct) >= 0 ? '+' : ''}${(r.option1.returnPct - r.ethHold.returnPct).toFixed(2)}%
- vs USDC Hold: ${r.option1.returnPct >= 0 ? '+' : ''}${r.option1.returnPct.toFixed(2)}%
- Final Value: $${r.option1.finalValue.toFixed(2)}
- Max Drawdown: ${r.option1.maxDrawdownPct.toFixed(2)}%
- Trades: ${r.option1.totalTrades}
- Win Rate: ${r.option1.winRate.toFixed(1)}%
- Sharpe: ${r.option1.sharpeRatio.toFixed(3)}

**Option 2 (Highest Returns):**
- Return: ${r.option2.returnPct >= 0 ? '+' : ''}${r.option2.returnPct.toFixed(2)}%
- vs ETH Hold: ${(r.option2.returnPct - r.ethHold.returnPct) >= 0 ? '+' : ''}${(r.option2.returnPct - r.ethHold.returnPct).toFixed(2)}%
- vs USDC Hold: ${r.option2.returnPct >= 0 ? '+' : ''}${r.option2.returnPct.toFixed(2)}%
- Final Value: $${r.option2.finalValue.toFixed(2)}
- Max Drawdown: ${r.option2.maxDrawdownPct.toFixed(2)}%
- Trades: ${r.option2.totalTrades}
- Win Rate: ${r.option2.winRate.toFixed(1)}%
- Sharpe: ${r.option2.sharpeRatio.toFixed(3)}

**Buy-and-Hold:**
- ETH Hold: ${r.ethHold.returnPct >= 0 ? '+' : ''}${r.ethHold.returnPct.toFixed(2)}% (Max DD: ${r.ethHold.maxDrawdownPct.toFixed(2)}%)
- USDC Hold: ${r.usdcHold.returnPct.toFixed(2)}%
`).join('\n---\n')}

## Conclusions

${results.every(r => r.option1.returnPct > r.ethHold.returnPct && r.option1.returnPct > 0) ? '✅ Option 1 outperforms ETH hold in all periods' : '⚠️ Option 1 does not outperform ETH hold in all periods'}
${results.every(r => r.option2.returnPct > r.ethHold.returnPct && r.option2.returnPct > 0) ? '✅ Option 2 outperforms ETH hold in all periods' : '⚠️ Option 2 does not outperform ETH hold in all periods'}
${results.every(r => r.option1.returnPct > 0) ? '✅ Option 1 is profitable in all periods' : '⚠️ Option 1 has losses in some periods'}
${results.every(r => r.option2.returnPct > 0) ? '✅ Option 2 is profitable in all periods' : '⚠️ Option 2 has losses in some periods'}

---
*Testing against synthetic 2026 data with various market regimes*
`;
}

main().catch(console.error);

