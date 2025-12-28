import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';

/**
 * GET /api/trading/paper/status
 * Get current paper trading session status
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await PaperTradingService.getActiveSession();

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

