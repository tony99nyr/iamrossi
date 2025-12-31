/**
 * Unified Trade Execution Logic
 * Shared between paper trading and backfill tests to ensure consistency
 * 
 * Features:
 * - FIFO cost basis tracking for accurate P&L
 * - Kelly Criterion position sizing
 * - ATR-based stop losses
 * - Optional trade audit generation
 */

import { v4 as uuidv4 } from 'uuid';
import type { PriceCandle, Portfolio, Trade, PortfolioSnapshot, TradingSignal, TradingConfig } from '@/types';
import type { EnhancedAdaptiveStrategyConfig } from './adaptive-strategy-enhanced';
import type { MarketRegimeSignal } from './market-regime-detector-cached';
import { getATRValue } from './indicators';
import { calculateKellyCriterion, getKellyMultiplier } from './kelly-criterion';
import { 
  createOpenPosition, 
  updateStopLoss, 
  checkStopLosses, 
  type StopLossConfig, 
  type OpenPosition 
} from './atr-stop-loss';
import { generateTradeAudit } from './trade-audit';
import { calculateVolatilityMultiplier, type VolatilityPositionSizingConfig } from './volatility-position-sizing';

export interface TransactionCostConfig {
  enabled: boolean;
  feePercent: number; // Trading fee as percentage (default: 0.1 = 0.1%)
  slippagePercent: number; // Slippage as percentage (default: 0.05 = 0.05%)
  useDynamicSlippage?: boolean; // Use volatility-based slippage (default: false)
}

const DEFAULT_TRANSACTION_COST_CONFIG: TransactionCostConfig = {
  enabled: true,
  feePercent: 0.1,
  slippagePercent: 0.05,
  useDynamicSlippage: false,
};

export interface TradeExecutionOptions {
  // Context
  candles: PriceCandle[];
  candleIndex: number;
  portfolioHistory?: PortfolioSnapshot[];
  config: EnhancedAdaptiveStrategyConfig;
  
  // Trade tracking
  trades: Trade[];
  openPositions: OpenPosition[];
  
  // Features
  useKellyCriterion?: boolean;
  useStopLoss?: boolean;
  kellyFractionalMultiplier?: number;
  stopLossConfig?: StopLossConfig;
  generateAudit?: boolean; // Generate trade audit data
  useVolatilitySizing?: boolean; // Use volatility-adjusted position sizing
  volatilitySizingConfig?: VolatilityPositionSizingConfig;
  transactionCostConfig?: TransactionCostConfig; // Transaction cost modeling
  
  // Callbacks (optional)
  onTradeExecuted?: (trade: Trade) => void;
  recordTradeResult?: (isWin: boolean) => void; // For circuit breaker
}

const DEFAULT_STOP_LOSS_CONFIG: StopLossConfig = {
  enabled: true,
  atrMultiplier: 2.0,
  trailing: true,
  useEMA: true,
  atrPeriod: 14,
};

/**
 * Calculate Kelly multiplier from completed trades
 */
function calculateKellyMultiplier(
  trades: Trade[],
  activeStrategy: { maxPositionPct: number },
  kellyConfig: { minTrades: number; lookbackPeriod: number; fractionalMultiplier: number }
): number {
  // Get completed trades (sells with P&L)
  const completedTrades = trades.filter((t): t is Trade & { pnl: number } => 
    t.type === 'sell' && t.pnl !== undefined && t.pnl !== null
  );
  
  if (completedTrades.length < kellyConfig.minTrades) {
    return 1.0;
  }
  
  // Use last N trades for Kelly calculation
  const recentTrades = completedTrades.slice(-kellyConfig.lookbackPeriod);
  
  const kellyResult = calculateKellyCriterion(recentTrades, {
    minTrades: kellyConfig.minTrades,
    lookbackPeriod: kellyConfig.lookbackPeriod,
    fractionalMultiplier: kellyConfig.fractionalMultiplier,
  });
  
  if (kellyResult) {
    return getKellyMultiplier(kellyResult, activeStrategy.maxPositionPct);
  }
  
  return 1.0;
}

/**
 * Calculate effective slippage based on volatility (if dynamic slippage enabled)
 */
function calculateEffectiveSlippage(
  slippagePercent: number,
  candles: PriceCandle[],
  currentIndex: number,
  useDynamicSlippage: boolean
): number {
  if (!useDynamicSlippage) {
    return slippagePercent;
  }

  // Use ATR to estimate slippage (higher volatility = higher slippage)
  const atr = getATRValue(candles, currentIndex, 14, true);
  const currentPrice = candles[currentIndex]?.close;
  
  if (!atr || !currentPrice || currentPrice === 0) {
    return slippagePercent;
  }

  const atrPercent = (atr / currentPrice) * 100;
  
  // Base slippage + volatility adjustment
  // For high volatility (ATR > 2%), increase slippage by up to 2x
  const volatilityMultiplier = Math.min(2.0, 1.0 + (atrPercent / 2.0));
  
  return slippagePercent * volatilityMultiplier;
}

/**
 * Apply transaction costs to trade
 */
function applyTransactionCosts(
  tradeValue: number,
  config: TransactionCostConfig,
  candles: PriceCandle[],
  currentIndex: number
): { fee: number; slippage: number; totalCost: number } {
  if (!config.enabled) {
    return { fee: 0, slippage: 0, totalCost: 0 };
  }

  const fee = tradeValue * (config.feePercent / 100);
  const effectiveSlippage = calculateEffectiveSlippage(
    config.slippagePercent,
    candles,
    currentIndex,
    config.useDynamicSlippage || false
  );
  const slippage = tradeValue * (effectiveSlippage / 100);
  const totalCost = fee + slippage;

  return { fee, slippage, totalCost };
}

/**
 * Execute a trade based on signal
 * Returns the executed trade or null if no trade was executed
 */
export function executeTrade(
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
  options: TradeExecutionOptions
): Trade | null {
  const {
    candles,
    candleIndex,
    portfolioHistory = [],
    config,
    trades,
    openPositions,
    useKellyCriterion = true,
    useStopLoss = true,
    kellyFractionalMultiplier = 0.25,
    stopLossConfig,
    generateAudit = false,
    useVolatilitySizing = false,
    volatilitySizingConfig,
    transactionCostConfig = DEFAULT_TRANSACTION_COST_CONFIG,
    onTradeExecuted,
    recordTradeResult,
  } = options;
  
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
          const costs = applyTransactionCosts(saleValue, transactionCostConfig, candles, candleIndex);
          const netProceeds = saleValue - costs.totalCost;
          
          portfolio.ethBalance -= ethToSell;
          portfolio.usdcBalance += netProceeds;
          portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
          portfolio.tradeCount++;
          portfolio.totalReturn = ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;
          
          // Calculate P&L using FIFO cost basis
          const buyCost = position.buyTrade.costBasis || position.buyTrade.usdcAmount;
          const pnl = netProceeds - buyCost;
          const isWin = pnl > 0;
          if (isWin) portfolio.winCount++;
          
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
            costBasis: buyCost,
            pnl,
          };
          
          // Generate audit if requested (skip if signal doesn't have required fields)
          if (generateAudit && portfolioHistory.length > 0 && signal.regime && signal.activeStrategy) {
            try {
              // Cast signal to required type for audit generation
              const auditSignal = signal as TradingSignal & { 
                regime: MarketRegimeSignal; 
                activeStrategy: TradingConfig | null; 
                momentumConfirmed: boolean; 
                positionSizeMultiplier: number;
              };
              trade.audit = generateTradeAudit(
                trade,
                auditSignal,
                candles,
                portfolioHistory,
                {
                  timeframe: config.bullishStrategy.timeframe,
                  buyThreshold: position.buyTrade.signal || 0,
                  sellThreshold: signal.activeStrategy.sellThreshold,
                  maxPositionPct: signal.activeStrategy.maxPositionPct,
                  riskFilters: {
                    volatilityFilter: false,
                    whipsawDetection: false,
                    circuitBreaker: false,
                    regimePersistence: true,
                  },
                }
              );
            } catch (error) {
              console.warn('Failed to generate trade audit:', error);
            }
          }
          
          trades.push(trade);
          if (recordTradeResult) recordTradeResult(isWin);
          if (onTradeExecuted) onTradeExecuted(trade);
          
          // Remove position from open positions
          const index = openPositions.indexOf(position);
          if (index > -1) {
            openPositions.splice(index, 1);
          }
          
          // Return early - stop loss exit takes precedence
          return trade;
        } else {
          // Update trailing stop loss (modifies position in place)
          updateStopLoss(position, currentPrice, currentATR, effectiveStopLossConfig);
        }
      }
    }
  }
  
  // Use signal.action to respect buy/sell thresholds
  if (signal.action === 'hold') return null;
  
  const isBuy = signal.action === 'buy';
  const activeStrategy = signal.activeStrategy;
  if (!activeStrategy) return null;
  
  // Calculate Kelly multiplier if enabled
  let kellyMultiplier = 1.0;
  if (useKellyCriterion && config.kellyCriterion?.enabled) {
    const kellyConfig = {
      minTrades: config.kellyCriterion.minTrades || 10,
      lookbackPeriod: config.kellyCriterion.lookbackPeriod || 50,
      fractionalMultiplier: kellyFractionalMultiplier,
    };
    kellyMultiplier = calculateKellyMultiplier(trades, activeStrategy, kellyConfig);
  }
  
  // Calculate position size
  // Paper trading uses: portfolio.usdcBalance * confidence * adjustedPositionPct
  // Backfill uses: signal.positionSizeMultiplier * basePositionSize * confidence * kellyMultiplier
  // We'll use a unified approach that works for both
  const maxPositionPct = activeStrategy.maxPositionPct || 0.75;
  const positionSizeMultiplier = signal.positionSizeMultiplier || 1.0;
  
  // Apply volatility adjustment if enabled
  let volatilityMultiplier = 1.0;
  if (useVolatilitySizing && volatilitySizingConfig?.enabled) {
    volatilityMultiplier = calculateVolatilityMultiplier(
      candles,
      candleIndex,
      volatilitySizingConfig
    );
  }
  
  const kellyAdjustedMultiplier = positionSizeMultiplier * kellyMultiplier * volatilityMultiplier;
  const maxBullishPosition = config.maxBullishPosition || 0.95;
  const adjustedPositionPct = Math.min(maxPositionPct * kellyAdjustedMultiplier, maxBullishPosition);
  
  if (isBuy && portfolio.usdcBalance > 0 && signal.signal > 0) {
    // Buy execution
    const positionSize = portfolio.usdcBalance * confidence * adjustedPositionPct;
    const ethAmount = positionSize / currentPrice;
    
    if (ethAmount > 0 && positionSize <= portfolio.usdcBalance) {
      const costBasis = positionSize;
      const costs = applyTransactionCosts(positionSize, transactionCostConfig, candles, candleIndex);
      const netCost = positionSize + costs.totalCost;
      
      if (portfolio.usdcBalance >= netCost) {
        portfolio.usdcBalance -= netCost;
        portfolio.ethBalance += ethAmount;
        portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
        portfolio.tradeCount++;
        portfolio.totalReturn = ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;
        
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
          costBasis, // Store cost basis for P&L calculation
        };
        
        // Generate audit if requested
        if (generateAudit && portfolioHistory.length > 0 && signal.regime) {
          try {
            trade.audit = generateTradeAudit(
              trade,
              signal as TradingSignal & { regime: MarketRegimeSignal; activeStrategy: TradingConfig | null; momentumConfirmed: boolean; positionSizeMultiplier: number },
              candles,
              portfolioHistory,
              {
                timeframe: config.bullishStrategy.timeframe,
                buyThreshold: activeStrategy.buyThreshold,
                sellThreshold: activeStrategy.sellThreshold,
                maxPositionPct: activeStrategy.maxPositionPct,
                riskFilters: {
                  volatilityFilter: false,
                  whipsawDetection: false,
                  circuitBreaker: false,
                  regimePersistence: true,
                },
              }
            );
          } catch (error) {
            console.warn('Failed to generate trade audit:', error);
          }
        }
        
        trades.push(trade);
        
        // Create open position with stop loss if enabled
        if (useStopLoss) {
          const currentATR = getATRValue(candles, candleIndex, effectiveStopLossConfig.atrPeriod, effectiveStopLossConfig.useEMA);
          if (currentATR) {
            const openPosition = createOpenPosition(trade, currentPrice, currentATR, effectiveStopLossConfig);
            if (openPosition) {
              openPositions.push(openPosition);
            }
          }
        }
        
        if (onTradeExecuted) onTradeExecuted(trade);
        return trade;
      }
    }
  } else if (!isBuy && portfolio.ethBalance > 0 && signal.signal < 0) {
    // Sell execution
    // Paper trading uses: portfolio.ethBalance * confidence * maxPositionPct
    const maxPositionPct = activeStrategy.maxPositionPct || 0.5;
    const positionSize = portfolio.ethBalance * confidence * maxPositionPct;
    const saleValue = positionSize * currentPrice;
    const costs = applyTransactionCosts(saleValue, transactionCostConfig, candles, candleIndex);
    const netProceeds = saleValue - costs.totalCost;
    
    if (positionSize > 0 && positionSize <= portfolio.ethBalance) {
      // Calculate P&L using FIFO cost basis tracking
      let remainingToSell = positionSize;
      let totalCostBasis = 0;
      
      // Find buy trades that haven't been fully sold yet (FIFO)
      for (const buyTrade of trades.filter(t => t.type === 'buy' && !t.fullySold)) {
        if (remainingToSell <= 0) break;
        
        const buyAmount = buyTrade.ethAmount;
        const sellAmount = Math.min(remainingToSell, buyAmount);
        const costBasisRatio = sellAmount / buyAmount;
        const costBasis = (buyTrade.costBasis || buyTrade.usdcAmount) * costBasisRatio;
        
        totalCostBasis += costBasis;
        remainingToSell -= sellAmount;
        
        // Mark buy trade as fully or partially sold
        if (sellAmount >= buyAmount) {
          buyTrade.fullySold = true;
        } else {
          buyTrade.ethAmount -= sellAmount;
          buyTrade.costBasis = (buyTrade.costBasis || buyTrade.usdcAmount) - costBasis;
          buyTrade.usdcAmount = buyTrade.costBasis;
        }
      }
      
      // If we couldn't match to a buy (shouldn't happen in normal operation), use average cost
      if (totalCostBasis === 0 && trades.filter(t => t.type === 'buy').length > 0) {
        const unsoldBuys = trades.filter(t => t.type === 'buy' && !t.fullySold);
        if (unsoldBuys.length > 0) {
          const totalCost = unsoldBuys.reduce((sum, t) => sum + (t.costBasis || t.usdcAmount), 0);
          const totalAmount = unsoldBuys.reduce((sum, t) => sum + t.ethAmount, 0);
          const avgCost = totalAmount > 0 ? totalCost / totalAmount : currentPrice;
          totalCostBasis = positionSize * avgCost;
        }
      }
      
      const pnl = netProceeds - totalCostBasis;
      const isWin = pnl > 0;
      
      portfolio.ethBalance -= positionSize;
      portfolio.usdcBalance += netProceeds;
      portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
      portfolio.tradeCount++;
      portfolio.totalReturn = ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;
      if (isWin) portfolio.winCount++;
      
      const trade: Trade = {
        id: uuidv4(),
        type: 'sell',
        timestamp: candles[candleIndex]?.timestamp || Date.now(),
        ethPrice: currentPrice,
        ethAmount: positionSize,
        usdcAmount: saleValue,
        signal: signal.signal,
        confidence,
        portfolioValue: portfolio.totalValue,
        costBasis: totalCostBasis,
        pnl,
      };
      
      // Generate audit if requested
      if (generateAudit && portfolioHistory.length > 0 && signal.regime) {
        try {
          trade.audit = generateTradeAudit(
            trade,
            signal as TradingSignal & { regime: MarketRegimeSignal; activeStrategy: TradingConfig | null; momentumConfirmed: boolean; positionSizeMultiplier: number },
            candles,
            portfolioHistory,
            {
              timeframe: config.bullishStrategy.timeframe,
              buyThreshold: activeStrategy.buyThreshold,
              sellThreshold: activeStrategy.sellThreshold,
              maxPositionPct: activeStrategy.maxPositionPct,
              riskFilters: {
                volatilityFilter: false,
                whipsawDetection: false,
                circuitBreaker: false,
                regimePersistence: true,
              },
            }
          );
        } catch (error) {
          console.warn('Failed to generate trade audit:', error);
        }
      }
      
      trades.push(trade);
      if (recordTradeResult) recordTradeResult(isWin);
      
      // Remove matching open positions (FIFO)
      let remainingToRemove = positionSize;
      for (let i = openPositions.length - 1; i >= 0 && remainingToRemove > 0; i--) {
        const position = openPositions[i]!;
        const positionSize = position.buyTrade.ethAmount;
        if (remainingToRemove >= positionSize) {
          openPositions.splice(i, 1);
          remainingToRemove -= positionSize;
        }
      }
      
      if (onTradeExecuted) onTradeExecuted(trade);
      return trade;
    }
  }
  
  return null;
}

