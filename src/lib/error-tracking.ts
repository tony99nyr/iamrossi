/**
 * Error Tracking Service
 * 
 * Tracks errors and sends notifications for critical issues
 */

import { sendErrorAlert, type ErrorNotification } from './notifications';
import { isNotificationsEnabled } from './notifications';

// Track error rates (last hour)
const errorCounts = new Map<string, { count: number; firstOccurrence: number }>();
const ERROR_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

/**
 * Track and report an error
 */
export async function trackError(
  type: ErrorNotification['type'],
  severity: ErrorNotification['severity'],
  message: string,
  context?: string,
  error?: Error | string
): Promise<void> {
  const errorKey = `${type}:${message}`;
  const now = Date.now();
  
  // Update error count
  const existing = errorCounts.get(errorKey);
  if (existing) {
    existing.count++;
  } else {
    errorCounts.set(errorKey, { count: 1, firstOccurrence: now });
  }

  // Clean up old errors
  for (const [key, value] of errorCounts.entries()) {
    if (now - value.firstOccurrence > ERROR_RATE_WINDOW) {
      errorCounts.delete(key);
    }
  }

  // Log error
  const errorMessage = error instanceof Error ? error.message : error || 'Unknown error';
  console.error(`[Error Tracking] ${type} (${severity}): ${message}`, {
    context,
    error: errorMessage,
    count: errorCounts.get(errorKey)?.count || 1,
  });

  // Send notification for medium+ severity errors
  if (severity !== 'low' && isNotificationsEnabled()) {
    try {
      await sendErrorAlert({
        type,
        severity,
        message,
        context,
        error: errorMessage,
        timestamp: now,
      });
    } catch (err) {
      // Don't fail if notification fails
      console.warn('[Error Tracking] Failed to send error notification:', err);
    }
  }
}

/**
 * Track API failure
 */
export async function trackApiFailure(
  endpoint: string,
  error: Error | string,
  context?: string
): Promise<void> {
  await trackError(
    'api_failure',
    'medium',
    `API call failed: ${endpoint}`,
    context,
    error
  );
}

/**
 * Track execution failure
 */
export async function trackExecutionFailure(
  tradeId: string,
  error: Error | string,
  context?: string
): Promise<void> {
  await trackError(
    'execution_failure',
    'high',
    `Trade execution failed: ${tradeId}`,
    context,
    error
  );
}

/**
 * Track data quality issue
 */
export async function trackDataQualityIssue(
  issue: string,
  context?: string
): Promise<void> {
  await trackError(
    'data_quality',
    'medium',
    `Data quality issue: ${issue}`,
    context
  );
}

/**
 * Track system error
 */
export async function trackSystemError(
  error: Error | string,
  context?: string
): Promise<void> {
  await trackError(
    'system_error',
    'critical',
    'System error occurred',
    context,
    error
  );
}

/**
 * Get error rate for a specific error type
 */
export function getErrorRate(type: string): number {
  let totalCount = 0;
  const now = Date.now();
  
  for (const [key, value] of errorCounts.entries()) {
    if (key.startsWith(`${type}:`) && now - value.firstOccurrence <= ERROR_RATE_WINDOW) {
      totalCount += value.count;
    }
  }
  
  return totalCount;
}

/**
 * Clear error tracking (useful for testing)
 */
export function clearErrorTracking(): void {
  errorCounts.clear();
}

