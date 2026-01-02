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
  drawdownThreshold: 18, // 18% - Alert before circuit breaker (20%) kicks in, gives early warning
  winRateThreshold: 18, // 18% - Match circuit breaker threshold for consistency
  winRateLookback: 10, // Last 10 trades - Match circuit breaker lookback for consistency
  noTradeHours: 72, // 72 hours (3 days) - Normal to wait for good market conditions
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
      // Check if drawdown protection is already active
      const isPaused = session.drawdownInfo.isPaused;
      const maxDrawdownThreshold = session.config.maxDrawdownThreshold ?? 0.20; // Default 20%
      
      await sendErrorAlert({
        type: 'system_error',
        severity: isPaused ? 'high' : 'medium', // High if already paused, medium if approaching
        message: isPaused 
          ? `Drawdown protection ACTIVE: ${currentDrawdown.toFixed(2)}% (max threshold: ${(maxDrawdownThreshold * 100).toFixed(0)}%). Trading is paused.`
          : `Drawdown approaching threshold: ${currentDrawdown.toFixed(2)}% (alert: ${thresholds.drawdownThreshold}%, max: ${(maxDrawdownThreshold * 100).toFixed(0)}%). Trading will pause at ${(maxDrawdownThreshold * 100).toFixed(0)}%.`,
        context: `Session: ${session.name || session.id}, Asset: ${assetName}, Peak: $${session.drawdownInfo.peakValue.toFixed(2)}`,
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
      // Check circuit breaker config to see if it's already active
      const circuitBreakerWinRate = session.config.circuitBreakerWinRate ?? 0.20;
      const circuitBreakerLookback = session.config.circuitBreakerLookback ?? 10;
      
      // Note: We can't directly check if circuit breaker is active, but we can infer
      // If win rate is below threshold, circuit breaker may be blocking trades
      await sendErrorAlert({
        type: 'system_error',
        severity: 'medium',
        message: `Win rate below threshold: ${winRate.toFixed(2)}% (threshold: ${thresholds.winRateThreshold}%, last ${sellTrades.length} trades). Circuit breaker may be active (${(circuitBreakerWinRate * 100).toFixed(0)}% for last ${circuitBreakerLookback} trades).`,
        context: `Session: ${session.name || session.id}, Asset: ${assetName}. Low win rate may cause circuit breaker to block new trades.`,
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
    // Only alert if session is very old (suggests system issue, not just waiting for conditions)
    const sessionAgeHours = (Date.now() - session.startedAt) / (1000 * 60 * 60);
    if (sessionAgeHours > thresholds.noTradeHours) {
      const alertKey = `notrade-${session.id}`;
      if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
        await sendErrorAlert({
          type: 'system_error',
          severity: 'low', // Lower severity - could be normal waiting for conditions
          message: `No trades since session start (${sessionAgeHours.toFixed(1)} hours). This may be normal if waiting for good market conditions.`,
          context: `Session: ${session.name || session.id}, Asset: ${assetName}, Started: ${new Date(session.startedAt).toISOString()}. Check if signals are being generated but filtered by risk management.`,
          timestamp: Date.now(),
        });
      }
    }
    return;
  }
  
  const hoursSinceLastTrade = (Date.now() - lastTrade.timestamp) / (1000 * 60 * 60);
  
  // Only alert if it's been a very long time since last trade
  // This suggests a potential system issue, not just normal waiting
  if (hoursSinceLastTrade > thresholds.noTradeHours) {
    const alertKey = `notrade-${session.id}`;
    if (shouldSendAlert(alertKey) && isNotificationsEnabled()) {
      await sendErrorAlert({
        type: 'system_error',
        severity: 'low', // Lower severity - could be normal waiting for conditions
        message: `No trades in ${hoursSinceLastTrade.toFixed(1)} hours (threshold: ${thresholds.noTradeHours}h). This may be normal if waiting for good market conditions.`,
        context: `Session: ${session.name || session.id}, Asset: ${assetName}, Last trade: ${new Date(lastTrade.timestamp).toISOString()}. Check if signals are being generated but filtered by risk management.`,
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

