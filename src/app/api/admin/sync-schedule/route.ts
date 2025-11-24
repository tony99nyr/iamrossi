import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/fetch-calendar';
import { transformCalendarEvents } from '@/lib/transform-calendar-events';
import { fetchMHRSchedule, scrapeTeamDetails } from '@/lib/mhr-service';
import { getSettings, setSchedule, setMHRSchedule } from '@/lib/kv';

export async function POST(request: NextRequest) {
  try {
    // 1. Get Settings from KV
    const settings = await getSettings();
    const mhrTeamId = settings?.mhrTeamId || '19758';
    const mhrYear = settings?.mhrYear || '2025';

    // 2. Fetch MHR Schedule (for known opponents)
    console.log('Fetching MHR Schedule...');
    const mhrSchedule = await fetchMHRSchedule(mhrTeamId, mhrYear);
    console.log(`Fetched ${mhrSchedule.length} games from MHR.`);
    
    // Save MHR Schedule to KV
    await setMHRSchedule(mhrSchedule);

    // 2b. Fetch Main Team Stats
    console.log('Fetching Main Team Stats...');
    const mainTeamStats = await scrapeTeamDetails(mhrTeamId, mhrYear);
    console.log(`Fetched Main Team Stats:`, mainTeamStats);

    // 3. Fetch Calendar Events
    console.log('Fetching Calendar Events...');
    const calendarEvents = await fetchCalendarEvents();
    console.log(`Fetched ${calendarEvents.length} events from Calendar.`);

    // 4. Transform and Merge
    console.log('Transforming and Merging...');
    const schedule = await transformCalendarEvents(calendarEvents, mhrSchedule, mhrYear, mainTeamStats);

    // 5. Save Schedule to KV
    await setSchedule(schedule);

    return NextResponse.json({ 
        success: true, 
        message: `Successfully synced ${schedule.length} games`,
        count: schedule.length 
    });

  } catch (error: any) {
    console.error('Sync failed:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
