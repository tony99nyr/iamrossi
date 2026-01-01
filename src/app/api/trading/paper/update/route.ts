import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { isValidAsset, type TradingAsset } from '@/lib/asset-config';

/**
 * POST /api/trading/paper/update
 * Update paper trading session (fetch price, calculate regime, execute trades)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get asset from query parameter (default to 'eth' for backward compatibility)
    const { searchParams } = new URL(request.url);
    const assetParam = searchParams.get('asset') || 'eth';
    const asset: TradingAsset = isValidAsset(assetParam) ? assetParam : 'eth';

    // Update session
    const session = await PaperTradingService.updateSession(undefined, asset);

    return NextResponse.json({ 
      session,
      message: 'Paper trading session updated successfully' 
    });
  } catch (error) {
    console.error('Error updating paper trading session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update paper trading session';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

