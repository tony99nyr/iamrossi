/**
 * Resume Trading API Endpoint
 * Resumes trading after emergency stop
 */

import { NextRequest, NextResponse } from 'next/server';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { isValidAsset, type TradingAsset } from '@/lib/asset-config';
import { verifyAdminAuth } from '@/lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assetParam = searchParams.get('asset') || 'eth';
    const asset: TradingAsset = isValidAsset(assetParam) ? assetParam : 'eth';

    // Get current session
    const session = await PaperTradingService.getActiveSession(asset);
    if (!session) {
      return NextResponse.json(
        { error: 'No active session found' },
        { status: 404 }
      );
    }
    
    // Clear emergency stop flag
    session.isEmergencyStopped = false;
    session.emergencyStoppedAt = undefined;

    // Save updated session back to Redis (using the same method as PaperTradingService)
    const { getPaperSessionKey } = await import('@/lib/asset-config');
    const { ensureConnected, redis } = await import('@/lib/kv');
    await ensureConnected();
    const sessionKey = getPaperSessionKey(asset);
    await redis.set(sessionKey, JSON.stringify(session));

    return NextResponse.json({
      success: true,
      message: 'Trading resumed',
      session: {
        id: session.id,
        isEmergencyStopped: session.isEmergencyStopped,
      },
    });
  } catch (error) {
    console.error('[Resume Trading] Error:', error);
    return NextResponse.json(
      { error: 'Failed to resume trading' },
      { status: 500 }
    );
  }
}

