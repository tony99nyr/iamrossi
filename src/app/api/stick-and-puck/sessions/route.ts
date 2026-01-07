import { NextRequest, NextResponse } from 'next/server';
import { getStickAndPuckSessions, setStickAndPuckSessions } from '@/lib/kv';
import { fetchStickAndPuckSessions } from '@/lib/daysmart-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stick-and-puck/sessions
 * Get all stick and puck sessions (cached in Redis, refreshed daily)
 * Query params:
 *   - refresh=1: Force refresh from DaySmart API
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = await getStickAndPuckSessions();
      if (cached.length > 0) {
        // Check if cache is still valid (less than 24 hours old)
        // Since we use setEx with 24h TTL, if data exists, it's fresh
        return NextResponse.json({
          sessions: cached,
          cached: true,
        });
      }
    }

    // Fetch fresh data from DaySmart API
    const sessions = await fetchStickAndPuckSessions();

    // Cache the results
    await setStickAndPuckSessions(sessions);

    return NextResponse.json({
      sessions,
      cached: false,
    });
  } catch (error) {
    console.error('[Stick and Puck API] Error:', error);
    
    // Try to return cached data as fallback
    try {
      const cached = await getStickAndPuckSessions();
      if (cached.length > 0) {
        return NextResponse.json({
          sessions: cached,
          cached: true,
          error: 'Failed to refresh, using cached data',
        });
      }
    } catch (cacheError) {
      console.error('[Stick and Puck API] Cache fallback failed:', cacheError);
    }

    return NextResponse.json(
      { error: 'Failed to fetch stick and puck sessions' },
      { status: 500 }
    );
  }
}








