import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import type { Trade } from '@/types';

/**
 * GET /api/trading/audit
 * Get all trades with audit data for the active paper trading session
 * 
 * Query parameters:
 * - startDate: Filter trades from this date (ISO string)
 * - endDate: Filter trades to this date (ISO string)
 * - type: Filter by trade type ('buy' | 'sell')
 * - outcome: Filter by outcome ('win' | 'loss' | 'breakeven' | 'pending')
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await PaperTradingService.getActiveSession();

    if (!session) {
      return NextResponse.json({ 
        trades: [],
        message: 'No active paper trading session' 
      });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type') as 'buy' | 'sell' | null;
    const outcome = searchParams.get('outcome') as 'win' | 'loss' | 'breakeven' | 'pending' | null;

    // Filter trades
    let filteredTrades: Trade[] = [...session.trades];

    // Filter by date range
    if (startDate) {
      const startTime = new Date(startDate).getTime();
      filteredTrades = filteredTrades.filter(t => t.timestamp >= startTime);
    }
    if (endDate) {
      const endTime = new Date(endDate).getTime();
      filteredTrades = filteredTrades.filter(t => t.timestamp <= endTime);
    }

    // Filter by type
    if (type) {
      filteredTrades = filteredTrades.filter(t => t.type === type);
    }

    // Filter by outcome
    if (outcome) {
      filteredTrades = filteredTrades.filter(t => {
        if (t.type === 'buy') {
          return outcome === 'pending';
        }
        if (t.pnl === undefined) {
          return outcome === 'pending';
        }
        if (t.pnl > 0) {
          return outcome === 'win';
        }
        if (t.pnl < 0) {
          return outcome === 'loss';
        }
        return outcome === 'breakeven';
      });
    }

    // Sort by timestamp (newest first)
    filteredTrades.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ 
      trades: filteredTrades,
      total: filteredTrades.length,
      sessionId: session.id,
      sessionStartedAt: session.startedAt,
    });
  } catch (error) {
    console.error('Error fetching trade audit:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trade audit' },
      { status: 500 }
    );
  }
}

