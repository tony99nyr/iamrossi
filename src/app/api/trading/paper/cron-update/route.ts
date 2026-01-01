import { NextRequest, NextResponse } from 'next/server';
import { PaperTradingService, type EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';
import { fetchLatestPrice } from '@/lib/eth-price-service';
import { ASSET_CONFIGS, type TradingAsset } from '@/lib/asset-config';

/**
 * GET /api/trading/paper/cron-update
 * Background cron job to update price candles and paper trading sessions (if active)
 * 
 * This endpoint:
 * 1. Always fetches the latest price for BOTH ETH and BTC and updates candles (1d, 1h, 8h, 12h, 5m) in Redis
 * 2. Updates paper trading sessions for BOTH assets if they are active
 * 
 * NOTE: Vercel Hobby plan only allows daily cron jobs, so this endpoint
 * is available for manual triggering or external cron services.
 * 
 * For automatic updates, use:
 * - UI auto-refresh (every 5 minutes when tab is open)
 * - Manual "Refresh Now" button
 * - External cron service (e.g., cron-job.org) calling this endpoint
 * - GitHub Actions workflow (trading-bot-cron.yml) calling this endpoint every 5 minutes
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

    // Fetch latest prices for ALL assets (ETH and BTC)
    // fetchLatestPrice calls updateTodayCandle for 1d, 1h, 8h, 12h, and 5m timeframes
    const priceFetches: Record<TradingAsset, { success: boolean; price?: number; error?: string }> = {
      eth: { success: false },
      btc: { success: false },
    };

    // Fetch prices for all assets in parallel
    const pricePromises = Object.entries(ASSET_CONFIGS).map(async ([assetId, config]) => {
      const asset = assetId as TradingAsset;
      try {
        const price = await fetchLatestPrice(config.symbol);
        priceFetches[asset] = { success: true, price };
        console.log(`✅ Fetched latest ${config.displayName} price: $${price.toFixed(2)} (candles updated in Redis)`);
      } catch (priceError) {
        const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
        priceFetches[asset] = { success: false, error: errorMessage };
        console.warn(`⚠️ Failed to fetch latest ${config.displayName} price (candles may not be updated):`, errorMessage);
        
        // Check if it's a rate limit error (expected and handled gracefully)
        const isRateLimit = errorMessage.includes('Rate limited') ||
                            errorMessage.includes('451') ||
                            errorMessage.includes('429');
        
        if (!isRateLimit) {
          // For non-rate-limit errors, log but continue
          console.error(`${config.displayName} price fetch error (non-rate-limit):`, errorMessage);
        }
      }
    });

    await Promise.allSettled(pricePromises);

    // Check for active sessions for ALL assets and update them
    const sessionUpdates: Record<TradingAsset, { success: boolean; error?: string; session?: EnhancedPaperTradingSession }> = {
      eth: { success: false },
      btc: { success: false },
    };

    // Update sessions for all assets in parallel
    const sessionPromises = Object.entries(ASSET_CONFIGS).map(async ([assetId]) => {
      const asset = assetId as TradingAsset;
      try {
        const session = await PaperTradingService.getActiveSession(asset);
        
        if (session && session.isActive) {
          // Update session (fetch price, calculate regime, execute trades)
          const updatedSession = await PaperTradingService.updateSession(undefined, asset);
          sessionUpdates[asset] = { success: true, session: updatedSession };
          console.log(`✅ ${ASSET_CONFIGS[asset].displayName} paper trading session updated successfully`);
        } else {
          console.log(`ℹ️ No active ${ASSET_CONFIGS[asset].displayName} paper trading session`);
        }
      } catch (updateError) {
        const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
        sessionUpdates[asset] = { success: false, error: errorMessage };
        console.warn(`⚠️ Failed to update ${ASSET_CONFIGS[asset].displayName} paper trading session:`, errorMessage);
        
        // Session update failure is not critical - candles were already updated above
      }
    });

    await Promise.allSettled(sessionPromises);

    // Build response
    const allPriceFetchesSucceeded = Object.values(priceFetches).every(p => p.success);
    const anySessionUpdated = Object.values(sessionUpdates).some(s => s.success);
    const anySessionActive = Object.values(sessionUpdates).some(s => s.session);

    const response: {
      message: string;
      priceFetches: typeof priceFetches;
      sessionUpdates: typeof sessionUpdates;
      timestamp: number;
    } = {
      message: allPriceFetchesSucceeded 
        ? 'Price candles updated successfully for all assets' + (anySessionUpdated ? ' and sessions updated' : '')
        : 'Cron update completed with warnings',
      priceFetches,
      sessionUpdates,
      timestamp: Date.now(),
    };

    if (!anySessionActive) {
      response.message += ' (no active sessions)';
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

