import { NextRequest, NextResponse } from 'next/server';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';

/**
 * GET /api/trading/paper/cron-update
 * Background cron job to update paper trading session
 * 
 * NOTE: Vercel Hobby plan only allows daily cron jobs, so this endpoint
 * is available for manual triggering or external cron services.
 * 
 * For automatic updates, use:
 * - UI auto-refresh (every 5 minutes when tab is open)
 * - Manual "Refresh Now" button
 * - External cron service (e.g., cron-job.org) calling this endpoint
 * - Upgrade to Vercel Pro for scheduled cron jobs
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!isValidCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active session
    const session = await PaperTradingService.getActiveSession();

    if (!session || !session.isActive) {
      return NextResponse.json({ 
        message: 'No active paper trading session',
        session: null
      });
    }

    // Update session (fetch price, calculate regime, execute trades)
    const updatedSession = await PaperTradingService.updateSession();

    return NextResponse.json({ 
      session: updatedSession,
      message: 'Paper trading session updated successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error updating paper trading session (cron):', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update paper trading session';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

