import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { getAdaptiveStrategyConfig } from '@/lib/kv';
import { tradingStartSchema, safeValidateRequest } from '@/lib/validation';

/**
 * POST /api/trading/paper/start
 * Start a new paper trading session
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate request body
    const body = await request.json().catch(() => ({}));
    const validation = safeValidateRequest(tradingStartSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { name } = validation.data;

    // Get config from Redis or use default
    const config = await getAdaptiveStrategyConfig();

    if (!config) {
      return NextResponse.json(
        { error: 'No strategy config found. Please save a config first using pnpm eth:save-config' },
        { status: 400 }
      );
    }

    // Start session
    const session = await PaperTradingService.startSession(config, name);

    return NextResponse.json({ 
      session,
      message: 'Paper trading session started successfully' 
    });
  } catch (error) {
    console.error('Error starting paper trading session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to start paper trading session';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

