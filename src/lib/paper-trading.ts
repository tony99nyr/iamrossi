import { v4 as uuidv4 } from 'uuid';
import type { TradingConfig, Trade, PortfolioSnapshot, Portfolio } from '@/types';
import { fetchLatestPrice } from './eth-price-service';
// Note: generateSignal and calculateConfidence would be used for live paper trading execution
// import { generateSignal } from './trading-signals';
// import { calculateConfidence } from './confidence-calculator';
// Note: calculateStrategyResults and calculateRiskMetrics are imported but not currently used
// import { calculateStrategyResults, calculateRiskMetrics } from './risk-metrics';

export interface PaperTradingSession {
  id: string;
  name?: string;
  config: TradingConfig;
  startedAt: number;
  stoppedAt?: number;
  isActive: boolean;
  strategyRunId?: string; // Link to strategy run when stopped
  trades: Trade[];
  portfolioHistory: PortfolioSnapshot[];
  portfolio: Portfolio;
}

/**
 * Start a new paper trading session
 */
export function createPaperTradingSession(
  config: TradingConfig,
  name?: string
): PaperTradingSession {
  return {
    id: uuidv4(),
    name,
    config,
    startedAt: Date.now(),
    isActive: true,
    trades: [],
    portfolioHistory: [],
    portfolio: {
      usdcBalance: config.initialCapital,
      ethBalance: 0,
      totalValue: config.initialCapital,
      initialCapital: config.initialCapital,
      totalReturn: 0,
      tradeCount: 0,
      winCount: 0,
    },
  };
}

/**
 * Stop paper trading session
 */
export async function stopPaperTrading(
  session: PaperTradingSession
): Promise<void> {
  if (!session.isActive) {
    throw new Error('Paper trading session is not active');
  }

  // Get final price for final portfolio value calculation
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
}

