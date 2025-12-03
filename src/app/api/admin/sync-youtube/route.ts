import { NextRequest, NextResponse } from 'next/server';
import { fetchYouTubeVideos } from '@/lib/youtube-service';
import { setYouTubeVideos, getSyncStatus, setSyncStatus } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';
import { debugLog } from '@/lib/logger';

// Force Node.js runtime (required for Playwright browser automation)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for scraping

// Cooldown period: 2 hours in milliseconds
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check current sync status
    const syncStatus = await getSyncStatus();

    // Check if already revalidating
    if (syncStatus.isRevalidating) {
      return NextResponse.json({ 
        message: 'Sync already in progress',
        status: syncStatus
      }, { status: 429 });
    }

    // Check cooldown
    if (syncStatus.lastSyncTime) {
      const timeSinceLastSync = Date.now() - syncStatus.lastSyncTime;
      if (timeSinceLastSync < COOLDOWN_MS) {
        const remainingMs = COOLDOWN_MS - timeSinceLastSync;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        
        return NextResponse.json({ 
          message: `Cooldown active. Please wait ${remainingMinutes} minutes.`,
          status: syncStatus,
          remainingMs
        }, { status: 429 });
      }
    }

    // Set revalidating flag
    await setSyncStatus({
      ...syncStatus,
      isRevalidating: true,
      lastError: null
    });

    debugLog('[YouTube Sync] Starting sync...');

    // Fetch videos from YouTube
    const videos = await fetchYouTubeVideos();
    debugLog(`[YouTube Sync] Fetched ${videos.length} videos`);

    // Save to KV
    await setYouTubeVideos(videos);

    // Update sync status
    await setSyncStatus({
      lastSyncTime: Date.now(),
      isRevalidating: false,
      lastError: null
    });

    debugLog('[YouTube Sync] Sync completed successfully');

    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${videos.length} videos`,
      count: videos.length,
      videos: videos.slice(0, 5) // Return first 5 for preview
    });

  } catch (error: any) {
    console.error('[YouTube Sync] Sync failed:', error);

    // Update sync status with error
    const currentStatus = await getSyncStatus();
    await setSyncStatus({
      ...currentStatus,
      isRevalidating: false,
      lastError: error.message || 'Unknown error'
    });

    return NextResponse.json({ 
      error: error.message || 'Sync failed',
      details: error.stack
    }, { status: 500 });
  }
}

// GET endpoint to check sync status
export async function GET() {
  try {
    const syncStatus = await getSyncStatus();
    
    // Calculate if cooldown is active
    let cooldownActive = false;
    let remainingMs = 0;
    
    if (syncStatus.lastSyncTime) {
      const timeSinceLastSync = Date.now() - syncStatus.lastSyncTime;
      if (timeSinceLastSync < COOLDOWN_MS) {
        cooldownActive = true;
        remainingMs = COOLDOWN_MS - timeSinceLastSync;
      }
    }

    return NextResponse.json({
      ...syncStatus,
      cooldownActive,
      remainingMs,
      cooldownMinutes: Math.ceil(remainingMs / 60000)
    });
  } catch (error: any) {
    console.error('[YouTube Sync] Failed to get status:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}
