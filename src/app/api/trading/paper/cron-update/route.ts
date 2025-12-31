import { NextRequest, NextResponse } from 'next/server';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { fetchLatestPrice } from '@/lib/eth-price-service';

/**
 * GET /api/trading/paper/cron-update
 * Background cron job to update price candles and paper trading session (if active)
 * 
 * This endpoint:
 * 1. Always fetches the latest price and updates candles (1d, 1h, 5m) in Redis
 * 2. Updates the paper trading session if one is active
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

    // Always fetch latest price (this automatically updates candles in Redis)
    // fetchLatestPrice calls updateTodayCandle for 1d, 1h, and 5m timeframes
    let priceFetchSuccess = false;
    let currentPrice: number | null = null;
    let priceFetchError: string | null = null;

    try {
      currentPrice = await fetchLatestPrice('ETHUSDT');
      priceFetchSuccess = true;
      console.log(`✅ Fetched latest price: $${currentPrice.toFixed(2)} (candles updated in Redis)`);
    } catch (priceError) {
      const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
      priceFetchError = errorMessage;
      console.warn('⚠️ Failed to fetch latest price (candles may not be updated):', errorMessage);
      
      // Check if it's a rate limit error (expected and handled gracefully)
      const isRateLimit = errorMessage.includes('Rate limited') ||
                          errorMessage.includes('451') ||
                          errorMessage.includes('429');
      
      if (!isRateLimit) {
        // For non-rate-limit errors, log but continue (still try to update session if active)
        console.error('Price fetch error (non-rate-limit):', errorMessage);
      }
    }

    // Get active session (optional - update if exists)
    const session = await PaperTradingService.getActiveSession();
    let sessionUpdateSuccess = false;
    let updatedSession = session;
    let sessionUpdateError: string | null = null;

    if (session && session.isActive) {
      // Update session (fetch price, calculate regime, execute trades)
      try {
        updatedSession = await PaperTradingService.updateSession();
        sessionUpdateSuccess = true;
        console.log('✅ Paper trading session updated successfully');
      } catch (updateError) {
        const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
        sessionUpdateError = errorMessage;
        console.warn('⚠️ Failed to update paper trading session:', errorMessage);
        
        // Session update failure is not critical - candles were already updated above
        // Continue and return success with warning
      }
    } else {
      console.log('ℹ️ No active paper trading session (candles still updated)');
    }

    // Return success response (candles were updated even if session update failed)
    const response: {
      message: string;
      priceFetch: { success: boolean; price?: number; error?: string };
      session?: typeof updatedSession;
      sessionUpdate?: { success: boolean; error?: string };
      timestamp: number;
    } = {
      message: priceFetchSuccess 
        ? 'Price candles updated successfully' + (sessionUpdateSuccess ? ' and session updated' : '')
        : 'Cron update completed with warnings',
      priceFetch: {
        success: priceFetchSuccess,
        ...(currentPrice !== null && { price: currentPrice }),
        ...(priceFetchError && { error: priceFetchError }),
      },
      timestamp: Date.now(),
    };

    if (updatedSession) {
      response.session = updatedSession;
      response.sessionUpdate = {
        success: sessionUpdateSuccess,
        ...(sessionUpdateError && { error: sessionUpdateError }),
      };
    } else {
      response.message += ' (no active session)';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in cron update endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process cron update';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

