import { NextRequest, NextResponse } from 'next/server';
import { verifyPin, createAuthToken, AUTH_COOKIE_CONFIG } from '@/lib/auth';
import { pinVerifySchema, safeValidateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

// In-memory rate limiting store (resets on server restart)
// In production, consider using Redis or a database
interface RateLimitEntry {
    attempts: number;
    lockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function getClientIdentifier(request: NextRequest): string {
    // Use IP address as identifier
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    return ip;
}

function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; lockedUntil?: number } {
    const entry = rateLimitStore.get(identifier);
    
    if (!entry) {
        return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }
    
    // Check if still locked
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
        return {
            allowed: false,
            remainingAttempts: 0,
            lockedUntil: entry.lockedUntil,
        };
    }
    
    // Lock expired, reset
    if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
        rateLimitStore.delete(identifier);
        return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }
    
    return {
        allowed: entry.attempts < MAX_ATTEMPTS,
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - entry.attempts),
    };
}

function recordFailedAttempt(identifier: string): void {
    const entry = rateLimitStore.get(identifier) || { attempts: 0 };
    entry.attempts += 1;
    
    if (entry.attempts >= MAX_ATTEMPTS) {
        entry.lockedUntil = Date.now() + COOLDOWN_MS;
    }
    
    rateLimitStore.set(identifier, entry);
}

function resetAttempts(identifier: string): void {
    rateLimitStore.delete(identifier);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validation = safeValidateRequest(pinVerifySchema, body);

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { pin } = validation.data;
        
        const identifier = getClientIdentifier(request);
        const rateLimit = checkRateLimit(identifier);
        
        // Check if rate limited
        if (!rateLimit.allowed) {
            const remainingTime = rateLimit.lockedUntil 
                ? Math.ceil((rateLimit.lockedUntil - Date.now()) / 1000)
                : 0;
                
            return NextResponse.json(
                {
                    error: 'Too many failed attempts',
                    remainingAttempts: 0,
                    cooldownSeconds: remainingTime,
                },
                { status: 429 }
            );
        }
        
        // Verify PIN
        const isValid = verifyPin(pin);
        
        if (!isValid) {
            recordFailedAttempt(identifier);
            const updatedLimit = checkRateLimit(identifier);
            
            return NextResponse.json(
                {
                    error: 'Invalid PIN',
                    remainingAttempts: updatedLimit.remainingAttempts,
                },
                { status: 401 }
            );
        }
        
        // PIN is correct - reset attempts and create auth token
        resetAttempts(identifier);
        const token = createAuthToken();
        
        const response = NextResponse.json(
            { success: true, token },
            { status: 200 }
        );
        
        // Set auth cookie
        response.cookies.set(
            AUTH_COOKIE_CONFIG.name,
            token,
            {
                maxAge: AUTH_COOKIE_CONFIG.maxAge,
                httpOnly: AUTH_COOKIE_CONFIG.httpOnly,
                secure: AUTH_COOKIE_CONFIG.secure,
                sameSite: AUTH_COOKIE_CONFIG.sameSite,
                path: AUTH_COOKIE_CONFIG.path,
            }
        );
        
        return response;
    } catch (error) {
        logger.apiError('POST', '/api/rehab/verify-pin', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
