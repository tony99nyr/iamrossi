import { NextResponse } from 'next/server';
import { isGoogleFitConfigured } from '@/lib/google-fit-service';

/**
 * Check if Google Fit is configured
 * GET /api/google-fit/status
 * 
 * Note: This endpoint is public (no auth required) as it only returns
 * configuration status, not sensitive health data. The actual heart rate
 * data endpoint requires authentication.
 */
export async function GET() {
  try {
    const configured = isGoogleFitConfigured();
    return NextResponse.json({ configured });
  } catch (error) {
    console.error('Error checking Google Fit status:', error);
    return NextResponse.json(
      { error: 'Failed to check configuration status' },
      { status: 500 }
    );
  }
}

