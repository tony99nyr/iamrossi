/**
 * Enhanced Paper Trading Service
 * Handles live paper trading with enhanced adaptive strategy
 */

import { v4 as uuidv4 } from 'uuid';
import type { Trade, PortfolioSnapshot, Portfolio, PriceCandle, TradingSignal, TradingConfig } from '@/types';
import type { MarketRegimeSignal } from './market-regime-detector-cached';
import type { EnhancedAdaptiveStrategyConfig } from './adaptive-strategy-enhanced';
import { fetchLatestPrice, fetchPriceCandles } from './eth-price-service';
import { generateEnhancedAdaptiveSignal, clearRegimeHistory, clearRegimeHistoryForSession, recordTradeResult } from './adaptive-strategy-enhanced';
import { calculateConfidence } from './confidence-calculator';
import { redis, ensureConnected } from './kv';
import { validateDataQuality, type DataQualityReport } from './data-quality-validator';
import { getATRValue } from './indicators';
import { type StopLossConfig, type OpenPosition } from './atr-stop-loss';
import { executeTrade, type TradeExecutionOptions } from './trade-executor';
import { calculateKellyCriterion, getKellyMultiplier } from './kelly-criterion';

export interface EnhancedPaperTradingSession {
  id: string;
  name?: string;
  config: EnhancedAdaptiveStrategyConfig;
  startedAt: number;
  stoppedAt?: number;
  isActive: boolean;
  trades: Trade[];
  portfolioHistory: PortfolioSnapshot[];
  portfolio: Portfolio;
  // Enhanced fields
  currentRegime: MarketRegimeSignal;
  currentIndicators: Record<string, number>;
  lastSignal: TradingSignal & { regime: MarketRegimeSignal; activeStrategy: TradingConfig | null; momentumConfirmed: boolean; positionSizeMultiplier: number; kellyMultiplier?: number };
  lastPrice: number;
  lastUpdate: number;
  dataQuality?: DataQualityReport; // Latest data quality report
  regimeHistory?: Array<{ timestamp: number; regime: MarketRegimeSignal['regime']; confidence: number }>; // Track regime changes
  strategySwitches?: Array<{ timestamp: number; from: string; to: string; reason: string }>; // Track strategy switches
  // Advanced risk management
  openPositions?: OpenPosition[]; // Track open positions with stop losses
  currentATR?: number; // Current ATR value for display
  kellyMultiplier?: number; // Current Kelly multiplier for display
}

const ACTIVE_SESSION_KEY = 'eth:paper:session:active';

/**
 * Paper Trading Service
 */
export class PaperTradingService {
  /**
   * Start a new paper trading session
   */
  static async startSession(config: EnhancedAdaptiveStrategyConfig, name?: string): Promise<EnhancedPaperTradingSession> {
    await ensureConnected();

    // Check if there's already an active session
    const existingSession = await this.getActiveSession();
    if (existingSession && existingSession.isActive) {
      throw new Error('A paper trading session is already active. Please stop it first.');
    }

    // Get initial price
    const initialPrice = await fetchLatestPrice('ETHUSDT');

    // Fetch ALL available candles for regime detection and chart display
    // Load from earliest available date to ensure we have complete historical context
    // fetchPriceCandles will automatically load from all available historical + rolling files
    const endDate = new Date().toISOString().split('T')[0];
    // Use a very early start date - fetchPriceCandles will load all available data from files
    // This ensures we get ALL historical data, not just the last 200 days
    const startDate = '2020-01-01'; // Early enough to capture all available historical data
    // Use timeframe from config (default to 8h if not specified)
    const timeframe = config.bullishStrategy.timeframe || '8h';
    // Use skipAPIFetch=false to allow API fetches for recent data, but ensure file data is preserved
    const candles = await fetchPriceCandles('ETHUSDT', timeframe, startDate, endDate, initialPrice, false);

    if (candles.length < 50) {
      throw new Error('Not enough historical data to start paper trading');
    }

    // Clear any previous regime history
    clearRegimeHistory();

    // Generate initial signal to get regime (pass session ID for regime history tracking)
    const currentIndex = candles.length - 1;
    const sessionId = uuidv4(); // Generate session ID before creating session
    
    // Validate data quality
    // Use the actual timeframe from config for validation
    // For 8h candles, use 8 hours (480 minutes) as max age
    // For daily candles, use 24 hours (1440 minutes) as max age
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    const maxAgeMinutes = timeframe === '8h' ? 480 : timeframe === '12h' ? 720 : 1440;
    const dataQuality = validateDataQuality(candles, timeframe, startTime, endTime, currentIndex, maxAgeMinutes);
    
    if (!dataQuality.isValid) {
      console.warn('Data quality issues detected at session start:', dataQuality.issues);
    }
    
    const initialSignal = generateEnhancedAdaptiveSignal(candles, config, currentIndex, sessionId);

    // Populate portfolioHistory with historical price data from candles
    // This gives the chart historical context even before the session has many updates
    const initialCapital = config.bullishStrategy.initialCapital;
    
    // Get today's date for comparison
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    
    // Check if today's candle is in the candles array
    const todayCandle = candles.find(c => {
      const candleDate = new Date(c.timestamp);
      candleDate.setUTCHours(0, 0, 0, 0);
      return candleDate.getTime() === todayStart;
    });
    
    // Start with daily candles for historical context
    const portfolioHistory: PortfolioSnapshot[] = candles.map(candle => ({
      timestamp: candle.timestamp,
      usdcBalance: initialCapital, // Historical snapshots show starting balance
      ethBalance: 0,
      totalValue: initialCapital,
      ethPrice: candle.close,
    }));

    // Fetch and merge recent intraday candles (5m or 1h) from Redis for the last 48 hours
    // This provides granular price movements for recent periods
    try {
      const now = Date.now();
      const recentCutoff = now - (48 * 60 * 60 * 1000); // Last 48 hours
      
      // Try to fetch 5-minute candles first (most granular), fall back to hourly if not available
      let intradayCandles: PriceCandle[] = [];
      const recentStartDate = new Date(recentCutoff).toISOString().split('T')[0];
      const recentEndDate = new Date(now).toISOString().split('T')[0];
      
      try {
        // Try 5-minute candles first
        intradayCandles = await fetchPriceCandles('ETHUSDT', '5m', recentStartDate, recentEndDate, initialPrice);
        console.log(`✅ Loaded ${intradayCandles.length} 5-minute candles from Redis for recent period`);
      } catch {
        // Fall back to hourly candles if 5-minute not available
        try {
          intradayCandles = await fetchPriceCandles('ETHUSDT', '1h', recentStartDate, recentEndDate, initialPrice);
          console.log(`✅ Loaded ${intradayCandles.length} hourly candles from Redis for recent period`);
        } catch (error1h) {
          console.warn('⚠️ Could not load intraday candles from Redis (non-critical):', error1h instanceof Error ? error1h.message : error1h);
        }
      }
      
      // Merge intraday candles into portfolioHistory, replacing daily candles for recent periods
      if (intradayCandles.length > 0) {
        // Create a map of existing daily candles by timestamp (rounded to day)
        const dailyCandleMap = new Map<number, PortfolioSnapshot>();
        portfolioHistory.forEach(snapshot => {
          const dayStart = new Date(snapshot.timestamp);
          dayStart.setUTCHours(0, 0, 0, 0);
          dailyCandleMap.set(dayStart.getTime(), snapshot);
        });
        
        // Add intraday candles, but only for the last 48 hours (replace daily candles in that range)
        intradayCandles.forEach(candle => {
          if (candle.timestamp >= recentCutoff) {
            // Check if this intraday candle is within a daily candle's range
            const candleDay = new Date(candle.timestamp);
            candleDay.setUTCHours(0, 0, 0, 0);
            // dayStart calculated but not currently used
            // const dayStart = candleDay.getTime();
            
            // Only add if it's in the recent 48-hour window
            // This replaces the daily candle with more granular intraday data
            portfolioHistory.push({
              timestamp: candle.timestamp,
              usdcBalance: initialCapital,
              ethBalance: 0,
              totalValue: initialCapital,
              ethPrice: candle.close,
            });
          }
        });
        
        // Remove daily candles that are within the recent 48-hour window (replaced by intraday)
        const filteredHistory = portfolioHistory.filter(snapshot => {
          const snapshotDay = new Date(snapshot.timestamp);
          snapshotDay.setUTCHours(0, 0, 0, 0);
          const dayStart = snapshotDay.getTime();
          
          // Keep daily candles older than 48 hours
          if (dayStart < recentCutoff) {
            return true;
          }
          
          // For recent periods, only keep if it's not a daily candle (intraday candles have more precise timestamps)
          // Daily candles have timestamps at start of day (00:00:00)
          const isDailyCandle = snapshot.timestamp === dayStart;
          return !isDailyCandle; // Remove daily candles in recent period, keep intraday
        });
        
        // Sort by timestamp
        filteredHistory.sort((a, b) => a.timestamp - b.timestamp);
        
        // Replace portfolioHistory with merged data
        portfolioHistory.length = 0;
        portfolioHistory.push(...filteredHistory);
      }
    } catch (error) {
      console.warn('⚠️ Failed to merge intraday candles (non-critical):', error instanceof Error ? error.message : error);
    }

    // Add current snapshot with actual current price (only if today's candle wasn't already included)
    // If today's candle exists, it should already have the latest price from fetchPriceCandles
    // But we add a "now" snapshot to show the very latest price
    const now = Date.now();
    if (!todayCandle || todayCandle.timestamp < now - 5 * 60 * 1000) {
      // Only add if today's candle is missing or more than 5 minutes old
      portfolioHistory.push({
        timestamp: now,
        usdcBalance: initialCapital,
        ethBalance: 0,
        totalValue: initialCapital,
        ethPrice: initialPrice,
      });
    } else if (todayCandle.close !== initialPrice) {
      // Today's candle exists but price has changed - add update snapshot
      portfolioHistory.push({
        timestamp: now,
        usdcBalance: initialCapital,
        ethBalance: 0,
        totalValue: initialCapital,
        ethPrice: initialPrice,
      });
    }
    
    // Final sort to ensure chronological order
    portfolioHistory.sort((a, b) => a.timestamp - b.timestamp);

    // Create session
    const session: EnhancedPaperTradingSession = {
      id: sessionId,
      name,
      config,
      startedAt: Date.now(),
      isActive: true,
      trades: [],
      portfolioHistory,
      portfolio: {
        usdcBalance: initialCapital,
        ethBalance: 0,
        totalValue: initialCapital,
        initialCapital,
        totalReturn: 0,
        tradeCount: 0,
        winCount: 0,
      },
      currentRegime: initialSignal.regime,
      currentIndicators: initialSignal.indicators,
      lastSignal: initialSignal,
      lastPrice: initialPrice,
      lastUpdate: Date.now(),
      dataQuality,
      regimeHistory: [{
        timestamp: Date.now(),
        regime: initialSignal.regime.regime,
        confidence: initialSignal.regime.confidence,
      }],
      strategySwitches: [],
    };

    // Save to Redis
    await redis.set(ACTIVE_SESSION_KEY, JSON.stringify(session));

    return session;
  }

  /**
   * Update paper trading session (fetch price, calculate regime, execute trades)
   */
  static async updateSession(sessionId?: string): Promise<EnhancedPaperTradingSession> {
    await ensureConnected();

    // Get session
    const session = sessionId 
      ? await this.getSession(sessionId)
      : await this.getActiveSession();

    if (!session) {
      throw new Error('Paper trading session not found');
    }

    if (!session.isActive) {
      throw new Error('Paper trading session is not active');
    }

    // Fetch latest price (this updates today's candle in Redis asynchronously)
    // If price fetch fails (e.g., all APIs rate limited), use the last price from the session
    let currentPrice: number;
    try {
      currentPrice = await fetchLatestPrice('ETHUSDT');
    } catch (priceError) {
      // If all APIs fail, try to use the last known price from the session
      const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
      console.warn(`⚠️ Failed to fetch latest price: ${errorMessage}`);
      
      // Try to get the last price from the session's portfolio history or current price
      if (session.portfolioHistory && session.portfolioHistory.length > 0) {
        const lastSnapshot = session.portfolioHistory[session.portfolioHistory.length - 1];
        // Estimate price from last portfolio value (rough approximation)
        if (lastSnapshot && session.portfolio.ethBalance > 0) {
          const estimatedPrice = (lastSnapshot.totalValue - session.portfolio.usdcBalance) / session.portfolio.ethBalance;
          if (estimatedPrice > 0 && estimatedPrice < 10000) { // Sanity check
            console.warn(`⚠️ Using estimated price from last portfolio snapshot: $${estimatedPrice.toFixed(2)}`);
            currentPrice = estimatedPrice;
          } else {
            throw new Error('Failed to fetch price and cannot estimate from portfolio');
          }
        } else {
          throw new Error('Failed to fetch price and no portfolio history available');
        }
      } else {
        // Last resort: throw error (will be caught by caller)
        throw new Error(`Failed to fetch latest price: ${errorMessage}`);
      }
    }
    
    // Note: updateTodayCandle is called asynchronously in fetchLatestPrice
    // The merge logic in fetchPriceCandles will pick up today's candle from Redis
    // We add a small delay to give updateTodayCandle time to complete its Redis update
    await new Promise(resolve => setTimeout(resolve, 200));

    // Also fetch and save hourly candles for historical data continuity
    // This ensures we have hourly candle data going forward
    try {
      const now = new Date();
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Fetch hourly candles for yesterday and today (saves to Redis and files)
      await fetchPriceCandles('ETHUSDT', '1h', yesterdayStr, todayStr, currentPrice);
      console.log(`✅ Fetched and saved hourly candles for historical data`);
    } catch (hourlyError) {
      // Non-critical - log but don't fail the session update
      console.warn('Failed to fetch hourly candles (non-critical):', hourlyError instanceof Error ? hourlyError.message : hourlyError);
    }

    // Fetch ALL available candles for regime detection
    // Load from earliest available date to ensure we have complete historical context
    // Pass currentPrice so fetchPriceCandles can create today's candle if Redis doesn't have it yet
    const endDate = new Date().toISOString().split('T')[0];
    // Use a very early start date - fetchPriceCandles will load all available data from files
    const startDate = '2020-01-01'; // Early enough to capture all available historical data
    // Use timeframe from config (default to 8h if not specified)
    const timeframe = session.config.bullishStrategy.timeframe || '8h';
    const candles = await fetchPriceCandles('ETHUSDT', timeframe, startDate, endDate, currentPrice);

    if (candles.length < 50) {
      throw new Error('Not enough historical data to update session');
    }

    // Log candle info for debugging
    if (candles.length > 0) {
      const firstCandle = candles[0]!;
      const lastCandle = candles[candles.length - 1]!;
      console.log(`[Paper Trading] Loaded ${candles.length} candles: ${new Date(firstCandle.timestamp).toISOString()} to ${new Date(lastCandle.timestamp).toISOString()}`);
    }

    // Generate signal with enhanced adaptive strategy (pass session ID for regime history tracking)
    const currentIndex = candles.length - 1;
    
    // Validate data quality (check for gaps, freshness, look-ahead bias)
    // Use the actual timeframe from config for validation
    // For 8h candles, use 8 hours (480 minutes) as max age
    // For daily candles, use 24 hours (1440 minutes) as max age
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    const maxAgeMinutes = timeframe === '8h' ? 480 : timeframe === '12h' ? 720 : 1440;
    const dataQuality = validateDataQuality(candles, timeframe, startTime, endTime, currentIndex, maxAgeMinutes);
    
    // Log data quality for debugging
    if (dataQuality.issues && dataQuality.issues.length > 0) {
      console.log(`[Paper Trading] Data quality issues:`, dataQuality.issues);
    }
    
    if (!dataQuality.isValid) {
      console.warn('Data quality issues detected:', dataQuality.issues);
      // Log warnings but don't block execution
      if (dataQuality.warnings.length > 0) {
        console.warn('Data quality warnings:', dataQuality.warnings);
      }
    }
    
    const signal = generateEnhancedAdaptiveSignal(candles, session.config, currentIndex, session.id);
    const confidence = calculateConfidence(signal, candles, currentIndex);

    // Execute trades based on signal
    const updatedSession = { ...session };
    const { portfolio } = updatedSession;

    // Initialize open positions array if not present
    if (!updatedSession.openPositions) {
      updatedSession.openPositions = [];
    }

    // Get Kelly Criterion and ATR stop loss configs
    const kellyConfig = session.config.kellyCriterion;
    const stopLossConfig = session.config.stopLoss;
    const useKelly = kellyConfig?.enabled ?? true;
    const useStopLoss = stopLossConfig?.enabled ?? true;
    const kellyFractionalMultiplier = kellyConfig?.fractionalMultiplier ?? 0.25;
    const effectiveStopLossConfig: StopLossConfig = stopLossConfig || {
      enabled: true,
      atrMultiplier: 2.0,
      trailing: true,
      useEMA: true,
      atrPeriod: 14,
    };

    // Calculate current ATR for display
    let currentATR: number | null = null;
    if (useStopLoss) {
      currentATR = getATRValue(candles, currentIndex, effectiveStopLossConfig.atrPeriod, effectiveStopLossConfig.useEMA);
      updatedSession.currentATR = currentATR || undefined;
    }

    // Use unified trade executor
    const executionOptions: TradeExecutionOptions = {
      candles,
      candleIndex: currentIndex,
      portfolioHistory: updatedSession.portfolioHistory,
      config: session.config,
      trades: updatedSession.trades,
      openPositions: updatedSession.openPositions,
      useKellyCriterion: useKelly,
      useStopLoss,
      kellyFractionalMultiplier,
      stopLossConfig: effectiveStopLossConfig,
      generateAudit: false, // Paper trading doesn't need audit data
      recordTradeResult: (isWin: boolean) => recordTradeResult(session.id, isWin),
    };

    // Execute trade (result is stored in trades array and portfolio is updated)
    executeTrade(
      signal,
      confidence,
      currentPrice,
      portfolio,
      executionOptions
    );
    
    // Calculate Kelly multiplier for display (after trade execution)
    let kellyMultiplier = 1.0;

    // Update Kelly multiplier for display (calculate from completed trades)
    if (useKelly && updatedSession.trades.length >= (kellyConfig?.minTrades || 10)) {
      const completedTrades = updatedSession.trades.filter((t): t is Trade & { pnl: number } => 
        t.type === 'sell' && t.pnl !== undefined && t.pnl !== null
      );
      if (completedTrades.length >= (kellyConfig?.minTrades || 10) && signal.activeStrategy) {
        const recentTrades = completedTrades.slice(-(kellyConfig?.lookbackPeriod || 50));
        const kellyResult = calculateKellyCriterion(recentTrades, {
          minTrades: kellyConfig?.minTrades || 10,
          lookbackPeriod: kellyConfig?.lookbackPeriod || 50,
          fractionalMultiplier: kellyFractionalMultiplier,
        });
        if (kellyResult) {
          kellyMultiplier = getKellyMultiplier(kellyResult, signal.activeStrategy.maxPositionPct || 0.9);
          updatedSession.kellyMultiplier = kellyMultiplier;
        } else {
          updatedSession.kellyMultiplier = 1.0;
        }
      } else {
        updatedSession.kellyMultiplier = 1.0;
      }
    } else {
      updatedSession.kellyMultiplier = 1.0;
    }

    // Update portfolio values
    const newTotalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.totalValue = newTotalValue;
    portfolio.totalReturn = ((newTotalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;

    // Update last signal with Kelly multiplier (cast to include kellyMultiplier)
    updatedSession.lastSignal = { 
      ...signal, 
      kellyMultiplier: kellyMultiplier !== 1.0 ? kellyMultiplier : undefined 
    } as typeof updatedSession.lastSignal;

    // Add portfolio snapshot with current price
    const now = Date.now();
    updatedSession.portfolioHistory.push({
      timestamp: now,
      usdcBalance: portfolio.usdcBalance,
      ethBalance: portfolio.ethBalance,
      totalValue: newTotalValue,
      ethPrice: currentPrice,
    });
    
    // Also fetch and merge recent intraday candles (5m or 1h) from Redis for the last 48 hours
    // This ensures the chart shows granular price movements for recent periods
    try {
      const recentCutoff = now - (48 * 60 * 60 * 1000); // Last 48 hours
      const recentStartDate = new Date(recentCutoff).toISOString().split('T')[0];
      const recentEndDate = new Date(now).toISOString().split('T')[0];
      
      // Try to fetch 5-minute candles first (most granular), fall back to hourly if not available
      let intradayCandles: PriceCandle[] = [];
      try {
        intradayCandles = await fetchPriceCandles('ETHUSDT', '5m', recentStartDate, recentEndDate, currentPrice);
      } catch {
        try {
          intradayCandles = await fetchPriceCandles('ETHUSDT', '1h', recentStartDate, recentEndDate, currentPrice);
        } catch {
          // Non-critical - continue without intraday candles
        }
      }
      
      // Merge intraday candles into portfolioHistory for recent periods
      if (intradayCandles.length > 0) {
        // Create a set of existing timestamps to avoid duplicates
        const existingTimestamps = new Set(updatedSession.portfolioHistory.map(s => s.timestamp));
        
        // Add intraday candles that are within the recent 48-hour window and not already present
        intradayCandles.forEach(candle => {
          if (candle.timestamp >= recentCutoff && !existingTimestamps.has(candle.timestamp)) {
            // Calculate portfolio value at this candle's timestamp
            // Use the current portfolio state (simplified - in reality, we'd need to track historical portfolio state)
            const candleValue = portfolio.usdcBalance + portfolio.ethBalance * candle.close;
            updatedSession.portfolioHistory.push({
              timestamp: candle.timestamp,
              usdcBalance: portfolio.usdcBalance,
              ethBalance: portfolio.ethBalance,
              totalValue: candleValue,
              ethPrice: candle.close,
            });
            existingTimestamps.add(candle.timestamp);
          }
        });
        
        // Remove daily candles that are within the recent 48-hour window (replaced by intraday)
        const filteredHistory = updatedSession.portfolioHistory.filter(snapshot => {
          const snapshotDay = new Date(snapshot.timestamp);
          snapshotDay.setUTCHours(0, 0, 0, 0);
          const dayStart = snapshotDay.getTime();
          
          // Keep daily candles older than 48 hours
          if (dayStart < recentCutoff) {
            return true;
          }
          
          // For recent periods, only keep if it's not a daily candle (intraday candles have more precise timestamps)
          const isDailyCandle = snapshot.timestamp === dayStart;
          return !isDailyCandle; // Remove daily candles in recent period, keep intraday
        });
        
        // Sort by timestamp
        filteredHistory.sort((a, b) => a.timestamp - b.timestamp);
        updatedSession.portfolioHistory = filteredHistory;
      }
    } catch (error) {
      // Non-critical - log but continue
      console.warn('⚠️ Failed to merge intraday candles in update (non-critical):', error instanceof Error ? error.message : error);
    }

    // Track regime changes
    if (!updatedSession.regimeHistory) {
      updatedSession.regimeHistory = [];
    }
    const previousRegime = updatedSession.currentRegime;
    if (previousRegime && previousRegime.regime !== signal.regime.regime) {
      // Regime changed - log it
      updatedSession.regimeHistory.push({
        timestamp: Date.now(),
        regime: signal.regime.regime,
        confidence: signal.regime.confidence,
      });
      // Keep only last 100 regime changes
      if (updatedSession.regimeHistory.length > 100) {
        updatedSession.regimeHistory.shift();
      }
    } else if (updatedSession.regimeHistory.length === 0) {
      // First regime entry
      updatedSession.regimeHistory.push({
        timestamp: Date.now(),
        regime: signal.regime.regime,
        confidence: signal.regime.confidence,
      });
    }

    // Track strategy switches
    if (!updatedSession.strategySwitches) {
      updatedSession.strategySwitches = [];
    }
    const previousStrategy = updatedSession.lastSignal?.activeStrategy?.name || 'none';
    const currentStrategy = signal.activeStrategy?.name || 'none';
    if (previousStrategy !== currentStrategy) {
      updatedSession.strategySwitches.push({
        timestamp: Date.now(),
        from: previousStrategy,
        to: currentStrategy,
        reason: `Regime: ${signal.regime.regime}, Confidence: ${(signal.regime.confidence * 100).toFixed(1)}%, Momentum: ${signal.momentumConfirmed ? 'confirmed' : 'not confirmed'}`,
      });
      // Keep only last 50 strategy switches
      if (updatedSession.strategySwitches.length > 50) {
        updatedSession.strategySwitches.shift();
      }
    }

    // Update session state
    updatedSession.currentRegime = signal.regime;
    updatedSession.currentIndicators = signal.indicators;
    updatedSession.lastSignal = signal;
    updatedSession.lastPrice = currentPrice;
    updatedSession.lastUpdate = Date.now();
    updatedSession.portfolio = portfolio;
    updatedSession.dataQuality = dataQuality;

    // Save to Redis
    await redis.set(ACTIVE_SESSION_KEY, JSON.stringify(updatedSession));

    return updatedSession;
  }

  /**
   * Get active paper trading session
   */
  static async getActiveSession(): Promise<EnhancedPaperTradingSession | null> {
    await ensureConnected();
    const data = await redis.get(ACTIVE_SESSION_KEY);
    return data ? JSON.parse(data) as EnhancedPaperTradingSession : null;
  }

  /**
   * Get session by ID (for future history support)
   */
  static async getSession(sessionId: string): Promise<EnhancedPaperTradingSession | null> {
    // For now, only support active session
    const session = await this.getActiveSession();
    if (session && session.id === sessionId) {
      return session;
    }
    return null;
  }

  /**
   * Stop paper trading session
   */
  static async stopSession(sessionId?: string): Promise<EnhancedPaperTradingSession> {
    await ensureConnected();

    const session = sessionId
      ? await this.getSession(sessionId)
      : await this.getActiveSession();

    if (!session) {
      throw new Error('Paper trading session not found');
    }

    if (!session.isActive) {
      throw new Error('Paper trading session is not active');
    }

    // Get final price
    const finalPrice = await fetchLatestPrice('ETHUSDT');
    const finalValue = session.portfolio.usdcBalance + session.portfolio.ethBalance * finalPrice;

    // Add final snapshot
    session.portfolioHistory.push({
      timestamp: Date.now(),
      usdcBalance: session.portfolio.usdcBalance,
      ethBalance: session.portfolio.ethBalance,
      totalValue: finalValue,
      ethPrice: finalPrice,
    });

    // Update session
    session.isActive = false;
    session.stoppedAt = Date.now();
    session.portfolio.totalValue = finalValue;
    session.portfolio.totalReturn = ((finalValue - session.portfolio.initialCapital) / session.portfolio.initialCapital) * 100;

    // Clear regime history for this session
    clearRegimeHistoryForSession(session.id);

    // Save to Redis
    await redis.set(ACTIVE_SESSION_KEY, JSON.stringify(session));

    return session;
  }
}

