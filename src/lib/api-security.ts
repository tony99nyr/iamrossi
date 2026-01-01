/**
 * API Security Utilities
 * Provides rate limiting, request size limits, timeout protection, and error sanitization
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from './rate-limit';

const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds for write operations
const DEFAULT_READ_TIMEOUT_MS = 10000; // 10 seconds for read operations

/**
 * Sanitize error messages for client responses
 * Returns generic error messages while logging detailed errors server-side
 */
export function sanitizeError(error: unknown, context: string): { clientMessage: string; serverMessage: string } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  // Log detailed error server-side
  const serverMessage = `[${context}] ${errorMessage}${errorStack ? `\n${errorStack}` : ''}`;
  console.error(serverMessage);
  
  // Return generic client message (no internal details)
  let clientMessage = 'An error occurred processing your request';
  
  // Map known error types to user-friendly messages
  if (errorMessage.includes('Unauthorized') || errorMessage.includes('authentication')) {
    clientMessage = 'Unauthorized';
  } else if (errorMessage.includes('validation') || errorMessage.includes('Invalid')) {
    clientMessage = 'Invalid request';
  } else if (errorMessage.includes('not found')) {
    clientMessage = 'Resource not found';
  } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
    clientMessage = 'Too many requests. Please try again later';
  } else if (errorMessage.includes('timeout')) {
    clientMessage = 'Request timed out. Please try again';
  }
  
  return { clientMessage, serverMessage };
}

/**
 * Check request size limit
 */
export async function checkRequestSize(request: NextRequest): Promise<{ valid: boolean; error?: string }> {
  const contentLength = request.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_REQUEST_SIZE) {
      return {
        valid: false,
        error: `Request body too large. Maximum size is ${MAX_REQUEST_SIZE / 1024}KB`,
      };
    }
  }
  
  // For requests without content-length, we'll check during body parsing
  return { valid: true };
}

/**
 * Apply timeout to async operations
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]);
}

/**
 * Rate limiting middleware for API routes
 */
export async function applyRateLimit(
  request: NextRequest,
  prefix: string = 'trading_api'
): Promise<{ allowed: boolean; response?: NextResponse }> {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, prefix);
  
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { 
        error: 'Too many requests. Please try again later',
        lockedUntil: rateLimit.lockedUntil,
      },
      { 
        status: 429,
        headers: {
          'Retry-After': rateLimit.lockedUntil 
            ? String(Math.ceil((rateLimit.lockedUntil - Date.now()) / 1000))
            : '300',
        },
      }
    );
    return { allowed: false, response };
  }
  
  return { allowed: true };
}

/**
 * Complete API security middleware wrapper
 * Applies rate limiting, request size checking, and timeout protection
 */
export async function withApiSecurity(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    rateLimitPrefix?: string;
    timeoutMs?: number;
    requireBody?: boolean;
  } = {}
): Promise<NextResponse> {
  const { rateLimitPrefix = 'trading_api', timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  
  try {
    // 1. Check rate limiting
    const rateLimitResult = await applyRateLimit(request, rateLimitPrefix);
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response;
    }
    
    // 2. Check request size
    const sizeCheck = await checkRequestSize(request);
    if (!sizeCheck.valid) {
      return NextResponse.json(
        { error: sizeCheck.error || 'Request too large' },
        { status: 413 }
      );
    }
    
    // 3. Apply timeout and execute handler
    const response = await withTimeout(
      handler(request),
      timeoutMs,
      'Request processing timed out'
    );
    
    return response;
  } catch (error) {
    const { clientMessage } = sanitizeError(error, 'API Security Middleware');
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.message.includes('timed out')) {
      return NextResponse.json(
        { error: 'Request timed out. Please try again' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: clientMessage },
      { status: 500 }
    );
  }
}

/**
 * Read-only API security wrapper (shorter timeout for GET requests)
 */
export async function withReadOnlyApiSecurity(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    rateLimitPrefix?: string;
  } = {}
): Promise<NextResponse> {
  return withApiSecurity(request, handler, {
    ...options,
    timeoutMs: DEFAULT_READ_TIMEOUT_MS,
    requireBody: false,
  });
}

