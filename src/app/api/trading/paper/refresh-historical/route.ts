import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchPriceCandles, fetchLatestPrice } from '@/lib/eth-price-service';
import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import type { PriceCandle } from '@/types';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');
const CUTOFF_DATE = '2025-12-27';

/**
 * Find the last daily candle date in historical files
 */
async function findLastDailyCandleDate(): Promise<string | null> {
  try {
    const symbol = 'ethusdt';
    const interval = '1d';
    const dir = path.join(HISTORICAL_DATA_DIR, symbol, interval);
    
    // Check rolling file first (most recent data)
    const rollingFilePath = path.join(dir, `${symbol}_${interval}_rolling.json.gz`);
    let lastDate: string | null = null;
    let lastTimestamp = 0;
    
    try {
      const compressed = await fs.readFile(rollingFilePath);
      const decompressed = gunzipSync(compressed);
      const candles = JSON.parse(decompressed.toString('utf-8')) as PriceCandle[];
      if (candles.length > 0) {
        const sorted = [...candles].sort((a, b) => b.timestamp - a.timestamp);
        const lastCandle = sorted[0]!;
        if (lastCandle.timestamp > lastTimestamp) {
          lastTimestamp = lastCandle.timestamp;
          lastDate = new Date(lastCandle.timestamp).toISOString().split('T')[0];
        }
      }
    } catch {
      // Rolling file doesn't exist or is invalid - continue
    }
    
    // Check historical files (pre-cutoff)
    try {
      const files = await fs.readdir(dir);
      const historicalFiles = files.filter(f => 
        f.startsWith(`${symbol}_${interval}_`) && 
        f.endsWith('.json.gz') &&
        !f.includes('rolling')
      );
      
      for (const file of historicalFiles) {
        try {
          const filePath = path.join(dir, file);
          const compressed = await fs.readFile(filePath);
          const decompressed = gunzipSync(compressed);
          const candles = JSON.parse(decompressed.toString('utf-8')) as PriceCandle[];
          if (candles.length > 0) {
            const sorted = [...candles].sort((a, b) => b.timestamp - a.timestamp);
            const lastCandle = sorted[0]!;
            if (lastCandle.timestamp > lastTimestamp) {
              lastTimestamp = lastCandle.timestamp;
              lastDate = new Date(lastCandle.timestamp).toISOString().split('T')[0];
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Directory doesn't exist - continue
    }
    
    return lastDate;
  } catch (error) {
    console.error('Error finding last daily candle date:', error);
    return null;
  }
}

/**
 * POST /api/trading/paper/refresh-historical
 * Find the last candle in historical-prices files and fill all gaps to now using APIs
 * This ensures the chart has complete data from historical files to current date
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const results = {
      daily: { fetched: 0, startDate: null as string | null, endDate: null as string | null, error: null as string | null },
      hourly: { fetched: 0, startDate: null as string | null, endDate: null as string | null, error: null as string | null },
      fiveMinute: { fetched: 0, startDate: null as string | null, endDate: null as string | null, error: null as string | null },
      today: { fetched: 0, price: null as number | null, error: null as string | null },
    };

    // 1. Find the last daily candle in historical files and fill all gaps to now
    try {
      console.log(`🔍 Finding last daily candle in historical-prices files...`);
      const lastDailyDate = await findLastDailyCandleDate();
      
      if (lastDailyDate) {
        // Calculate the next day after the last candle
        const lastDate = new Date(lastDailyDate);
        lastDate.setDate(lastDate.getDate() + 1);
        const nextDayStr = lastDate.toISOString().split('T')[0];
        
        // Check if there's a gap (next day is before or equal to today)
        if (nextDayStr <= todayStr) {
          console.log(`📊 Found gap: last daily candle is ${lastDailyDate}, fetching from ${nextDayStr} to ${todayStr}`);
          results.daily.startDate = nextDayStr;
          results.daily.endDate = todayStr;
          
          // Fetch all missing daily candles from the next day to now
          // This will use Binance → CoinGecko OHLC → CoinGecko market_chart fallback chain
          console.log(`📊 Fetching daily candles from ${nextDayStr} to ${todayStr}...`);
          const missingDailyCandles = await fetchPriceCandles(
            'ETHUSDT',
            '1d',
            nextDayStr,
            todayStr
          );
          results.daily.fetched = missingDailyCandles.length;
          
          if (missingDailyCandles.length > 0) {
            console.log(`✅ Fetched ${missingDailyCandles.length} missing daily candle(s) from ${nextDayStr} to ${todayStr}`);
          } else {
            console.log(`ℹ️ No missing daily candles found (data is up to date)`);
          }
        } else {
          console.log(`ℹ️ Daily data is up to date (last candle: ${lastDailyDate})`);
        }
      } else {
        // No historical files found - fetch last 30 days as a starting point
        console.log(`📊 No historical files found, fetching last 30 days of daily candles...`);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        const startDateStr = startDate.toISOString().split('T')[0];
        
        results.daily.startDate = startDateStr;
        results.daily.endDate = todayStr;
        
        const allDailyCandles = await fetchPriceCandles(
          'ETHUSDT',
          '1d',
          startDateStr,
          todayStr
        );
        results.daily.fetched = allDailyCandles.length;
        console.log(`✅ Fetched ${allDailyCandles.length} daily candle(s) from ${startDateStr} to ${todayStr}`);
      }
    } catch (error) {
      results.daily.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch missing daily candles:', error);
    }

    // 2. Find the last hourly candle and fill gaps (for intraday granularity)
    try {
      // Get a wider range to find where our hourly data ends
      const startDateForCheck = new Date(today);
      startDateForCheck.setDate(startDateForCheck.getDate() - 30);
      const checkStartStr = startDateForCheck.toISOString().split('T')[0];
      
      console.log(`🔍 Checking for last hourly candle in data (checking last 30 days)...`);
      const existingHourlyCandles = await fetchPriceCandles(
        'ETHUSDT',
        '1h',
        checkStartStr,
        todayStr
      );
      
      if (existingHourlyCandles.length > 0) {
        const sortedCandles = [...existingHourlyCandles].sort((a, b) => b.timestamp - a.timestamp);
        const lastCandle = sortedCandles[0]!;
        const lastCandleTime = new Date(lastCandle.timestamp);
        const lastCandleDateStr = lastCandleTime.toISOString();
        
        const nextHour = new Date(lastCandleTime);
        nextHour.setHours(nextHour.getHours() + 1);
        nextHour.setMinutes(0, 0, 0);
        const nextHourStr = nextHour.toISOString();
        
        const now = new Date();
        if (nextHour < now) {
          console.log(`📊 Found hourly gap: last hourly candle is ${lastCandleDateStr}, fetching from ${nextHourStr} to now`);
          results.hourly.startDate = nextHourStr.split('T')[0];
          results.hourly.endDate = todayStr;
          
          const missingHourlyCandles = await fetchPriceCandles(
            'ETHUSDT',
            '1h',
            nextHourStr.split('T')[0],
            todayStr
          );
          results.hourly.fetched = missingHourlyCandles.length;
          
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
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
        const startDateStr = startDate.toISOString().split('T')[0];
        
        results.hourly.startDate = startDateStr;
        results.hourly.endDate = todayStr;
        
        const allHourlyCandles = await fetchPriceCandles(
          'ETHUSDT',
          '1h',
          startDateStr,
          todayStr
        );
        results.hourly.fetched = allHourlyCandles.length;
        console.log(`✅ Fetched ${allHourlyCandles.length} hourly candle(s) from ${startDateStr} to ${todayStr}`);
      }
    } catch (error) {
      results.hourly.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch missing hourly candles:', error);
    }

    // 3. Fill 5-minute candle gaps for the last 48 hours (most granular intraday data)
    try {
      const now = new Date();
      const cutoff48h = new Date(now.getTime() - (48 * 60 * 60 * 1000));
      const startDate48h = cutoff48h.toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];
      
      console.log(`🔍 Checking for 5-minute candle gaps in last 48 hours (${startDate48h} to ${todayStr})...`);
      
      // Fetch 5m candles for the last 48 hours - this will fill any gaps
      // fetchPriceCandles will automatically load from Redis and fill gaps from API if needed
      const fiveMinuteCandles = await fetchPriceCandles(
        'ETHUSDT',
        '5m',
        startDate48h,
        todayStr
      );
      
      results.fiveMinute.fetched = fiveMinuteCandles.length;
      results.fiveMinute.startDate = startDate48h;
      results.fiveMinute.endDate = todayStr;
      
      if (fiveMinuteCandles.length > 0) {
        // Check how many are in the last 24 hours
        const cutoff24h = now.getTime() - (24 * 60 * 60 * 1000);
        const recent24h = fiveMinuteCandles.filter(c => c.timestamp >= cutoff24h);
        console.log(`✅ Fetched ${fiveMinuteCandles.length} 5-minute candles (${recent24h.length} in last 24h)`);
      } else {
        console.log(`ℹ️ No 5-minute candles found (may need to wait for data to accumulate)`);
      }
    } catch (error) {
      results.fiveMinute.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to fetch 5-minute candles:', error);
      // Non-critical - 5m candles are nice to have but not required
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

