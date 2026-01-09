import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import {
  getAllInstagramLabels,
  addInstagramLabel,
  updateInstagramLabel,
  deleteInstagramLabel,
} from '@/lib/kv';
import { logError } from '@/lib/logger';
import type { InstagramLabel } from '@/types';

/**
 * GET /api/instagram/labels
 * Get all labels
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const labels = await getAllInstagramLabels();
    return NextResponse.json({ labels });
  } catch (error) {
    logError('Instagram Labels API Error', error, {
      method: 'GET',
      path: '/api/instagram/labels',
    });

    return NextResponse.json(
      { error: 'Failed to fetch labels' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/instagram/labels
 * Create a new label
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Label name is required' },
        { status: 400 }
      );
    }

    // Check if label with same name already exists
    const existingLabels = await getAllInstagramLabels();
    if (existingLabels.some(l => l.name.toLowerCase() === name.toLowerCase().trim())) {
      return NextResponse.json(
        { error: 'Label with this name already exists' },
        { status: 400 }
      );
    }

    const newLabel: InstagramLabel = {
      id: `label-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: name.trim(),
      color: color || undefined,
      createdAt: new Date().toISOString(),
    };

    await addInstagramLabel(newLabel);

    return NextResponse.json({ label: newLabel }, { status: 201 });
  } catch (error) {
    logError('Instagram Labels API Error', error, {
      method: 'POST',
      path: '/api/instagram/labels',
    });

    return NextResponse.json(
      { error: 'Failed to create label' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/instagram/labels
 * Update a label
 */
export async function PATCH(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, color } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Label ID is required' },
        { status: 400 }
      );
    }

    const updates: Partial<InstagramLabel> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Label name must be a non-empty string' },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }
    if (color !== undefined) {
      updates.color = color || undefined;
    }

    await updateInstagramLabel(id, updates);

    const labels = await getAllInstagramLabels();
    const updatedLabel = labels.find(l => l.id === id);

    return NextResponse.json({ label: updatedLabel });
  } catch (error) {
    logError('Instagram Labels API Error', error, {
      method: 'PATCH',
      path: '/api/instagram/labels',
    });

    return NextResponse.json(
      { error: 'Failed to update label' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/instagram/labels
 * Delete a label
 */
export async function DELETE(request: NextRequest) {
  // Verify authentication
  if (!(await verifyAuthToken(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Label ID is required' },
        { status: 400 }
      );
    }

    await deleteInstagramLabel(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Instagram Labels API Error', error, {
      method: 'DELETE',
      path: '/api/instagram/labels',
    });

    return NextResponse.json(
      { error: 'Failed to delete label' },
      { status: 500 }
    );
  }
}

