import { NextRequest, NextResponse } from 'next/server';
import { getDailyScores, isOuraConfigured } from '@/lib/oura-service';

/**
 * Fetch Oura scores for a specific date
 * GET /api/oura/scores?date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    // Check if Oura is configured
    if (!isOuraConfigured()) {
      return NextResponse.json(
        { error: 'Oura is not configured. Please set OURA_PAT environment variable.' },
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
    
    const scores = await getDailyScores(date);
    return NextResponse.json(scores);
  } catch (error) {
    console.error('Error fetching Oura scores:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to fetch Oura scores', details: errorMessage },
      { status: 500 }
    );
  }
}
