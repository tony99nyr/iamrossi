import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getInstagramPost, setInstagramPost } from '@/lib/kv';
import { logError } from '@/lib/logger';

/**
 * POST /api/instagram/posts/archive
 * Archive or unarchive a post
 * 
 * Body:
 * - shortcode: Post shortcode
 * - archived: boolean (true to archive, false to unarchive)
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { shortcode, archived } = body;

    if (!shortcode) {
      return NextResponse.json(
        { error: 'shortcode is required' },
        { status: 400 }
      );
    }

    if (typeof archived !== 'boolean') {
      return NextResponse.json(
        { error: 'archived must be a boolean' },
        { status: 400 }
      );
    }

    const post = await getInstagramPost(shortcode);

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    post.archived = archived;
    await setInstagramPost(post);

    return NextResponse.json({
      success: true,
      post: {
        shortcode: post.shortcode,
        archived: post.archived,
      },
    });
  } catch (error) {
    logError('Instagram Archive API Error', error, {
      method: 'POST',
      path: '/api/instagram/posts/archive',
    });

    return NextResponse.json(
      { error: 'Failed to update archive status' },
      { status: 500 }
    );
  }
}

