import { NextRequest, NextResponse } from 'next/server';
import { getRoster, setRoster, Player } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';

export async function GET() {
  try {
    const roster = await getRoster();
    return NextResponse.json(roster);
  } catch (error) {
    console.error('Error loading roster:', error);
    return NextResponse.json({ error: 'Failed to load roster' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { roster } = body;

    if (!Array.isArray(roster)) {
      return NextResponse.json({ error: 'Invalid roster format' }, { status: 400 });
    }

    // Validate each player
    for (const player of roster) {
      if (!player.id || typeof player.jerseyNumber !== 'string' || typeof player.name !== 'string') {
        return NextResponse.json({ error: 'Invalid player data' }, { status: 400 });
      }
    }

    // Save roster to KV
    await setRoster(roster as Player[]);

    return NextResponse.json({ success: true, message: 'Roster saved successfully' });
  } catch (error) {
    console.error('Error saving roster:', error);
    return NextResponse.json({ error: 'Failed to save roster' }, { status: 500 });
  }
}
