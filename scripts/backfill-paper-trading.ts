#!/usr/bin/env tsx
/**
 * Paper Trading Backfill Verification Test
 * 
 * This script simulates paper trading from the exact start time of the active
 * paper trading session using the same functions and logic. It generates a
 * detailed markdown report for verification.
 * 
 * Usage:
 *   pnpm eth:backfill-paper
 */

import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PaperTradingService } from '../src/lib/paper-trading-enhanced';
import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { generateEnhancedAdaptiveSignal, clearRegimeHistory } from '../src/lib/adaptive-strategy-enhanced';
import { calculateConfidence } from '../src/lib/confidence-calculator';
import { calculateMACD, calculateRSI, getLatestIndicatorValue } from '../src/lib/indicators';
import type { PriceCandle, Trade, PortfolioSnapshot, Portfolio } from '../src/types';
import type { EnhancedAdaptiveStrategyConfig } from '../src/lib/adaptive-strategy-enhanced';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local doesn't exist - that's OK, use environment variables
}

const BACKFILL_REPORTS_DIR = path.join(process.cwd(), 'data', 'backfill-reports');

interface PeriodAnalysis {
  date: string;
  timestamp: number;
  price: number;
  regime: {
    type: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  momentum: {
    confirmed: boolean;
    strength: number;
    threshold: number;
  };
  persistence: {
    met: boolean;
    targetRegime: 'bullish' | 'bearish' | 'neutral';
    requiredPeriods: number;
    actualCount: number;
    recentRegimes: Array<'bullish' | 'bearish' | 'neutral'>;
  };
  activeStrategy: string;
  signal: {
    action: 'buy' | 'sell' | 'hold';
    strength: number;
  };
  trade: Trade | null;
  portfolio: {
    usdcBalance: number;
    ethBalance: number;
    totalValue: number;
  };
}

/**
 * Calculate momentum strength (same logic as hasStrongMomentum but returns strength)
 */
function calculateMomentumStrength(
  candles: PriceCandle[],
  currentIndex: number
): number {
  if (currentIndex < 50) return 0;

  const prices = candles.map(c => c.close);
  
  const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);
  const macdValue = getLatestIndicatorValue(macd, currentIndex, 34);
  const signalValue = getLatestIndicatorValue(signal, currentIndex, 34);
  const histogramValue = getLatestIndicatorValue(histogram, currentIndex, 34);
  
  let momentumScore = 0;
  let momentumSignals = 0;
  
  if (macdValue !== null && signalValue !== null) {
    if (macdValue > signalValue) {
      momentumScore += 1;
    } else {
      momentumScore -= 1;
    }
    momentumSignals++;
  }
  
  if (histogramValue !== null && histogramValue > 0) {
    momentumScore += 1;
    momentumSignals++;
  }
  
  const rsi = calculateRSI(prices, 14);
  const rsiValue = getLatestIndicatorValue(rsi, currentIndex, 14);
  if (rsiValue !== null && rsiValue > 50) {
    momentumScore += 1;
    momentumSignals++;
  }
  
  if (currentIndex >= 20) {
    const price20PeriodsAgo = prices[currentIndex - 20];
    const priceMomentum = (prices[currentIndex] - price20PeriodsAgo) / price20PeriodsAgo;
    if (priceMomentum > 0) {
      momentumScore += 1;
      momentumSignals++;
    }
  }
  
  return momentumSignals > 0 ? momentumScore / momentumSignals : 0;
}

/**
 * Get regime persistence details (tracks history manually to get details)
 */
function getRegimePersistenceDetails(
  currentRegime: 'bullish' | 'bearish' | 'neutral',
  requiredPeriods: number,
  targetRegime: 'bullish' | 'bearish' | 'neutral',
  regimeHistory: Array<'bullish' | 'bearish' | 'neutral'>
): {
  met: boolean;
  actualCount: number;
  recentRegimes: Array<'bullish' | 'bearish' | 'neutral'>;
} {
  // Append current regime to history (rolling window)
  regimeHistory.push(currentRegime);
  if (regimeHistory.length > 10) {
    regimeHistory.shift(); // Keep only last 10 periods
  }
  
  // Need at least 5 periods in history for majority rule
  if (regimeHistory.length < 5) {
    return {
      met: false,
      actualCount: 0,
      recentRegimes: [...regimeHistory],
    };
  }
  
  // Use majority rule: require N out of last 5 periods
  const recentRegimes = regimeHistory.slice(-5);
  const targetCount = recentRegimes.filter(r => r === targetRegime).length;
  
  return {
    met: targetCount >= requiredPeriods,
    actualCount: targetCount,
    recentRegimes: [...recentRegimes],
  };
}

/**
 * Execute trade (same logic as PaperTradingService.updateSession)
 */
function executeTrade(
  signal: ReturnType<typeof generateEnhancedAdaptiveSignal>,
  confidence: number,
  currentPrice: number,
  portfolio: Portfolio,
  trades: Trade[]
): Trade | null {
  // Execute buy signal
  if (signal.action === 'buy' && portfolio.usdcBalance > 0 && signal.signal > 0) {
    const activeStrategy = signal.activeStrategy;
    const maxPositionPct = activeStrategy.maxPositionPct || 0.75;
    const positionSizeMultiplier = signal.positionSizeMultiplier || 1.0;
    const adjustedPositionPct = Math.min(maxPositionPct * positionSizeMultiplier, 0.95);
    
    const positionSize = portfolio.usdcBalance * confidence * adjustedPositionPct;
    const ethAmount = positionSize / currentPrice;

    if (ethAmount > 0 && positionSize <= portfolio.usdcBalance) {
      const costBasis = positionSize;
      
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
        costBasis,
      };

      trades.push(trade);
      portfolio.tradeCount++;
      return trade;
    }
  }

  // Execute sell signal
  if (signal.action === 'sell' && portfolio.ethBalance > 0 && signal.signal < 0) {
    const activeStrategy = signal.activeStrategy;
    const maxPositionPct = activeStrategy.maxPositionPct || 0.5;
    const positionSize = portfolio.ethBalance * confidence * maxPositionPct;
    const usdcAmount = positionSize * currentPrice;

    if (positionSize > 0 && positionSize <= portfolio.ethBalance) {
      // Calculate P&L: find matching buy trades using FIFO
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
        const buyTrades = trades.filter(t => t.type === 'buy' && !t.fullySold);
        const totalCost = buyTrades.reduce((sum, t) => sum + (t.costBasis || t.usdcAmount), 0);
        const totalAmount = buyTrades.reduce((sum, t) => sum + t.ethAmount, 0);
        const avgCost = totalAmount > 0 ? totalCost / totalAmount : 0;
        totalCostBasis = positionSize * avgCost;
      }
      
      const pnl = usdcAmount - totalCostBasis;
      const isWin = pnl > 0;
      
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
        costBasis: totalCostBasis,
        pnl,
      };

      trades.push(trade);
      portfolio.tradeCount++;

      // Update win count based on actual trade P&L
      if (isWin) {
        portfolio.winCount++;
      }
      
      return trade;
    }
  }

  return null;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(
  session: Awaited<ReturnType<typeof PaperTradingService.getActiveSession>> | null,
  config: EnhancedAdaptiveStrategyConfig,
  periods: PeriodAnalysis[],
  portfolio: Portfolio,
  startTime: number,
  processingTime: number,
  startDateStr: string,
  endDateStr: string
): string {
  const now = new Date();
  const sessionStart = session ? new Date(session.startedAt) : new Date(startDateStr);
  const startDate = periods.length > 0 ? new Date(periods[0]!.timestamp) : new Date(startDateStr);
  const endDate = periods.length > 0 ? new Date(periods[periods.length - 1]!.timestamp) : new Date(endDateStr);
  
  // Calculate statistics
  const regimeCounts = {
    bullish: 0,
    bearish: 0,
    neutral: 0,
  };
  
  let momentumConfirmedCount = 0;
  let persistenceFailures = {
    bullish: 0,
    bearish: 0,
  };
  
  const strategyUsage = {
    bullish: 0,
    bearish: 0,
    neutral: 0,
  };
  
  periods.forEach(period => {
    regimeCounts[period.regime.type]++;
    if (period.momentum.confirmed) {
      momentumConfirmedCount++;
    }
    if (period.regime.type === 'bullish' && !period.persistence.met) {
      persistenceFailures.bullish++;
    }
    if (period.regime.type === 'bearish' && !period.persistence.met) {
      persistenceFailures.bearish++;
    }
    
    const strategyName = period.activeStrategy.toLowerCase();
    if (strategyName.includes('bullish')) {
      strategyUsage.bullish++;
    } else if (strategyName.includes('bearish')) {
      strategyUsage.bearish++;
    } else {
      strategyUsage.neutral++;
    }
  });
  
  const totalPeriods = periods.length;
  const trades = periods.filter(p => p.trade !== null).map(p => p.trade!);
  
  // Build markdown
  let md = `# Paper Trading Backfill Test Report\n\n`;
  md += `**Generated**: ${now.toISOString().replace('T', ' ').substring(0, 19)}\n`;
  md += `**Test Duration**: ${processingTime.toFixed(1)} seconds\n`;
  md += `**Session Start**: ${sessionStart.toISOString().replace('T', ' ').substring(0, 19)}\n\n`;
  
  md += `## Test Configuration\n`;
  md += `- Start Date: ${startDate.toISOString().split('T')[0]} (from paper trading session)\n`;
  md += `- End Date: ${endDate.toISOString().split('T')[0]}\n`;
  md += `- Session ID: ${session!.id}\n`;
  md += `- Initial Capital: $${portfolio.initialCapital.toFixed(2)}\n`;
  md += `- Periods Analyzed: ${totalPeriods} (session periods)\n`;
  md += `- Historical Context: Processed historical periods before session start to build regime history\n\n`;
  
  md += `## Per-Period Analysis\n\n`;
  
  periods.forEach(period => {
    const date = new Date(period.timestamp);
    md += `### [${date.toISOString().split('T')[0]}] Price: $${period.price.toFixed(2)}\n`;
    md += `- **Regime**: ${period.regime.type} (confidence: ${(period.regime.confidence * 100).toFixed(1)}%)\n`;
    md += `- **Momentum**: ${period.momentum.confirmed ? '✓ confirmed' : '✗ not confirmed'} (strength: ${period.momentum.strength.toFixed(2)}, threshold: ${period.momentum.threshold.toFixed(2)})\n`;
    md += `- **Persistence**: ${period.persistence.met ? '✓ met' : '✗ not met'} (${period.persistence.actualCount}/${period.persistence.requiredPeriods} periods ${period.persistence.targetRegime}, recent: [${period.persistence.recentRegimes.join(', ')}])\n`;
    md += `- **Active Strategy**: ${period.activeStrategy}\n`;
    md += `- **Signal**: ${period.signal.action} ${period.signal.strength > 0 ? '+' : ''}${period.signal.strength.toFixed(2)}\n`;
    if (period.trade) {
      md += `- **Trade**: ${period.trade.type.toUpperCase()} ${period.trade.ethAmount.toFixed(4)} ETH @ $${period.trade.ethPrice.toFixed(2)} (${period.trade.type === 'sell' && period.trade.pnl ? `P&L: $${period.trade.pnl.toFixed(2)}` : ''})\n`;
    } else {
      md += `- **Trade**: None\n`;
    }
    md += `- **Portfolio**: $${period.portfolio.totalValue.toFixed(2)} (${period.portfolio.ethBalance.toFixed(4)} ETH, $${period.portfolio.usdcBalance.toFixed(2)} USDC)\n\n`;
  });
  
  md += `## Summary Statistics\n\n`;
  
  md += `### Regime Distribution\n`;
  md += `- Bullish: ${((regimeCounts.bullish / totalPeriods) * 100).toFixed(1)}% (${regimeCounts.bullish}/${totalPeriods} periods)\n`;
  md += `- Bearish: ${((regimeCounts.bearish / totalPeriods) * 100).toFixed(1)}% (${regimeCounts.bearish}/${totalPeriods} periods)\n`;
  md += `- Neutral: ${((regimeCounts.neutral / totalPeriods) * 100).toFixed(1)}% (${regimeCounts.neutral}/${totalPeriods} periods)\n\n`;
  
  md += `### Momentum & Persistence\n`;
  md += `- Momentum confirmed: ${((momentumConfirmedCount / totalPeriods) * 100).toFixed(1)}% (${momentumConfirmedCount}/${totalPeriods} periods)\n`;
  md += `- Persistence failures: ${persistenceFailures.bullish + persistenceFailures.bearish} periods\n`;
  md += `  - Bullish regime detected but persistence not met: ${persistenceFailures.bullish} periods\n`;
  md += `  - Bearish regime detected but persistence not met: ${persistenceFailures.bearish} periods\n\n`;
  
  md += `### Strategy Usage\n`;
  md += `- Bullish strategy: ${((strategyUsage.bullish / totalPeriods) * 100).toFixed(1)}% (${strategyUsage.bullish}/${totalPeriods} periods)\n`;
  md += `- Bearish strategy: ${((strategyUsage.bearish / totalPeriods) * 100).toFixed(1)}% (${strategyUsage.bearish}/${totalPeriods} periods)\n`;
  md += `- Neutral strategy: ${((strategyUsage.neutral / totalPeriods) * 100).toFixed(1)}% (${strategyUsage.neutral}/${totalPeriods} periods)\n\n`;
  
  md += `### Performance\n`;
  md += `- Final Portfolio Value: $${portfolio.totalValue.toFixed(2)}\n`;
  md += `- Total Return: ${portfolio.totalReturn > 0 ? '+' : ''}${portfolio.totalReturn.toFixed(2)}%\n`;
  md += `- Trade Count: ${trades.length}\n`;
  md += `- Win Rate: ${trades.length > 0 ? ((portfolio.winCount / trades.filter(t => t.type === 'sell').length) * 100).toFixed(1) : 0}%\n\n`;
  
  // Comparison with actual paper trading
  md += `## Comparison with Actual Paper Trading\n\n`;
  md += `### Backfill Results\n`;
  md += `- Final Value: $${portfolio.totalValue.toFixed(2)}\n`;
  md += `- Trades: ${trades.length}\n`;
  md += `- Regime switches: ${periods.filter((p, i) => i > 0 && p.regime.type !== periods[i - 1].regime.type).length}\n\n`;
  
  md += `### Actual Paper Trading\n`;
  md += `- Final Value: $${session!.portfolio.totalValue.toFixed(2)}\n`;
  md += `- Trades: ${session!.trades.length}\n`;
  md += `- Regime switches: ${session!.regimeHistory ? session!.regimeHistory.length - 1 : 0}\n\n`;
  
  const valueDiff = Math.abs(portfolio.totalValue - session!.portfolio.totalValue);
  const valueDiffPct = (valueDiff / session!.portfolio.totalValue) * 100;
  const tradeDiff = Math.abs(trades.length - session!.trades.length);
  
  md += `### Differences\n`;
  md += `- Value difference: $${valueDiff.toFixed(2)} (${valueDiffPct.toFixed(2)}%)\n`;
  md += `- Trade count difference: ${tradeDiff} trade${tradeDiff !== 1 ? 's' : ''}\n`;
  md += `- Analysis: ${valueDiffPct < 1 ? 'Minor differences due to timing of price updates' : 'Significant differences detected - may indicate issues'}\n\n`;
  
  // Verification status
  const tolerance = 1.0; // 1% tolerance
  const passed = valueDiffPct < tolerance;
  md += `## Verification Status\n`;
  md += `${passed ? '✅' : '❌'} **${passed ? 'PASS' : 'FAIL'}**: Backfill results ${passed ? 'match' : 'do not match'} paper trading within acceptable tolerance (< ${tolerance}% difference)\n`;
  
  return md;
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  
  console.log('🔄 Running paper trading backfill verification...');
  
  try {
    // ALWAYS use active session - this is for verification/comparison
    const session = await PaperTradingService.getActiveSession();
    
    if (!session || !session.isActive) {
      console.error('❌ Error: No active paper trading session found');
      console.error('   Please start a paper trading session first');
      console.error('   This script verifies the active session by replaying the same period');
      process.exit(1);
    }
    
    console.log(`📊 Found active session: ${session.id}`);
    console.log(`   Started: ${new Date(session.startedAt).toISOString()}`);
    
    // Extract start date from session (ALWAYS use session dates for comparison)
    const startDate = new Date(session.startedAt);
    startDate.setUTCHours(0, 0, 0, 0);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // End date is today (same as what the session would have processed)
    const endDate = new Date();
    endDate.setUTCHours(0, 0, 0, 0);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const config = session.config;
    console.log(`📅 Date range (from session): ${startDateStr} to ${endDateStr}`);
    
    // Clear regime history to start fresh (but we'll use sessionId to maintain it)
    clearRegimeHistory();
    
    // Fetch candles (need 200 days for indicators, but use available data)
    const lookbackDate = new Date(startDateStr);
    lookbackDate.setDate(lookbackDate.getDate() - 200);
    const lookbackDateStr = lookbackDate.toISOString().split('T')[0];
    
    // Use available historical data (starts at 2025-01-01)
    const minHistoryDate = '2025-01-01';
    const actualHistoryStart = lookbackDateStr < minHistoryDate ? minHistoryDate : lookbackDateStr;
    
    console.log(`📈 Fetching candles from ${actualHistoryStart} to ${endDateStr}...`);
    const candles = await fetchPriceCandles('ETHUSDT', '1d', actualHistoryStart, endDateStr);
    
    if (candles.length < 50) {
      console.error('❌ Error: Not enough historical data');
      process.exit(1);
    }
    
    // Find the index corresponding to the start date
    const startTimestamp = new Date(startDateStr).getTime();
    let startIndex = candles.findIndex(c => {
      const candleDate = new Date(c.timestamp);
      candleDate.setUTCHours(0, 0, 0, 0);
      return candleDate.getTime() >= startTimestamp;
    });
    
    if (startIndex === -1) {
      startIndex = candles.length - 1;
    }
    
    // Need at least 50 candles before start index for indicators
    if (startIndex < 50) {
      console.warn(`⚠️ Warning: Only ${startIndex} candles before start date, using index 50`);
      startIndex = 50;
    }
    
    // Calculate how many historical periods to process for regime history
    // We need at least 5 periods before the session start to build regime history
    const historyStartIndex = Math.max(50, startIndex - 10); // Process up to 10 periods before session start
    const historicalPeriods = startIndex - historyStartIndex;
    
    console.log(`📊 Building regime history: processing ${historicalPeriods} historical periods (index ${historyStartIndex} to ${startIndex - 1})...`);
    console.log(`📊 Processing ${candles.length - startIndex} session periods from index ${startIndex}...`);
    
    // Initialize portfolio (same as config)
    const portfolio: Portfolio = {
      usdcBalance: config.bullishStrategy.initialCapital,
      ethBalance: 0,
      totalValue: config.bullishStrategy.initialCapital,
      initialCapital: config.bullishStrategy.initialCapital,
      totalReturn: 0,
      tradeCount: 0,
      winCount: 0,
    };
    
    const trades: Trade[] = [];
    const periods: PeriodAnalysis[] = [];
    
    // Track regime history manually (same as paper trading uses sessionId)
    const regimeHistory: Array<'bullish' | 'bearish' | 'neutral'> = [];
    
    // STEP 1: Process historical periods BEFORE session start to build regime history
    // This simulates what happens when the session starts - it has historical context
    for (let i = historyStartIndex; i < startIndex; i++) {
      const candle = candles[i]!;
      
      // Generate signal to build regime history (but don't execute trades or record periods)
      // This builds up the regime history that the session would have had at start
      const signal = generateEnhancedAdaptiveSignal(
        candles,
        config,
        i,
        session.id
      );
      
      // Track regime history manually for display
      const persistencePeriods = config.regimePersistencePeriods || 2;
      getRegimePersistenceDetails(
        signal.regime.regime,
        persistencePeriods,
        signal.regime.regime,
        regimeHistory
      );
    }
    
    console.log(`✅ Regime history built: ${regimeHistory.length} periods in history`);
    
    // STEP 2: Process actual session periods (from session start to now)
    for (let i = startIndex; i < candles.length; i++) {
      const candle = candles[i]!;
      const currentPrice = candle.close;
      
      // Generate signal (using same sessionId for regime persistence)
      // This will internally call checkRegimePersistence which updates the history
      const signal = generateEnhancedAdaptiveSignal(
        candles,
        config,
        i,
        session.id
      );
      
      const confidence = calculateConfidence(signal, candles, i);
      
      // Get detailed momentum and persistence info
      const momentumStrength = calculateMomentumStrength(candles, i);
      const momentumThreshold = config.momentumConfirmationThreshold || 0.25;
      const momentumConfirmed = momentumStrength >= momentumThreshold;
      
      // Track regime history manually for display (using detected regime from signal)
      // Note: The actual persistence check happens inside generateEnhancedAdaptiveSignal
      // We track separately just for display purposes
      const persistencePeriods = config.regimePersistencePeriods || 2;
      const persistenceDetails = getRegimePersistenceDetails(
        signal.regime.regime,
        persistencePeriods,
        signal.regime.regime,
        regimeHistory
      );
      
      // Execute trade
      const trade = executeTrade(signal, confidence, currentPrice, portfolio, trades);
      
      // Update portfolio value
      portfolio.totalValue = portfolio.usdcBalance + portfolio.ethBalance * currentPrice;
      portfolio.totalReturn = ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;
      
      // Record period analysis
      periods.push({
        date: new Date(candle.timestamp).toISOString().split('T')[0],
        timestamp: candle.timestamp,
        price: currentPrice,
        regime: {
          type: signal.regime.regime,
          confidence: signal.regime.confidence,
        },
        momentum: {
          confirmed: momentumConfirmed,
          strength: momentumStrength,
          threshold: momentumThreshold,
        },
        persistence: {
          met: persistenceDetails.met,
          targetRegime: signal.regime.regime,
          requiredPeriods: persistencePeriods,
          actualCount: persistenceDetails.actualCount,
          recentRegimes: persistenceDetails.recentRegimes,
        },
        activeStrategy: signal.activeStrategy?.name || 'unknown',
        signal: {
          action: signal.action,
          strength: signal.signal,
        },
        trade: trade || null,
        portfolio: {
          usdcBalance: portfolio.usdcBalance,
          ethBalance: portfolio.ethBalance,
          totalValue: portfolio.totalValue,
        },
      });
    }
    
    // Generate markdown report
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    const report = generateMarkdownReport(session, config, periods, portfolio, startTime, processingTime, startDateStr, endDateStr);
    
    // Save report
    await fs.mkdir(BACKFILL_REPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `paper-trading-backfill-${timestamp}.md`;
    const filepath = path.join(BACKFILL_REPORTS_DIR, filename);
    
    await fs.writeFile(filepath, report, 'utf-8');
    
    console.log(`✅ Backfill complete!`);
    console.log(`📄 Report saved to: ${filepath}`);
    
    // ALWAYS compare with actual session (this is the purpose of this script)
    const valueDiff = Math.abs(portfolio.totalValue - session.portfolio.totalValue);
    const valueDiffPct = (valueDiff / session.portfolio.totalValue) * 100;
    const tradeDiff = Math.abs(session.trades.length - trades.length);
    const passed = valueDiffPct < 1.0 && tradeDiff <= 2;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Verification Results');
    console.log('='.repeat(60));
    console.log(`Backfill Value: $${portfolio.totalValue.toFixed(2)}`);
    console.log(`Session Value:  $${session.portfolio.totalValue.toFixed(2)}`);
    console.log(`Difference:     $${valueDiff.toFixed(2)} (${valueDiffPct.toFixed(2)}%)`);
    console.log(`\nBackfill Trades: ${trades.length}`);
    console.log(`Session Trades:  ${session.trades.length}`);
    console.log(`Difference:      ${tradeDiff}`);
    console.log(`\n${passed ? '✅' : '❌'} Verification: ${passed ? 'PASS' : 'FAIL'} (differences ${passed ? 'within' : 'exceed'} tolerance)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

main();

