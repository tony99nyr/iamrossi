import { NextRequest, NextResponse } from 'next/server';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { fetchLatestPrice, fetchPriceCandles } from '@/lib/eth-price-service';
import { ASSET_CONFIGS, type TradingAsset } from '@/lib/asset-config';
import { isNotificationsEnabled, sendErrorAlert } from '@/lib/notifications';
import { detectGaps } from '@/lib/data-quality-validator';
import crypto from 'crypto';

/**
 * GET /api/trading/paper/cron-update
 * Background cron job to update price candles and paper trading sessions (if active)
 * 
 * This endpoint:
 * 1. Always fetches the latest price for BOTH ETH and BTC and updates candles (1d, 1h, 8h, 5m) in Redis
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
 * 
 * Authentication:
 * - Accepts TRADING_UPDATE_TOKEN (recommended for third-party cron services)
 *   - Updates price candles AND trading sessions (can trigger trades in active sessions)
 *   - Isolated: Only grants access to this endpoint (no admin access)
 *   - Safe to store in third-party services (paper trading only, no real money)
 * - Also accepts CRON_SECRET (for backward compatibility with GitHub Actions)
 *   - Same functionality as TRADING_UPDATE_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication - accept either TRADING_UPDATE_TOKEN or CRON_SECRET
    // TRADING_UPDATE_TOKEN is recommended for third-party services (isolated, low-risk)
    // CRON_SECRET is kept for backward compatibility with GitHub Actions
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    // Use timing-safe comparison to prevent timing attacks
    const tradingUpdateToken = process.env.TRADING_UPDATE_TOKEN;
    const cronSecret = process.env.CRON_SECRET;
    
    let isValid = false;
    
    // Check TRADING_UPDATE_TOKEN first (recommended for third-party services)
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
    
    // Fall back to CRON_SECRET for backward compatibility (GitHub Actions)
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

    // Fetch latest prices for ALL assets (ETH and BTC)
    // fetchLatestPrice calls updateTodayCandle for 1d, 1h, 8h, and 5m timeframes
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

    // NEW: Gap detection and filling for each asset (especially 8h candles)
    // This proactively fills missing candles to prevent data quality issues
    const gapFillingResults: Record<TradingAsset, Record<string, { detected: number; filled: number }>> = {
      eth: {},
      btc: {},
    };

    const gapFillingPromises = Object.entries(ASSET_CONFIGS).map(async ([assetId, config]) => {
      const asset = assetId as TradingAsset;
      const symbol = config.symbol;
      
      // Focus on 8h candles (primary trading timeframe)
      const timeframes = ['8h'];
      
      for (const timeframe of timeframes) {
        try {
          // Load candles to check for gaps (last 7 days)
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          
          const candles = await fetchPriceCandles(symbol, timeframe, startDate, endDate, undefined, false, false);
          
          if (candles.length === 0) continue;
          
          // Detect gaps
          const startTime = new Date(startDate).getTime();
          const endTime = new Date(endDate + 'T23:59:59.999Z').getTime();
          const gapInfo = detectGaps(candles, timeframe, startTime, endTime);
          
          if (gapInfo.missingCandles.length > 0) {
            // Filter to recent gaps only (within last 7 days, completed periods)
            const now = Date.now();
            const recentGaps = gapInfo.missingCandles.filter(m => {
              const gapAge = now - m.expected;
              const maxGapAge = 7 * 24 * 60 * 60 * 1000; // 7 days
              return gapAge > 0 && gapAge < maxGapAge;
            });
            
            if (recentGaps.length > 0) {
              // Calculate date range for missing candles
              const missingStart = Math.min(...recentGaps.map(g => g.expected));
              const missingEnd = Math.max(...recentGaps.map(g => g.expected));
              const missingStartDate = new Date(missingStart).toISOString().split('T')[0];
              // Extend endDate to today to ensure fetchPriceCandles doesn't treat it as historical
              // This forces API fetch for recent missing candles
              const todayDate = new Date().toISOString().split('T')[0];
              const missingEndDate = todayDate; // Use today to ensure API fetch
              
              // Fetch missing candles from API (automatically saves to Redis)
              const filledCandles = await fetchPriceCandles(
                symbol,
                timeframe,
                missingStartDate,
                missingEndDate,
                undefined,
                false, // Don't skip API fetch
                false  // No synthetic data
              );
              
              if (filledCandles.length > 0) {
                gapFillingResults[asset][timeframe] = {
                  detected: recentGaps.length,
                  filled: filledCandles.length,
                };
                console.log(`✅ [Cron] Filled ${filledCandles.length} missing ${timeframe} candles for ${config.displayName}`);
              } else {
                gapFillingResults[asset][timeframe] = {
                  detected: recentGaps.length,
                  filled: 0,
                };
              }
            }
          }
        } catch (error) {
          // Non-critical - log but don't fail the cron job
          console.warn(`⚠️ [Cron] Failed to check/fill gaps for ${config.displayName} ${timeframe}:`, error instanceof Error ? error.message : error);
        }
      }
    });

    await Promise.allSettled(gapFillingPromises);

    // Check for active sessions for ALL assets and update them
    // Both TRADING_UPDATE_TOKEN and CRON_SECRET can update sessions (execute trades)
    const sessionUpdates: Record<TradingAsset, { success: boolean; active: boolean; error?: string; summary?: { tradeCount: number; totalReturn: number; portfolioValue: number } }> = {
      eth: { success: false, active: false },
      btc: { success: false, active: false },
    };

    // Update sessions for all assets in parallel
    const sessionPromises = Object.entries(ASSET_CONFIGS).map(async ([assetId]) => {
      const asset = assetId as TradingAsset;
      try {
        const session = await PaperTradingService.getActiveSession(asset);
        
        if (session && session.isActive) {
          // Update session (fetch price, calculate regime, execute trades)
          const updatedSession = await PaperTradingService.updateSession(undefined, asset);
          sessionUpdates[asset] = { 
            success: true, 
            active: true,
            summary: {
              tradeCount: updatedSession.trades.length,
              totalReturn: updatedSession.portfolio.totalReturn,
              portfolioValue: updatedSession.portfolio.totalValue,
            }
          };
          console.log(`✅ ${ASSET_CONFIGS[asset].displayName} paper trading session updated successfully`);
        } else {
          sessionUpdates[asset] = { success: true, active: false };
          console.log(`ℹ️ No active ${ASSET_CONFIGS[asset].displayName} paper trading session`);
        }
      } catch (updateError) {
        const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
        sessionUpdates[asset] = { success: false, active: false, error: errorMessage };
        console.warn(`⚠️ Failed to update ${ASSET_CONFIGS[asset].displayName} paper trading session:`, errorMessage);
        
        // Session update failure is not critical - candles were already updated above
      }
    });

    await Promise.allSettled(sessionPromises);

    // Build minimal response (for cron services that have output size limits)
    const allPriceFetchesSucceeded = Object.values(priceFetches).every(p => p.success);
    const anySessionUpdated = Object.values(sessionUpdates).some(s => s.success && s.active);
    const anySessionActive = Object.values(sessionUpdates).some(s => s.active);

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
    
    // Send Discord alert on cron failure
    if (isNotificationsEnabled()) {
      await sendErrorAlert({
        type: 'system_error',
        severity: 'high',
        message: 'Cron update failed',
        context: `Error: ${errorMessage}`,
        error: error instanceof Error ? error.stack : String(error),
        timestamp: Date.now(),
      }).catch((err: unknown) => {
        console.warn('[Cron Update] Failed to send error alert:', err);
      });
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

