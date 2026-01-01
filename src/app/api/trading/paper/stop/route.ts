import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { isValidAsset, type TradingAsset } from '@/lib/asset-config';
import { withApiSecurity } from '@/lib/api-security';

/**
 * POST /api/trading/paper/stop
 * Stop the current paper trading session
 */
export async function POST(request: NextRequest) {
  return withApiSecurity(
    request,
    async (req: NextRequest) => {
      // Verify authentication
      if (!(await verifyAdminAuth(req))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Get asset from query parameter (default to 'eth' for backward compatibility)
      const { searchParams } = new URL(req.url);
      const assetParam = searchParams.get('asset') || 'eth';
      const asset: TradingAsset = isValidAsset(assetParam) ? assetParam : 'eth';

      // Stop session
      const session = await PaperTradingService.stopSession(undefined, asset);

      return NextResponse.json({ 
        session,
        message: 'Paper trading session stopped successfully' 
      });
    },
    {
      rateLimitPrefix: 'trading_paper_stop',
      timeoutMs: 30000,
      requireBody: false,
    }
  );
}

