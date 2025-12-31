#!/usr/bin/env npx tsx
/**
 * Strategy Optimization Script
 * Tests different strategy configurations to find optimal parameters
 */

// Configurable timeframe - default to 8h
const TIMEFRAME = (process.env.TIMEFRAME as '8h' | '12h' | '1d') || '8h';

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '../src/lib/market-regime-detector-cached';
import type { PriceCandle, Portfolio, Trade, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  configName: string;
  config: EnhancedAdaptiveStrategyConfig;
  bullishPeriod: PeriodResult;
  bearishPeriod: PeriodResult;
  fullYear: PeriodResult;
}

interface PeriodResult {
  totalTrades: number;
  totalReturn: number;
  returnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  ethHoldReturnPct: number;
  vsEthHold: number; // Difference in return %
  sharpeRatio: number;
}

const TEST_PERIODS = [
  { name: 'bullish', start: '2025-04-01', end: '2025-08-23' },
  { name: 'bearish', start: '2025-01-01', end: '2025-06-01' },
  { name: 'fullYear', start: '2025-01-01', end: '2025-12-27' },
];

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

async function testConfig(
  config: EnhancedAdaptiveStrategyConfig,
  configName: string,
  startDate: string,
  endDate: string
): Promise<PeriodResult> {
  clearRegimeHistory();
  clearIndicatorCache();
  
  const historyStartDate = new Date(startDate);
  historyStartDate.setDate(historyStartDate.getDate() - 200);
  const historyStart = historyStartDate.toISOString().split('T')[0];
  const minHistoryDate = '2025-01-01';
  const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
  
  // Configurable timeframe - default to 8h
  const TIMEFRAME = (process.env.TIMEFRAME as '8h' | '12h' | '1d') || '8h';
  const candles = await fetchPriceCandles('ETHUSDT', TIMEFRAME, actualHistoryStart, endDate);
  if (candles.length < 50) throw new Error('Not enough candles');
  
  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  if (startIndex < 50) startIndex = 50;
  
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
  const sessionId = `optimize-${configName}-${startDate}`;
  
  // Preload regime history
  const regimeHistory: Array<'bullish' | 'bearish' | 'neutral'> = [];
  const historyPreloadStartIndex = Math.max(0, startIndex - 10);
  for (let i = historyPreloadStartIndex; i < startIndex; i++) {
    const { detectMarketRegimeCached } = await import('../src/lib/market-regime-detector-cached');
    const regime = detectMarketRegimeCached(candles, i);
    regimeHistory.push(regime.regime);
    if (regimeHistory.length > 10) regimeHistory.shift();
  }
  
  let maxValue = portfolio.totalValue;
  let maxDrawdown = 0;
  const returns: number[] = [];
  
  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;
    
    const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    const trade = executeTrade(signal, confidence, currentPrice, portfolio, trades);
    
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
  
  // Calculate ETH hold return
  const startPrice = candles[startIndex]!.close;
  const endPrice = candles[candles.length - 1]!.close;
  const ethHoldReturnPct = ((endPrice - startPrice) / startPrice) * 100;
  
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
    totalTrades: trades.length,
    totalReturn: portfolio.totalReturn,
    returnPct: (portfolio.totalReturn / portfolio.initialCapital) * 100,
    maxDrawdownPct: (maxDrawdown / portfolio.initialCapital) * 100,
    winRate,
    ethHoldReturnPct,
    vsEthHold: (portfolio.totalReturn / portfolio.initialCapital) * 100 - ethHoldReturnPct,
    sharpeRatio,
  };
}

async function main() {
  console.log('🔬 Strategy Optimization Test\n');
  
  // Test different configurations
  const configs: Array<{ name: string; config: EnhancedAdaptiveStrategyConfig }> = [
    // Current config (baseline)
    {
      name: 'Current',
      config: {
        bullishStrategy: {
          name: 'Bullish-Conservative',
          timeframe: TIMEFRAME,
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
          timeframe: TIMEFRAME,
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
      },
    },
    // Config 1: Much higher thresholds (dramatically fewer trades)
    {
      name: 'High Thresholds',
      config: {
        bullishStrategy: {
          name: 'Bullish-Conservative',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.3, params: { period: 20 } },
            { type: 'ema', weight: 0.3, params: { period: 12 } },
            { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
            { type: 'rsi', weight: 0.2, params: { period: 14 } },
          ],
          buyThreshold: 0.6, // Much higher - only trade on strong signals
          sellThreshold: -0.5, // Much more negative - hold through dips
          maxPositionPct: 0.9, // Larger positions when we do trade
          initialCapital: 1000,
        },
        bearishStrategy: {
          name: 'Strategy1',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.5, params: { period: 20 } },
            { type: 'ema', weight: 0.5, params: { period: 12 } },
          ],
          buyThreshold: 0.7, // Very high - rarely buy in bearish
          sellThreshold: -0.4, // More negative
          maxPositionPct: 0.4, // Smaller positions in bearish
          initialCapital: 1000,
        },
        regimeConfidenceThreshold: 0.3, // Higher confidence required
        momentumConfirmationThreshold: 0.35, // Higher momentum required
        bullishPositionMultiplier: 1.2,
        regimePersistencePeriods: 3, // Require 3 out of 5 (more persistent)
        dynamicPositionSizing: true,
        maxBullishPosition: 0.95,
      },
    },
    // Config 2: Buy-and-hold with selective exits (minimal trading)
    {
      name: 'Selective Trading',
      config: {
        bullishStrategy: {
          name: 'Bullish-Selective',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.3, params: { period: 20 } },
            { type: 'ema', weight: 0.3, params: { period: 12 } },
            { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
            { type: 'rsi', weight: 0.2, params: { period: 14 } },
          ],
          buyThreshold: 0.4, // Moderate - buy on good signals
          sellThreshold: -0.6, // Very negative - only sell on strong bearish signals
          maxPositionPct: 0.95, // Use almost all capital when buying
          initialCapital: 1000,
        },
        bearishStrategy: {
          name: 'Bearish-Selective',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.5, params: { period: 20 } },
            { type: 'ema', weight: 0.5, params: { period: 12 } },
          ],
          buyThreshold: 0.8, // Very high - almost never buy in bearish
          sellThreshold: -0.3, // Moderate - sell on bearish signals
          maxPositionPct: 0.2, // Very small positions if we do buy
          initialCapital: 1000,
        },
        regimeConfidenceThreshold: 0.25,
        momentumConfirmationThreshold: 0.3,
        bullishPositionMultiplier: 1.0, // No multiplier - use base position
        regimePersistencePeriods: 4, // Very persistent - require 4/5
        dynamicPositionSizing: false, // Disable dynamic sizing
        maxBullishPosition: 0.95,
      },
    },
    // Config 3: Trend-following (buy strong trends, hold through noise)
    {
      name: 'Trend Following',
      config: {
        bullishStrategy: {
          name: 'Bullish-Trend',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.4, params: { period: 20 } },
            { type: 'ema', weight: 0.4, params: { period: 12 } },
            { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
          ],
          buyThreshold: 0.5, // Higher threshold
          sellThreshold: -0.5, // Very negative - hold through dips
          maxPositionPct: 0.9,
          initialCapital: 1000,
        },
        bearishStrategy: {
          name: 'Bearish-Trend',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.5, params: { period: 20 } },
            { type: 'ema', weight: 0.5, params: { period: 12 } },
          ],
          buyThreshold: 0.7, // Very high
          sellThreshold: -0.35, // Moderate
          maxPositionPct: 0.3,
          initialCapital: 1000,
        },
        regimeConfidenceThreshold: 0.3,
        momentumConfirmationThreshold: 0.4, // Higher momentum required
        bullishPositionMultiplier: 1.0,
        regimePersistencePeriods: 3,
        dynamicPositionSizing: false,
        maxBullishPosition: 0.95,
      },
    },
    // Config 4: Minimal trading (only trade on very strong signals)
    {
      name: 'Minimal Trading',
      config: {
        bullishStrategy: {
          name: 'Bullish-Minimal',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.3, params: { period: 20 } },
            { type: 'ema', weight: 0.3, params: { period: 12 } },
            { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
            { type: 'rsi', weight: 0.2, params: { period: 14 } },
          ],
          buyThreshold: 0.7, // Very high - only strongest signals
          sellThreshold: -0.7, // Very negative - almost never sell
          maxPositionPct: 0.95, // Use full position when we do trade
          initialCapital: 1000,
        },
        bearishStrategy: {
          name: 'Bearish-Minimal',
          timeframe: TIMEFRAME,
          indicators: [
            { type: 'sma', weight: 0.5, params: { period: 20 } },
            { type: 'ema', weight: 0.5, params: { period: 12 } },
          ],
          buyThreshold: 0.9, // Extremely high - almost never buy
          sellThreshold: -0.5, // Very negative
          maxPositionPct: 0.1, // Tiny positions if we do buy
          initialCapital: 1000,
        },
        regimeConfidenceThreshold: 0.35, // High confidence
        momentumConfirmationThreshold: 0.4, // High momentum
        bullishPositionMultiplier: 1.0,
        regimePersistencePeriods: 4, // Very persistent
        dynamicPositionSizing: false,
        maxBullishPosition: 0.95,
      },
    },
  ];
  
  const results: TestResult[] = [];
  
  for (const { name, config } of configs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${name}`);
    console.log('='.repeat(60));
    
    const bullishResult = await testConfig(config, name, TEST_PERIODS[0]!.start, TEST_PERIODS[0]!.end);
    console.log(`  Bullish: ${bullishResult.totalTrades} trades, ${bullishResult.returnPct >= 0 ? '+' : ''}${bullishResult.returnPct.toFixed(2)}% (vs ETH: ${bullishResult.vsEthHold >= 0 ? '+' : ''}${bullishResult.vsEthHold.toFixed(2)}%)`);
    
    const bearishResult = await testConfig(config, name, TEST_PERIODS[1]!.start, TEST_PERIODS[1]!.end);
    console.log(`  Bearish: ${bearishResult.totalTrades} trades, ${bearishResult.returnPct >= 0 ? '+' : ''}${bearishResult.returnPct.toFixed(2)}% (vs ETH: ${bearishResult.vsEthHold >= 0 ? '+' : ''}${bearishResult.vsEthHold.toFixed(2)}%)`);
    
    const fullYearResult = await testConfig(config, name, TEST_PERIODS[2]!.start, TEST_PERIODS[2]!.end);
    console.log(`  Full Year: ${fullYearResult.totalTrades} trades, ${fullYearResult.returnPct >= 0 ? '+' : ''}${fullYearResult.returnPct.toFixed(2)}% (vs ETH: ${fullYearResult.vsEthHold >= 0 ? '+' : ''}${fullYearResult.vsEthHold.toFixed(2)}%)`);
    
    results.push({
      configName: name,
      config,
      bullishPeriod: bullishResult,
      bearishPeriod: bearishResult,
      fullYear: fullYearResult,
    });
  }
  
  // Generate comparison report
  const report = generateComparisonReport(results);
  
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `strategy-optimization-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');
  
  console.log(`\n✅ Optimization complete!`);
  console.log(`📄 Report saved to: ${reportPath}`);
  
  // Find best config
  const bestConfig = results.reduce((best, current) => {
    const currentScore = current.fullYear.returnPct + (current.fullYear.vsEthHold * 2); // Weight vs ETH hold
    const bestScore = best.fullYear.returnPct + (best.fullYear.vsEthHold * 2);
    return currentScore > bestScore ? current : best;
  });
  
  console.log(`\n🏆 Best Configuration: ${bestConfig.configName}`);
  console.log(`   Full Year Return: ${bestConfig.fullYear.returnPct >= 0 ? '+' : ''}${bestConfig.fullYear.returnPct.toFixed(2)}%`);
  console.log(`   vs ETH Hold: ${bestConfig.fullYear.vsEthHold >= 0 ? '+' : ''}${bestConfig.fullYear.vsEthHold.toFixed(2)}%`);
  console.log(`   Total Trades: ${bestConfig.fullYear.totalTrades}`);
}

function generateComparisonReport(results: TestResult[]): string {
  return `# Strategy Optimization Results

**Generated**: ${new Date().toISOString()}

## Summary Comparison

| Config | Bullish Return | Bearish Return | Full Year Return | Full Year vs ETH | Total Trades (Full Year) | Win Rate | Max DD |
|--------|---------------|----------------|------------------|------------------|-------------------------|----------|--------|
${results.map(r => `| **${r.configName}** | ${r.bullishPeriod.returnPct >= 0 ? '+' : ''}${r.bullishPeriod.returnPct.toFixed(2)}% | ${r.bearishPeriod.returnPct >= 0 ? '+' : ''}${r.bearishPeriod.returnPct.toFixed(2)}% | ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% | ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}% | ${r.fullYear.totalTrades} | ${r.fullYear.winRate.toFixed(1)}% | ${r.fullYear.maxDrawdownPct.toFixed(2)}% |`).join('\n')}

## Detailed Results

${results.map(r => `
### ${r.configName}

**Configuration:**
- Bullish: buyThreshold=${r.config.bullishStrategy.buyThreshold}, sellThreshold=${r.config.bullishStrategy.sellThreshold}, maxPosition=${r.config.bullishStrategy.maxPositionPct}
- Bearish: buyThreshold=${r.config.bearishStrategy.buyThreshold}, sellThreshold=${r.config.bearishStrategy.sellThreshold}, maxPosition=${r.config.bearishStrategy.maxPositionPct}
- Regime Confidence: ${r.config.regimeConfidenceThreshold}
- Momentum Threshold: ${r.config.momentumConfirmationThreshold}
- Persistence: ${r.config.regimePersistencePeriods}/5 periods

**Bullish Period (2025-04-01 to 2025-08-23):**
- Return: ${r.bullishPeriod.returnPct >= 0 ? '+' : ''}${r.bullishPeriod.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.bullishPeriod.vsEthHold >= 0 ? '+' : ''}${r.bullishPeriod.vsEthHold.toFixed(2)}%
- Trades: ${r.bullishPeriod.totalTrades}
- Win Rate: ${r.bullishPeriod.winRate.toFixed(1)}%
- Sharpe: ${r.bullishPeriod.sharpeRatio.toFixed(3)}

**Bearish Period (2025-01-01 to 2025-06-01):**
- Return: ${r.bearishPeriod.returnPct >= 0 ? '+' : ''}${r.bearishPeriod.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.bearishPeriod.vsEthHold >= 0 ? '+' : ''}${r.bearishPeriod.vsEthHold.toFixed(2)}%
- Trades: ${r.bearishPeriod.totalTrades}
- Win Rate: ${r.bearishPeriod.winRate.toFixed(1)}%
- Sharpe: ${r.bearishPeriod.sharpeRatio.toFixed(3)}

**Full Year (2025-01-01 to 2025-12-27):**
- Return: ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}%
- vs ETH Hold: ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}%
- Trades: ${r.fullYear.totalTrades}
- Win Rate: ${r.fullYear.winRate.toFixed(1)}%
- Max Drawdown: ${r.fullYear.maxDrawdownPct.toFixed(2)}%
- Sharpe: ${r.fullYear.sharpeRatio.toFixed(3)}
`).join('\n---\n')}

## Recommendations

Based on the results, the best configuration should:
1. Outperform ETH hold in the full year period
2. Have reasonable trade frequency (not too many trades)
3. Have good win rate (>40%)
4. Have manageable drawdown (<50%)

---
*Using new smoothed regime detection with hysteresis*
`;
}

main().catch(console.error);

