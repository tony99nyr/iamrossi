/**
 * Centralized logging utility with levels and sanitization
 * Replaces console.log/warn/error with structured logging
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Sanitize log data to prevent leaking sensitive information
 */
function sanitizeLogData(data: unknown): unknown {
  if (typeof data === 'string') {
    // Remove potential file paths, API keys, tokens, etc.
    return data
      .replace(/\/[^\s]+/g, '[path]') // Remove file paths
      .replace(/[A-Za-z0-9]{32,}/g, '[token]') // Remove long alphanumeric strings (potential tokens)
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer [token]') // Remove bearer tokens
      .replace(/api[_-]?key[=:]\s*[^\s]+/gi, 'api_key=[key]') // Remove API keys
      .replace(/secret[=:]\s*[^\s]+/gi, 'secret=[secret]'); // Remove secrets
  }
  
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map(sanitizeLogData);
    }
    
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip sensitive keys
      if (['password', 'secret', 'token', 'apiKey', 'api_key', 'auth', 'authorization'].some(sensitive => 
        key.toLowerCase().includes(sensitive.toLowerCase())
      )) {
        sanitized[key] = '[redacted]';
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Format log message with context
 */
function formatLogMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(sanitizeLogData(context))}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Log info message
 */
export function logInfo(message: string, context?: LogContext): void {
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGS === 'true') {
    console.log(formatLogMessage('info', message, context));
  }
}

/**
 * Log warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  console.warn(formatLogMessage('warn', message, context));
}

/**
 * Log error message
 */
export function logError(message: string, error?: unknown, context?: LogContext): void {
  const errorContext: LogContext = {
    ...context,
    error: error instanceof Error 
      ? { message: error.message, name: error.name }
      : String(error),
  };
  console.error(formatLogMessage('error', message, errorContext));
}

/**
 * Log debug message (only in development)
 */
export function logDebug(message: string, context?: LogContext): void {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(formatLogMessage('debug', message, context));
  }
}
