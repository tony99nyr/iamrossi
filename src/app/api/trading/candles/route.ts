import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchPriceCandles } from '@/lib/eth-price-service';

/**
 * GET /api/trading/candles
 * Fetch price candles using the same method as the strategy
 * Used by the chart to ensure it uses the same data source
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'ETHUSDT';
    const timeframe = searchParams.get('timeframe') || '8h';
    const startDate = searchParams.get('startDate') || '2020-01-01';
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
    const currentPrice = searchParams.get('currentPrice') ? Number.parseFloat(searchParams.get('currentPrice')!) : undefined;
    const skipAPIFetch = searchParams.get('skipAPIFetch') === 'true';

    // Fetch candles using the same method as the strategy
    // NEVER use synthetic data in API routes (paper trading context)
    const candles = await fetchPriceCandles(
      symbol,
      timeframe,
      startDate,
      endDate,
      currentPrice,
      skipAPIFetch,
      false // NEVER synthetic data in paper trading
    );

    return NextResponse.json({
      candles,
      count: candles.length,
      timeframe,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error('Error fetching candles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candles' },
      { status: 500 }
    );
  }
}

