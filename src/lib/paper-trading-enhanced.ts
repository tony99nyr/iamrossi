/**
 * Enhanced Paper Trading Service
 * Handles live paper trading with enhanced adaptive strategy
 */

import { v4 as uuidv4 } from 'uuid';
import type { Trade, PortfolioSnapshot, Portfolio, PriceCandle, TradingSignal, TradingConfig } from '@/types';
import type { MarketRegimeSignal } from './market-regime-detector-cached';
import type { EnhancedAdaptiveStrategyConfig } from './adaptive-strategy-enhanced';
import { fetchLatestPrice, fetchPriceCandles } from './eth-price-service';
import { generateEnhancedAdaptiveSignal, clearRegimeHistory, clearRegimeHistoryForSession, recordTradeResult, resetDrawdownTracking, checkDrawdownCircuitBreaker, getPeakPortfolioValue } from './adaptive-strategy-enhanced';
import { calculateConfidence } from './confidence-calculator';
import { redis, ensureConnected } from './kv';
import { validateDataQuality, type DataQualityReport } from './data-quality-validator';
import { getATRValue } from './indicators';
import { type StopLossConfig, type OpenPosition } from './atr-stop-loss';
import { executeTrade, type TradeExecutionOptions } from './trade-executor';
import { calculateKellyCriterion, getKellyMultiplier } from './kelly-criterion';
import { sendTradeAlert, sendRegimeChangeAlert, sendSessionAlert, createTradeNotification, isNotificationsEnabled } from './notifications';
import { trackDataQualityIssue, trackSystemError } from './error-tracking';
import { getAssetConfig, getPaperSessionKey, type TradingAsset } from './asset-config';
import { analyzeCorrelation, getCorrelationContext } from './correlation-analysis';
import { fetchAlignedCandles } from './btc-price-service';
import { checkAllThresholds } from './alert-thresholds';
// Circuit breaker imports removed - not currently used in paper trading

// Maximum number of portfolio history snapshots to keep (rolling window)
const MAX_PORTFOLIO_HISTORY = 1000;

// Session expiration: 90 days of inactivity (for autonomous long-running sessions)
// Sessions that are actively being updated will never expire
// Only truly abandoned/inactive sessions will be cleaned up
const SESSION_EXPIRATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Cleanup job interval: run every hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface EnhancedPaperTradingSession {
  id: string;
  name?: string;
  asset: TradingAsset; // Asset being traded (eth, btc, etc.)
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
  drawdownInfo?: {
    currentDrawdown: number; // Current drawdown percentage (0-1)
    peakValue: number; // Peak portfolio value
    threshold: number; // Drawdown threshold
    isPaused: boolean; // Whether trading is paused due to drawdown
  };
  // Emergency stop
  isEmergencyStopped?: boolean; // Whether trading is manually stopped
  emergencyStoppedAt?: number; // Timestamp when emergency stop was activated
  // Session management
  expiresAt?: number; // Timestamp when session expires (if inactive)
}

// Helper to get active session key for an asset
function getActiveSessionKey(asset: TradingAsset = 'eth'): string {
  return getPaperSessionKey(asset);
}

/**
 * Manage portfolio history with rolling window
 * Keeps only the most recent MAX_PORTFOLIO_HISTORY snapshots
 */
function managePortfolioHistory(history: PortfolioSnapshot[]): PortfolioSnapshot[] {
  if (history.length <= MAX_PORTFOLIO_HISTORY) {
    return history;
  }
  
  // Keep the most recent snapshots (remove oldest)
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.slice(-MAX_PORTFOLIO_HISTORY);
}

/**
 * Deduplicate portfolio history snapshots by timestamp
 */
function deduplicatePortfolioHistory(history: PortfolioSnapshot[]): PortfolioSnapshot[] {
  const seen = new Map<number, PortfolioSnapshot>();
  
  for (const snapshot of history) {
    const existing = seen.get(snapshot.timestamp);
    if (!existing || snapshot.timestamp > existing.timestamp) {
      seen.set(snapshot.timestamp, snapshot);
    }
  }
  
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Paper Trading Service
 */
export class PaperTradingService {
  /**
   * Validate session state (check for corruption, missing fields, etc.)
   */
  static validateSession(session: EnhancedPaperTradingSession): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!session.id) {
      errors.push('Session missing ID');
    }
    
    if (!session.asset) {
      errors.push('Session missing asset');
    }
    
    if (!session.portfolio) {
      errors.push('Session missing portfolio');
    } else {
      if (typeof session.portfolio.initialCapital !== 'number' || session.portfolio.initialCapital <= 0) {
        errors.push('Invalid initial capital');
      }
      if (typeof session.portfolio.usdcBalance !== 'number' || session.portfolio.usdcBalance < 0) {
        errors.push('Invalid USDC balance');
      }
      if (typeof session.portfolio.ethBalance !== 'number' || session.portfolio.ethBalance < 0) {
        errors.push('Invalid asset balance');
      }
    }
    
    if (!session.trades || !Array.isArray(session.trades)) {
      errors.push('Session missing or invalid trades array');
    }
    
    if (!session.portfolioHistory || !Array.isArray(session.portfolioHistory)) {
      errors.push('Session missing or invalid portfolio history');
    }
    
    if (session.isActive && !session.lastUpdate) {
      errors.push('Active session missing lastUpdate timestamp');
    }
    
    // Check for expired session
    if (session.isActive && session.expiresAt && Date.now() > session.expiresAt) {
      errors.push('Session has expired');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Check if session is expired (only for truly inactive sessions)
   * For autonomous long-running sessions, expiration only occurs if the session
   * hasn't been updated in a very long time (90 days). Active sessions that are
   * being updated regularly will never expire.
   */
  static isSessionExpired(session: EnhancedPaperTradingSession): boolean {
    if (!session.isActive) {
      return false; // Inactive sessions don't expire
    }
    
    // Check based on lastUpdate (most reliable indicator of activity)
    const timeSinceUpdate = Date.now() - (session.lastUpdate || session.startedAt);
    
    // Only expire if session hasn't been updated in 90 days
    // This allows autonomous sessions to run for weeks/months as long as they're being updated
    return timeSinceUpdate > SESSION_EXPIRATION_MS;
  }
  
  /**
   * Start a new paper trading session
   */
  static async startSession(config: EnhancedAdaptiveStrategyConfig, name?: string, asset: TradingAsset = 'eth'): Promise<EnhancedPaperTradingSession> {
    await ensureConnected();

    const assetConfig = getAssetConfig(asset);
    const symbol = assetConfig.symbol;

    // Check if there's already an active session for this asset
    const existingSession = await this.getActiveSession(asset);
    if (existingSession && existingSession.isActive) {
      throw new Error(`A paper trading session for ${assetConfig.displayName} is already active. Please stop it first.`);
    }

    // Get initial price
    const initialPrice = await fetchLatestPrice(symbol);

    // Fetch ALL available candles for regime detection and chart display
    // Load from earliest available date to ensure we have complete historical context
    // fetchPriceCandles will automatically load from all available historical + rolling files
    const endDate = new Date().toISOString().split('T')[0];
    
    // Use a start date based on asset availability:
    // - ETH has historical data from 2025, so use 2020 to get all available data
    // - BTC: APIs typically provide ~90 days of historical data, so use a recent date
    //   For BTC, we'll fetch from APIs (no synthetic data) and build up history over time
    let startDate: string;
    if (asset === 'btc') {
      // For BTC, use a date that APIs can provide (typically 90-365 days)
      // Start from 90 days ago to ensure we get enough data from APIs
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 90);
      startDate = daysAgo.toISOString().split('T')[0];
      console.log(`📊 BTC paper trading: Using API data from ${startDate} (90 days lookback)`);
    } else {
      startDate = '2020-01-01';
    }
    
    // Use timeframe from config (default to asset's default timeframe if not specified)
    const timeframe = config.bullishStrategy.timeframe || assetConfig.defaultTimeframe;
    
    // CRITICAL: Paper trading MUST NEVER use synthetic data
    // - skipAPIFetch=false allows API fetches for recent data
    // - allowSyntheticData=false ensures synthetic data is NEVER loaded from synthetic/ directory
    // - Paper trading ONLY uses real historical data files (ethusdt/8h/, btcusdt/8h/) and real API data
    // NOTE: Synthetic data is identified by LOCATION (synthetic/ directory), NOT by date
    // Real data can be from any date, including 2026 and beyond
    const candles = await fetchPriceCandles(symbol, timeframe, startDate, endDate, initialPrice, false, false);

    if (candles.length < 50) {
      // For BTC, provide a more helpful error message
      if (asset === 'btc') {
        throw new Error(`Not enough historical data to start BTC paper trading. Got ${candles.length} candles, need at least 50. APIs may not have enough historical data. Try again later as more data accumulates.`);
      }
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
    
    // Initialize drawdown tracking with initial capital
    const initialCapital = config.bullishStrategy.initialCapital;
    resetDrawdownTracking(sessionId, initialCapital);
    
    const initialSignal = generateEnhancedAdaptiveSignal(candles, config, currentIndex, sessionId);

    // Populate portfolioHistory with historical price data from candles
    // This gives the chart historical context even before the session has many updates
    
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
      const currentTime = Date.now();
      const recentCutoff = currentTime - (48 * 60 * 60 * 1000); // Last 48 hours
      
      // Try to fetch 5-minute candles first (most granular), fall back to hourly if not available
      let intradayCandles: PriceCandle[] = [];
      const recentStartDate = new Date(recentCutoff).toISOString().split('T')[0];
      const recentEndDate = new Date(currentTime).toISOString().split('T')[0];
      
      try {
        // Try 5-minute candles first
        intradayCandles = await fetchPriceCandles(symbol, '5m', recentStartDate, recentEndDate, initialPrice, false, false); // NEVER synthetic data in paper trading
        console.log(`✅ Loaded ${intradayCandles.length} 5-minute candles from Redis for recent period`);
      } catch {
        // Fall back to hourly candles if 5-minute not available
        try {
          intradayCandles = await fetchPriceCandles(symbol, '1h', recentStartDate, recentEndDate, initialPrice, false, false); // NEVER synthetic data in paper trading
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
    const currentTime = Date.now();
    if (!todayCandle || todayCandle.timestamp < currentTime - 5 * 60 * 1000) {
      // Only add if today's candle is missing or more than 5 minutes old
      portfolioHistory.push({
        timestamp: currentTime,
        usdcBalance: initialCapital,
        ethBalance: 0,
        totalValue: initialCapital,
        ethPrice: initialPrice,
      });
    } else if (todayCandle.close !== initialPrice) {
      // Today's candle exists but price has changed - add update snapshot
      portfolioHistory.push({
        timestamp: currentTime,
        usdcBalance: initialCapital,
        ethBalance: 0,
        totalValue: initialCapital,
        ethPrice: initialPrice,
      });
    }
    
    // Final sort to ensure chronological order
    portfolioHistory.sort((a, b) => a.timestamp - b.timestamp);

    // Create session
    const sessionStartTime = Date.now();
    const session: EnhancedPaperTradingSession = {
      id: sessionId,
      name,
      asset,
      config,
      startedAt: sessionStartTime,
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
      lastUpdate: sessionStartTime,
      expiresAt: sessionStartTime + SESSION_EXPIRATION_MS,
      dataQuality,
      regimeHistory: [{
        timestamp: sessionStartTime,
        regime: initialSignal.regime.regime,
        confidence: initialSignal.regime.confidence,
      }],
      strategySwitches: [],
    };

    // Save to Redis
    await redis.set(getActiveSessionKey(asset), JSON.stringify(session));

    // Send session start notification
    if (isNotificationsEnabled()) {
      sendSessionAlert('start', session.name, session.portfolio.totalValue, asset).catch(err => {
        console.warn('[Paper Trading] Failed to send session start notification:', err);
      });
    }

    return session;
  }

  /**
   * Update paper trading session (fetch price, calculate regime, execute trades)
   */
  static async updateSession(sessionId?: string, asset: TradingAsset = 'eth', fillAllGaps: boolean = false): Promise<EnhancedPaperTradingSession> {
    await ensureConnected();

    // Get session
    const session = sessionId 
      ? await this.getSession(sessionId)
      : await this.getActiveSession(asset);

    if (!session) {
      throw new Error('Paper trading session not found');
    }

    if (!session.isActive) {
      throw new Error('Paper trading session is not active');
    }

    // Get asset from session (it should have it, but fallback to parameter for backward compatibility)
    const sessionAsset = session.asset || asset;
    const assetConfig = getAssetConfig(sessionAsset);
    const symbol = assetConfig.symbol;

    // Fetch latest price (this updates today's candle in Redis asynchronously)
    // If price fetch fails (e.g., all APIs rate limited), use the last price from the session
    let currentPrice: number;
    try {
      currentPrice = await fetchLatestPrice(symbol);
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
    
    // CRITICAL: Ensure today's candle is updated in Redis before loading candles
    // updateTodayCandle is called asynchronously in fetchLatestPrice, but we need to wait for it
    // Retry loading candles if the latest candle is missing (up to 3 attempts)
    const timeframe = session.config.bullishStrategy.timeframe || assetConfig.defaultTimeframe;
    let candles: PriceCandle[] = [];
    let retryCount = 0;
    const maxRetries = 3;
    
    // Define date range outside loop for use in gap detection
    const endDate = new Date().toISOString().split('T')[0];
    // We'll determine the actual start date from file data (files start at 2025-01-01)
    // Don't request data older than what's in files - that would trigger unnecessary API calls
    let startDate = '2025-01-01'; // Default to when historical files start
    
    while (retryCount < maxRetries) {
      // Wait for updateTodayCandle to complete (increased delay for reliability)
      await new Promise(resolve => setTimeout(resolve, 500 + retryCount * 200));
      
      // Strategy: Load ALL file data first (directly from files, no date filtering), then only fetch recent/missing candles from API/Redis
      // The 50 candles should come from files + Redis, NOT from API
      // Step 1: Load ALL file data directly (not filtered by date range)
      let fileCandles: PriceCandle[] = [];
      // Map timeframe to interval format used in file paths (needed for Redis cache keys too)
      const fileInterval = timeframe === '8h' ? '8h' : timeframe === '12h' ? '12h' : timeframe === '1d' ? '1d' : '8h';
      
      try {
        const { loadCandlesFromFile, getHistoricalDataPath, fixOHLCRelationships } = await import('./historical-file-utils');
        const historicalFilePath = getHistoricalDataPath(symbol, fileInterval);
        const historicalData = await loadCandlesFromFile(historicalFilePath);
        
        if (historicalData && historicalData.length > 0) {
          // Fix OHLC relationships and get ALL file data (not filtered by date range)
          fileCandles = fixOHLCRelationships(historicalData);
          console.log(`[Paper Trading] Loaded ${fileCandles.length} candles from files (all available data, no date filtering)`);
          
          // Determine actual date range from file data (files start at 2025-01-01, not 2020)
          if (fileCandles.length > 0) {
            const firstCandleDate = new Date(fileCandles[0]!.timestamp);
            const fileStartDate = firstCandleDate.toISOString().split('T')[0];
            // Use the earliest date from files, not a hardcoded 2020 date
            startDate = fileStartDate;
            console.log(`[Paper Trading] Historical files start at ${startDate}, using that as start date`);
          }
        }
      } catch (fileError) {
        console.warn(`[Paper Trading] Failed to load from files: ${fileError instanceof Error ? fileError.message : fileError}`);
      }
      
      // Step 2: Load recent candles from Redis (last 30 days) - this is cached data, not API
      // Redis contains recent candles that were fetched from API and cached
      let redisCandles: PriceCandle[] = [];
      try {
        const { redis, ensureConnected } = await import('./kv');
        const { getPriceCachePrefix, getAssetFromSymbol } = await import('./asset-config');
        await ensureConnected();
        
        // Get the correct cache prefix for this asset
        const asset = getAssetFromSymbol(symbol) || 'eth';
        const prefix = getPriceCachePrefix(asset);
        
        // Try to load from Redis cache for recent period (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentStartDate = thirtyDaysAgo.toISOString().split('T')[0];
        const recentStartTime = new Date(recentStartDate).getTime();
        const recentEndTime = new Date(endDate + 'T23:59:59.999Z').getTime();
        
        // Try multiple cache keys (Redis caches by date range)
        const cacheKeys = [
          `${prefix}${symbol}:${fileInterval}:${recentStartTime}:${recentEndTime}`,
          `${prefix}${symbol}:${fileInterval}:${recentStartDate}:${endDate}`,
        ];
        
        for (const cacheKey of cacheKeys) {
          try {
            const cached = await redis.get(cacheKey);
            if (cached) {
              const parsed = JSON.parse(cached) as PriceCandle[];
              if (parsed && parsed.length > 0) {
                redisCandles = parsed;
                console.log(`[Paper Trading] Loaded ${redisCandles.length} candles from Redis cache`);
                break;
              }
            }
          } catch {
            // Try next cache key
          }
        }
      } catch (redisError) {
        console.warn(`[Paper Trading] Failed to load from Redis: ${redisError instanceof Error ? redisError.message : redisError}`);
      }
      
      // Step 3: Merge file data + Redis data (this should give us the 50+ candles we need)
      const allCandlesMap = new Map<number, PriceCandle>();
      
      // Add all file candles first (historical data)
      fileCandles.forEach(c => {
        allCandlesMap.set(c.timestamp, c);
      });
      
      // Add Redis candles (overwrites file data for same timestamps - Redis has fresher data)
      redisCandles.forEach(c => {
        allCandlesMap.set(c.timestamp, c);
      });
      
      candles = Array.from(allCandlesMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      console.log(`[Paper Trading] Merged ${fileCandles.length} file candles + ${redisCandles.length} Redis candles = ${candles.length} total candles`);
      
      // Step 4: Only fetch from API if we still don't have enough data AND we need recent candles
      // This should rarely happen - files + Redis should have enough historical data
      if (candles.length < 50) {
        console.warn(`[Paper Trading] Only ${candles.length} candles from files+Redis, need 50. Will try to fetch recent candles from API as last resort.`);
        
        // Only fetch recent candles (last 7 days) from API - this is the minimum needed
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentStartDate = sevenDaysAgo.toISOString().split('T')[0];
        
        try {
          // Fetch only recent candles from API (this will also check Redis cache first)
          const apiCandles = await fetchPriceCandles(symbol, timeframe, recentStartDate, endDate, currentPrice, false, false);
          
          // Merge API candles into our existing candles
          apiCandles.forEach(c => {
            allCandlesMap.set(c.timestamp, c);
          });
          
          candles = Array.from(allCandlesMap.values()).sort((a, b) => a.timestamp - b.timestamp);
          console.log(`[Paper Trading] After API fetch: ${candles.length} total candles (added ${apiCandles.length} from API)`);
        } catch (apiError) {
          // API fetch failed - use what we have from files + Redis
          console.warn(`[Paper Trading] Failed to fetch recent candles from API: ${apiError instanceof Error ? apiError.message : apiError}. Using ${candles.length} candles from files+Redis only.`);
        }
      } else {
        // We have enough candles from files + Redis - no API call needed!
        console.log(`[Paper Trading] Sufficient candles (${candles.length}) from files+Redis, no API fetch needed`);
      }

      // NOTE: Synthetic data is prevented by allowSyntheticData=false in fetchPriceCandles
      // Synthetic data is identified by LOCATION (synthetic/ directory), NOT by date
      // Real data can be from any date, including 2026 and beyond

      // Require minimum candles for regime detection (SMA 50 needs 50 candles)
      // However, if we have very few candles (e.g., < 10), the real issue is data loading failure
      if (candles.length < 50) {
        // Calculate expected candles for the actual date range (from file data, not hardcoded 2020)
        // startDate is now set from file data (2025-01-01) or default
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        const intervalMs = timeframe === '8h' ? 8 * 60 * 60 * 1000 :
                           timeframe === '12h' ? 12 * 60 * 60 * 1000 :
                           timeframe === '1d' ? 24 * 60 * 60 * 1000 :
                           24 * 60 * 60 * 1000;
        const expectedCandles = Math.floor((endTime - startTime) / intervalMs);
        
        let errorMsg: string;
        if (candles.length < 10) {
          // Very few candles - this is a data loading failure, not just insufficient data
          errorMsg = `Data loading failure: Only ${candles.length} candles loaded for ${expectedCandles.toLocaleString()} expected candles (${startDate} to ${endDate}). Historical data files may be empty or API fetch failed.`;
        } else {
          // Some data but not enough for regime detection
          errorMsg = `Insufficient historical data: Got ${candles.length} candles, need at least 50 for regime detection (SMA 50 indicator). Expected ~${expectedCandles.toLocaleString()} candles for date range ${startDate} to ${endDate}.`;
        }
        
        console.error(`[Paper Trading] ${errorMsg}`);
        
        // Send Discord alert for critical data quality issue
        if (isNotificationsEnabled()) {
          await trackSystemError(
            new Error(errorMsg),
            `[${sessionAsset.toUpperCase()}] Session update failed: insufficient data. Symbol: ${symbol}, Timeframe: ${timeframe}, Date range: ${startDate} to ${endDate}, Got: ${candles.length} candles, Expected: ~${expectedCandles.toLocaleString()}`
          ).catch(err => {
            console.warn('[Paper Trading] Failed to send Discord alert:', err);
          });
        }
        
        throw new Error(errorMsg);
      }

      // Check if the latest candle is recent enough (within expected timeframe)
      const lastCandle = candles[candles.length - 1]!;
      const now = Date.now();
      const expectedInterval = timeframe === '8h' ? 8 * 60 * 60 * 1000 :
                               timeframe === '12h' ? 12 * 60 * 60 * 1000 :
                               timeframe === '1d' ? 24 * 60 * 60 * 1000 :
                               8 * 60 * 60 * 1000; // Default to 8h
      const candleAge = now - lastCandle.timestamp;
      
      // If the latest candle is too old (more than 1.5x the expected interval), retry
      if (candleAge > expectedInterval * 1.5 && retryCount < maxRetries - 1) {
        retryCount++;
        console.warn(`[Paper Trading] Latest candle is ${(candleAge / (60 * 60 * 1000)).toFixed(1)}h old (expected ${(expectedInterval / (60 * 60 * 1000)).toFixed(1)}h). Retrying (${retryCount}/${maxRetries})...`);
        continue;
      }
      
      // Candle is fresh enough, break out of retry loop
      break;
    }

    // CRITICAL: Detect and fill gaps automatically to prevent missing candles
    // This ensures data quality without manual intervention
    const { detectGaps } = await import('./data-quality-validator');
    
    // Use actual data range for gap detection (from first to last REAL candle, not future dates)
    // Check for gaps in the data
    // NOTE: Synthetic data is prevented by allowSyntheticData=false in fetchPriceCandles
    // Synthetic data is identified by LOCATION (synthetic/ directory), NOT by date
    const now = Date.now();
    const gapStartTime = candles.length > 0 ? candles[0]!.timestamp : new Date(startDate).getTime();
    const gapEndTime = Math.min(now, new Date(endDate + 'T23:59:59.999Z').getTime());
    
    // Detect gaps in the data (all candles are real data since allowSyntheticData=false)
    const gapInfo = detectGaps(candles, timeframe, gapStartTime, gapEndTime);
    
    if (gapInfo.missingCandles.length > 0) {
      // Try to fill gaps from API
      // For manual updates (fillAllGaps=true), fill ALL gaps in the past (no age limit)
      // For automatic updates (fillAllGaps=false), only fill recent gaps (last 7 days)
      const now = Date.now();
      
      const gapsToFill = fillAllGaps
        ? gapInfo.missingCandles.filter(m => m.expected < now) // Fill all gaps in the past (no age limit for manual updates)
        : gapInfo.missingCandles.filter(m => {
            const gapAge = now - m.expected;
            const maxGapAge = 7 * 24 * 60 * 60 * 1000; // 7 days for automatic updates
            return gapAge > 0 && gapAge < maxGapAge;
          });
      
      const oldGaps = gapInfo.missingCandles.length - gapsToFill.length;
      const gapType = fillAllGaps ? 'all eligible' : 'recent';
      console.warn(`[Paper Trading] Detected ${gapInfo.missingCandles.length} missing candles (${gapsToFill.length} ${gapType}, ${oldGaps} too old). Attempting to fill ${gapType} gaps...`);
      
      if (gapsToFill.length > 0) {
        try {
          // Use targeted gap filler to fetch only the specific missing candles
          // This is more efficient than fillGapsInCandles which tries to fill all gaps
          const { fetchMissingCandles } = await import('./targeted-gap-filler');
          const missingTimestamps = gapsToFill.map(g => g.expected);
          
          console.log(`[Paper Trading] Attempting to fetch ${gapsToFill.length} missing candles from API...`);
          const filledCandles = await fetchMissingCandles(symbol, timeframe, missingTimestamps);
          
          if (filledCandles.length > 0) {
            // Merge filled candles with existing candles
            const allCandles = [...candles, ...filledCandles];
            const merged = allCandles
              .filter((c, i, arr) => arr.findIndex(cc => cc.timestamp === c.timestamp) === i)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            // NOTE: Synthetic data is prevented by allowSyntheticData=false in fetchPriceCandles
            candles = merged;
            
            console.log(`[Paper Trading] Filled ${filledCandles.length} of ${gapsToFill.length} missing candles from API`);
          } else {
            // Gap filling didn't add any candles - send alert
            console.warn(`[Paper Trading] Gap filling attempt did not add any candles. ${gapsToFill.length} gaps remain.`);
            if (isNotificationsEnabled()) {
              await trackDataQualityIssue(
                `Gap filling failed to add candles: ${gapsToFill.length} gaps remain`,
                `[${sessionAsset.toUpperCase()}] Symbol: ${symbol}, Timeframe: ${timeframe}, Gaps: ${gapsToFill.length}`
              ).catch(err => {
                console.warn('[Paper Trading] Failed to send Discord alert:', err);
              });
            }
          }
        } catch (fillError) {
          const errorMessage = fillError instanceof Error ? fillError.message : String(fillError);
          console.warn(`[Paper Trading] Failed to fill gaps from API: ${errorMessage}`);
          
          // Send Discord alert for gap filling failure
          if (isNotificationsEnabled()) {
            await trackDataQualityIssue(
              `Gap filling failed: ${errorMessage}`,
              `[${sessionAsset.toUpperCase()}] Symbol: ${symbol}, Timeframe: ${timeframe}, Gaps: ${gapsToFill.length}`
            ).catch(err => {
              console.warn('[Paper Trading] Failed to send Discord alert:', err);
            });
          }
          
          // Continue with existing candles - better than failing completely
        }
      } else {
        // No gaps to fill - log why
        if (oldGaps > 0) {
          if (fillAllGaps) {
            // For manual updates, all past gaps should be filled - if we have oldGaps, they must be in the future
            const futureGaps = gapInfo.missingCandles.filter(m => m.expected >= now);
            if (futureGaps.length > 0) {
              console.log(`[Paper Trading] ${futureGaps.length} gaps are in the future and cannot be filled.`);
            }
          } else {
            console.log(`[Paper Trading] ${oldGaps} gaps are older than 7 days and will not be filled automatically. Click "Update Now" to fill all gaps, or use populate script for very old historical gaps.`);
          }
        }
      }
      
      // If gaps still exist after API fill attempt, try to fetch missing end candles explicitly
      const remainingGaps = detectGaps(candles, timeframe, gapStartTime, gapEndTime);
      if (remainingGaps.missingCandles.length > 0) {
        // Try to fetch missing end candles explicitly
        const now = Date.now();
        const endGaps = remainingGaps.missingCandles.filter(m => {
          const gapAge = now - m.expected;
          return gapAge > 0 && gapAge < 7 * 24 * 60 * 60 * 1000; // Last 7 days
        });
        
        if (endGaps.length > 0) {
          const missingStart = Math.min(...endGaps.map(g => g.expected));
          const missingStartDate = new Date(missingStart).toISOString().split('T')[0];
          // Extend endDate to today to ensure fetchPriceCandles doesn't treat it as historical
          // This forces API fetch for recent missing candles
          const todayDate = new Date().toISOString().split('T')[0];
          const missingEndDate = todayDate; // Use today to ensure API fetch
          
          try {
            const endCandles = await fetchPriceCandles(
              symbol,
              timeframe,
              missingStartDate,
              missingEndDate,
              currentPrice,
              false, // Don't skip API fetch
              false  // No synthetic data
            );
            
            if (endCandles.length > 0) {
              // Merge with existing candles
              const allCandles = [...candles, ...endCandles];
              candles = allCandles
                .filter((c, i, arr) => arr.findIndex(cc => cc.timestamp === c.timestamp) === i)
                .sort((a, b) => a.timestamp - b.timestamp);
              
              // NOTE: Synthetic data is prevented by allowSyntheticData=false in fetchPriceCandles
              
              console.log(`[Paper Trading] Filled ${endCandles.length} missing end candles from API`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Paper Trading] Failed to fetch missing end candles:`, errorMessage);
            
            // Send Discord alert for gap filling failure
            if (isNotificationsEnabled()) {
              await trackDataQualityIssue(
                `Failed to fetch missing end candles: ${errorMessage}`,
                `[${sessionAsset.toUpperCase()}] Symbol: ${symbol}, Timeframe: ${timeframe}, Missing end gaps: ${endGaps.length}`
              ).catch(err => {
                console.warn('[Paper Trading] Failed to send Discord alert:', err);
              });
            }
          }
        }
        
        // Re-check gaps after fetch
        // Final gap check
        const finalGaps = detectGaps(candles, timeframe, gapStartTime, gapEndTime);
        if (finalGaps.missingCandles.length > 0) {
          console.warn(`[Paper Trading] ${finalGaps.missingCandles.length} gaps remain after fill attempt. This may affect regime detection accuracy.`);
        }
      }
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
    const maxAgeMinutes = timeframe === '8h' ? 480 : timeframe === '12h' ? 720 : 1440;
    const dataQuality = validateDataQuality(candles, timeframe, gapStartTime, gapEndTime, currentIndex, maxAgeMinutes);
    
    // Log data quality for debugging and send Discord alerts
    if (dataQuality.issues && dataQuality.issues.length > 0) {
      console.log(`[Paper Trading] Data quality issues:`, dataQuality.issues);
      
      // Send Discord alerts for data quality issues
      if (isNotificationsEnabled()) {
        for (const issue of dataQuality.issues) {
          await trackDataQualityIssue(
            issue,
            `[${sessionAsset.toUpperCase()}] Symbol: ${symbol}, Timeframe: ${timeframe}, Coverage: ${dataQuality.coverage.toFixed(1)}%, Gaps: ${dataQuality.gapCount}`
          ).catch(err => {
            console.warn('[Paper Trading] Failed to send Discord alert:', err);
          });
        }
      }
    }
    
    if (!dataQuality.isValid) {
      console.warn('Data quality issues detected:', dataQuality.issues);
      // Log warnings but don't block execution
      if (dataQuality.warnings.length > 0) {
        console.warn('Data quality warnings:', dataQuality.warnings);
        
        // Send Discord alerts for critical warnings (stale data, low coverage)
        if (isNotificationsEnabled()) {
          for (const warning of dataQuality.warnings) {
            // Only alert on high-severity warnings (stale data, low coverage)
            if (warning.includes('stale') || warning.includes('coverage')) {
              await trackDataQualityIssue(
                warning,
                `[${sessionAsset.toUpperCase()}] Symbol: ${symbol}, Timeframe: ${timeframe}, Last candle age: ${(dataQuality.lastCandleAge / (60 * 60 * 1000)).toFixed(1)}h`
              ).catch(err => {
                console.warn('[Paper Trading] Failed to send Discord alert:', err);
              });
            }
          }
        }
      }
    }
    
    // Calculate correlation context if trading BTC (use ETH correlation) or ETH (use BTC correlation)
    let correlationContext: { signal: number; riskLevel: 'low' | 'medium' | 'high'; context: string } | undefined;
    
    if (session.asset === 'btc' || session.asset === 'eth') {
      try {
        // Fetch aligned candles for correlation analysis
        const aligned = await fetchAlignedCandles(candles, timeframe);
        const ethCandles = aligned.eth;
        const btcCandles = aligned.btc;
        
        if (ethCandles.length >= 30 && btcCandles.length >= 30 && ethCandles.length === btcCandles.length) {
          // Use recent candles for correlation (last 30 periods)
          const recentEth = ethCandles.slice(-30);
          const recentBtc = btcCandles.slice(-30);
          
          const correlationAnalysis = await analyzeCorrelation(recentEth, recentBtc, 30, true);
          const context = getCorrelationContext(correlationAnalysis);
          
          // For BTC, reverse the signal perspective
          if (session.asset === 'btc') {
            correlationContext = {
              signal: -context.signal,
              riskLevel: context.riskLevel,
              context: context.context,
            };
          } else {
            correlationContext = context;
          }
        }
      } catch (error) {
        // Correlation calculation is optional - don't fail if it can't be calculated
        console.warn(`⚠️  Could not calculate correlation for ${session.asset}:`, error instanceof Error ? error.message : error);
      }
    }
    
    const signal = generateEnhancedAdaptiveSignal(candles, session.config, currentIndex, session.id, correlationContext);
    const confidence = calculateConfidence(signal, candles, currentIndex);

    // Execute trades based on signal
    const updatedSession = { ...session };
    // Ensure asset field is preserved (for backward compatibility with old sessions)
    if (!updatedSession.asset) {
      updatedSession.asset = sessionAsset;
    }
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
      sessionId: session.id, // Pass session ID for drawdown tracking
      isEmergencyStopped: session.isEmergencyStopped ?? false, // Pass emergency stop status
      signalPrice: currentPrice, // Store price at signal generation for validation
      useKellyCriterion: useKelly,
      useStopLoss,
      kellyFractionalMultiplier,
      stopLossConfig: effectiveStopLossConfig,
      generateAudit: false, // Paper trading doesn't need audit data
      recordTradeResult: (isWin: boolean) => recordTradeResult(session.id, isWin),
    };

    // Execute trade (result is stored in trades array and portfolio is updated)
    const executedTrade = executeTrade(
      signal,
      confidence,
      currentPrice,
      portfolio,
      executionOptions
    );
    
    // Send trade notification if a trade was executed
    if (executedTrade && isNotificationsEnabled()) {
      const notification = createTradeNotification(
        executedTrade,
        signal.regime?.regime || 'neutral',
        portfolio.totalValue,
        symbol
      );
      sendTradeAlert(notification).catch(err => {
        console.warn('[Paper Trading] Failed to send trade notification:', err);
      });
    }
    
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
    
    // Check alert thresholds
    await checkAllThresholds(updatedSession);
    
    // Update drawdown tracking and check circuit breaker
    const maxDrawdownThreshold = session.config.maxDrawdownThreshold ?? 0.20;
    const drawdownCheck = checkDrawdownCircuitBreaker(session.id, newTotalValue, maxDrawdownThreshold);
    const peakValue = getPeakPortfolioValue(session.id);
    
    // Store drawdown info in session for UI display
    updatedSession.drawdownInfo = {
      currentDrawdown: drawdownCheck.drawdown,
      peakValue,
      threshold: maxDrawdownThreshold,
      isPaused: drawdownCheck.shouldPause,
    };

    // Update last signal with Kelly multiplier (cast to include kellyMultiplier)
    updatedSession.lastSignal = { 
      ...signal, 
      kellyMultiplier: kellyMultiplier !== 1.0 ? kellyMultiplier : undefined 
    } as typeof updatedSession.lastSignal;

    // Add portfolio snapshot with current price
    const updateTime = Date.now();
    updatedSession.portfolioHistory.push({
      timestamp: updateTime,
      usdcBalance: portfolio.usdcBalance,
      ethBalance: portfolio.ethBalance,
      totalValue: newTotalValue,
      ethPrice: currentPrice,
    });
    
    // Deduplicate and manage history size (rolling window)
    updatedSession.portfolioHistory = deduplicatePortfolioHistory(updatedSession.portfolioHistory);
    updatedSession.portfolioHistory = managePortfolioHistory(updatedSession.portfolioHistory);
    
    // Also fetch and merge recent intraday candles (5m or 1h) from Redis for the last 48 hours
    // This ensures the chart shows granular price movements for recent periods
    try {
      const currentTimestamp = Date.now();
      const recentCutoff = currentTimestamp - (48 * 60 * 60 * 1000); // Last 48 hours
      const recentStartDate = new Date(recentCutoff).toISOString().split('T')[0];
      const recentEndDate = new Date(currentTimestamp).toISOString().split('T')[0];
      
      // Try to fetch 5-minute candles first (most granular), fall back to hourly if not available
      let intradayCandles: PriceCandle[] = [];
      try {
        intradayCandles = await fetchPriceCandles(symbol, '5m', recentStartDate, recentEndDate, currentPrice, false, false); // NEVER synthetic data in paper trading
      } catch {
        try {
          intradayCandles = await fetchPriceCandles(symbol, '1h', recentStartDate, recentEndDate, currentPrice, false, false); // NEVER synthetic data in paper trading
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
        
        // Sort by timestamp, deduplicate, and manage size
        filteredHistory.sort((a, b) => a.timestamp - b.timestamp);
        updatedSession.portfolioHistory = deduplicatePortfolioHistory(filteredHistory);
        updatedSession.portfolioHistory = managePortfolioHistory(updatedSession.portfolioHistory);
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
      
      // Send regime change notification (rate limited to avoid spam in choppy markets)
      // Only alert if confidence is reasonably high (>= 0.3) to avoid noise from low-confidence changes
      if (isNotificationsEnabled() && signal.regime.confidence >= 0.3) {
        sendRegimeChangeAlert({
          previousRegime: previousRegime.regime,
          newRegime: signal.regime.regime,
          confidence: signal.regime.confidence,
          timestamp: Date.now(),
          asset: asset, // Include asset identifier
        }).catch(err => {
          console.warn('[Paper Trading] Failed to send regime change notification:', err);
        });
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
    const updateTimestamp = Date.now();
    updatedSession.currentRegime = signal.regime;
    updatedSession.currentIndicators = signal.indicators;
    updatedSession.lastSignal = signal;
    updatedSession.lastPrice = currentPrice;
    updatedSession.lastUpdate = updateTimestamp;
    updatedSession.expiresAt = updateTimestamp + SESSION_EXPIRATION_MS; // Refresh expiration on update
    updatedSession.portfolio = portfolio;
    updatedSession.dataQuality = dataQuality;

    // Save to Redis (use asset from session)
    const sessionAssetForSave = updatedSession.asset || asset;
    await redis.set(getActiveSessionKey(sessionAssetForSave), JSON.stringify(updatedSession));

    return updatedSession;
  }

  /**
   * Get active paper trading session
   */
  static async getActiveSession(asset: TradingAsset = 'eth'): Promise<EnhancedPaperTradingSession | null> {
    await ensureConnected();
    const data = await redis.get(getActiveSessionKey(asset));
    if (!data) return null;
    
    const session = JSON.parse(data) as EnhancedPaperTradingSession;
    
    // Ensure asset field is set (for backward compatibility with old sessions)
    if (!session.asset) {
      session.asset = asset;
    }
    
    return session;
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
  static async stopSession(sessionId?: string, asset: TradingAsset = 'eth'): Promise<EnhancedPaperTradingSession> {
    await ensureConnected();

    const session = sessionId
      ? await this.getSession(sessionId)
      : await this.getActiveSession(asset);

    if (!session) {
      throw new Error('Paper trading session not found');
    }

    if (!session.isActive) {
      throw new Error('Paper trading session is not active');
    }

    // Get asset from session (it should have it, but fallback to parameter for backward compatibility)
    const sessionAsset = session.asset || asset;
    const assetConfig = getAssetConfig(sessionAsset);
    const symbol = assetConfig.symbol;

    // Get final price
    const finalPrice = await fetchLatestPrice(symbol);
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
    await redis.set(getActiveSessionKey(sessionAsset), JSON.stringify(session));

    // Send session stop notification
    if (isNotificationsEnabled()) {
      sendSessionAlert('stop', session.name, session.portfolio.totalValue, sessionAsset).catch(err => {
        console.warn('[Paper Trading] Failed to send session stop notification:', err);
      });
    }

    return session;
  }
  
  /**
   * Cleanup expired sessions (run periodically)
   * Only stops sessions that are truly inactive (haven't been updated in 90+ days)
   * Active autonomous sessions that are being updated regularly will continue running indefinitely
   */
  static async cleanupExpiredSessions(): Promise<{ cleaned: number; errors: string[] }> {
    await ensureConnected();
    
    const errors: string[] = [];
    let cleaned = 0;
    
    // Check all known assets
    const assets: TradingAsset[] = ['eth', 'btc'];
    
    for (const asset of assets) {
      try {
        const session = await this.getActiveSession(asset);
        if (session && this.isSessionExpired(session)) {
          const timeSinceUpdate = Date.now() - (session.lastUpdate || session.startedAt);
          const daysInactive = Math.floor(timeSinceUpdate / (24 * 60 * 60 * 1000));
          console.log(`Cleaning up expired session: ${session.id} (${asset}) - inactive for ${daysInactive} days`);
          try {
            await this.stopSession(session.id, asset);
            cleaned++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to stop expired session ${session.id}: ${errorMessage}`);
          }
        }
      } catch (error) {
        // Ignore errors for sessions that don't exist
        if (!(error instanceof Error && error.message.includes('not found'))) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Error checking session for ${asset}: ${errorMessage}`);
        }
      }
    }
    
    return { cleaned, errors };
  }
}

// Start cleanup job if running in server environment
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Run cleanup every hour
  setInterval(() => {
    PaperTradingService.cleanupExpiredSessions().catch(error => {
      console.error('[Paper Trading] Cleanup job failed:', error);
    });
  }, CLEANUP_INTERVAL_MS);
  
  // Run initial cleanup after 1 minute (to avoid startup race conditions)
  setTimeout(() => {
    PaperTradingService.cleanupExpiredSessions().catch(error => {
      console.error('[Paper Trading] Initial cleanup failed:', error);
    });
  }, 60 * 1000);
}

