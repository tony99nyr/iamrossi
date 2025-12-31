/**
 * Trade Audit Generator
 * Creates comprehensive audit information for each trade explaining when, why, and how successful
 */

import type { Trade, PriceCandle, PortfolioSnapshot, TradeAudit, TradingSignal } from '@/types';
import type { MarketRegimeSignal } from './market-regime-detector-cached';
import type { TradingConfig } from '@/types';

/**
 * Calculate trade performance metrics (MFE, MAE, holding period)
 */
export function calculateTradePerformance(
  trade: Trade,
  portfolioHistory: PortfolioSnapshot[],
  candles: PriceCandle[]
): {
  holdingPeriod?: number;
  maxFavorableExcursion?: number;
  maxAdverseExcursion?: number;
} {
  if (trade.type === 'buy') {
    // For buy trades, find the corresponding sell trade or current position
    const tradeIndex = portfolioHistory.findIndex(s => s.timestamp >= trade.timestamp);
    if (tradeIndex === -1) {
      return {};
    }

    // Find sell trade or use current price
    let sellTimestamp: number | null = null;

    // Look for matching sell trade
    const sellTrade = portfolioHistory.find((s, idx) => 
      idx > tradeIndex && s.ethBalance < portfolioHistory[tradeIndex]!.ethBalance
    );

    if (sellTrade) {
      sellTimestamp = sellTrade.timestamp;
    } else {
      // No sell yet, use latest price
      sellTimestamp = portfolioHistory[portfolioHistory.length - 1]?.timestamp || trade.timestamp;
    }

    // Calculate holding period (in candles/days)
    const holdingPeriod = Math.floor((sellTimestamp - trade.timestamp) / (24 * 60 * 60 * 1000));

    // Find MFE and MAE during holding period
    const candleIndex = candles.findIndex(c => c.timestamp >= trade.timestamp);
    const sellCandleIndex = candles.findIndex(c => c.timestamp >= sellTimestamp);

    if (candleIndex !== -1 && sellCandleIndex !== -1) {
      let maxFavorable = trade.ethPrice;
      let maxAdverse = trade.ethPrice;

      for (let i = candleIndex; i <= sellCandleIndex && i < candles.length; i++) {
        const price = candles[i].high; // Use high for MFE
        if (price > maxFavorable) maxFavorable = price;

        const lowPrice = candles[i].low; // Use low for MAE
        if (lowPrice < maxAdverse) maxAdverse = lowPrice;
      }

      return {
        holdingPeriod,
        maxFavorableExcursion: ((maxFavorable - trade.ethPrice) / trade.ethPrice) * 100,
        maxAdverseExcursion: ((trade.ethPrice - maxAdverse) / trade.ethPrice) * 100,
      };
    }
  }

  return {};
}

/**
 * Classify trade outcome
 */
export function classifyTradeOutcome(trade: Trade): 'win' | 'loss' | 'breakeven' | 'pending' {
  if (trade.type === 'buy') {
    return 'pending'; // Buy trades are pending until sold
  }

  if (trade.pnl === undefined) {
    return 'pending';
  }

  if (trade.pnl > 0) {
    return 'win';
  } else if (trade.pnl < 0) {
    return 'loss';
  } else {
    return 'breakeven';
  }
}

/**
 * Analyze market conditions at trade time
 */
export function analyzeTradeContext(
  trade: Trade,
  candles: PriceCandle[],
  index: number
): {
  trend: 'up' | 'down' | 'sideways';
  momentum: 'strong' | 'moderate' | 'weak';
  volatility: 'high' | 'medium' | 'low';
} {
  if (index < 20 || index >= candles.length) {
    return {
      trend: 'sideways',
      momentum: 'moderate',
      volatility: 'medium',
    };
  }

  // Calculate trend (price change over last 20 candles)
  const recentCandles = candles.slice(Math.max(0, index - 20), index + 1);
  const priceChange = ((recentCandles[recentCandles.length - 1]!.close - recentCandles[0]!.close) / recentCandles[0]!.close) * 100;

  let trend: 'up' | 'down' | 'sideways';
  if (priceChange > 5) {
    trend = 'up';
  } else if (priceChange < -5) {
    trend = 'down';
  } else {
    trend = 'sideways';
  }

  // Calculate momentum (rate of change)
  const momentumChange = priceChange / 20; // Average per candle
  let momentum: 'strong' | 'moderate' | 'weak';
  if (Math.abs(momentumChange) > 0.5) {
    momentum = 'strong';
  } else if (Math.abs(momentumChange) > 0.2) {
    momentum = 'moderate';
  } else {
    momentum = 'weak';
  }

  // Calculate volatility (standard deviation of returns)
  const returns = recentCandles.slice(1).map((c, i) => 
    ((c.close - recentCandles[i]!.close) / recentCandles[i]!.close) * 100
  );
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  let volatility: 'high' | 'medium' | 'low';
  if (stdDev > 3) {
    volatility = 'high';
  } else if (stdDev > 1.5) {
    volatility = 'medium';
  } else {
    volatility = 'low';
  }

  return { trend, momentum, volatility };
}

/**
 * Generate comprehensive trade audit
 */
export function generateTradeAudit(
  trade: Trade,
  signal: TradingSignal & { 
    regime: MarketRegimeSignal; 
    activeStrategy: TradingConfig | null;
    momentumConfirmed: boolean;
    positionSizeMultiplier: number;
  },
  candles: PriceCandle[],
  portfolioHistory: PortfolioSnapshot[],
  config: {
    timeframe: string;
    buyThreshold: number;
    sellThreshold: number;
    maxPositionPct: number;
    riskFilters?: {
      volatilityFilter: boolean;
      whipsawDetection: boolean;
      circuitBreaker: boolean;
      regimePersistence: boolean;
    };
  }
): TradeAudit {
  const tradeIndex = candles.findIndex(c => c.timestamp >= trade.timestamp);
  const candle = tradeIndex >= 0 ? candles[tradeIndex] : null;

  // Calculate performance metrics
  const performance = calculateTradePerformance(trade, portfolioHistory, candles);

  // Classify outcome
  const outcome = classifyTradeOutcome(trade);

  // Analyze market context
  const marketConditions = tradeIndex >= 0 
    ? analyzeTradeContext(trade, candles, tradeIndex)
    : {
        trend: 'sideways' as const,
        momentum: 'moderate' as const,
        volatility: 'medium' as const,
      };

  // Calculate ROI for sell trades
  let roi: number | undefined;
  if (trade.type === 'sell' && trade.costBasis && trade.costBasis > 0) {
    roi = ((trade.pnl || 0) / trade.costBasis) * 100;
  }

  // Calculate position size percentage
  const positionSizePct = trade.type === 'buy' 
    ? (trade.usdcAmount / (portfolioHistory.find(s => s.timestamp <= trade.timestamp)?.totalValue || trade.portfolioValue)) * 100
    : 0;

  // Calculate 24h price change
  const priceChange24h = candle && tradeIndex >= 24
    ? ((candle.close - candles[tradeIndex - 24]!.close) / candles[tradeIndex - 24]!.close) * 100
    : undefined;

  // Calculate volatility (rolling 20-period)
  let volatility = 0;
  if (tradeIndex >= 20) {
    const recentCandles = candles.slice(tradeIndex - 20, tradeIndex + 1);
    const returns = recentCandles.slice(1).map((c, i) => 
      ((c.close - recentCandles[i]!.close) / recentCandles[i]!.close) * 100
    );
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    volatility = Math.sqrt(variance);
  }

  const audit: TradeAudit = {
    // When
    date: new Date(trade.timestamp).toISOString().split('T')[0],
    timeframe: config.timeframe,
    
    // Why - Signal Details
    regime: signal.regime.regime,
    regimeConfidence: signal.regime.confidence,
    activeStrategy: signal.activeStrategy?.name || 'Unknown',
    momentumConfirmed: signal.momentumConfirmed,
    
    // Why - Indicator Breakdown
    indicatorSignals: signal.indicators || {},
    indicatorWeights: {}, // Will be populated from strategy config if available
    buyThreshold: config.buyThreshold,
    sellThreshold: config.sellThreshold,
    
    // Why - Market Context
    priceAtTrade: trade.ethPrice,
    volatility,
    volume: candle?.volume || 0,
    priceChange24h,
    
    // Why - Risk Management
    riskFilters: config.riskFilters || {
      volatilityFilter: false,
      whipsawDetection: false,
      circuitBreaker: false,
      regimePersistence: true, // Default to true if not specified
    },
    
    // Why - Position Sizing
    positionSizePct,
    positionSizeMultiplier: signal.positionSizeMultiplier || 1.0,
    maxPositionAllowed: config.maxPositionPct * 100,
    
    // How Successful - Trade Performance Analysis
    holdingPeriod: performance.holdingPeriod,
    maxFavorableExcursion: performance.maxFavorableExcursion,
    maxAdverseExcursion: performance.maxAdverseExcursion,
    exitReason: trade.type === 'sell' ? 'signal' : undefined,
    
    // How Successful - Outcome Classification
    outcome,
    winLossAmount: trade.pnl || 0,
    roi,
    
    // Context - Market Conditions
    marketConditions,
  };

  return audit;
}

