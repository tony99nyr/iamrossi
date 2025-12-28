import { v4 as uuidv4 } from 'uuid';
import type {
  TradingConfig,
  Trade,
  PortfolioSnapshot,
  StrategyRun,
  Portfolio,
} from '@/types';
import { fetchPriceCandles } from './eth-price-service';
import { generateSignal } from './trading-signals';
import { calculateConfidence } from './confidence-calculator';
import { calculateStrategyResults, calculateRiskMetrics } from './risk-metrics';

export interface BacktestOptions {
  startDate: string;
  endDate: string;
  config: TradingConfig;
  runName?: string;
}

export interface BacktestResult {
  run: StrategyRun;
  trades: Trade[];
  portfolioHistory: PortfolioSnapshot[];
}

/**
 * Run a backtest on historical data
 */
export async function runBacktest(options: BacktestOptions): Promise<BacktestResult> {
  const { startDate, endDate, config, runName } = options;

  // Fetch historical price data
  const candles = await fetchPriceCandles('ETHUSDT', config.timeframe, startDate, endDate);
  if (candles.length === 0) {
    throw new Error('No price data available for the specified date range');
  }

  // Initialize portfolio
  let usdcBalance = config.initialCapital;
  let ethBalance = 0;
  const trades: Trade[] = [];
  const portfolioHistory: PortfolioSnapshot[] = [];

  // Track portfolio state
  const portfolio: Portfolio = {
    usdcBalance,
    ethBalance,
    totalValue: usdcBalance,
    initialCapital: config.initialCapital,
    totalReturn: 0,
    tradeCount: 0,
    winCount: 0,
  };

  // Run backtest
  for (let i = 1; i < candles.length; i++) {
    const candle = candles[i];
    const signal = generateSignal(candles, config, i);
    const confidence = calculateConfidence(signal, candles, i);

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
    if (signal.action === 'buy' && usdcBalance > 0) {
      // Calculate position size based on confidence
      const positionSize = usdcBalance * confidence * config.maxPositionPct;
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
          signal: signal.signal,
          confidence,
          portfolioValue: usdcBalance + ethBalance * currentEthPrice,
        };

        trades.push(trade);
        portfolio.tradeCount++;
      }
    } else if (signal.action === 'sell' && ethBalance > 0) {
      // Calculate position size based on confidence
      const positionSize = ethBalance * confidence * config.maxPositionPct;
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
          signal: signal.signal,
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
  const results = calculateStrategyResults(trades, config.initialCapital, finalValue);
  const riskMetrics = calculateRiskMetrics(trades, portfolioHistory, config.initialCapital);

  // Create strategy run
  const run: StrategyRun = {
    id: uuidv4(),
    name: runName,
    type: 'backtest',
    createdAt: Date.now(),
    startDate,
    endDate,
    config,
    results,
    riskMetrics,
    tradeIds: trades.map(t => t.id),
  };

  return {
    run,
    trades,
    portfolioHistory,
  };
}

