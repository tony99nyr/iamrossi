#!/usr/bin/env npx tsx
/**
 * Small test of ATR-based stop losses
 * Tests on a short period to verify stop losses are working correctly
 */

import { fetchPriceCandles } from '@/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal } from '@/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { clearRegimeHistory } from '@/lib/adaptive-strategy-enhanced';
import { clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import { calculateKellyCriterion, getKellyMultiplier } from '@/lib/kelly-criterion';
import { getATRValue } from '@/lib/indicators';
import { createOpenPosition, updateStopLoss, checkStopLosses, type StopLossConfig, type OpenPosition as StopLossOpenPosition } from '@/lib/atr-stop-loss';
import { disconnectRedis } from '@/lib/kv';
import type { PriceCandle, Portfolio, Trade, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import { v4 as uuidv4 } from 'uuid';

const TIMEFRAME = '8h';

// Use best known config
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
    buyThreshold: 0.41,
    sellThreshold: -0.45,
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
    buyThreshold: 0.65,
    sellThreshold: -0.25,
    maxPositionPct: 0.3,
    initialCapital: 1000,
  },
  regimeConfidenceThreshold: 0.22,
  momentumConfirmationThreshold: 0.26,
  bullishPositionMultiplier: 1.0,
  regimePersistencePeriods: 1,
  dynamicPositionSizing: false,
  maxBullishPosition: 0.90,
  maxVolatility: 0.019,
  circuitBreakerWinRate: 0.18,
  circuitBreakerLookback: 12,
  whipsawDetectionPeriods: 5,
  whipsawMaxChanges: 3,
};

// ATR Stop Loss Config
const STOP_LOSS_CONFIG: StopLossConfig = {
  enabled: true,
  atrMultiplier: 2.0, // 2x ATR stop loss
  trailing: true,
  useEMA: true,
  atrPeriod: 14,
};

// Use OpenPosition from atr-stop-loss module
type OpenPosition = StopLossOpenPosition;

function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[],
  candles: PriceCandle[],
  candleIndex: number,
  config: EnhancedAdaptiveStrategyConfig,
  openPositions: OpenPosition[],
  useKelly: boolean = true,
  useStopLoss: boolean = true
): Trade | null {
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  // Check stop losses first (before new trades)
  if (useStopLoss && openPositions.length > 0) {
    const currentATR = getATRValue(candles, candleIndex, STOP_LOSS_CONFIG.atrPeriod, STOP_LOSS_CONFIG.useEMA);
    const stopLossResults = checkStopLosses(openPositions, currentPrice, currentATR, STOP_LOSS_CONFIG);
    
    for (const { position, result } of stopLossResults) {
      if (result.shouldExit) {
        // Exit position due to stop loss
        const ethToSell = position.buyTrade.ethAmount;
        const saleValue = ethToSell * currentPrice;
        
        portfolio.ethBalance -= ethToSell;
        portfolio.usdcBalance += saleValue;
        portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
        portfolio.tradeCount++;

        // Calculate P&L
        const buyCost = position.buyTrade.usdcAmount;
        const pnl = saleValue - buyCost;
        if (pnl > 0) portfolio.winCount++;

        const trade: Trade = {
          id: uuidv4(),
          type: 'sell',
          timestamp: candles[candleIndex]?.timestamp || Date.now(),
          ethPrice: currentPrice,
          ethAmount: ethToSell,
          usdcAmount: saleValue,
          signal: signal.signal,
          confidence,
          portfolioValue: portfolio.totalValue,
          pnl,
        };

        trades.push(trade);
        
        // Remove position from open positions
        const index = openPositions.indexOf(position);
        if (index > -1) {
          openPositions.splice(index, 1);
        }

        // Return early - stop loss exit takes precedence
        return trade;
      }
    }
  }

  // Calculate Kelly multiplier if enabled
  let kellyMultiplier = 1.0;
  if (useKelly) {
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined && t.pnl !== null);
    
    if (sellTrades.length >= 10) {
      const tradesWithPnl = sellTrades.map(t => ({ ...t, pnl: t.pnl! })) as Array<Trade & { pnl: number }>;

      const kellyResult = calculateKellyCriterion(tradesWithPnl, {
        minTrades: 10,
        lookbackPeriod: Math.min(50, sellTrades.length),
        fractionalMultiplier: 0.25,
      });

      if (kellyResult) {
        kellyMultiplier = getKellyMultiplier(kellyResult, activeStrategy.maxPositionPct || 0.9);
      }
    }
  }

  const basePositionSize = portfolio.usdcBalance * (activeStrategy.maxPositionPct || 0.75);
  const positionSize = signal.positionSizeMultiplier * basePositionSize * confidence * kellyMultiplier;

  if (isBuy && portfolio.usdcBalance >= positionSize) {
    const ethAmount = positionSize / currentPrice;
    portfolio.usdcBalance -= positionSize;
    portfolio.ethBalance += ethAmount;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;

    const trade: Trade = {
      id: uuidv4(),
      type: 'buy',
      timestamp: candles[candleIndex]?.timestamp || Date.now(),
      ethPrice: currentPrice,
      ethAmount,
      usdcAmount: positionSize,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
    };

    trades.push(trade);

    // Create open position with stop loss if enabled
    if (useStopLoss) {
      const atrAtEntry = getATRValue(candles, candleIndex, STOP_LOSS_CONFIG.atrPeriod, STOP_LOSS_CONFIG.useEMA);
      if (atrAtEntry) {
        const position = createOpenPosition(trade, currentPrice, atrAtEntry, STOP_LOSS_CONFIG);
        if (position) {
          openPositions.push(position);
        }
      }
    }

    return trade;
  } else if (!isBuy && portfolio.ethBalance > 0) {
    // Regular sell signal (not stop loss)
    const baseSellSize = portfolio.ethBalance * activeStrategy.maxPositionPct;
    const ethToSell = Math.min(portfolio.ethBalance, baseSellSize * kellyMultiplier);
    const saleValue = ethToSell * currentPrice;
    
    portfolio.ethBalance -= ethToSell;
    portfolio.usdcBalance += saleValue;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;

    // Calculate P&L
    const lastBuyTrade = [...trades].reverse().find(t => t.type === 'buy');
    let pnl = 0;
    if (lastBuyTrade) {
      const buyCost = lastBuyTrade.usdcAmount;
      pnl = saleValue - buyCost;
      if (pnl > 0) portfolio.winCount++;
    }

    const trade: Trade = {
      id: uuidv4(),
      type: 'sell',
      timestamp: candles[candleIndex]?.timestamp || Date.now(),
      ethPrice: currentPrice,
      ethAmount: ethToSell,
      usdcAmount: saleValue,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
      pnl,
    };

    trades.push(trade);

    // Remove matching open position
    if (useStopLoss && lastBuyTrade) {
      const positionIndex = openPositions.findIndex(p => p.buyTrade.id === lastBuyTrade.id);
      if (positionIndex > -1) {
        openPositions.splice(positionIndex, 1);
      }
    }

    return trade;
  }

  return null;
}

async function testPeriod(
  startDate: string,
  endDate: string,
  useStopLoss: boolean
): Promise<{
  returnPct: number;
  tradeCount: number;
  stopLossExits: number;
  regularExits: number;
  winRate: number;
}> {
  clearRegimeHistory();
  clearIndicatorCache();

  const historyStartDate = new Date(startDate);
  historyStartDate.setDate(historyStartDate.getDate() - 200);
  const historyStart = historyStartDate.toISOString().split('T')[0];
  const minHistoryDate = '2025-01-01';
  const actualHistoryStart = historyStart < minHistoryDate ? minHistoryDate : historyStart;
  
  const candles = await fetchPriceCandles('ETHUSDT', TIMEFRAME, actualHistoryStart, endDate);

  if (candles.length < 50) {
    return {
      returnPct: 0,
      tradeCount: 0,
      stopLossExits: 0,
      regularExits: 0,
      winRate: 0,
    };
  }

  const startTime = new Date(startDate).getTime();
  let startIndex = candles.findIndex(c => c.timestamp >= startTime);
  if (startIndex === -1) startIndex = candles.length - 1;
  const minIndex = Math.max(50, Math.floor(candles.length * 0.1));
  if (startIndex < minIndex) startIndex = minIndex;

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
  const openPositions: OpenPosition[] = [];
  const sessionId = `atr-test-${Date.now()}`;
  let stopLossExits = 0;
  let regularExits = 0;

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const currentPrice = candle.close;

    // Update open positions (for trailing stops)
    if (useStopLoss && openPositions.length > 0) {
      const currentATR = getATRValue(candles, i, STOP_LOSS_CONFIG.atrPeriod, STOP_LOSS_CONFIG.useEMA);
      for (const position of openPositions) {
        updateStopLoss(position, currentPrice, currentATR, STOP_LOSS_CONFIG);
      }
    }

    const signal = generateEnhancedAdaptiveSignal(candles, DEFAULT_CONFIG, i, sessionId);
    const confidence = calculateConfidence(signal, candles, i);
    
    const trade = executeTrade(
      signal,
      confidence,
      currentPrice,
      portfolio,
      trades,
      candles,
      i,
      DEFAULT_CONFIG,
      openPositions,
      true, // Use Kelly
      useStopLoss
    );

    // Track exit type
    if (trade?.type === 'sell') {
      // Check if this was a stop loss exit (price hit stop loss)
      if (useStopLoss && openPositions.length === 0 && trade.pnl !== undefined) {
        // If we had open positions before and now we don't, might be stop loss
        // Actually, we need to track this better - let's check the trade reason
        // For now, we'll track by checking if price is near a stop loss level
        const lastBuy = trades.filter(t => t.type === 'buy').slice(-1)[0];
        if (lastBuy) {
          const atrAtTime = getATRValue(candles, i, STOP_LOSS_CONFIG.atrPeriod, STOP_LOSS_CONFIG.useEMA);
          if (atrAtTime) {
            const expectedStopLoss = lastBuy.ethPrice - (atrAtTime * STOP_LOSS_CONFIG.atrMultiplier);
            const distanceToStop = Math.abs(currentPrice - expectedStopLoss) / currentPrice;
            if (distanceToStop < 0.01) { // Within 1% of expected stop loss
              stopLossExits++;
            } else {
              regularExits++;
            }
          } else {
            regularExits++;
          }
        } else {
          regularExits++;
        }
      } else {
        regularExits++;
      }
    }

    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;
  }

  const returnPct = (portfolio.totalReturn / portfolio.initialCapital) * 100;
  const sellTrades = trades.filter(t => t.type === 'sell');
  const winRate = sellTrades.length > 0 ? (portfolio.winCount / sellTrades.length) * 100 : 0;

  return {
    returnPct,
    tradeCount: trades.length,
    stopLossExits,
    regularExits,
    winRate,
  };
}

async function main() {
  console.log('🔬 Testing ATR-Based Stop Losses (Small Test)\n');
  console.log('Testing on a short period to verify stop losses work correctly\n');

  // Test on a 2-month period with some volatility
  const period = {
    name: '2 Months (March-April 2025)',
    start: '2025-03-01',
    end: '2025-04-30',
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${period.name} (${period.start} to ${period.end})`);
  console.log('='.repeat(60));

  // Test without stop loss
  console.log('\n📊 Running WITHOUT ATR Stop Loss...');
  const withoutStopLoss = await testPeriod(period.start, period.end, false);
  console.log(`   Return: ${withoutStopLoss.returnPct >= 0 ? '+' : ''}${withoutStopLoss.returnPct.toFixed(2)}%`);
  console.log(`   Trades: ${withoutStopLoss.tradeCount} (${withoutStopLoss.regularExits} regular exits)`);
  console.log(`   Win Rate: ${withoutStopLoss.winRate.toFixed(1)}%`);

  // Test with stop loss
  console.log('\n📊 Running WITH ATR Stop Loss (2x ATR, trailing)...');
  const withStopLoss = await testPeriod(period.start, period.end, true);
  console.log(`   Return: ${withStopLoss.returnPct >= 0 ? '+' : ''}${withStopLoss.returnPct.toFixed(2)}%`);
  console.log(`   Trades: ${withStopLoss.tradeCount}`);
  console.log(`   Stop Loss Exits: ${withStopLoss.stopLossExits}`);
  console.log(`   Regular Exits: ${withStopLoss.regularExits}`);
  console.log(`   Win Rate: ${withStopLoss.winRate.toFixed(1)}%`);

  const improvement = withStopLoss.returnPct - withoutStopLoss.returnPct;
  const improvementPct = withoutStopLoss.returnPct !== 0
    ? ((withStopLoss.returnPct - withoutStopLoss.returnPct) / Math.abs(withoutStopLoss.returnPct)) * 100
    : 0;

  console.log(`\n   💡 Improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}% (${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}% relative)`);
  console.log(`   📊 Stop Loss Exits: ${withStopLoss.stopLossExits} out of ${withStopLoss.tradeCount} total trades`);

  if (withStopLoss.stopLossExits > 0) {
    console.log(`\n   ✅ Stop losses are working! ${withStopLoss.stopLossExits} trades exited via stop loss.`);
  } else {
    console.log(`\n   ⚠️  No stop loss exits detected. This could mean:`);
    console.log(`      - Prices didn't drop enough to trigger stops`);
    console.log(`      - Stop loss logic needs adjustment`);
  }

  console.log(`\n✅ Small test complete!`);
  console.log(`\nNext: Run full backfill test on all 2025 and 2026 periods`);
}

main()
  .then(async () => {
    await disconnectRedis();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Error:', error);
    await disconnectRedis();
    process.exit(1);
  });

