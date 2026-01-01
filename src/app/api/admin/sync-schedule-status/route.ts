import { NextResponse } from 'next/server';
import { getCalendarSyncStatus, setCalendarSyncStatus } from '@/lib/kv';
import { logDebug } from '@/lib/logger';

const STUCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  try {
    let status = await getCalendarSyncStatus();
    
    // Check if stuck in revalidating state
    if (status.isRevalidating) {
      const timeSinceLastSync = status.lastSyncTime 
        ? Date.now() - status.lastSyncTime 
        : Infinity;
      
      // If stuck for more than 10 minutes, reset the flag
      if (!status.lastSyncTime || timeSinceLastSync > STUCK_TIMEOUT_MS) {
        logDebug('[Calendar Sync Status] Detected stuck revalidating flag, resetting');
        status = {
          ...status,
          isRevalidating: false,
          lastError: status.lastError || 'Previous sync was stuck and has been reset'
        };
        await setCalendarSyncStatus(status);
      }
    }
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error('[Calendar Sync Status] Failed to get status:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}

