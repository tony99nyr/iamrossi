import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { PaperTradingService } from '@/lib/paper-trading-enhanced';
import { withReadOnlyApiSecurity } from '@/lib/api-security';

/**
 * GET /api/trading/performance-attribution
 * 
 * Returns performance attribution analysis by regime and strategy.
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

        // Group trades by regime
        const regimeStats: Record<string, {
          regime: string;
          tradeCount: number;
          winCount: number;
          lossCount: number;
          totalPnl: number;
          totalReturn: number;
          avgPnl: number;
          winRate: number;
          avgWin: number;
          avgLoss: number;
        }> = {};

        // Group trades by strategy
        const strategyStats: Record<string, {
          strategy: string;
          tradeCount: number;
          winCount: number;
          lossCount: number;
          totalPnl: number;
          totalReturn: number;
          avgPnl: number;
          winRate: number;
          avgWin: number;
          avgLoss: number;
        }> = {};

        // Process each completed trade
        for (const trade of completedTrades) {
          // Get regime and strategy from audit (if available)
          const regime = trade.audit?.regime || 'unknown';
          const strategy = trade.audit?.activeStrategy || 'unknown';

          // Initialize regime stats
          if (!regimeStats[regime]) {
            regimeStats[regime] = {
              regime,
              tradeCount: 0,
              winCount: 0,
              lossCount: 0,
              totalPnl: 0,
              totalReturn: 0,
              avgPnl: 0,
              winRate: 0,
              avgWin: 0,
              avgLoss: 0,
            };
          }

          // Initialize strategy stats
          if (!strategyStats[strategy]) {
            strategyStats[strategy] = {
              strategy,
              tradeCount: 0,
              winCount: 0,
              lossCount: 0,
              totalPnl: 0,
              totalReturn: 0,
              avgPnl: 0,
              winRate: 0,
              avgWin: 0,
              avgLoss: 0,
            };
          }

          const pnl = trade.pnl || 0;
          const isWin = pnl > 0;

          // Update regime stats
          regimeStats[regime]!.tradeCount++;
          if (isWin) {
            regimeStats[regime]!.winCount++;
            regimeStats[regime]!.avgWin = (regimeStats[regime]!.avgWin * (regimeStats[regime]!.winCount - 1) + pnl) / regimeStats[regime]!.winCount;
          } else {
            regimeStats[regime]!.lossCount++;
            regimeStats[regime]!.avgLoss = (regimeStats[regime]!.avgLoss * (regimeStats[regime]!.lossCount - 1) + pnl) / regimeStats[regime]!.lossCount;
          }
          regimeStats[regime]!.totalPnl += pnl;
          if (trade.costBasis && trade.costBasis > 0) {
            regimeStats[regime]!.totalReturn += (pnl / trade.costBasis) * 100;
          }

          // Update strategy stats
          strategyStats[strategy]!.tradeCount++;
          if (isWin) {
            strategyStats[strategy]!.winCount++;
            strategyStats[strategy]!.avgWin = (strategyStats[strategy]!.avgWin * (strategyStats[strategy]!.winCount - 1) + pnl) / strategyStats[strategy]!.winCount;
          } else {
            strategyStats[strategy]!.lossCount++;
            strategyStats[strategy]!.avgLoss = (strategyStats[strategy]!.avgLoss * (strategyStats[strategy]!.lossCount - 1) + pnl) / strategyStats[strategy]!.lossCount;
          }
          strategyStats[strategy]!.totalPnl += pnl;
          if (trade.costBasis && trade.costBasis > 0) {
            strategyStats[strategy]!.totalReturn += (pnl / trade.costBasis) * 100;
          }
        }

        // Calculate final metrics
        for (const regime of Object.values(regimeStats)) {
          regime.winRate = regime.tradeCount > 0 ? (regime.winCount / regime.tradeCount) * 100 : 0;
          regime.avgPnl = regime.tradeCount > 0 ? regime.totalPnl / regime.tradeCount : 0;
        }

        for (const strategy of Object.values(strategyStats)) {
          strategy.winRate = strategy.tradeCount > 0 ? (strategy.winCount / strategy.tradeCount) * 100 : 0;
          strategy.avgPnl = strategy.tradeCount > 0 ? strategy.totalPnl / strategy.tradeCount : 0;
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
          byRegime: Object.values(regimeStats).sort((a, b) => b.totalPnl - a.totalPnl),
          byStrategy: Object.values(strategyStats).sort((a, b) => b.totalPnl - a.totalPnl),
        });
      } catch (error) {
        console.error('Error calculating performance attribution:', error);
        return NextResponse.json({
          error: 'Failed to calculate performance attribution',
          message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
      }
    }
  );
}

