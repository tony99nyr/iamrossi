import { NextRequest, NextResponse } from 'next/server';
import { getStatSessions, saveStatSession, deleteStatSession } from '@/lib/kv';
import { verifyAuthToken } from '@/lib/auth';
import { StatSession } from '@/types';
import { statSessionSchema, deleteSessionSchema, safeValidateRequest } from '@/lib/validation';
import { logError } from '@/lib/logger';

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
    logError('API Error', error, { method: 'GET', path: '/api/stats' });
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = safeValidateRequest(statSessionSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid session data' },
        { status: 400 }
      );
    }

    await saveStatSession(validation.data as StatSession);
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('API Error', error, { method: 'POST', path: '/api/stats' });
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
    const body = await request.json();
    const validation = safeValidateRequest(deleteSessionSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    await deleteStatSession(validation.data.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('API Error', error, { method: 'DELETE', path: '/api/stats' });
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
