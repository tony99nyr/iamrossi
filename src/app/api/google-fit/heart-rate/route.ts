import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getDailyHeartRate, isGoogleFitConfigured } from '@/lib/google-fit-service';

/**
 * Fetch Google Fit heart rate data for a specific date
 * GET /api/google-fit/heart-rate?date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  const isAuthenticated = await verifyAuthToken(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if Google Fit is configured
    if (!isGoogleFitConfigured()) {
      return NextResponse.json(
        { error: 'Google Fit is not configured. Please set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN environment variables.' },
        { status: 503 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    
    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required (YYYY-MM-DD format)' },
        { status: 400 }
      );
    }
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }
    
    // Validate date is actually valid
    const dateObj = new Date(`${date}T00:00:00`);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date' },
        { status: 400 }
      );
    }
    
    // Prevent future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (dateObj > today) {
      return NextResponse.json(
        { error: 'Future dates not allowed' },
        { status: 400 }
      );
    }
    
    const heartRate = await getDailyHeartRate(date);
    return NextResponse.json(heartRate);
  } catch (error) {
    console.error('Error fetching Google Fit heart rate:', error);
    // Log detailed error server-side only
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', errorMessage);
    
    return NextResponse.json(
      { error: 'Failed to fetch Google Fit heart rate data' },
      { status: 500 }
    );
  }
}

