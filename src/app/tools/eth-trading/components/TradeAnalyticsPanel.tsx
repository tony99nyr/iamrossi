'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface TradeAnalyticsPanelProps {
  session: EnhancedPaperTradingSession;
}

/**
 * Trade Analytics Panel
 * Shows: Trade counts, frequency, recent performance, best/worst trades
 * Note: Open positions are shown in RiskManagementPanel
 */
export default function TradeAnalyticsPanel({ session }: TradeAnalyticsPanelProps) {
  const { trades } = session;

  const analytics = useMemo(() => {
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
    const buyTrades = trades.filter(t => t.type === 'buy');
    
    const buyCount = buyTrades.length;
    const sellCount = sellTrades.length;
    const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = sellTrades.filter(t => (t.pnl || 0) < 0);
    
    // Trade frequency
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in useMemo
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tradesLast24h = trades.filter(t => t.timestamp >= oneDayAgo).length;
    const tradesPerDay = session.startedAt > 0
      ? (trades.length / ((now - session.startedAt) / (24 * 60 * 60 * 1000)))
      : 0;
    
    // Best and worst trades
    const sortedByPnl = [...sellTrades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
    const bestTrade = sortedByPnl[0];
    const worstTrade = sortedByPnl[sortedByPnl.length - 1];
    
    // Recent performance (last 5 trades)
    const recentSellTrades = sellTrades.slice(-5);
    const recentWinRate = recentSellTrades.length > 0
      ? (recentSellTrades.filter(t => (t.pnl || 0) > 0).length / recentSellTrades.length) * 100
      : 0;
    const avgRecentPnl = recentSellTrades.length > 0
      ? recentSellTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / recentSellTrades.length
      : 0;
    
    // Total P&L
    const totalPnl = sellTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    return {
      buyCount,
      sellCount,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      tradesLast24h,
      tradesPerDay,
      bestTrade,
      worstTrade,
      recentWinRate,
      avgRecentPnl,
      totalPnl,
    };
  }, [trades, session.startedAt]);

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Trade Statistics
      </h2>
      
      <div className={stack({ gap: '8px' })}>
        {/* Trade Summary Row */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '8px' })}>
          <div className={css({ textAlign: 'center', flex: '1' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Total</div>
            <div className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
              {analytics.buyCount + analytics.sellCount}
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Buys</div>
            <div className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
              {analytics.buyCount}
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Sells</div>
            <div className={css({ color: '#f85149', fontWeight: 'semibold' })}>
              {analytics.sellCount}
            </div>
          </div>
        </div>

        {/* Win/Loss Row */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '8px' })}>
          <div className={css({ textAlign: 'center', flex: '1' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Wins</div>
            <div className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
              {analytics.winningTrades}
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Losses</div>
            <div className={css({ color: '#f85149', fontWeight: 'semibold' })}>
              {analytics.losingTrades}
            </div>
          </div>
          <div className={css({ textAlign: 'center', flex: '1' })}>
            <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Total P&L</div>
            <div className={css({ 
              color: analytics.totalPnl >= 0 ? '#3fb950' : '#f85149', 
              fontWeight: 'semibold',
              fontSize: 'sm',
            })}>
              {analytics.totalPnl >= 0 ? '+' : ''}${analytics.totalPnl.toFixed(0)}
            </div>
          </div>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Trade Frequency */}
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trades (24h)</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {analytics.tradesLast24h}
          </span>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Avg/Day</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {analytics.tradesPerDay.toFixed(1)}
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />

        {/* Recent Performance */}
        <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '2px' })}>
          Recent (Last 5 Trades)
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Win Rate</span>
          <span className={css({
            color: analytics.recentWinRate >= 60 ? '#3fb950' : analytics.recentWinRate >= 40 ? '#eab308' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {analytics.recentWinRate.toFixed(0)}%
          </span>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Avg P&L</span>
          <span className={css({
            color: analytics.avgRecentPnl >= 0 ? '#3fb950' : '#f85149',
            fontWeight: 'semibold',
          })}>
            {analytics.avgRecentPnl >= 0 ? '+' : ''}${analytics.avgRecentPnl.toFixed(2)}
          </span>
        </div>

        {/* Best/Worst Trades - Compact */}
        {(analytics.bestTrade || analytics.worstTrade) && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '4px 0' })} />
            <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '12px' })}>
              {analytics.bestTrade && (
                <div className={css({ flex: 1 })}>
                  <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '2px' })}>Best Trade</div>
                  <div className={css({ color: '#3fb950', fontWeight: 'semibold', fontSize: 'sm' })}>
                    +${(analytics.bestTrade.pnl || 0).toFixed(2)}
                  </div>
                </div>
              )}
              {analytics.worstTrade && analytics.worstTrade !== analytics.bestTrade && (
                <div className={css({ flex: 1 })}>
                  <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '2px' })}>Worst Trade</div>
                  <div className={css({ color: '#f85149', fontWeight: 'semibold', fontSize: 'sm' })}>
                    ${(analytics.worstTrade.pnl || 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

