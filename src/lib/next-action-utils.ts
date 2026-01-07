import type { EnhancedPaperTradingSession } from './paper-trading-enhanced';

export interface NextActionInfo {
  action: 'BUY' | 'SELL' | 'HOLD';
  message: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Calculate the next action for a trading session
 * Returns information about what action will be taken on the next update
 */
export function getNextAction(session: EnhancedPaperTradingSession | null): NextActionInfo | null {
  if (!session) return null;

  const { currentRegime, lastSignal, regimeHistory, config, portfolio } = session;

  const recentRegimes = regimeHistory?.slice(-5) || [];
  const requiredPeriods = config.regimePersistencePeriods || 2;
  
  // Persistence check
  const bullishCount = recentRegimes.filter(r => r.regime === 'bullish').length;
  const bearishCount = recentRegimes.filter(r => r.regime === 'bearish').length;
  const bullishPersistenceMet = bullishCount >= requiredPeriods;
  const bearishPersistenceMet = bearishCount >= requiredPeriods;
  
  // Trade conditions
  const buyConditions = {
    regimeBullish: currentRegime.regime === 'bullish',
    momentumConfirmed: lastSignal.momentumConfirmed,
    persistenceMet: bullishPersistenceMet,
    signalPositive: lastSignal.signal > 0,
    hasBalance: portfolio.usdcBalance > 0,
  };
  
  const sellConditions = {
    regimeBearish: currentRegime.regime === 'bearish',
    persistenceMet: bearishPersistenceMet,
    signalNegative: lastSignal.signal < 0,
    hasBalance: portfolio.ethBalance > 0,
  };
  
  const buyReady = Object.values(buyConditions).every(v => v);
  const sellReady = Object.values(sellConditions).every(v => v);
  const buyProgress = (Object.values(buyConditions).filter(v => v).length / Object.keys(buyConditions).length) * 100;
  const sellProgress = (Object.values(sellConditions).filter(v => v).length / Object.keys(sellConditions).length) * 100;

  if (buyReady) {
    return {
      action: 'BUY',
      message: '→ BUY on next update',
      color: '#3fb950',
      bgColor: 'rgba(63, 185, 80, 0.1)',
      borderColor: 'rgba(63, 185, 80, 0.2)',
    };
  }

  if (sellReady) {
    return {
      action: 'SELL',
      message: '→ SELL on next update',
      color: '#f85149',
      bgColor: 'rgba(248, 81, 73, 0.1)',
      borderColor: 'rgba(248, 81, 73, 0.2)',
    };
  }

  // HOLD with progress info
  const direction = buyProgress > sellProgress ? 'buy' : 'sell';
  const progress = Math.max(buyProgress, sellProgress);
  
  return {
    action: 'HOLD',
    message: `→ HOLD (${direction} ${progress.toFixed(0)}% ready)`,
    color: '#7d8590',
    bgColor: 'rgba(125, 133, 144, 0.05)',
    borderColor: 'rgba(125, 133, 144, 0.1)',
  };
}


