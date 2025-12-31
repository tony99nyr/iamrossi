/**
 * Shared trade execution logic for backtesting
 * Extracted from backfill-test.ts to ensure consistency across all test scripts
 */

// uuidv4 not currently used but may be needed for future trade ID generation
import type { PriceCandle, Portfolio, Trade } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from './adaptive-strategy-enhanced';
import { getATRValue } from './indicators';
import { calculateKellyCriterion, getKellyMultiplier } from './kelly-criterion';
import { 
  createOpenPosition, 
  checkStopLosses, 
  type StopLossConfig, 
  type OpenPosition 
} from './atr-stop-loss';
import type { TradingSignal } from '@/types';

export interface PortfolioSnapshot {
  timestamp: number;
  usdcBalance: number;
  ethBalance: number;
  totalValue: number;
  ethPrice: number;
}

const DEFAULT_STOP_LOSS_CONFIG: StopLossConfig = {
  enabled: true,
  atrMultiplier: 2.0,
  trailing: true,
  atrPeriod: 14,
  useEMA: true,
};

/**
 * Execute a trade based on signal - matches backfill-test.ts logic exactly
 */
export function executeBacktestTrade(
  signal: TradingSignal & {
    regime?: {
      regime: 'bullish' | 'bearish' | 'neutral';
      confidence: number;
    };
    activeStrategy?: {
      buyThreshold: number;
      sellThreshold: number;
      maxPositionPct: number;
    };
    momentumConfirmed: boolean;
    positionSizeMultiplier: number;
  },
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[],
  candles: PriceCandle[],
  candleIndex: number,
  portfolioHistory: PortfolioSnapshot[],
  config: EnhancedAdaptiveStrategyConfig,
  openPositions: OpenPosition[],
  useKellyCriterion: boolean = true,
  useStopLoss: boolean = true,
  stopLossConfig?: StopLossConfig,
  kellyFractionalMultiplier?: number // Optional: override default 0.25
): Trade | null {
  const effectiveStopLossConfig = stopLossConfig || DEFAULT_STOP_LOSS_CONFIG;

  // Check stop losses first (before new trades)
  if (useStopLoss && openPositions.length > 0) {
    const currentATR = getATRValue(candles, candleIndex, effectiveStopLossConfig.atrPeriod, effectiveStopLossConfig.useEMA);
    if (currentATR) {
      const stopLossResults = checkStopLosses(openPositions, currentPrice, currentATR, effectiveStopLossConfig);
      
      for (const { position, result } of stopLossResults) {
        if (result.shouldExit) {
          // Exit position due to stop loss
          const ethToSell = position.buyTrade.ethAmount;
          const saleValue = ethToSell * currentPrice;
          const fee = saleValue * 0.001;
          const netProceeds = saleValue - fee;
          
          portfolio.ethBalance -= ethToSell;
          portfolio.usdcBalance += netProceeds;
          portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
          portfolio.tradeCount++;
          portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;

          // Calculate P&L
          const buyCost = position.buyTrade.costBasis || position.buyTrade.usdcAmount;
          const pnl = netProceeds - (ethToSell * (buyCost / position.buyTrade.ethAmount));
          if (pnl > 0) portfolio.winCount++;

          const trade: Trade = {
            id: `trade-${Date.now()}-${Math.random()}`,
            type: 'sell',
            timestamp: candles[candleIndex]?.timestamp || Date.now(),
            ethPrice: currentPrice,
            ethAmount: ethToSell,
            usdcAmount: saleValue,
            signal: signal.signal,
            confidence,
            portfolioValue: portfolio.totalValue,
            costBasis: buyCost,
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
  }

  // Use signal.action instead of signal.signal to respect buy/sell thresholds
  if (signal.action === 'hold') return null;

  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;

  // Calculate Kelly multiplier if enabled and we have enough trades
  let kellyMultiplier = 1.0;
  if (useKellyCriterion && trades.length >= 10) {
    // Calculate P&L for completed trades
    const tradesWithPnl = trades.map((t, idx) => {
      if (t.type === 'sell' && idx > 0) {
        // Find matching buy trade
        const buyTrade = trades.slice(0, idx).reverse().find(bt => bt.type === 'buy');
        if (buyTrade) {
          const pnl = t.usdcAmount - buyTrade.usdcAmount;
          return { ...t, pnl };
        }
      }
      return t;
    }).filter(t => 'pnl' in t && t.pnl !== undefined) as Array<Trade & { pnl: number }>;

    if (tradesWithPnl.length >= 10) {
      const kellyResult = calculateKellyCriterion(tradesWithPnl, {
        minTrades: 10,
        lookbackPeriod: 50, // Use last 50 trades
        fractionalMultiplier: kellyFractionalMultiplier ?? 0.25, // Use provided multiplier or default 25% of full Kelly
      });

      if (kellyResult) {
        kellyMultiplier = getKellyMultiplier(kellyResult, activeStrategy.maxPositionPct || 0.9);
      }
    }
  }

  // Calculate position size with Kelly adjustment
  const basePositionSize = portfolio.usdcBalance * (activeStrategy.maxPositionPct || 0.75);
  const positionSize = signal.positionSizeMultiplier * basePositionSize * confidence * kellyMultiplier;

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
        timestamp: candles[candleIndex]?.timestamp || Date.now(),
        ethPrice: currentPrice,
        ethAmount: ethAmount,
        usdcAmount: positionSize,
        signal: signal.signal,
        confidence,
        portfolioValue: portfolio.totalValue,
        costBasis: totalCost,
      };

      trades.push(trade);

      // Create open position for stop loss tracking
      if (useStopLoss) {
        const atrAtEntry = getATRValue(candles, candleIndex, effectiveStopLossConfig.atrPeriod, effectiveStopLossConfig.useEMA);
        if (atrAtEntry) {
          const openPosition = createOpenPosition(trade, currentPrice, atrAtEntry, effectiveStopLossConfig);
          if (openPosition) {
            openPositions.push(openPosition);
          }
        }
      }

      return trade;
    }
  } else if (!isBuy && portfolio.ethBalance > 0) {
    // Apply Kelly multiplier to sell size as well
    const baseSellSize = portfolio.ethBalance * activeStrategy.maxPositionPct;
    const ethToSell = Math.min(portfolio.ethBalance, baseSellSize * kellyMultiplier);
    const saleValue = ethToSell * currentPrice;
    const fee = saleValue * 0.001;
    const netProceeds = saleValue - fee;

    portfolio.ethBalance -= ethToSell;
    portfolio.usdcBalance += netProceeds;
    portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.tradeCount++;
    portfolio.totalReturn = portfolio.totalValue - portfolio.initialCapital;

    // Calculate P&L
    interface TradeWithFullySold extends Trade {
      fullySold?: boolean;
    }
    const buyTrades = [...trades].reverse().filter((t): t is TradeWithFullySold => t.type === 'buy' && !(t as TradeWithFullySold).fullySold);
    let totalCostBasis = 0;
    let totalAmount = 0;
    
    for (const buyTrade of buyTrades) {
      if (totalAmount < ethToSell) {
        const remaining = ethToSell - totalAmount;
        const used = Math.min(remaining, buyTrade.ethAmount);
        totalCostBasis += (buyTrade.costBasis || buyTrade.usdcAmount) * (used / buyTrade.ethAmount);
        totalAmount += used;
        if (used >= buyTrade.ethAmount) {
          (buyTrade as TradeWithFullySold).fullySold = true;
        }
      }
    }

    const avgCost = totalAmount > 0 ? totalCostBasis / totalAmount : currentPrice;
    const pnl = netProceeds - (ethToSell * avgCost);
    
    // Check if this was a winning trade
    if (pnl > 0) portfolio.winCount++;

    const trade: Trade = {
      id: `trade-${Date.now()}-${Math.random()}`,
      type: 'sell',
      timestamp: candles[candleIndex]?.timestamp || Date.now(),
      ethPrice: currentPrice,
      ethAmount: ethToSell,
      usdcAmount: saleValue,
      signal: signal.signal,
      confidence,
      portfolioValue: portfolio.totalValue,
      costBasis: totalCostBasis,
      pnl,
    };

    trades.push(trade);

    // Remove matching open position
    if (useStopLoss) {
      const buyTrades = [...trades].reverse().filter(t => t.type === 'buy' && !t.fullySold);
      for (const buyTrade of buyTrades) {
        const positionIndex = openPositions.findIndex(p => p.buyTrade.id === buyTrade.id);
        if (positionIndex > -1) {
          openPositions.splice(positionIndex, 1);
        }
      }
    }

    return trade;
  }

  return null;
}

