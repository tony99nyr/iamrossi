/**
 * Circuit Breaker for API Calls
 * Prevents repeated API failures from causing excessive load
 */

interface CircuitState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  nextAttemptTime: number;
}

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // Open circuit after 5 failures
  resetTimeout: 60000, // 60 seconds before attempting half-open
  successThreshold: 2, // Need 2 successes to close from half-open
};

// Circuit breaker state per API endpoint
const circuitBreakers = new Map<string, CircuitState>();

/**
 * Get circuit breaker state for an API endpoint
 */
function getCircuitState(endpoint: string): CircuitState {
  if (!circuitBreakers.has(endpoint)) {
    circuitBreakers.set(endpoint, {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      nextAttemptTime: 0,
    });
  }
  return circuitBreakers.get(endpoint)!;
}

/**
 * Check if circuit breaker allows the request
 */
export function canMakeRequest(endpoint: string): boolean {
  const state = getCircuitState(endpoint);
  const now = Date.now();
  
  // If circuit is open, check if we should try half-open
  if (state.state === 'open') {
    if (now >= state.nextAttemptTime) {
      state.state = 'half-open';
      state.failures = 0; // Reset failure count for half-open attempts
      return true;
    }
    return false; // Circuit is open, block request
  }
  
  // Closed or half-open - allow request
  return true;
}

/**
 * Record a successful API call
 */
export function recordSuccess(endpoint: string): void {
  const state = getCircuitState(endpoint);
  
  if (state.state === 'half-open') {
    // Increment success count (simplified - just reset on first success)
    state.failures = 0;
    state.state = 'closed';
    state.lastFailureTime = 0;
  } else if (state.state === 'closed') {
    // Reset failure count on success
    state.failures = 0;
  }
}

/**
 * Record a failed API call
 */
export function recordFailure(endpoint: string): void {
  const state = getCircuitState(endpoint);
  const now = Date.now();
  
  state.failures++;
  state.lastFailureTime = now;
  
  if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    state.state = 'open';
    state.nextAttemptTime = now + CIRCUIT_BREAKER_CONFIG.resetTimeout;
  }
}

/**
 * Reset circuit breaker for an endpoint (useful for testing)
 */
export function resetCircuitBreaker(endpoint: string): void {
  circuitBreakers.delete(endpoint);
}

