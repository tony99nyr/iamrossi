import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { getAdaptiveStrategyConfig } from '@/lib/kv';
import { tradingStartSchema, safeValidateRequest } from '@/lib/validation';
import { isValidAsset, type TradingAsset } from '@/lib/asset-config';
import { withApiSecurity } from '@/lib/api-security';

/**
 * POST /api/trading/paper/start
 * Start a new paper trading session
 */
export async function POST(request: NextRequest) {
  return withApiSecurity(
    request,
    async (req: NextRequest) => {
      // Verify authentication
      if (!(await verifyAdminAuth(req))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Validate request body
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      const validation = safeValidateRequest(tradingStartSchema, body);

      if (!validation.success) {
        return NextResponse.json(
          { error: validation.issues[0]?.message || 'Invalid request body' },
          { status: 400 }
        );
      }

      const { name, asset } = validation.data;

      // Validate asset
      const tradingAsset: TradingAsset = isValidAsset(asset) ? asset : 'eth';

      // Get config from Redis (asset-specific)
      const config = await getAdaptiveStrategyConfig(tradingAsset);

      if (!config) {
        return NextResponse.json(
          { error: 'No strategy config found. Please save a config first using pnpm eth:save-config' },
          { status: 400 }
        );
      }

      // Start session
      const session = await PaperTradingService.startSession(config, name, tradingAsset);

      return NextResponse.json({ 
        session,
        message: 'Paper trading session started successfully' 
      });
    },
    {
      rateLimitPrefix: 'trading_paper_start',
      timeoutMs: 30000,
      requireBody: true,
    }
  );
}

