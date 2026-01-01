/**
 * Request Deduplication
 * Prevents duplicate API requests within a short time window
 */

interface CachedRequest {
  result: unknown;
  timestamp: number;
}

// Cache for deduplicated requests (in-memory, cleared periodically)
const requestCache = new Map<string, CachedRequest>();
const DEDUPLICATION_WINDOW_MS = 1000; // 1 second window

/**
 * Generate cache key from request parameters
 */
function getRequestKey(endpoint: string, params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  return `${endpoint}:${sortedParams}`;
}

/**
 * Check if a request can be deduplicated (same request within window)
 */
export function getCachedRequest<T>(
  endpoint: string,
  params: Record<string, unknown>
): T | null {
  const key = getRequestKey(endpoint, params);
  const cached = requestCache.get(key);
  
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < DEDUPLICATION_WINDOW_MS) {
      return cached.result as T;
    }
    // Cache expired - remove it
    requestCache.delete(key);
  }
  
  return null;
}

/**
 * Cache a request result
 */
export function cacheRequest(
  endpoint: string,
  params: Record<string, unknown>,
  result: unknown
): void {
  const key = getRequestKey(endpoint, params);
  requestCache.set(key, {
    result,
    timestamp: Date.now(),
  });
  
  // Clean up old entries periodically (keep cache size reasonable)
  if (requestCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of requestCache.entries()) {
      if (now - v.timestamp > DEDUPLICATION_WINDOW_MS * 10) {
        requestCache.delete(k);
      }
    }
  }
}

/**
 * Clear all cached requests (useful for testing)
 */
export function clearRequestCache(): void {
  requestCache.clear();
}

