import { NextResponse } from 'next/server';
import { getEnrichedGames } from '@/lib/kv';

export async function GET() {
  try {
    const enrichedGames = await getEnrichedGames();
    return NextResponse.json({
      enrichedGamesLastUpdated: enrichedGames?.lastUpdated || null
    });
  } catch (error: unknown) {
    console.error('[Cache Info] Failed to get cache info:', error);
    return NextResponse.json({ error: 'Failed to get cache info' }, { status: 500 });
  }
}

