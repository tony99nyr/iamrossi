/**
 * Optimized Adaptive Backtest Engine
 * Uses momentum filters and optimized position sizing
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Trade,
  PortfolioSnapshot,
  StrategyRun,
  Portfolio,
  PriceCandle,
} from '@/types';
import { fetchPriceCandles } from './eth-price-service';
import { generateOptimizedAdaptiveSignal, type OptimizedAdaptiveStrategyConfig } from './adaptive-strategy-optimized';
import { calculateConfidence } from './confidence-calculator';
import { calculateStrategyResults, calculateRiskMetrics } from './risk-metrics';
import { clearIndicatorCache } from './market-regime-detector-cached';

export interface OptimizedAdaptiveBacktestOptions {
  startDate: string;
  endDate: string;
  config: OptimizedAdaptiveStrategyConfig;
  saveRun?: boolean;
  runName?: string;
}

export interface OptimizedAdaptiveBacktestResult {
  run: StrategyRun;
  trades: Trade[];
  portfolioHistory: PortfolioSnapshot[];
  strategyUsage: {
    bullishUsage: number;
    bearishUsage: number;
    neutralUsage: number;
    momentumConfirmedCount: number;
    regimeDistribution: {
      bullish: number;
      bearish: number;
      neutral: number;
    };
  };
}

/**
 * Run an optimized adaptive backtest with momentum filters
 */
export async function runOptimizedAdaptiveBacktest(
  options: OptimizedAdaptiveBacktestOptions
): Promise<OptimizedAdaptiveBacktestResult> {
  const { startDate, endDate, config, runName } = options;

  const candles = await fetchPriceCandles('ETHUSDT', config.bullishStrategy.timeframe, startDate, endDate);
  if (candles.length === 0) {
    throw new Error('No price data available for the specified date range');
  }

  // Clear indicator cache at start of backtest
  clearIndicatorCache();

  const initialCapital = config.bullishStrategy.initialCapital || 1000;
  let usdcBalance = initialCapital;
  let ethBalance = 0;
  const trades: Trade[] = [];
  const portfolioHistory: PortfolioSnapshot[] = [];

  const portfolio: Portfolio = {
    usdcBalance,
    ethBalance,
    totalValue: usdcBalance,
    initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };

  // Track strategy usage
  const strategyUsageCounts = {
    bullish: 0,
    bearish: 0,
    neutral: 0,
  };
  
  const regimeCounts = {
    bullish: 0,
    bearish: 0,
    neutral: 0,
  };
  
  let momentumConfirmedCount = 0;

  // Run backtest
  for (let i = 50; i < candles.length; i++) {
    const candle = candles[i];
    const adaptiveSignal = generateOptimizedAdaptiveSignal(candles, config, i);
    const confidence = calculateConfidence(adaptiveSignal, candles, i);

    // Track regime distribution
    regimeCounts[adaptiveSignal.regime.regime]++;
    
    // Track momentum confirmations
    if (adaptiveSignal.momentumConfirmed) {
      momentumConfirmedCount++;
    }

    // Track which strategy was used (compare by name)
    const activeStrategyName = adaptiveSignal.activeStrategy.name || '';
    if (activeStrategyName === config.bullishStrategy.name || 
        activeStrategyName.toLowerCase().includes('bullish')) {
      strategyUsageCounts.bullish++;
    } else if (activeStrategyName === config.bearishStrategy.name || 
               activeStrategyName.toLowerCase().includes('bearish') ||
               activeStrategyName === 'Strategy1') {
      strategyUsageCounts.bearish++;
    } else {
      strategyUsageCounts.neutral++;
    }

    // Calculate current portfolio value
    const currentEthPrice = candle.close;
    const totalValue = usdcBalance + ethBalance * currentEthPrice;

    // Record portfolio snapshot
    portfolioHistory.push({
      timestamp: candle.timestamp,
      usdcBalance,
      ethBalance,
      totalValue,
      ethPrice: currentEthPrice,
    });

    // Apply bullish position multiplier if momentum confirmed
    const positionMultiplier = (adaptiveSignal.momentumConfirmed && 
                                 adaptiveSignal.activeStrategy === config.bullishStrategy)
      ? (config.bullishPositionMultiplier || 1.0)
      : 1.0;

    // Execute trades based on signal
    if (adaptiveSignal.action === 'buy' && usdcBalance > 0) {
      const maxPositionPct = adaptiveSignal.activeStrategy.maxPositionPct;
      const adjustedPositionPct = maxPositionPct * positionMultiplier;
      const positionSize = usdcBalance * confidence * Math.min(adjustedPositionPct, 0.95); // Cap at 95%
      const ethAmount = positionSize / currentEthPrice;

      if (ethAmount > 0 && positionSize <= usdcBalance) {
        usdcBalance -= positionSize;
        ethBalance += ethAmount;

        const trade: Trade = {
          id: uuidv4(),
          timestamp: candle.timestamp,
          type: 'buy',
          ethPrice: currentEthPrice,
          ethAmount,
          usdcAmount: positionSize,
          signal: adaptiveSignal.signal,
          confidence,
          portfolioValue: usdcBalance + ethBalance * currentEthPrice,
        };

        trades.push(trade);
        portfolio.tradeCount++;
      }
    } else if (adaptiveSignal.action === 'sell' && ethBalance > 0) {
      const maxPositionPct = adaptiveSignal.activeStrategy.maxPositionPct;
      const positionSize = ethBalance * confidence * maxPositionPct;
      const usdcAmount = positionSize * currentEthPrice;

      if (positionSize > 0 && positionSize <= ethBalance) {
        ethBalance -= positionSize;
        usdcBalance += usdcAmount;

        const trade: Trade = {
          id: uuidv4(),
          timestamp: candle.timestamp,
          type: 'sell',
          ethPrice: currentEthPrice,
          ethAmount: positionSize,
          usdcAmount,
          signal: adaptiveSignal.signal,
          confidence,
          portfolioValue: usdcBalance + ethBalance * currentEthPrice,
        };

        trades.push(trade);
        portfolio.tradeCount++;

        if (trade.portfolioValue > portfolio.initialCapital) {
          portfolio.winCount++;
        }
      }
    }
  }

  // Calculate final portfolio value
  const finalCandle = candles[candles.length - 1];
  const finalEthPrice = finalCandle.close;
  const finalValue = usdcBalance + ethBalance * finalEthPrice;

  // Calculate results and risk metrics
  const results = calculateStrategyResults(trades, initialCapital, finalValue);
  const riskMetrics = calculateRiskMetrics(trades, portfolioHistory, initialCapital);

  // Calculate strategy usage statistics
  const totalPeriods = candles.length - 50;
  const strategyUsage = {
    bullishUsage: strategyUsageCounts.bullish / totalPeriods,
    bearishUsage: strategyUsageCounts.bearish / totalPeriods,
    neutralUsage: strategyUsageCounts.neutral / totalPeriods,
    momentumConfirmedCount: momentumConfirmedCount / totalPeriods,
    regimeDistribution: {
      bullish: regimeCounts.bullish / totalPeriods,
      bearish: regimeCounts.bearish / totalPeriods,
      neutral: regimeCounts.neutral / totalPeriods,
    },
  };

  // Create strategy run
  const run: StrategyRun = {
    id: uuidv4(),
    name: runName || 'Optimized-Adaptive-Strategy',
    type: 'backtest',
    createdAt: Date.now(),
    startDate,
    endDate,
    config: config.bullishStrategy,
    results,
    riskMetrics,
    tradeIds: trades.map(t => t.id),
  };

  if (saveRun) {
    await saveStrategyRun(run);
  }

  return {
    run,
    trades,
    portfolioHistory,
    strategyUsage,
  };
}

