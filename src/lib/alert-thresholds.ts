/**
 * Alert Thresholds
 * Configurable alert thresholds for trading system monitoring
 */

import { sendErrorAlert } from './notifications';
import { isNotificationsEnabled } from './notifications';
import type { EnhancedPaperTradingSession } from './paper-trading-enhanced';
import { getErrorRate } from './error-tracking';

export interface AlertThresholds {
  drawdownThreshold: number; // Percentage (default: 15%)
  winRateThreshold: number; // Percentage (default: 20%)
  winRateLookback: number; // Number of trades to check (default: 20)
  noTradeHours: number; // Hours without trades to alert (default: 24)
  apiFailureThreshold: number; // Number of failures per hour (default: 3)
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  drawdownThreshold: 15, // 15%
  winRateThreshold: 20, // 20%
  winRateLookback: 20, // Last 20 trades
  noTradeHours: 24, // 24 hours
  apiFailureThreshold: 3, // 3 failures per hour
};

// Track last alert time to avoid spam (rate limit: 1 alert per threshold per hour)
const lastAlertTimes = new Map<string, number>();
const ALERT_COOLDOWN = 60 * 60 * 1000; // 1 hour

/**
 * Check if we should send an alert (rate limiting)
 */
function shouldSendAlert(alertKey: string): boolean {
  const lastAlert = lastAlertTimes.get(alertKey);
  const now = Date.now();
  
  if (!lastAlert || (now - lastAlert) > ALERT_COOLDOWN) {
    lastAlertTimes.set(alertKey, now);
    return true;
  }
  
  return false;
}

/**
 * Check drawdown threshold
 */
export async function checkDrawdownThreshold(
  session: EnhancedPaperTradingSession,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  if (!session.drawdownInfo) return;
  
  const currentDrawdown = session.drawdownInfo.currentDrawdown * 100; // Convert to percentage
  
  if (currentDrawdown > thresholds.drawdownThreshold) {
    const alertKey = `drawdown-${session.id}`;
    if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
      const assetName = session.asset || 'unknown';
      await sendErrorAlert({
        type: 'system_error',
        severity: 'high',
        message: `Drawdown threshold exceeded: ${currentDrawdown.toFixed(2)}% (threshold: ${thresholds.drawdownThreshold}%)`,
        context: `Session: ${session.name || session.id}, Asset: ${assetName}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Check win rate threshold
 */
export async function checkWinRateThreshold(
  session: EnhancedPaperTradingSession,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  const sellTrades = session.trades
    .filter(t => t.type === 'sell' && t.pnl !== undefined)
    .slice(-thresholds.winRateLookback);
  
  if (sellTrades.length < thresholds.winRateLookback) {
    return; // Not enough trades yet
  }
  
  const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0);
  const winRate = (winningTrades.length / sellTrades.length) * 100;
  
  if (winRate < thresholds.winRateThreshold) {
    const alertKey = `winrate-${session.id}`;
    if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
      const assetName = session.asset || 'unknown';
      await sendErrorAlert({
        type: 'system_error',
        severity: 'medium',
        message: `Win rate below threshold: ${winRate.toFixed(2)}% (threshold: ${thresholds.winRateThreshold}%, last ${sellTrades.length} trades)`,
        context: `Session: ${session.name || session.id}, Asset: ${assetName}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Check no trade threshold
 */
export async function checkNoTradeThreshold(
  session: EnhancedPaperTradingSession,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  // Don't alert for inactive or emergency-stopped sessions
  if (!session.isActive || session.isEmergencyStopped) return;
  
  const lastTrade = session.trades.length > 0 
    ? session.trades[session.trades.length - 1] 
    : null;
  
  // Get asset name safely (handle undefined)
  const assetName = session.asset || 'unknown';
  
  if (!lastTrade) {
    // No trades at all - check session age
    const sessionAgeHours = (Date.now() - session.startedAt) / (1000 * 60 * 60);
    if (sessionAgeHours > thresholds.noTradeHours) {
      const alertKey = `notrade-${session.id}`;
      if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
        await sendErrorAlert({
          type: 'system_error',
          severity: 'medium',
          message: `No trades in ${sessionAgeHours.toFixed(1)} hours (threshold: ${thresholds.noTradeHours}h)`,
          context: `Session: ${session.name || session.id}, Asset: ${assetName}, Started: ${new Date(session.startedAt).toISOString()}`,
          timestamp: Date.now(),
        });
      }
    }
    return;
  }
  
  const hoursSinceLastTrade = (Date.now() - lastTrade.timestamp) / (1000 * 60 * 60);
  
  if (hoursSinceLastTrade > thresholds.noTradeHours) {
    const alertKey = `notrade-${session.id}`;
    if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
      await sendErrorAlert({
        type: 'system_error',
        severity: 'medium',
        message: `No trades in ${hoursSinceLastTrade.toFixed(1)} hours (threshold: ${thresholds.noTradeHours}h)`,
        context: `Session: ${session.name || session.id}, Asset: ${assetName}, Last trade: ${new Date(lastTrade.timestamp).toISOString()}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Check API failure threshold
 */
export async function checkApiFailureThreshold(
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  const apiFailureRate = getErrorRate('api_failure');
  
  if (apiFailureRate > thresholds.apiFailureThreshold) {
    const alertKey = 'api-failure';
    if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
      await sendErrorAlert({
        type: 'api_failure',
        severity: 'high',
        message: `API failure rate exceeded: ${apiFailureRate} failures in last hour (threshold: ${thresholds.apiFailureThreshold})`,
        context: 'System-wide API failure monitoring',
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Check all thresholds for a session
 */
export async function checkAllThresholds(
  session: EnhancedPaperTradingSession,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  // Skip threshold checks for inactive or emergency-stopped sessions
  // This prevents false alerts for sessions that are intentionally stopped
  if (!session.isActive || session.isEmergencyStopped) {
    return;
  }
  
  await Promise.all([
    checkDrawdownThreshold(session, thresholds),
    checkWinRateThreshold(session, thresholds),
    checkNoTradeThreshold(session, thresholds),
    checkApiFailureThreshold(thresholds),
  ]);
}

/**
 * Clear alert tracking (useful for testing)
 */
export function clearAlertTracking(): void {
  lastAlertTimes.clear();
}

