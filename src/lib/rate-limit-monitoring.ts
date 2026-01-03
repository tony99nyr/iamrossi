/**
 * Rate Limit Monitoring
 * 
 * Tracks API usage and alerts when approaching rate limits.
 * Uses Redis for persistence and provides real-time usage statistics.
 */

import { redis, ensureConnected } from './kv';
import { sendErrorAlert } from './notifications';
import { isNotificationsEnabled } from './notifications';

interface ApiUsageStats {
  requests: number;
  windowStart: number;
  lastAlertTime: number;
}

interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
  alertThreshold: number; // Alert when usage exceeds this percentage (0-1)
  alertCooldown: number; // Minimum time between alerts (ms)
}

// Rate limit configurations per API endpoint
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  binance_klines: {
    maxRequests: 1200, // 1200 requests per minute (Binance limit)
    windowMs: 60 * 1000, // 1 minute
    alertThreshold: 0.8, // Alert at 80% usage
    alertCooldown: 5 * 60 * 1000, // 5 minutes between alerts
  },
  binance_ticker: {
    maxRequests: 1200,
    windowMs: 60 * 1000,
    alertThreshold: 0.8,
    alertCooldown: 5 * 60 * 1000,
  },
  coingecko_price: {
    maxRequests: 50, // 50 requests per minute (free tier)
    windowMs: 60 * 1000,
    alertThreshold: 0.8,
    alertCooldown: 5 * 60 * 1000,
  },
  coingecko_ohlc: {
    maxRequests: 50,
    windowMs: 60 * 1000,
    alertThreshold: 0.8,
    alertCooldown: 5 * 60 * 1000,
  },
};

// In-memory cache for API usage (Redis-backed for persistence)
const usageCache = new Map<string, ApiUsageStats>();

/**
 * Record an API request for rate limit monitoring
 * 
 * @param endpoint - API endpoint identifier (e.g., 'binance_klines', 'coingecko_price')
 * @throws Never throws - errors are logged but don't fail the operation
 */
export async function recordApiRequest(endpoint: string): Promise<void> {
  const config = RATE_LIMIT_CONFIGS[endpoint];
  if (!config) {
    // No monitoring for this endpoint
    return;
  }

  const now = Date.now();
  const cacheKey = `rate_limit:${endpoint}`;

  try {
    await ensureConnected();
    
    // Get current usage from Redis
    const cached = await redis.get(cacheKey);
    let stats: ApiUsageStats;
    
    if (cached) {
      stats = JSON.parse(cached) as ApiUsageStats;
      
      // Reset window if expired
      if (now - stats.windowStart >= config.windowMs) {
        stats = {
          requests: 1,
          windowStart: now,
          lastAlertTime: stats.lastAlertTime || 0,
        };
      } else {
        stats.requests++;
      }
    } else {
      stats = {
        requests: 1,
        windowStart: now,
        lastAlertTime: 0,
      };
    }

    // Store in Redis with TTL
    await redis.setEx(cacheKey, Math.ceil(config.windowMs / 1000), JSON.stringify(stats));
    
    // Update in-memory cache
    usageCache.set(endpoint, stats);

    // Check if we should alert
    const usagePercent = stats.requests / config.maxRequests;
    const timeSinceLastAlert = now - stats.lastAlertTime;
    
    if (
      usagePercent >= config.alertThreshold &&
      timeSinceLastAlert >= config.alertCooldown &&
      isNotificationsEnabled()
    ) {
      await sendRateLimitAlert(endpoint, stats, config, usagePercent);
      stats.lastAlertTime = now;
      await redis.setEx(cacheKey, Math.ceil(config.windowMs / 1000), JSON.stringify(stats));
    }
  } catch (error) {
    // Don't fail if monitoring fails
    console.warn('[Rate Limit Monitoring] Failed to record request:', error);
  }
}

/**
 * Get current API usage statistics
 * 
 * @param endpoint - API endpoint identifier
 * @returns Usage statistics or null if endpoint is not monitored
 */
export async function getApiUsage(endpoint: string): Promise<{
  requests: number;
  maxRequests: number;
  usagePercent: number;
  windowStart: number;
  windowEnd: number;
} | null> {
  const config = RATE_LIMIT_CONFIGS[endpoint];
  if (!config) {
    return null;
  }

  try {
    await ensureConnected();
    const cacheKey = `rate_limit:${endpoint}`;
    const cached = await redis.get(cacheKey);
    
    if (!cached) {
      return {
        requests: 0,
        maxRequests: config.maxRequests,
        usagePercent: 0,
        windowStart: Date.now(),
        windowEnd: Date.now() + config.windowMs,
      };
    }

    const stats = JSON.parse(cached) as ApiUsageStats;
    const now = Date.now();
    
    // Reset if window expired
    if (now - stats.windowStart >= config.windowMs) {
      return {
        requests: 0,
        maxRequests: config.maxRequests,
        usagePercent: 0,
        windowStart: now,
        windowEnd: now + config.windowMs,
      };
    }

    const usagePercent = stats.requests / config.maxRequests;
    return {
      requests: stats.requests,
      maxRequests: config.maxRequests,
      usagePercent,
      windowStart: stats.windowStart,
      windowEnd: stats.windowStart + config.windowMs,
    };
  } catch (error) {
    console.warn('[Rate Limit Monitoring] Failed to get usage:', error);
    return null;
  }
}

/**
 * Send rate limit alert
 */
async function sendRateLimitAlert(
  endpoint: string,
  stats: ApiUsageStats,
  config: RateLimitConfig,
  usagePercent: number
): Promise<void> {
  const usagePercentFormatted = (usagePercent * 100).toFixed(1);
  const remainingRequests = Math.max(0, config.maxRequests - stats.requests);
  
  await sendErrorAlert({
    type: 'api_failure',
    severity: usagePercent >= 0.95 ? 'high' : 'medium', // High if >95% usage
    message: `API rate limit approaching: ${endpoint} at ${usagePercentFormatted}% usage (${stats.requests}/${config.maxRequests} requests)`,
    context: `Remaining requests: ${remainingRequests}. Window resets in ${Math.ceil((config.windowMs - (Date.now() - stats.windowStart)) / 1000)} seconds. Consider reducing API call frequency.`,
    timestamp: Date.now(),
  });
}

/**
 * Check if API is approaching rate limit threshold (80%)
 * 
 * @param endpoint - API endpoint identifier
 * @returns true if usage is >= 80% of limit
 */
export async function isApproachingRateLimit(endpoint: string): Promise<boolean> {
  const usage = await getApiUsage(endpoint);
  if (!usage) {
    return false;
  }
  
  return usage.usagePercent >= 0.8; // 80% threshold
}

