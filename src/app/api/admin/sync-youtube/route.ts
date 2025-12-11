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

    // Check cooldown first - if past cooldown, we should sync regardless of revalidating flag
    const timeSinceLastSync = syncStatus.lastSyncTime 
      ? Date.now() - syncStatus.lastSyncTime 
      : Infinity;
    const isPastCooldown = !syncStatus.lastSyncTime || timeSinceLastSync >= COOLDOWN_MS;

    // Check if already revalidating, but allow if past cooldown (might be from optimistic update)
    if (syncStatus.isRevalidating && !isPastCooldown) {
      const stuckTimeout = 10 * 60 * 1000; // 10 minutes - if no sync completed in this time, consider it stuck
      
      // If lastSyncTime is null or very old, and we're marked as revalidating, it's likely stuck
      if (!syncStatus.lastSyncTime || timeSinceLastSync > stuckTimeout) {
        // Reset stuck revalidating flag
        debugLog('[YouTube Sync] Resetting stuck revalidating flag (no recent sync activity)');
        await setSyncStatus({
          ...syncStatus,
          isRevalidating: false,
          lastError: syncStatus.lastError || 'Previous sync was stuck and has been reset'
        });
      } else {
        // Within cooldown and revalidating - sync is likely in progress
        return NextResponse.json({ 
          error: 'Sync already in progress',
          message: 'A sync operation is currently running. Please wait for it to complete.',
          status: syncStatus
        }, { status: 429 });
      }
    }

    // Check cooldown (only if not already handled above)
    if (!isPastCooldown) {
      const remainingMs = COOLDOWN_MS - timeSinceLastSync;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      
      return NextResponse.json({ 
        error: 'Cooldown active',
        message: `Please wait ${remainingMinutes} minutes before syncing again. This helps prevent YouTube rate limiting.`,
        status: syncStatus,
        remainingMs,
        remainingMinutes
      }, { status: 429 });
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

  } catch (error: unknown) {
    console.error('[YouTube Sync] Sync failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Check if this is a rate limit error from YouTube
    const isRateLimited = errorMessage.toLowerCase().includes('rate limit') || 
                         errorMessage.toLowerCase().includes('429') ||
                         errorMessage.toLowerCase().includes('too many requests');

    // Update sync status with error
    const currentStatus = await getSyncStatus();
    await setSyncStatus({
      ...currentStatus,
      isRevalidating: false,
      lastError: errorMessage
    });

    // Return 429 for rate limiting, 500 for other errors
    if (isRateLimited) {
      return NextResponse.json({ 
        error: 'YouTube rate limit exceeded. Please wait before trying again.',
        message: errorMessage,
        retryAfter: 'Please wait at least 1 hour before retrying.',
        details: errorStack
      }, { status: 429 });
    }

    return NextResponse.json({ 
      error: errorMessage || 'Sync failed',
      details: errorStack
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
  } catch (error: unknown) {
    console.error('[YouTube Sync] Failed to get status:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}
