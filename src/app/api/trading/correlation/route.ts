import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { analyzeCorrelation } from '@/lib/correlation-analysis';
import { fetchAlignedCandles } from '@/lib/btc-price-service';
import { fetchPriceCandles } from '@/lib/eth-price-service';
import { withReadOnlyApiSecurity } from '@/lib/api-security';
import type { PriceCandle } from '@/types';

/**
 * GET /api/trading/correlation
 * 
 * Returns ETH-BTC correlation analysis for the overview dashboard.
 * 
 * Query params:
 * - period: Rolling period for correlation (default: 30)
 * - lookback: Number of days to look back (default: 90)
 */
export async function GET(request: NextRequest) {
  return withReadOnlyApiSecurity(
    request,
    async (req: NextRequest) => {
      // Verify authentication
      if (!(await verifyAdminAuth(req))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      try {
        const searchParams = req.nextUrl.searchParams;
        const period = parseInt(searchParams.get('period') || '30', 10);
        const lookbackDays = parseInt(searchParams.get('lookback') || '90', 10);
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - lookbackDays);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Fetch aligned ETH and BTC candles
        let ethCandles: PriceCandle[];
        try {
          ethCandles = await fetchPriceCandles(
            'ETHUSDT',
            '8h',
            startDateStr,
            endDateStr,
            undefined, // currentPrice
            false, // skipAPIFetch
            false // allowSyntheticData
          );
        } catch (error) {
          console.error('Error fetching ETH candles:', error);
          return NextResponse.json({
            error: 'Failed to fetch ETH data',
            message: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
        
        if (ethCandles.length < period) {
          return NextResponse.json({
            error: 'Insufficient ETH data',
            message: `Need at least ${period} ETH candles, got ${ethCandles.length}`,
          }, { status: 400 });
        }
        
        // Get aligned BTC candles
        let aligned: { eth: PriceCandle[]; btc: PriceCandle[] };
        try {
          aligned = await fetchAlignedCandles(ethCandles, '8h');
        } catch (error) {
          console.error('Error fetching aligned candles:', error);
          return NextResponse.json({
            error: 'Failed to fetch BTC data',
            message: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
        
        // Check if we have enough aligned data
        // If not, try with a smaller period (minimum 10 candles)
        let effectivePeriod = period;
        if (aligned.btc.length < period || aligned.eth.length < period) {
          // Try to use what we have, but require at least 10 candles for meaningful correlation
          const availableCandles = Math.min(aligned.btc.length, aligned.eth.length);
          if (availableCandles < 10) {
            return NextResponse.json({
              error: 'Insufficient aligned data',
              message: `Need at least 10 aligned candles for correlation. Got ${aligned.eth.length} ETH and ${aligned.btc.length} BTC aligned candles. Please ensure both ETH and BTC have sufficient historical data.`,
            }, { status: 400 });
          }
          // Use available candles, but cap at requested period
          effectivePeriod = Math.min(availableCandles, period);
          console.log(`⚠️ Using reduced period: ${effectivePeriod} (requested: ${period}, available: ${availableCandles})`);
        }
        
        // Analyze correlation with effective period
        let correlationAnalysis;
        try {
          correlationAnalysis = await analyzeCorrelation(
            aligned.eth,
            aligned.btc,
            effectivePeriod,
            true // useCache
          );
        } catch (error) {
          console.error('Error analyzing correlation:', error);
          return NextResponse.json({
            error: 'Failed to analyze correlation',
            message: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
        
        return NextResponse.json({
          correlation: correlationAnalysis.currentCorrelation,
          averageCorrelation: correlationAnalysis.averageCorrelation,
          trend: correlationAnalysis.trend,
          strength: correlationAnalysis.correlations.length > 0
            ? correlationAnalysis.correlations[correlationAnalysis.correlations.length - 1]!.strength
            : 'none',
          history: correlationAnalysis.correlations.slice(-30), // Last 30 data points for chart
        });
      } catch (error) {
        console.error('Error fetching correlation:', error);
        return NextResponse.json({
          error: 'Failed to fetch correlation',
          message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
      }
    }
  );
}

