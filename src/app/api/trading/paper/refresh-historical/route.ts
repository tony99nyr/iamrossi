import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchPriceCandles, fetchLatestPrice } from '@/lib/eth-price-service';

/**
 * POST /api/trading/paper/refresh-historical
 * Fetch and update historical price data for yesterday and today
 * This ensures the chart has the latest data
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format dates as YYYY-MM-DD
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const results = {
      yesterday: { fetched: 0, error: null as string | null },
      today: { fetched: 0, price: null as number | null, error: null as string | null },
    };

    // Fetch yesterday's data
    try {
      const yesterdayCandles = await fetchPriceCandles(
        'ETHUSDT',
        '1d',
        yesterdayStr,
        yesterdayStr
      );
      results.yesterday.fetched = yesterdayCandles.length;
      if (yesterdayCandles.length > 0) {
        console.log(`✅ Fetched ${yesterdayCandles.length} candle(s) for yesterday (${yesterdayStr})`);
      }
    } catch (error) {
      results.yesterday.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch yesterday data:', error);
    }

    // For today, fetch latest price and it will automatically update historical data
    // Also try to fetch today's candle if available
    try {
      // Fetch latest price (this will update today's candle automatically)
      const latestPrice = await fetchLatestPrice('ETHUSDT');
      results.today.price = latestPrice;
      results.today.fetched = 1; // Price was fetched and will update candle
      
      // Also try to fetch today's candle from API if available
      try {
        const todayCandles = await fetchPriceCandles(
          'ETHUSDT',
          '1d',
          todayStr,
          todayStr
        );
        if (todayCandles.length > 0) {
          console.log(`✅ Fetched ${todayCandles.length} candle(s) for today (${todayStr})`);
        }
      } catch (candleError) {
        // This is OK - we already have the price from fetchLatestPrice
        console.log('Today candle fetch failed (using latest price instead):', candleError);
      }
    } catch (error) {
      results.today.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch today data:', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Historical data refresh completed',
      results,
    });
  } catch (error) {
    console.error('Error refreshing historical data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to refresh historical data';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

