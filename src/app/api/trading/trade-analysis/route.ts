import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { withReadOnlyApiSecurity } from '@/lib/api-security';

/**
 * GET /api/trading/trade-analysis
 * 
 * Returns trade analysis by time of day, regime, and signal strength.
 * 
 * Query params:
 * - asset: Trading asset (eth, btc) - default: eth
 * - startDate: Filter trades from this date (ISO string)
 * - endDate: Filter trades to this date (ISO string)
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
        const { searchParams } = new URL(req.url);
        const asset = (searchParams.get('asset') || 'eth') as 'eth' | 'btc';
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Get active session for the asset
        const session = await PaperTradingService.getActiveSession(asset);

        if (!session) {
          return NextResponse.json({
            error: 'No active session',
            message: `No active paper trading session found for ${asset.toUpperCase()}`,
          }, { status: 404 });
        }

        // Filter trades by date range if provided
        let trades = [...session.trades];
        if (startDate) {
          const startTime = new Date(startDate).getTime();
          trades = trades.filter(t => t.timestamp >= startTime);
        }
        if (endDate) {
          const endTime = new Date(endDate).getTime();
          trades = trades.filter(t => t.timestamp <= endTime);
        }

        // Only analyze completed trades (sells)
        const completedTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);

        // Group by time of day (UTC hours)
        const timeOfDayStats: Record<string, {
          hour: number;
          hourLabel: string;
          tradeCount: number;
          winCount: number;
          lossCount: number;
          totalPnl: number;
          winRate: number;
          avgPnl: number;
        }> = {};

        // Group by regime
        const regimeStats: Record<string, {
          regime: string;
          tradeCount: number;
          winCount: number;
          lossCount: number;
          totalPnl: number;
          winRate: number;
          avgPnl: number;
        }> = {};

        // Group by signal strength (confidence buckets)
        const signalStrengthStats: Record<string, {
          strength: string;
          minConfidence: number;
          maxConfidence: number;
          tradeCount: number;
          winCount: number;
          lossCount: number;
          totalPnl: number;
          winRate: number;
          avgPnl: number;
        }> = {};

        // Process each completed trade
        for (const trade of completedTrades) {
          // Time of day analysis
          const tradeDate = new Date(trade.timestamp);
          const hour = tradeDate.getUTCHours();
          const hourKey = hour.toString();
          const hourLabel = `${hour.toString().padStart(2, '0')}:00 UTC`;

          if (!timeOfDayStats[hourKey]) {
            timeOfDayStats[hourKey] = {
              hour,
              hourLabel,
              tradeCount: 0,
              winCount: 0,
              lossCount: 0,
              totalPnl: 0,
              winRate: 0,
              avgPnl: 0,
            };
          }

          // Regime analysis
          const regime = trade.audit?.regime || 'unknown';
          if (!regimeStats[regime]) {
            regimeStats[regime] = {
              regime,
              tradeCount: 0,
              winCount: 0,
              lossCount: 0,
              totalPnl: 0,
              winRate: 0,
              avgPnl: 0,
            };
          }

          // Signal strength analysis (confidence buckets)
          const confidence = trade.confidence || 0;
          let strength: string;
          let minConfidence: number;
          let maxConfidence: number;
          
          if (confidence >= 0.8) {
            strength = 'very-high';
            minConfidence = 0.8;
            maxConfidence = 1.0;
          } else if (confidence >= 0.6) {
            strength = 'high';
            minConfidence = 0.6;
            maxConfidence = 0.8;
          } else if (confidence >= 0.4) {
            strength = 'medium';
            minConfidence = 0.4;
            maxConfidence = 0.6;
          } else if (confidence >= 0.2) {
            strength = 'low';
            minConfidence = 0.2;
            maxConfidence = 0.4;
          } else {
            strength = 'very-low';
            minConfidence = 0.0;
            maxConfidence = 0.2;
          }

          if (!signalStrengthStats[strength]) {
            signalStrengthStats[strength] = {
              strength,
              minConfidence,
              maxConfidence,
              tradeCount: 0,
              winCount: 0,
              lossCount: 0,
              totalPnl: 0,
              winRate: 0,
              avgPnl: 0,
            };
          }

          const pnl = trade.pnl || 0;
          const isWin = pnl > 0;

          // Update time of day stats
          timeOfDayStats[hourKey]!.tradeCount++;
          if (isWin) {
            timeOfDayStats[hourKey]!.winCount++;
          } else {
            timeOfDayStats[hourKey]!.lossCount++;
          }
          timeOfDayStats[hourKey]!.totalPnl += pnl;

          // Update regime stats
          regimeStats[regime]!.tradeCount++;
          if (isWin) {
            regimeStats[regime]!.winCount++;
          } else {
            regimeStats[regime]!.lossCount++;
          }
          regimeStats[regime]!.totalPnl += pnl;

          // Update signal strength stats
          signalStrengthStats[strength]!.tradeCount++;
          if (isWin) {
            signalStrengthStats[strength]!.winCount++;
          } else {
            signalStrengthStats[strength]!.lossCount++;
          }
          signalStrengthStats[strength]!.totalPnl += pnl;
        }

        // Calculate final metrics
        for (const stat of Object.values(timeOfDayStats)) {
          stat.winRate = stat.tradeCount > 0 ? (stat.winCount / stat.tradeCount) * 100 : 0;
          stat.avgPnl = stat.tradeCount > 0 ? stat.totalPnl / stat.tradeCount : 0;
        }

        for (const stat of Object.values(regimeStats)) {
          stat.winRate = stat.tradeCount > 0 ? (stat.winCount / stat.tradeCount) * 100 : 0;
          stat.avgPnl = stat.tradeCount > 0 ? stat.totalPnl / stat.tradeCount : 0;
        }

        for (const stat of Object.values(signalStrengthStats)) {
          stat.winRate = stat.tradeCount > 0 ? (stat.winCount / stat.tradeCount) * 100 : 0;
          stat.avgPnl = stat.tradeCount > 0 ? stat.totalPnl / stat.tradeCount : 0;
        }

        // Calculate overall stats
        const totalTrades = completedTrades.length;
        const totalWins = completedTrades.filter(t => (t.pnl || 0) > 0).length;
        const totalLosses = completedTrades.filter(t => (t.pnl || 0) < 0).length;
        const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

        return NextResponse.json({
          overall: {
            totalTrades,
            winCount: totalWins,
            lossCount: totalLosses,
            totalPnl,
            winRate: overallWinRate,
            avgPnl: totalTrades > 0 ? totalPnl / totalTrades : 0,
          },
          byTimeOfDay: Object.values(timeOfDayStats)
            .sort((a, b) => a.hour - b.hour),
          byRegime: Object.values(regimeStats)
            .sort((a, b) => b.totalPnl - a.totalPnl),
          bySignalStrength: Object.values(signalStrengthStats)
            .sort((a, b) => b.minConfidence - a.minConfidence),
        });
      } catch (error) {
        console.error('Error calculating trade analysis:', error);
        return NextResponse.json({
          error: 'Failed to calculate trade analysis',
          message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
      }
    }
  );
}

