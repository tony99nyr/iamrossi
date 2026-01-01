import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, verifyPin, createAuthToken, ADMIN_AUTH_COOKIE_CONFIG, getClientIdentifier } from '@/lib/auth';
import { adminVerifySchema, safeValidateRequest } from '@/lib/validation';
import { logError } from '@/lib/logger';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = safeValidateRequest(adminVerifySchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { secret } = validation.data;
    
    // Check rate limiting
    const identifier = getClientIdentifier(request);
    const rateLimit = await checkRateLimit(identifier, 'rate_limit:admin_verify');
    
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

    // Try ADMIN_SECRET first, then fall back to WORKOUT_ADMIN_PIN
    const isValid = verifyAdminSecret(secret) || verifyPin(secret);
    
    if (!isValid) {
      await recordFailedAttempt(identifier, 'rate_limit:admin_verify');
      const updatedLimit = await checkRateLimit(identifier, 'rate_limit:admin_verify');
      
      return NextResponse.json(
        {
          error: 'Invalid secret',
          remainingAttempts: updatedLimit.remainingAttempts,
        },
        { status: 401 }
      );
    }

    // Authentication successful - reset rate limit and create token
    await resetRateLimit(identifier, 'rate_limit:admin_verify');
    const token = createAuthToken();
    
    // Store session token in Redis with TTL matching cookie maxAge
    const { redis, ensureConnected } = await import('@/lib/kv');
    await ensureConnected();
    const sessionKey = `admin:session:${token}`;
    await redis.setEx(sessionKey, ADMIN_AUTH_COOKIE_CONFIG.maxAge, '1');
    
    const response = NextResponse.json({ 
      success: true, 
      message: 'Authentication successful',
      token 
    });
    
    // Set secure HTTP-only cookie
    response.cookies.set(
      ADMIN_AUTH_COOKIE_CONFIG.name,
      token,
      {
        maxAge: ADMIN_AUTH_COOKIE_CONFIG.maxAge,
        httpOnly: ADMIN_AUTH_COOKIE_CONFIG.httpOnly,
        secure: ADMIN_AUTH_COOKIE_CONFIG.secure,
        sameSite: ADMIN_AUTH_COOKIE_CONFIG.sameSite,
        path: ADMIN_AUTH_COOKIE_CONFIG.path,
      }
    );
    
    return response;
  } catch (error) {
    logError('API Error', error, { method: 'POST', path: '/api/admin/verify' });
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
