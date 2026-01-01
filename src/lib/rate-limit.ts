import { NextRequest } from 'next/server';
import { redis, ensureConnected } from './kv';

const MAX_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 5 * 60; // 5 minutes

/**
 * Gets client identifier from request (IP address)
 */
export function getClientIdentifier(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    return ip;
}

/**
 * Checks rate limit for a given identifier using Redis
 * Returns whether the request is allowed and remaining attempts
 * 
 * NOTE: This only tracks failed attempts. Successful requests don't increment the counter.
 * Use recordFailedAttempt() to increment on failures.
 */
export async function checkRateLimit(
    identifier: string,
    prefix: string = 'rate_limit'
): Promise<{ allowed: boolean; remainingAttempts: number; lockedUntil?: number }> {
    // Disable rate limiting in development mode
    if (process.env.NODE_ENV === 'development' || process.env.DISABLE_RATE_LIMIT === 'true') {
        return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }
    
    await ensureConnected();
    
    const key = `${prefix}:${identifier}`;
    const attemptsStr = await redis.get(key);
    
    if (!attemptsStr) {
        // No previous attempts - allow request
        return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }
    
    const attempts = parseInt(attemptsStr, 10);
    
    if (attempts >= MAX_ATTEMPTS) {
        // Rate limited - get remaining TTL
        const ttl = await redis.ttl(key);
        const lockedUntil = Date.now() + (ttl * 1000);
        return {
            allowed: false,
            remainingAttempts: 0,
            lockedUntil,
        };
    }
    
    // Still have attempts remaining
    const remainingAttempts = Math.max(0, MAX_ATTEMPTS - attempts);
    
    return {
        allowed: true,
        remainingAttempts,
    };
}

/**
 * Records a failed attempt (increments counter)
 */
export async function recordFailedAttempt(
    identifier: string,
    prefix: string = 'rate_limit'
): Promise<void> {
    await ensureConnected();
    
    const key = `${prefix}:${identifier}`;
    const attemptsStr = await redis.get(key);
    
    if (!attemptsStr) {
        // First attempt - initialize counter with TTL
        await redis.setEx(key, COOLDOWN_SECONDS, '1');
    } else {
        // Increment attempts
        await redis.incr(key);
    }
}

/**
 * Resets rate limit for a given identifier (on successful auth)
 */
export async function resetRateLimit(
    identifier: string,
    prefix: string = 'rate_limit'
): Promise<void> {
    await ensureConnected();
    
    const key = `${prefix}:${identifier}`;
    await redis.del(key);
}

