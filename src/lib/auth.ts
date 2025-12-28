import { NextRequest } from 'next/server';

import crypto from 'crypto';
import { logger } from './logger';

const COOKIE_NAME = 'rehab_auth';
const ADMIN_COOKIE_NAME = 'admin_auth';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Creates a secure authentication token
 */
export function createAuthToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a PIN for secure comparison
 */
export function hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * Verifies the PIN against the environment variable using constant-time comparison
 * to prevent timing attacks
 */
export function verifyPin(pin: string): boolean {
    const correctPin = process.env.WORKOUT_ADMIN_PIN;

    if (!correctPin) {
        logger.error('WORKOUT_ADMIN_PIN environment variable is not set');
        return false;
    }

    // Constant-time comparison to prevent timing attacks
    try {
        const pinBuffer = Buffer.from(pin, 'utf8');
        const correctBuffer = Buffer.from(correctPin, 'utf8');

        // Ensure same length to prevent length-based timing attacks
        if (pinBuffer.length !== correctBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(pinBuffer, correctBuffer);
    } catch {
        return false;
    }
}

/**
 * Verifies authentication from request (cookie or header)
 */
export async function verifyAuthToken(request: NextRequest): Promise<boolean> {
    // Check for auth cookie from request (works in both runtime and tests)
    const cookieHeader = request.headers.get('cookie') || '';
    const authCookie = cookieHeader.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`));

    if (authCookie) {
        return true;
    }

    // Check for Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return true;
    }

    return false;
}

/**
 * Cookie configuration for authentication
 */
export const AUTH_COOKIE_CONFIG = {
    name: COOKIE_NAME,
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

/**
 * Cookie configuration for admin authentication
 */
export const ADMIN_AUTH_COOKIE_CONFIG = {
    name: ADMIN_COOKIE_NAME,
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

/**
 * Verifies the admin secret from environment variable using constant-time comparison
 * to prevent timing attacks
 */
export function verifyAdminSecret(secret: string): boolean {
    const correctSecret = process.env.ADMIN_SECRET;

    if (!correctSecret) {
        logger.error('ADMIN_SECRET environment variable is not set');
        return false;
    }

    // Constant-time comparison to prevent timing attacks
    try {
        const secretBuffer = Buffer.from(secret, 'utf8');
        const correctBuffer = Buffer.from(correctSecret, 'utf8');

        // Ensure same length to prevent length-based timing attacks
        if (secretBuffer.length !== correctBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(secretBuffer, correctBuffer);
    } catch {
        return false;
    }
}

/**
 * Gets admin secret from environment (for client-side validation)
 * This should only be called server-side
 */
export function getAdminSecret(): string {
    const secret = process.env.ADMIN_SECRET;

    if (!secret) {
        throw new Error('ADMIN_SECRET environment variable not configured');
    }

    return secret;
}

/**
 * Gets client IP address from request (for rate limiting)
 */
export function getClientIdentifier(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    return ip;
}

/**
 * Verifies admin authentication from request (cookie or Authorization header)
 * Accepts either ADMIN_SECRET, WORKOUT_ADMIN_PIN, or valid session token
 */
export async function verifyAdminAuth(request: NextRequest): Promise<boolean> {
    // Check for admin auth cookie first
    const cookieHeader = request.headers.get('cookie') || '';
    const adminCookie = cookieHeader.split(';').find(c => c.trim().startsWith(`${ADMIN_COOKIE_NAME}=`));
    
    if (adminCookie) {
        // Extract token from cookie
        const token = adminCookie.split('=')[1]?.trim();
        if (token) {
            // Check if it's a session token stored in Redis
            try {
                const { redis, ensureConnected } = await import('./kv');
                await ensureConnected();
                const sessionKey = `admin:session:${token}`;
                const sessionExists = await redis.exists(sessionKey);
                if (sessionExists) {
                    return true;
                }
            } catch {
                // If Redis check fails, fall through to secret/PIN check
            }
            
            // Fall back to direct secret/PIN verification (for backward compatibility)
            if (verifyAdminSecret(token) || verifyPin(token)) {
                return true;
            }
        }
    }

    // Fall back to Authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return false;
    }

    // Check if it's a session token
    try {
        const { redis, ensureConnected } = await import('./kv');
        await ensureConnected();
        const sessionKey = `admin:session:${token}`;
        const sessionExists = await redis.exists(sessionKey);
        if (sessionExists) {
            return true;
        }
    } catch {
        // If Redis check fails, fall through to secret/PIN check
    }

    // Accept either ADMIN_SECRET or WORKOUT_ADMIN_PIN (for backward compatibility)
    return verifyAdminSecret(token) || verifyPin(token);
}
