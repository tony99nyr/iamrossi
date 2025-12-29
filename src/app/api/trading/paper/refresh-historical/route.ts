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
      range: { fetched: 0, startDate: null as string | null, endDate: null as string | null, error: null as string | null },
      yesterday: { fetched: 0, error: null as string | null },
      today: { fetched: 0, price: null as number | null, error: null as string | null },
    };

    // First, find the last HOURLY candle we have in historical data to determine what's missing
    // Then fetch all missing hourly candles from that point to now
    try {
      // Get a wider range to find where our hourly data ends (go back further to find the actual gap)
      const startDateForCheck = new Date(today);
      startDateForCheck.setDate(startDateForCheck.getDate() - 30); // Check last 30 days to find the gap
      const checkStartStr = startDateForCheck.toISOString().split('T')[0];
      
      // Load existing HOURLY candles to find the last one
      console.log(`🔍 Checking for last hourly candle in data (checking last 30 days)...`);
      const existingHourlyCandles = await fetchPriceCandles(
        'ETHUSDT',
        '1h',
        checkStartStr,
        todayStr
      );
      
      if (existingHourlyCandles.length > 0) {
        // Find the last hourly candle we have
        const sortedCandles = [...existingHourlyCandles].sort((a, b) => b.timestamp - a.timestamp);
        const lastCandle = sortedCandles[0]!;
        const lastCandleTime = new Date(lastCandle.timestamp);
        const lastCandleDateStr = lastCandleTime.toISOString();
        
        // Calculate the next hour after the last candle
        const nextHour = new Date(lastCandleTime);
        nextHour.setHours(nextHour.getHours() + 1);
        nextHour.setMinutes(0, 0, 0);
        const nextHourStr = nextHour.toISOString();
        
        // Check if there's a gap (next hour is before now)
        const now = new Date();
        if (nextHour < now) {
          console.log(`📊 Found gap: last hourly candle is ${lastCandleDateStr}, fetching from ${nextHourStr} to now`);
          results.range.startDate = nextHourStr.split('T')[0];
          results.range.endDate = todayStr;
          
          // Fetch all missing hourly candles from the next hour to now
          console.log(`📊 Fetching hourly candles from ${nextHourStr} to ${now.toISOString()}...`);
          const missingHourlyCandles = await fetchPriceCandles(
            'ETHUSDT',
            '1h',
            nextHourStr.split('T')[0],
            todayStr
          );
          results.range.fetched = missingHourlyCandles.length;
          
          if (missingHourlyCandles.length > 0) {
            console.log(`✅ Fetched ${missingHourlyCandles.length} missing hourly candle(s) from ${nextHourStr} to now`);
          } else {
            console.log(`ℹ️ No missing hourly candles found (data is up to date)`);
          }
        } else {
          console.log(`ℹ️ Hourly data is up to date (last candle: ${lastCandleDateStr})`);
        }
      } else {
        // No existing hourly data - fetch last 7 days of hourly candles
        console.log(`📊 No existing hourly data found, fetching last 7 days of hourly candles...`);
        results.range.startDate = checkStartStr;
        results.range.endDate = todayStr;
        
        const allHourlyCandles = await fetchPriceCandles(
          'ETHUSDT',
          '1h',
          checkStartStr,
          todayStr
        );
        results.range.fetched = allHourlyCandles.length;
        console.log(`✅ Fetched ${allHourlyCandles.length} hourly candle(s) from ${checkStartStr} to ${todayStr}`);
      }
    } catch (error) {
      results.range.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch missing hourly candles:', error);
    }

    // Also fetch yesterday's data explicitly (for verification)
    try {
      const yesterdayCandles = await fetchPriceCandles(
        'ETHUSDT',
        '1d',
        yesterdayStr,
        yesterdayStr
      );
      results.yesterday.fetched = yesterdayCandles.length;
      if (yesterdayCandles.length > 0) {
        console.log(`✅ Verified ${yesterdayCandles.length} candle(s) for yesterday (${yesterdayStr})`);
      }
    } catch (error) {
      results.yesterday.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch yesterday data:', error);
    }

    // For today, fetch latest price and it will automatically update historical data
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

