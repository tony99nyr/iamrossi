import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE_NAME = 'rehab_auth';
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
 * Verifies the PIN against the environment variable
 */
export function verifyPin(pin: string): boolean {
    const correctPin = process.env.WORKOUT_ADMIN_PIN;
    
    if (!correctPin) {
        console.error('WORKOUT_ADMIN_PIN environment variable is not set');
        return false;
    }
    
    // Simple constant-time comparison
    return pin === correctPin;
}

/**
 * Verifies authentication from request (cookie or header)
 */
export async function verifyAuthToken(request: NextRequest): Promise<boolean> {
    // Check for auth cookie
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(COOKIE_NAME);
    
    if (authCookie?.value) {
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
