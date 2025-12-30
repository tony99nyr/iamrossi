#!/usr/bin/env npx tsx
/**
 * Comprehensive Strategy Testing Framework
 * Tests many strategy configurations across historical periods
 * Ranks by profit and risk metrics
 */

import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '../src/lib/market-regime-detector-cached';
import type { PriceCandle, Portfolio, Trade, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import * as fs from 'fs';
import * as path from 'path';

interface StrategyResult {
  configName: string;
  config: EnhancedAdaptiveStrategyConfig;
  bullishPeriod: PeriodMetrics;
  bearishPeriod: PeriodMetrics;
  fullYear: PeriodMetrics;
  overallScore: number; // Combined score for ranking
}

interface PeriodMetrics {
  totalTrades: number;
  totalReturn: number;
  returnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  ethHoldReturnPct: number;
  vsEthHold: number; // Difference in return %
  sharpeRatio: number;
  riskAdjustedReturn: number; // returnPct / maxDrawdownPct
  profitFactor: number; // Gross profit / Gross loss
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
  candles: PriceCandle[],
  startDate: string,
  endDate: string
): Promise<PeriodMetrics> {
  clearRegimeHistory();
  clearIndicatorCache();
  
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
  const sessionId = `test-${configName}-${startDate}`;
  
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
  let grossProfit = 0;
  let grossLoss = 0;
  
  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;
    
    const signal = generateEnhancedAdaptiveSignal(candles, config, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    const trade = executeTrade(signal, confidence, currentPrice, portfolio, trades);
    
    // Track profit/loss for profit factor
    if (trade && trade.type === 'sell') {
      const lastBuy = [...trades].slice(0, -1).reverse().find(t => t.type === 'buy');
      if (lastBuy) {
        const profit = trade.usdcAmount - lastBuy.usdcAmount;
        if (profit > 0) grossProfit += profit;
        else grossLoss += Math.abs(profit);
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
  
  const returnPct = (portfolio.totalReturn / portfolio.initialCapital) * 100;
  const maxDrawdownPct = (maxDrawdown / portfolio.initialCapital) * 100;
  const riskAdjustedReturn = maxDrawdownPct > 0 ? returnPct / maxDrawdownPct : returnPct;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
  
  return {
    totalTrades: trades.length,
    totalReturn: portfolio.totalReturn,
    returnPct,
    maxDrawdownPct,
    winRate,
    ethHoldReturnPct,
    vsEthHold: returnPct - ethHoldReturnPct,
    sharpeRatio,
    riskAdjustedReturn,
    profitFactor,
  };
}

function generateStrategyConfigs(): Array<{ name: string; config: EnhancedAdaptiveStrategyConfig }> {
  const configs: Array<{ name: string; config: EnhancedAdaptiveStrategyConfig }> = [];
  
  // Base indicators
  const bullishIndicators: Array<{ type: 'sma' | 'ema' | 'macd' | 'rsi'; weight: number; params: Record<string, number> }> = [
    { type: 'sma', weight: 0.3, params: { period: 20 } },
    { type: 'ema', weight: 0.3, params: { period: 12 } },
    { type: 'macd', weight: 0.2, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    { type: 'rsi', weight: 0.2, params: { period: 14 } },
  ];
  
  const bearishIndicators: Array<{ type: 'sma' | 'ema'; weight: number; params: Record<string, number> }> = [
    { type: 'sma', weight: 0.5, params: { period: 20 } },
    { type: 'ema', weight: 0.5, params: { period: 12 } },
  ];
  
  // Test different threshold combinations
  const bullishBuyThresholds = [0.3, 0.4, 0.5, 0.6, 0.7];
  const bullishSellThresholds = [-0.2, -0.3, -0.4, -0.5, -0.6];
  const bullishMaxPositions = [0.7, 0.8, 0.85, 0.9, 0.95];
  
  const bearishBuyThresholds = [0.4, 0.5, 0.6, 0.7, 0.8];
  const bearishSellThresholds = [-0.15, -0.2, -0.3, -0.4];
  const bearishMaxPositions = [0.3, 0.4, 0.5];
  
  const regimeConfidences = [0.15, 0.2, 0.25, 0.3];
  const momentumThresholds = [0.2, 0.25, 0.3, 0.35];
  const persistencePeriods = [2, 3, 4];
  const dynamicSizingOptions = [true, false];
  
  // Generate a subset of combinations (not all, as that would be too many)
  // Focus on promising combinations
  let configIndex = 0;
  
  // Test 1: Current baseline
  configs.push({
    name: `Config-${++configIndex}-Baseline`,
    config: {
      bullishStrategy: {
        name: 'Bullish-Conservative',
        timeframe: '1d',
        indicators: bullishIndicators,
        buyThreshold: 0.35,
        sellThreshold: -0.3,
        maxPositionPct: 0.75,
        initialCapital: 1000,
      },
      bearishStrategy: {
        name: 'Strategy1',
        timeframe: '1d',
        indicators: bearishIndicators,
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
  });
  
  // Test 2-15: Focus on promising configurations based on previous results
  // Balanced approach with variations around the top performer
  for (const buyThresh of [0.35, 0.4, 0.45]) {
    for (const sellThresh of [-0.3, -0.35, -0.4, -0.45]) {
      if (configs.length >= 20) break;
      configs.push({
        name: `Config-${++configIndex}-Balanced-B${buyThresh}-S${Math.abs(sellThresh)}`,
        config: {
          bullishStrategy: {
            name: 'Bullish-Balanced',
            timeframe: '1d',
            indicators: bullishIndicators,
            buyThreshold: buyThresh,
            sellThreshold: sellThresh,
            maxPositionPct: 0.85,
            initialCapital: 1000,
          },
          bearishStrategy: {
            name: 'Bearish-Balanced',
            timeframe: '1d',
            indicators: bearishIndicators,
            buyThreshold: 0.65,
            sellThreshold: -0.3,
            maxPositionPct: 0.4,
            initialCapital: 1000,
          },
          regimeConfidenceThreshold: 0.25,
          momentumConfirmationThreshold: 0.3,
          bullishPositionMultiplier: 1.0,
          regimePersistencePeriods: 3,
          dynamicPositionSizing: false,
          maxBullishPosition: 0.95,
        },
      });
    }
  }
  
  // Test 16-22: Variations with different persistence and confidence
  for (const persistence of [2, 3, 4]) {
    for (const confidence of [0.2, 0.25, 0.3]) {
      if (configs.length >= 25) break;
      configs.push({
        name: `Config-${++configIndex}-Persist${persistence}-Conf${confidence}`,
        config: {
          bullishStrategy: {
            name: 'Bullish-Persist',
            timeframe: '1d',
            indicators: bullishIndicators,
            buyThreshold: 0.4,
            sellThreshold: -0.35,
            maxPositionPct: 0.85,
            initialCapital: 1000,
          },
          bearishStrategy: {
            name: 'Bearish-Persist',
            timeframe: '1d',
            indicators: bearishIndicators,
            buyThreshold: 0.65,
            sellThreshold: -0.3,
            maxPositionPct: 0.4,
            initialCapital: 1000,
          },
          regimeConfidenceThreshold: confidence,
          momentumConfirmationThreshold: 0.3,
          bullishPositionMultiplier: 1.0,
          regimePersistencePeriods: persistence,
          dynamicPositionSizing: false,
          maxBullishPosition: 0.95,
        },
      });
    }
  }
  
  // Test 23-28: Position size variations
  for (const maxPos of [0.8, 0.85, 0.9, 0.95]) {
    if (configs.length >= 30) break;
    configs.push({
      name: `Config-${++configIndex}-MaxPos${maxPos}`,
      config: {
        bullishStrategy: {
          name: 'Bullish-MaxPos',
          timeframe: '1d',
          indicators: bullishIndicators,
          buyThreshold: 0.4,
          sellThreshold: -0.35,
          maxPositionPct: maxPos,
          initialCapital: 1000,
        },
        bearishStrategy: {
          name: 'Bearish-MaxPos',
          timeframe: '1d',
          indicators: bearishIndicators,
          buyThreshold: 0.65,
          sellThreshold: -0.3,
          maxPositionPct: 0.4,
          initialCapital: 1000,
        },
        regimeConfidenceThreshold: 0.25,
        momentumConfirmationThreshold: 0.3,
        bullishPositionMultiplier: 1.0,
        regimePersistencePeriods: 3,
        dynamicPositionSizing: false,
        maxBullishPosition: 0.95,
      },
    });
  }
  
  return configs;
}

function calculateOverallScore(result: StrategyResult): number {
  // Weighted scoring considering all three periods:
  // - Full year return vs ETH hold: 30% (most important)
  // - Bullish period return vs ETH: 20% (must perform in bull markets)
  // - Bearish period return vs ETH: 20% (must perform in bear markets)
  // - Full year return: 10%
  // - Risk-adjusted return: 10%
  // - Win rate: 5%
  // - Sharpe ratio: 3%
  // - Profit factor: 2%
  
  const fullYear = result.fullYear;
  const bullish = result.bullishPeriod;
  const bearish = result.bearishPeriod;
  
  // Full year vs ETH hold (target: outperform by at least 10%)
  const fullYearVsEthScore = Math.max(0, Math.min(100, (fullYear.vsEthHold + 20) * 2.5));
  
  // Bullish period vs ETH hold (must outperform in bull markets)
  const bullishVsEthScore = Math.max(0, Math.min(100, (bullish.vsEthHold + 20) * 2.5));
  
  // Bearish period vs ETH hold (must outperform in bear markets)
  const bearishVsEthScore = Math.max(0, Math.min(100, (bearish.vsEthHold + 20) * 2.5));
  
  // Full year return (target: positive return)
  const returnScore = Math.max(0, Math.min(100, fullYear.returnPct + 50));
  
  // Risk-adjusted return (higher is better)
  const riskAdjScore = Math.max(0, Math.min(100, fullYear.riskAdjustedReturn * 20));
  
  // Win rate (target: >40%)
  const winRateScore = Math.max(0, Math.min(100, fullYear.winRate * 2));
  
  // Sharpe ratio (target: >0)
  const sharpeScore = Math.max(0, Math.min(100, (fullYear.sharpeRatio + 1) * 50));
  
  // Profit factor (target: >1.5)
  const profitFactorScore = Math.max(0, Math.min(100, (fullYear.profitFactor / 2) * 100));
  
  return (
    fullYearVsEthScore * 0.3 +
    bullishVsEthScore * 0.2 +
    bearishVsEthScore * 0.2 +
    returnScore * 0.1 +
    riskAdjScore * 0.1 +
    winRateScore * 0.05 +
    sharpeScore * 0.03 +
    profitFactorScore * 0.02
  );
}

async function loadCandlesForPeriod(startDate: string, endDate: string): Promise<PriceCandle[]> {
  const historyStartDate = new Date(startDate);
  historyStartDate.setDate(historyStartDate.getDate() - 200);
  const historyStart = historyStartDate.toISOString().split('T')[0];
  const minHistoryDate = '2025-01-01';
  const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
  
  const candles = await fetchPriceCandles('ETHUSDT', '1d', actualHistoryStart, endDate);
  if (candles.length < 50) throw new Error(`Not enough candles for period ${startDate} to ${endDate}`);
  return candles;
}

async function main() {
  console.log('🔬 Comprehensive Strategy Testing\n');
  console.log('This will test multiple strategy configurations across historical periods...\n');
  
  // Load candles once for each period
  console.log('📊 Loading historical data for all periods...\n');
  const [bullishCandles, bearishCandles, fullYearCandles] = await Promise.all([
    loadCandlesForPeriod(TEST_PERIODS[0]!.start, TEST_PERIODS[0]!.end),
    loadCandlesForPeriod(TEST_PERIODS[1]!.start, TEST_PERIODS[1]!.end),
    loadCandlesForPeriod(TEST_PERIODS[2]!.start, TEST_PERIODS[2]!.end),
  ]);
  
  console.log(`✅ Loaded ${bullishCandles.length} candles for bullish period`);
  console.log(`✅ Loaded ${bearishCandles.length} candles for bearish period`);
  console.log(`✅ Loaded ${fullYearCandles.length} candles for full year period\n`);
  
  const configs = generateStrategyConfigs();
  console.log(`📊 Testing ${configs.length} strategy configurations\n`);
  
  const results: StrategyResult[] = [];
  let completed = 0;
  
  for (const { name, config } of configs) {
    completed++;
    console.log(`[${completed}/${configs.length}] Testing: ${name}`);
    
    try {
      const bullishResult = await testConfig(config, name, bullishCandles, TEST_PERIODS[0]!.start, TEST_PERIODS[0]!.end);
      const bearishResult = await testConfig(config, name, bearishCandles, TEST_PERIODS[1]!.start, TEST_PERIODS[1]!.end);
      const fullYearResult = await testConfig(config, name, fullYearCandles, TEST_PERIODS[2]!.start, TEST_PERIODS[2]!.end);
      
      const result: StrategyResult = {
        configName: name,
        config,
        bullishPeriod: bullishResult,
        bearishPeriod: bearishResult,
        fullYear: fullYearResult,
        overallScore: 0, // Will calculate after
      };
      
      result.overallScore = calculateOverallScore(result);
      results.push(result);
      
      console.log(`  ✅ Bullish: ${bullishResult.returnPct >= 0 ? '+' : ''}${bullishResult.returnPct.toFixed(2)}% (vs ETH: ${bullishResult.vsEthHold >= 0 ? '+' : ''}${bullishResult.vsEthHold.toFixed(2)}%)`);
      console.log(`  ✅ Bearish: ${bearishResult.returnPct >= 0 ? '+' : ''}${bearishResult.returnPct.toFixed(2)}% (vs ETH: ${bearishResult.vsEthHold >= 0 ? '+' : ''}${bearishResult.vsEthHold.toFixed(2)}%)`);
      console.log(`  ✅ Full Year: ${fullYearResult.returnPct >= 0 ? '+' : ''}${fullYearResult.returnPct.toFixed(2)}% (vs ETH: ${fullYearResult.vsEthHold >= 0 ? '+' : ''}${fullYearResult.vsEthHold.toFixed(2)}%), ${fullYearResult.totalTrades} trades`);
    } catch (error) {
      console.error(`  ❌ Error testing ${name}:`, error);
    }
  }
  
  // Sort by overall score
  results.sort((a, b) => b.overallScore - a.overallScore);
  
  // Generate report
  const report = generateReport(results);
  
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `comprehensive-strategy-test-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');
  
  console.log(`\n✅ Testing complete!`);
  console.log(`📄 Report saved to: ${reportPath}`);
  
  // Show top 5
  console.log(`\n🏆 Top 5 Strategies:\n`);
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i]!;
    console.log(`${i + 1}. ${r.configName} (Score: ${r.overallScore.toFixed(1)})`);
    console.log(`   Full Year: ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% (vs ETH: ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}%)`);
    console.log(`   Trades: ${r.fullYear.totalTrades}, Win Rate: ${r.fullYear.winRate.toFixed(1)}%, Sharpe: ${r.fullYear.sharpeRatio.toFixed(3)}`);
    console.log(`   Risk-Adj Return: ${r.fullYear.riskAdjustedReturn.toFixed(2)}, Profit Factor: ${r.fullYear.profitFactor.toFixed(2)}\n`);
  }
}

function generateReport(results: StrategyResult[]): string {
  const top10 = results.slice(0, 10);
  
  return `# Comprehensive Strategy Testing Results

**Generated**: ${new Date().toISOString()}
**Total Configurations Tested**: ${results.length}

## Top 10 Strategies (Ranked by Overall Score)

| Rank | Config Name | Bullish Return | Bearish Return | Full Year Return | Full Year vs ETH | Trades | Win Rate | Sharpe | Score |
|------|-------------|----------------|---------------|------------------|------------------|--------|----------|--------|-------|
${top10.map((r, i) => `| ${i + 1} | ${r.configName} | ${r.bullishPeriod.returnPct >= 0 ? '+' : ''}${r.bullishPeriod.returnPct.toFixed(2)}% | ${r.bearishPeriod.returnPct >= 0 ? '+' : ''}${r.bearishPeriod.returnPct.toFixed(2)}% | ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% | ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}% | ${r.fullYear.totalTrades} | ${r.fullYear.winRate.toFixed(1)}% | ${r.fullYear.sharpeRatio.toFixed(3)} | ${r.overallScore.toFixed(1)} |`).join('\n')}

## Detailed Top 5 Analysis

${top10.slice(0, 5).map((r, i) => `
### ${i + 1}. ${r.configName} (Score: ${r.overallScore.toFixed(1)})

**Configuration:**
- Bullish: buyThreshold=${r.config.bullishStrategy.buyThreshold}, sellThreshold=${r.config.bullishStrategy.sellThreshold}, maxPosition=${r.config.bullishStrategy.maxPositionPct}
- Bearish: buyThreshold=${r.config.bearishStrategy.buyThreshold}, sellThreshold=${r.config.bearishStrategy.sellThreshold}, maxPosition=${r.config.bearishStrategy.maxPositionPct}
- Regime Confidence: ${r.config.regimeConfidenceThreshold}
- Momentum Threshold: ${r.config.momentumConfirmationThreshold}
- Persistence: ${r.config.regimePersistencePeriods}/5 periods
- Dynamic Sizing: ${r.config.dynamicPositionSizing}

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
- Risk-Adjusted Return: ${r.fullYear.riskAdjustedReturn.toFixed(2)}
- Profit Factor: ${r.fullYear.profitFactor.toFixed(2)}
`).join('\n---\n')}

## All Results Summary

| Config | Bullish Return | Bearish Return | Full Year Return | vs ETH | Trades | Win Rate | Score |
|--------|----------------|---------------|------------------|--------|--------|----------|-------|
${results.map(r => `| ${r.configName} | ${r.bullishPeriod.returnPct >= 0 ? '+' : ''}${r.bullishPeriod.returnPct.toFixed(2)}% | ${r.bearishPeriod.returnPct >= 0 ? '+' : ''}${r.bearishPeriod.returnPct.toFixed(2)}% | ${r.fullYear.returnPct >= 0 ? '+' : ''}${r.fullYear.returnPct.toFixed(2)}% | ${r.fullYear.vsEthHold >= 0 ? '+' : ''}${r.fullYear.vsEthHold.toFixed(2)}% | ${r.fullYear.totalTrades} | ${r.fullYear.winRate.toFixed(1)}% | ${r.overallScore.toFixed(1)} |`).join('\n')}

## Scoring Methodology

Overall score is calculated using weighted metrics across all three periods:
- **Full Year vs ETH Hold (30%)**: Most important - must outperform buy-and-hold
- **Bullish Period vs ETH (20%)**: Must perform well in bull markets
- **Bearish Period vs ETH (20%)**: Must perform well in bear markets
- **Full Year Return (10%)**: Absolute return performance
- **Risk-Adjusted Return (10%)**: Return / Max Drawdown
- **Win Rate (5%)**: Percentage of profitable trades
- **Sharpe Ratio (3%)**: Risk-adjusted return measure
- **Profit Factor (2%)**: Gross profit / Gross loss

---
*Using new smoothed regime detection with hysteresis*
`;
}

main().catch(console.error);

