import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/fetch-calendar';
import { transformCalendarEvents } from '@/lib/transform-calendar-events';
import { fetchMHRSchedule, scrapeTeamDetails } from '@/lib/mhr-service';
import { getSettings, setSchedule, setMHRSchedule } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';
import { debugLog } from '@/lib/logger';

// Force Node.js runtime (required for Playwright browser automation in mhr-service)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // 1. Get Settings from KV
    const settings = await getSettings();
    const mhrTeamId = settings?.mhrTeamId || '19758';
    const mhrYear = settings?.mhrYear || '2025';

    // 2. Fetch MHR Schedule (for known opponents)
    debugLog('Fetching MHR Schedule...');
    const mhrSchedule = await fetchMHRSchedule(mhrTeamId, mhrYear);
    debugLog(`Fetched ${mhrSchedule.length} games from MHR.`);
    
    // Save MHR Schedule to KV
    await setMHRSchedule(mhrSchedule);

    // 2b. Fetch Main Team Stats
    debugLog('Fetching Main Team Stats...');
    const mainTeamStats = await scrapeTeamDetails(mhrTeamId, mhrYear);
    debugLog('Fetched Main Team Stats:', mainTeamStats);

    // 3. Fetch Calendar Events
    debugLog('Fetching Calendar Events...');
    const calendarEvents = await fetchCalendarEvents();
    debugLog(`Fetched ${calendarEvents.length} events from Calendar.`);

    // 4. Transform and Merge
    debugLog('Transforming and Merging...');
    const schedule = await transformCalendarEvents(calendarEvents, mhrSchedule, mhrYear, mainTeamStats);

    // 5. Save Schedule to KV
    await setSchedule(schedule);

    return NextResponse.json({ 
        success: true, 
        message: `Successfully synced ${schedule.length} games`,
        count: schedule.length 
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Sync failed:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
