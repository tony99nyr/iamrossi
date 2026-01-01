import { NextResponse } from 'next/server';
import { getSchedule } from '@/lib/kv';
import { logError } from '@/lib/logger';

export async function GET() {
  try {
    const schedule = await getSchedule();
    return NextResponse.json(schedule);
  } catch (error) {
    logError('API Error', error, { method: 'GET', path: '/api/schedule' });
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
