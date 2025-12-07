import { NextResponse } from 'next/server';
import { getCalendarSyncStatus } from '@/lib/kv';

export async function GET() {
  try {
    const status = await getCalendarSyncStatus();
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error('[Calendar Sync Status] Failed to get status:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}

