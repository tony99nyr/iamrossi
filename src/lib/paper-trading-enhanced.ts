/**
 * Enhanced Paper Trading Service
 * Handles live paper trading with enhanced adaptive strategy
 */

import { v4 as uuidv4 } from 'uuid';
import type { Trade, PortfolioSnapshot, Portfolio, PriceCandle, TradingSignal } from '@/types';
import type { MarketRegimeSignal } from './market-regime-detector-cached';
import type { EnhancedAdaptiveStrategyConfig } from './adaptive-strategy-enhanced';
import { fetchLatestPrice, fetchPriceCandles } from './eth-price-service';
import { generateEnhancedAdaptiveSignal, clearRegimeHistory } from './adaptive-strategy-enhanced';
import { calculateConfidence } from './confidence-calculator';
import { redis, ensureConnected } from './kv';

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
  lastSignal: TradingSignal & { regime: MarketRegimeSignal; activeStrategy: any; momentumConfirmed: boolean; positionSizeMultiplier: number };
  lastPrice: number;
  lastUpdate: number;
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

    // Fetch recent candles for regime detection (need at least 200 for indicators)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const candles = await fetchPriceCandles('ETHUSDT', '1d', startDate, endDate);

    if (candles.length < 50) {
      throw new Error('Not enough historical data to start paper trading');
    }

    // Clear any previous regime history
    clearRegimeHistory();

    // Generate initial signal to get regime
    const currentIndex = candles.length - 1;
    const initialSignal = generateEnhancedAdaptiveSignal(candles, config, currentIndex);

    // Create session
    const session: EnhancedPaperTradingSession = {
      id: uuidv4(),
      name,
      config,
      startedAt: Date.now(),
      isActive: true,
      trades: [],
      portfolioHistory: [{
        timestamp: Date.now(),
        usdcBalance: config.bullishStrategy.initialCapital,
        ethBalance: 0,
        totalValue: config.bullishStrategy.initialCapital,
        ethPrice: initialPrice,
      }],
      portfolio: {
        usdcBalance: config.bullishStrategy.initialCapital,
        ethBalance: 0,
        totalValue: config.bullishStrategy.initialCapital,
        initialCapital: config.bullishStrategy.initialCapital,
        totalReturn: 0,
        tradeCount: 0,
        winCount: 0,
      },
      currentRegime: initialSignal.regime,
      currentIndicators: initialSignal.indicators,
      lastSignal: initialSignal,
      lastPrice: initialPrice,
      lastUpdate: Date.now(),
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

    // Fetch latest price
    const currentPrice = await fetchLatestPrice('ETHUSDT');

    // Fetch recent candles for regime detection
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const candles = await fetchPriceCandles('ETHUSDT', '1d', startDate, endDate);

    if (candles.length < 50) {
      throw new Error('Not enough historical data to update session');
    }

    // Generate signal with enhanced adaptive strategy
    const currentIndex = candles.length - 1;
    const signal = generateEnhancedAdaptiveSignal(candles, session.config, currentIndex);
    const confidence = calculateConfidence(signal, candles, currentIndex);

    // Execute trades based on signal
    const updatedSession = { ...session };
    const { portfolio } = updatedSession;

    // Calculate current portfolio value
    const currentValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;

    // Execute buy signal
    if (signal.action === 'buy' && portfolio.usdcBalance > 0 && signal.signal > 0) {
      const activeStrategy = signal.activeStrategy;
      const maxPositionPct = activeStrategy.maxPositionPct || 0.75;
      const positionSizeMultiplier = signal.positionSizeMultiplier || 1.0;
      const adjustedPositionPct = Math.min(maxPositionPct * positionSizeMultiplier, session.config.maxBullishPosition || 0.95);
      
      const positionSize = portfolio.usdcBalance * confidence * adjustedPositionPct;
      const ethAmount = positionSize / currentPrice;

      if (ethAmount > 0 && positionSize <= portfolio.usdcBalance) {
        portfolio.usdcBalance -= positionSize;
        portfolio.ethBalance += ethAmount;

        const trade: Trade = {
          id: uuidv4(),
          timestamp: Date.now(),
          type: 'buy',
          ethPrice: currentPrice,
          ethAmount,
          usdcAmount: positionSize,
          signal: signal.signal,
          confidence,
          portfolioValue: portfolio.usdcBalance + portfolio.ethBalance * currentPrice,
        };

        updatedSession.trades.push(trade);
        portfolio.tradeCount++;
      }
    }

    // Execute sell signal
    if (signal.action === 'sell' && portfolio.ethBalance > 0 && signal.signal < 0) {
      const activeStrategy = signal.activeStrategy;
      const maxPositionPct = activeStrategy.maxPositionPct || 0.5;
      const positionSize = portfolio.ethBalance * confidence * maxPositionPct;
      const usdcAmount = positionSize * currentPrice;

      if (positionSize > 0 && positionSize <= portfolio.ethBalance) {
        portfolio.ethBalance -= positionSize;
        portfolio.usdcBalance += usdcAmount;

        const trade: Trade = {
          id: uuidv4(),
          timestamp: Date.now(),
          type: 'sell',
          ethPrice: currentPrice,
          ethAmount: positionSize,
          usdcAmount,
          signal: signal.signal,
          confidence,
          portfolioValue: portfolio.usdcBalance + portfolio.ethBalance * currentPrice,
        };

        updatedSession.trades.push(trade);
        portfolio.tradeCount++;

        // Check if this was a winning trade
        if (trade.portfolioValue > portfolio.initialCapital) {
          portfolio.winCount++;
        }
      }
    }

    // Update portfolio values
    const newTotalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
    portfolio.totalValue = newTotalValue;
    portfolio.totalReturn = ((newTotalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;

    // Add portfolio snapshot
    updatedSession.portfolioHistory.push({
      timestamp: Date.now(),
      usdcBalance: portfolio.usdcBalance,
      ethBalance: portfolio.ethBalance,
      totalValue: newTotalValue,
      ethPrice: currentPrice,
    });

    // Update session state
    updatedSession.currentRegime = signal.regime;
    updatedSession.currentIndicators = signal.indicators;
    updatedSession.lastSignal = signal;
    updatedSession.lastPrice = currentPrice;
    updatedSession.lastUpdate = Date.now();
    updatedSession.portfolio = portfolio;

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

    // Save to Redis
    await redis.set(ACTIVE_SESSION_KEY, JSON.stringify(session));

    return session;
  }
}

