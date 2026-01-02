/**
 * Audit Logger
 * Logs all critical actions for compliance and debugging
 */

import { redis, ensureConnected } from './kv';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  type: 'trade' | 'config_change' | 'emergency_stop' | 'session_start' | 'session_stop' | 'error';
  action: string;
  details: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
}

const AUDIT_LOG_KEY = 'trading:audit:logs';
const MAX_AUDIT_LOGS = 1000; // Keep last 1000 log entries

/**
 * Log an audit entry
 */
export async function logAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    await ensureConnected();
    
    const auditEntry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      ...entry,
    };

    // Add to list (prepend for chronological order)
    await redis.lpush(AUDIT_LOG_KEY, JSON.stringify(auditEntry));
    
    // Trim to max size
    await redis.ltrim(AUDIT_LOG_KEY, 0, MAX_AUDIT_LOGS - 1);
  } catch (error) {
    // Don't fail if audit logging fails - just log to console
    console.error('[Audit Logger] Failed to log audit entry:', error);
  }
}

/**
 * Log a trade execution
 */
export async function logTrade(tradeId: string, tradeType: 'buy' | 'sell', details: Record<string, unknown>, sessionId?: string): Promise<void> {
  await logAuditEntry({
    type: 'trade',
    action: `Trade ${tradeType}`,
    details: {
      tradeId,
      tradeType,
      ...details,
    },
    sessionId,
  });
}

/**
 * Log a config change
 */
export async function logConfigChange(configName: string, changes: Record<string, unknown>, sessionId?: string): Promise<void> {
  await logAuditEntry({
    type: 'config_change',
    action: 'Config changed',
    details: {
      configName,
      changes,
    },
    sessionId,
  });
}

/**
 * Log emergency stop
 */
export async function logEmergencyStop(sessionId: string, reason?: string): Promise<void> {
  await logAuditEntry({
    type: 'emergency_stop',
    action: 'Emergency stop activated',
    details: {
      reason,
    },
    sessionId,
  });
}

/**
 * Log session start
 */
export async function logSessionStart(sessionId: string, configName?: string, asset?: string): Promise<void> {
  await logAuditEntry({
    type: 'session_start',
    action: 'Session started',
    details: {
      configName,
      asset,
    },
    sessionId,
  });
}

/**
 * Log session stop
 */
export async function logSessionStop(sessionId: string, reason?: string): Promise<void> {
  await logAuditEntry({
    type: 'session_stop',
    action: 'Session stopped',
    details: {
      reason,
    },
    sessionId,
  });
}

/**
 * Log error
 */
export async function logError(errorType: string, errorMessage: string, context?: Record<string, unknown>, sessionId?: string): Promise<void> {
  await logAuditEntry({
    type: 'error',
    action: 'Error occurred',
    details: {
      errorType,
      errorMessage,
      context,
    },
    sessionId,
  });
}

/**
 * Get audit logs
 */
export async function getAuditLogs(limit: number = 100): Promise<AuditLogEntry[]> {
  try {
    await ensureConnected();
    
    const logs = await redis.lrange(AUDIT_LOG_KEY, 0, limit - 1);
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return [];
    }
    // Filter and map only string entries
    const validLogs = logs
      .filter((log): log is string => typeof log === 'string')
      .map((log: string) => JSON.parse(log) as AuditLogEntry);
    return validLogs.reverse(); // Reverse to get chronological order
  } catch (error) {
    console.error('[Audit Logger] Failed to get audit logs:', error);
    return [];
  }
}

/**
 * Clear audit logs (useful for testing)
 */
export async function clearAuditLogs(): Promise<void> {
  try {
    await ensureConnected();
    await redis.del(AUDIT_LOG_KEY);
  } catch (error) {
    console.error('[Audit Logger] Failed to clear audit logs:', error);
  }
}

