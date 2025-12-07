import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/fetch-calendar';
import { transformCalendarEvents } from '@/lib/transform-calendar-events';
import { fetchMHRSchedule, scrapeTeamDetails } from '@/lib/mhr-service';
import { getSettings, setSchedule, setMHRSchedule, getTeamMap, setTeamMap, isTeamCacheStale, getCalendarSyncStatus, setCalendarSyncStatus } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';
import { debugLog } from '@/lib/logger';

// Force Node.js runtime (required for Playwright browser automation in mhr-service)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for scraping

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Get current sync status
  const syncStatus = await getCalendarSyncStatus();
  
  // Set revalidating flag
  await setCalendarSyncStatus({
    ...syncStatus,
    isRevalidating: true,
    lastError: null
  });
  
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

    // 2b. Fetch Main Team Stats (with weekly caching)
    debugLog('Checking Main Team Stats cache...');
    const teamMap = await getTeamMap();
    const cachedMainTeam = teamMap[mhrTeamId];
    
    let mainTeamStats: { name: string; record: string; rating: string; logo: string };
    if (cachedMainTeam && !isTeamCacheStale(cachedMainTeam) && cachedMainTeam.record && cachedMainTeam.rating) {
      debugLog('Using cached Main Team Stats (fresh within 7 days)');
      mainTeamStats = {
        name: cachedMainTeam.name || '',
        record: cachedMainTeam.record,
        rating: cachedMainTeam.rating,
        logo: cachedMainTeam.logo || ''
      };
    } else {
      debugLog('Fetching fresh Main Team Stats (cache stale or missing)...');
      mainTeamStats = await scrapeTeamDetails(mhrTeamId, mhrYear);
      debugLog('Fetched Main Team Stats:', mainTeamStats);
      
      // Update cache with timestamp
      teamMap[mhrTeamId] = {
        ...mainTeamStats,
        lastUpdated: Date.now()
      };
      await setTeamMap(teamMap);
      debugLog('Updated Main Team Stats cache');
    }

    // 3. Fetch Calendar Events
    debugLog('Fetching Calendar Events...');
    const calendarEvents = await fetchCalendarEvents();
    debugLog(`Fetched ${calendarEvents.length} events from Calendar.`);

    // 4. Transform and Merge
    debugLog('Transforming and Merging...');
    const schedule = await transformCalendarEvents(
      calendarEvents, 
      mhrSchedule, 
      mhrYear, 
      { record: mainTeamStats.record, rating: mainTeamStats.rating }
    );

    // 5. Save Schedule to KV
    await setSchedule(schedule);

    // Update sync status - success
    await setCalendarSyncStatus({
      lastSyncTime: Date.now(),
      isRevalidating: false,
      lastError: null
    });

    return NextResponse.json({ 
        success: true, 
        message: `Successfully synced ${schedule.length} games`,
        count: schedule.length 
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Sync failed:', error);
    
    // Update sync status - error
    await setCalendarSyncStatus({
      ...syncStatus,
      isRevalidating: false,
      lastError: error.message || 'Sync failed'
    });
    
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
