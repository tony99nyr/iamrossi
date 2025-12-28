/**
 * Adaptive Backtest Engine
 * Supports market regime-aware strategies that switch based on market conditions
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
import { generateAdaptiveSignal } from './adaptive-strategy';
import type { AdaptiveStrategyConfig } from './adaptive-strategy';
import { calculateConfidence } from './confidence-calculator';
import { calculateStrategyResults, calculateRiskMetrics } from './risk-metrics';
import { clearIndicatorCache } from './market-regime-detector-cached';

export interface AdaptiveBacktestOptions {
  startDate: string;
  endDate: string;
  config: AdaptiveStrategyConfig;
  runName?: string;
}

export interface AdaptiveBacktestResult {
  run: StrategyRun;
  trades: Trade[];
  portfolioHistory: PortfolioSnapshot[];
  strategyUsage: {
    bullishUsage: number;
    bearishUsage: number;
    neutralUsage: number;
    regimeDistribution: {
      bullish: number;
      bearish: number;
      neutral: number;
    };
  };
}

/**
 * Run an adaptive backtest that switches strategies based on market regime
 */
export async function runAdaptiveBacktest(
  options: AdaptiveBacktestOptions
): Promise<AdaptiveBacktestResult> {
  const { startDate, endDate, config, runName } = options;

  // Fetch historical price data
  const candles = await fetchPriceCandles('ETHUSDT', config.bullishStrategy.timeframe, startDate, endDate);
  if (candles.length === 0) {
    throw new Error('No price data available for the specified date range');
  }

  // Clear indicator cache at start of backtest for fresh calculations
  clearIndicatorCache();

  // Initialize portfolio
  const initialCapital = config.bullishStrategy.initialCapital || 1000;
  let usdcBalance = initialCapital;
  let ethBalance = 0;
  const trades: Trade[] = [];
  const portfolioHistory: PortfolioSnapshot[] = [];

  // Track portfolio state
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

  // Run backtest
  for (let i = 50; i < candles.length; i++) { // Start at 50 to have enough data for regime detection
    const candle = candles[i];
    const adaptiveSignal = generateAdaptiveSignal(candles, config, i);
    const confidence = calculateConfidence(adaptiveSignal, candles, i);

    // Track which strategy was used (compare by name since object references differ)
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

    // Execute trades based on signal
    if (adaptiveSignal.action === 'buy' && usdcBalance > 0) {
      // Calculate position size based on confidence and active strategy
      const maxPositionPct = adaptiveSignal.activeStrategy.maxPositionPct;
      const positionSize = usdcBalance * confidence * maxPositionPct;
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
      // Calculate position size based on confidence and active strategy
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

        // Check if this was a winning trade
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
  const totalPeriods = candles.length - 50; // Subtract initial warmup
  const strategyUsage = {
    bullishUsage: strategyUsageCounts.bullish / totalPeriods,
    bearishUsage: strategyUsageCounts.bearish / totalPeriods,
    neutralUsage: strategyUsageCounts.neutral / totalPeriods,
    regimeDistribution: {
      bullish: strategyUsageCounts.bullish / totalPeriods,
      bearish: strategyUsageCounts.bearish / totalPeriods,
      neutral: strategyUsageCounts.neutral / totalPeriods,
    },
  };

  // Create strategy run (use bullish strategy config as primary)
  const run: StrategyRun = {
    id: uuidv4(),
    name: runName || 'Adaptive-Strategy',
    type: 'backtest',
    createdAt: Date.now(),
    startDate,
    endDate,
    config: config.bullishStrategy, // Use bullish as primary config for storage
    results,
    riskMetrics,
    tradeIds: trades.map(t => t.id),
  };

  return {
    run,
    trades,
    portfolioHistory,
    strategyUsage,
  };
}

