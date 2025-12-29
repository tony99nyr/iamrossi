import { NextResponse } from 'next/server';
import { isGoogleFitConfigured, GoogleFitTokenError, getAccessToken } from '@/lib/google-fit-service';

/**
 * Check if Google Fit is configured and token is valid
 * GET /api/google-fit/status
 * 
 * Note: This endpoint is public (no auth required) as it only returns
 * configuration status, not sensitive health data. The actual heart rate
 * data endpoint requires authentication.
 */
export async function GET() {
  try {
    const configured = isGoogleFitConfigured();
    
    if (!configured) {
      return NextResponse.json({ 
        configured: false,
        tokenValid: false,
        message: 'Google Fit credentials are not configured',
      });
    }
    
    // Try to get an access token to verify the refresh token is valid
    try {
      await getAccessToken();
      
      return NextResponse.json({ 
        configured: true,
        tokenValid: true,
        message: 'Google Fit is configured and token is valid',
      });
    } catch (error) {
      if (error instanceof GoogleFitTokenError) {
        return NextResponse.json({ 
          configured: true,
          tokenValid: false,
          message: error.message,
          code: error.code,
          requiresTokenRefresh: error.code === 'invalid_grant',
        });
      }
      
      // Re-throw unexpected errors
      throw error;
    }
  } catch (error) {
    console.error('Error checking Google Fit status:', error);
    return NextResponse.json(
      { 
        configured: false,
        tokenValid: false,
        error: 'Failed to check configuration status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

