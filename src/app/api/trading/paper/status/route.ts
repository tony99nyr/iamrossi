import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { isValidAsset, type TradingAsset } from '@/lib/asset-config';

/**
 * GET /api/trading/paper/status
 * Get current paper trading session status
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get asset from query parameter (default to 'eth' for backward compatibility)
    const { searchParams } = new URL(request.url);
    const assetParam = searchParams.get('asset') || 'eth';
    const asset: TradingAsset = isValidAsset(assetParam) ? assetParam : 'eth';

    const session = await PaperTradingService.getActiveSession(asset);

    if (!session) {
      return NextResponse.json({ 
        session: null,
        message: 'No active paper trading session' 
      });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error fetching paper trading status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch paper trading status' },
      { status: 500 }
    );
  }
}

