import type { EnhancedPaperTradingSession } from './paper-trading-enhanced';

/**
 * Check if trading is currently blocked by risk management filters
 * Returns true if any risk filter (volatility, whipsaw, circuit breaker, or drawdown) is blocking trading
 */
export function isTradingBlocked(session: EnhancedPaperTradingSession | null): boolean {
  if (!session) return false;

  const { portfolioHistory, regimeHistory, lastSignal, config, trades, drawdownInfo } = session;

  // 1. Check volatility filter
  const maxVolatility = config.maxVolatility || 0.05;
  if (portfolioHistory.length >= 20) {
    const prices = portfolioHistory.slice(-21).map(p => p.ethPrice);
    const returns: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1]! > 0) {
        returns.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
      }
    }
    
    if (returns.length > 0) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const currentVolatility = Math.sqrt(variance);
      
      if (currentVolatility > maxVolatility) {
        return true;
      }
    }
  }

  // 2. Check whipsaw detection
  const whipsawMaxChanges = config.whipsawMaxChanges || 3;
  if (regimeHistory && regimeHistory.length >= 5) {
    const recent = regimeHistory.slice(-5);
    const currentRegime = lastSignal.regime.regime;
    const allRegimes = [...recent.map(r => r.regime), currentRegime];
    
    let changes = 0;
    for (let i = 1; i < allRegimes.length; i++) {
      if (allRegimes[i] !== allRegimes[i - 1]) {
        changes++;
      }
    }
    
    if (changes > whipsawMaxChanges) {
      return true;
    }
  }

  // 3. Check circuit breaker (win rate)
  const minWinRate = config.circuitBreakerWinRate || 0.2;
  const lookback = config.circuitBreakerLookback || 10;
  
  const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
  if (sellTrades.length >= 5) {
    const recent = sellTrades.slice(-lookback);
    const wins = recent.filter(t => (t.pnl || 0) > 0).length;
    const winRate = wins / recent.length;
    
    if (winRate < minWinRate) {
      return true;
    }
  }

  // 4. Check drawdown status
  if (drawdownInfo?.isPaused) {
    return true;
  }

  return false;
}



