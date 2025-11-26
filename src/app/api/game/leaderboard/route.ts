import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard, addScore, getScoreRank } from '@/lib/kv';

/**
 * GET /api/game/leaderboard
 * Get the top scores
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const leaderboard = await getLeaderboard(limit);

    return NextResponse.json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/leaderboard
 * Submit a new score
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, score } = body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || score < 0) {
      return NextResponse.json(
        { error: 'Valid score is required' },
        { status: 400 }
      );
    }

    // Sanitize name
    const sanitizedName = name.trim().slice(0, 20);

    // Get rank before saving
    const rank = await getScoreRank(score);

    // Save the score
    const timestamp = Date.now();
    await addScore(sanitizedName, score);

    // Get updated leaderboard to find the actual position
    const leaderboard = await getLeaderboard();
    const entry = leaderboard.find(
      (e) => e.name === sanitizedName && Math.abs(e.timestamp - timestamp) < 1000
    );

    return NextResponse.json({
      success: true,
      rank: entry?.rank || rank,
      timestamp,
      message: `Score saved! You ranked #${entry?.rank || rank}`,
    });
  } catch (error) {
    console.error('Error saving score:', error);
    return NextResponse.json(
      { error: 'Failed to save score' },
      { status: 500 }
    );
  }
}
