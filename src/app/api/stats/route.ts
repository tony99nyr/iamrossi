import { NextRequest, NextResponse } from 'next/server';
import { getStatSessions, saveStatSession, deleteStatSession } from '@/lib/kv';
import { verifyAuthToken } from '@/lib/auth';
import { StatSession } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sessions = await getStatSessions();
    
    if (id) {
      const session = sessions.find(s => s.id === id);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json(session);
    }
    
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching stat sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await request.json() as StatSession;
    
    // Basic validation
    if (!session.id || !session.date || !session.recorderName) {
      return NextResponse.json({ error: 'Invalid session data' }, { status: 400 });
    }

    await saveStatSession(session);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving stat session:', error);
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // Verify auth
  const isAuth = await verifyAuthToken(request);
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    await deleteStatSession(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
