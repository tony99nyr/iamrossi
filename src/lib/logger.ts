/**
 * Centralized logging service for the application
 * Provides consistent logging with context and appropriate log levels
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';

  /**
   * Debug logs - only shown in development
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Info logs - general application flow
   */
  info(message: string, context?: LogContext): void {
    console.log(`[INFO] ${message}`, context || '');
  }

  /**
   * Warning logs - unexpected but recoverable situations
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context || '');
  }

  /**
   * Error logs - errors that need attention
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack, ...context }
      : { error, ...context };

    console.error(`[ERROR] ${message}`, errorDetails);
  }

  /**
   * API request logging helper
   */
  apiRequest(method: string, path: string, context?: LogContext): void {
    this.debug(`API ${method} ${path}`, context);
  }

  /**
   * API error logging helper
   */
  apiError(method: string, path: string, error: Error | unknown, context?: LogContext): void {
    this.error(`API ${method} ${path} failed`, error, context);
  }

  /**
   * Redis operation logging helper
   */
  redisOperation(operation: string, key: string, context?: LogContext): void {
    this.debug(`Redis ${operation}: ${key}`, context);
  }

  /**
   * Redis error logging helper
   */
  redisError(operation: string, key: string, error: Error | unknown): void {
    this.error(`Redis ${operation} failed for key: ${key}`, error);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export legacy debugLog for backwards compatibility
export const debugLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

// Export type for extensions
export type { LogLevel, LogContext };
