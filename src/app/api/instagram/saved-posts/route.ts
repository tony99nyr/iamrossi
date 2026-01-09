import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchInstagramSavedPosts, validateSessionCookie } from '@/lib/instagram-service';
import { getInstagramSavedPosts, setInstagramSavedPosts } from '@/lib/kv';
import { logError } from '@/lib/logger';

/**
 * GET /api/instagram/saved-posts
 * Fetch saved/bookmarked posts from Instagram
 * 
 * Requires admin authentication.
 * Uses INSTAGRAM_SESSION_COOKIE environment variable for authentication.
 * Results are cached for 1 hour.
 * 
 * Query parameters:
 * - refresh: Set to "1" to force refresh from Instagram (bypass cache)
 * - maxPosts: Maximum number of posts to fetch (default: 50)
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === '1';
    const maxPostsParam = searchParams.get('maxPosts');
    const maxPosts = maxPostsParam ? parseInt(maxPostsParam, 10) : 50;

    // Validate maxPosts
    if (isNaN(maxPosts) || maxPosts < 1 || maxPosts > 200) {
      return NextResponse.json(
        { error: 'maxPosts must be between 1 and 200' },
        { status: 400 }
      );
    }

    // Check cache first (unless refresh is requested)
    if (!refresh) {
      const cached = await getInstagramSavedPosts();
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    // Get session cookie from environment
    const sessionCookie = process.env.INSTAGRAM_SESSION_COOKIE;
    
    if (!sessionCookie) {
      logError('Instagram API Error', new Error('INSTAGRAM_SESSION_COOKIE not configured'), {
        method: 'GET',
        path: '/api/instagram/saved-posts',
      });
      return NextResponse.json(
        { error: 'Instagram session cookie not configured' },
        { status: 500 }
      );
    }

    // Validate cookie format
    if (!validateSessionCookie(sessionCookie)) {
      logError('Instagram API Error', new Error('Invalid session cookie format'), {
        method: 'GET',
        path: '/api/instagram/saved-posts',
      });
      return NextResponse.json(
        { error: 'Invalid session cookie format' },
        { status: 500 }
      );
    }

    // Fetch from Instagram
    const posts = await fetchInstagramSavedPosts(sessionCookie, maxPosts);

    // Cache the results
    await setInstagramSavedPosts(posts);

    return NextResponse.json(posts);
  } catch (error) {
    logError('Instagram API Error', error, {
      method: 'GET',
      path: '/api/instagram/saved-posts',
    });

    // Return generic error message to client
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for specific error types
    if (errorMessage.includes('Invalid session cookie') || errorMessage.includes('session cookie')) {
      return NextResponse.json(
        { error: 'Invalid or expired session cookie. Please update INSTAGRAM_SESSION_COOKIE.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch saved posts' },
      { status: 500 }
    );
  }
}

