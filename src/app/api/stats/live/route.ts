import { NextRequest, NextResponse } from 'next/server';
import { getStatSessions, getSelectedLiveSession } from '@/lib/kv';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const sessions = await getStatSessions();
    
    // Filter for live sessions (no endTime)
    const liveSessions = sessions.filter(s => !s.endTime);
    
    if (liveSessions.length === 0) {
      return NextResponse.json({ session: null });
    }

    // Get selected session from Redis
    const selectedId = await getSelectedLiveSession();
    
    let selectedSession = null;
    
    if (selectedId) {
      selectedSession = liveSessions.find(s => s.id === selectedId);
    }
    
    // If no selected session or selected not found, use first live session (oldest by startTime)
    if (!selectedSession) {
      selectedSession = liveSessions.sort((a, b) => a.startTime - b.startTime)[0];
    }
    
    return NextResponse.json({ session: selectedSession });
  } catch (error) {
    logger.apiError('GET', '/api/stats/live', error);
    return NextResponse.json({ error: 'Failed to fetch live session' }, { status: 500 });
  }
}

