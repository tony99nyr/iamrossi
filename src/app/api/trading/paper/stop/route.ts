import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';

/**
 * POST /api/trading/paper/stop
 * Stop the current paper trading session
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Stop session
    const session = await PaperTradingService.stopSession();

    return NextResponse.json({ 
      session,
      message: 'Paper trading session stopped successfully' 
    });
  } catch (error) {
    console.error('Error stopping paper trading session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to stop paper trading session';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

