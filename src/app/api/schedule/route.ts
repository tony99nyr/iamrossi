import { NextResponse } from 'next/server';
import { getSchedule } from '@/lib/kv';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const schedule = await getSchedule();
    return NextResponse.json(schedule);
  } catch (error) {
    logger.apiError('GET', '/api/schedule', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
