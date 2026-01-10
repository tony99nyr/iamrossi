import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAllInstagramPosts, setInstagramPost } from '@/lib/kv';
import { logError } from '@/lib/logger';
import type { InstagramPostsFilter } from '@/types';

/**
 * GET /api/instagram/posts
 * Fetch all Instagram posts with optional filters
 * 
 * Query parameters:
 * - labelId: Filter by label ID
 * - archived: Filter by archived status (true/false, undefined = all)
 * - authorUsername: Filter by author username
 * - maxPosts: Maximum number of posts to return
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const labelId = searchParams.get('labelId') || undefined;
    const archivedParam = searchParams.get('archived');
    const archived = archivedParam === null ? undefined : archivedParam === 'true';
    const authorUsername = searchParams.get('authorUsername') || undefined;

    const filter: InstagramPostsFilter = {
      labelId,
      archived,
      authorUsername,
    };

    // Get all posts from Redis
    let posts = await getAllInstagramPosts();

    // Apply filters
    if (filter.archived !== undefined) {
      posts = posts.filter(p => (p.archived ?? false) === filter.archived);
    }

    if (filter.labelId) {
      posts = posts.filter(p => p.labels?.includes(filter.labelId!));
    }

    if (filter.authorUsername) {
      posts = posts.filter(p => p.authorUsername === filter.authorUsername);
    }

    // Sort by saved date (newest saved first)
    // importedAt represents the order posts were saved (newest saved first on Instagram)
    // This is the best proxy for saved date since Instagram doesn't provide it in the API
    posts.sort((a, b) => {
      const dateA = a.importedAt || a.savedAt || a.postedAt || '';
      const dateB = b.importedAt || b.savedAt || b.postedAt || '';
      if (dateA && dateB) {
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      if (dateA) return -1;
      if (dateB) return 1;
      return 0;
    });

    // Apply maxPosts limit if specified
    const maxPostsParam = searchParams.get('maxPosts');
    if (maxPostsParam) {
      const maxPosts = parseInt(maxPostsParam, 10);
      if (!isNaN(maxPosts) && maxPosts > 0) {
        posts = posts.slice(0, maxPosts);
      }
    }

    return NextResponse.json({
      posts,
      totalCount: posts.length,
      filter,
    });
  } catch (error) {
    logError('Instagram Posts API Error', error, {
      method: 'GET',
      path: '/api/instagram/posts',
    });

    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/instagram/posts
 * Update a post (e.g., archive/unarchive, add/remove labels)
 */
export async function PATCH(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { shortcode, archived, labels } = body;

    if (!shortcode) {
      return NextResponse.json(
        { error: 'shortcode is required' },
        { status: 400 }
      );
    }

    const { getInstagramPost } = await import('@/lib/kv');
    const post = await getInstagramPost(shortcode);

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Update fields
    if (archived !== undefined) {
      post.archived = archived;
    }

    if (labels !== undefined) {
      post.labels = labels;
    }

    await setInstagramPost(post);

    return NextResponse.json({ post });
  } catch (error) {
    logError('Instagram Posts API Error', error, {
      method: 'PATCH',
      path: '/api/instagram/posts',
    });

    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

