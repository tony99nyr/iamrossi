import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { fetchInstagramSavedPosts, validateSessionCookie } from '@/lib/instagram-service';
import { getAllInstagramPosts } from '@/lib/kv';
import { logError } from '@/lib/logger';

/**
 * POST /api/instagram/posts/sync
 * Scrape Instagram saved posts and import new ones to Redis
 * 
 * This endpoint:
 * 1. Fetches saved posts from Instagram (up to 200 posts)
 * 2. Compares with existing posts in Redis
 * 3. Adds new posts (doesn't overwrite existing ones)
 * 4. Returns count of new posts added
 * 
 * NOTE: This is for incremental updates. For initial full import,
 * use the script: pnpm instagram:import
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get session cookie from environment
    const sessionCookie = process.env.INSTAGRAM_SESSION_COOKIE;
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Instagram session cookie not configured' },
        { status: 500 }
      );
    }

    // Validate cookie format
    if (!validateSessionCookie(sessionCookie)) {
      return NextResponse.json(
        { error: 'Invalid session cookie format' },
        { status: 500 }
      );
    }

    // Get existing posts from Redis
    const existingPosts = await getAllInstagramPosts();
    const existingShortcodes = new Set(existingPosts.map(p => p.shortcode));
    const existingPostsMap = new Map(existingPosts.map(p => [p.shortcode, p]));

    // Fetch from Instagram (get up to 200 posts)
    const scrapedData = await fetchInstagramSavedPosts(sessionCookie, 200);

    // IMPORTANT: Instagram's saved posts are already in the correct order (newest saved first)
    // We need to assign importedAt to ALL posts (new and existing) based on their position
    // This preserves the correct order when sorted by importedAt
    const baseTime = Date.now();
    const allPostsToSave = scrapedData.posts.map((post, index) => {
      // First post (index 0) is most recently saved, gets current time
      // Each subsequent post gets a slightly earlier time to preserve order
      const importedAt = new Date(baseTime - (index * 1000)).toISOString();
      const existing = existingPostsMap.get(post.shortcode);
      
      // For existing posts, preserve labels and archived status
      // For new posts, set defaults
      return {
        ...post,
        importedAt, // Update importedAt for ALL posts to reflect current order
        archived: existing?.archived ?? false,
        labels: existing?.labels ?? [],
      };
    });
    
    const newPosts = allPostsToSave.filter(post => !existingShortcodes.has(post.shortcode));
    const postsToSave = allPostsToSave;

    // Save new posts to Redis
    if (postsToSave.length > 0) {
      const { setInstagramPosts } = await import('@/lib/kv');
      await setInstagramPosts(postsToSave);
    }

    return NextResponse.json({
      success: true,
      newPostsCount: postsToSave.length,
      totalScraped: scrapedData.posts.length,
      alreadyExists: scrapedData.posts.length - newPosts.length,
      lastSynced: new Date().toISOString(),
    });
  } catch (error) {
    logError('Instagram Sync API Error', error, {
      method: 'POST',
      path: '/api/instagram/posts/sync',
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('Invalid session cookie') || errorMessage.includes('session cookie')) {
      return NextResponse.json(
        { error: 'Invalid or expired session cookie. Please update INSTAGRAM_SESSION_COOKIE.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to sync posts' },
      { status: 500 }
    );
  }
}

