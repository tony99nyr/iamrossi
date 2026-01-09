import { NextRequest, NextResponse } from 'next/server';
import { sendDailySummary } from '@/lib/daily-summary';
import crypto from 'crypto';

/**
 * GET /api/trading/daily-summary
 * 
 * Sends a daily summary notification to Discord with trading status for ETH and BTC.
 * 
 * This endpoint:
 * 1. Fetches active sessions for both ETH and BTC
 * 2. Calculates health metrics, portfolio status, and next actions
 * 3. Formats and sends a comprehensive summary to Discord
 * 
 * Authentication:
 * - Accepts TRADING_UPDATE_TOKEN (recommended for third-party cron services)
 * - Also accepts CRON_SECRET (for backward compatibility with GitHub Actions)
 * 
 * Scheduling:
 * - Should be called daily at 12pm Eastern Time (17:00 UTC)
 * - Can be scheduled via external cron service (cron-job.org) or GitHub Actions
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication - accept either TRADING_UPDATE_TOKEN or CRON_SECRET
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    const tradingUpdateToken = process.env.TRADING_UPDATE_TOKEN;
    const cronSecret = process.env.CRON_SECRET;
    
    let isValid = false;
    
    // Check TRADING_UPDATE_TOKEN first
    if (tradingUpdateToken) {
      try {
        const tokenBuffer = Buffer.from(token, 'utf8');
        const correctBuffer = Buffer.from(tradingUpdateToken, 'utf8');
        
        if (tokenBuffer.length === correctBuffer.length) {
          isValid = crypto.timingSafeEqual(tokenBuffer, correctBuffer);
        }
      } catch {
        // Invalid token format, continue to check CRON_SECRET
      }
    }
    
    // Fall back to CRON_SECRET for backward compatibility
    if (!isValid && cronSecret) {
      try {
        const tokenBuffer = Buffer.from(token, 'utf8');
        const correctBuffer = Buffer.from(cronSecret, 'utf8');
        
        if (tokenBuffer.length === correctBuffer.length) {
          isValid = crypto.timingSafeEqual(tokenBuffer, correctBuffer);
        }
      } catch {
        // Invalid token format
      }
    }
    
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Send daily summary
    const success = await sendDailySummary();
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to send daily summary', success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Daily summary sent successfully',
      success: true,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error in daily summary endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process daily summary request';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

