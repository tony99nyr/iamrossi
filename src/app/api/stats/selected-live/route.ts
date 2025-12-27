import { NextRequest, NextResponse } from 'next/server';
import { getStatSessions, setSelectedLiveSession, getSelectedLiveSession } from '@/lib/kv';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const selectedId = await getSelectedLiveSession();
    const sessions = await getStatSessions();
    const liveSessions = sessions.filter(s => !s.endTime);
    
    return NextResponse.json({ 
      selectedSessionId: selectedId,
      liveSessions 
    });
  } catch (error) {
    logger.apiError('GET', '/api/stats/selected-live', error);
    return NextResponse.json({ error: 'Failed to fetch selected session' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body.sessionId;
    
    if (sessionId && typeof sessionId === 'string') {
      // Verify session exists and is live
      const sessions = await getStatSessions();
      const session = sessions.find(s => s.id === sessionId && !s.endTime);
      
      if (!session) {
        return NextResponse.json({ error: 'Session not found or not live' }, { status: 404 });
      }
      
      await setSelectedLiveSession(sessionId);
      return NextResponse.json({ success: true });
    } else if (sessionId === null) {
      // Clear selection
      await setSelectedLiveSession(null);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
  } catch (error) {
    logger.apiError('POST', '/api/stats/selected-live', error);
    return NextResponse.json({ error: 'Failed to set selected session' }, { status: 500 });
  }
}

