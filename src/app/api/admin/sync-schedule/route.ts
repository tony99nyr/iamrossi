import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { fetchCalendarEvents } from '@/lib/fetch-calendar';
import { transformCalendarEvents } from '@/lib/transform-calendar-events';
import { fetchMHRSchedule, scrapeTeamDetails } from '@/lib/mhr-service';

export async function POST(request: NextRequest) {
  try {
    // 1. Get Settings
    const settingsPath = path.join(process.cwd(), 'src/data/settings.json');
    let settings = { mhrTeamId: '19758', mhrYear: '2025' };
    if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }

    const { mhrTeamId, mhrYear } = settings;

    // 2. Fetch MHR Schedule (for known opponents)
    console.log('Fetching MHR Schedule...');
    const mhrSchedule = await fetchMHRSchedule(mhrTeamId, mhrYear);
    console.log(`Fetched ${mhrSchedule.length} games from MHR.`);
    
    // Save MHR Schedule for Past Games
    const mhrSchedulePath = path.join(process.cwd(), 'src/data/mhr-schedule.json');
    fs.writeFileSync(mhrSchedulePath, JSON.stringify(mhrSchedule, null, 2));

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

    // 5. Save Schedule
    const schedulePath = path.join(process.cwd(), 'src/data/schedule.json');
    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));

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
