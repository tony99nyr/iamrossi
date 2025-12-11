import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { isGoogleFitConfigured } from '@/lib/google-fit-service';

/**
 * Check if Google Fit is configured
 * GET /api/google-fit/status
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  const isAuthenticated = await verifyAuthToken(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ configured: isGoogleFitConfigured() });
}

