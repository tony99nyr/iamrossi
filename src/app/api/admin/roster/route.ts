import { NextRequest, NextResponse } from 'next/server';
import { getRoster, setRoster, Player } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';
import { rosterSchema, safeValidateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const roster = await getRoster();
    return NextResponse.json(roster);
  } catch (error) {
    logger.apiError('GET', '/api/admin/roster', error);
    return NextResponse.json({ error: 'Failed to load roster' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = safeValidateRequest(rosterSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid roster format' },
        { status: 400 }
      );
    }

    // Save roster to KV
    await setRoster(validation.data.players as Player[]);

    return NextResponse.json({ success: true, message: 'Roster saved successfully' });
  } catch (error) {
    logger.apiError('POST', '/api/admin/roster', error);
    return NextResponse.json({ error: 'Failed to save roster' }, { status: 500 });
  }
}
