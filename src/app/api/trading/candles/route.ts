import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import { withReadOnlyApiSecurity } from '@/lib/api-security';
import { candlesQuerySchema, safeValidateRequest } from '@/lib/validation';

/**
 * GET /api/trading/candles
 * Fetch price candles using the same method as the strategy
 * Used by the chart to ensure it uses the same data source
 */
export async function GET(request: NextRequest) {
  return withReadOnlyApiSecurity(
    request,
    async (req: NextRequest) => {
      // Verify authentication
      if (!(await verifyAdminAuth(req))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Validate query parameters
      const { searchParams } = new URL(req.url);
      const queryParams = Object.fromEntries(searchParams.entries());
      const validation = safeValidateRequest(candlesQuerySchema, queryParams);

      if (!validation.success) {
        return NextResponse.json(
          { error: validation.issues[0]?.message || 'Invalid query parameters' },
          { status: 400 }
        );
      }

      const { symbol, timeframe, startDate, endDate, currentPrice, skipAPIFetch } = validation.data;

      // Use defaults if dates not provided
      const finalStartDate = startDate || '2020-01-01';
      const finalEndDate = endDate || new Date().toISOString().split('T')[0];

      // Fetch candles using the same method as the strategy
      // NEVER use synthetic data in API routes (paper trading context)
      const candles = await fetchPriceCandles(
        symbol,
        timeframe,
        finalStartDate,
        finalEndDate,
        currentPrice,
        skipAPIFetch,
        false // NEVER synthetic data in paper trading
      );

      return NextResponse.json({
        candles,
        count: candles.length,
        timeframe,
        startDate: finalStartDate,
        endDate: finalEndDate,
      });
    },
    {
      rateLimitPrefix: 'trading_candles',
    }
  );
}

