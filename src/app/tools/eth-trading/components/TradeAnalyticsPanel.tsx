'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface TradeAnalyticsPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function TradeAnalyticsPanel({ session }: TradeAnalyticsPanelProps) {
  const { trades } = session;

  const analytics = useMemo(() => {
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
    const buyTrades = trades.filter(t => t.type === 'buy');
    
    // Trade distribution
    const buyCount = buyTrades.length;
    const sellCount = sellTrades.length;
    
    // Trade timing analysis
    const tradesByHour = new Map<number, number>();
    sellTrades.forEach(trade => {
      const hour = new Date(trade.timestamp).getHours();
      tradesByHour.set(hour, (tradesByHour.get(hour) || 0) + 1);
    });
    
    // Best and worst trades
    const sortedByPnl = [...sellTrades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
    const bestTrade = sortedByPnl[0];
    const worstTrade = sortedByPnl[sortedByPnl.length - 1];
    
    // Trade performance by regime (would need regime info per trade - simplified for now)
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
    
    return {
      buyCount,
      sellCount,
      tradesByHour,
      bestTrade,
      worstTrade,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      tradesLast24h,
      tradesPerDay,
    };
  }, [trades, session.startedAt]);

  const formatTimeAgo = (timestamp: number) => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in function
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Trade Analytics
      </h2>
      
      <div className={stack({ gap: '8px' })}>
        {/* Trade Distribution */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Buy Trades</span>
          <span className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
            {analytics.buyCount}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Sell Trades</span>
          <span className={css({ color: '#f85149', fontWeight: 'semibold' })}>
            {analytics.sellCount}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Winning Trades</span>
          <span className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
            {analytics.winningTrades}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Losing Trades</span>
          <span className={css({ color: '#f85149', fontWeight: 'semibold' })}>
            {analytics.losingTrades}
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />

        {/* Trade Frequency */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trades (24h)</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {analytics.tradesLast24h}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trades/Day</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {analytics.tradesPerDay.toFixed(1)}
          </span>
        </div>

        {/* Best/Worst Trades */}
        {analytics.bestTrade && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
            <div className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
              Best Trade
            </div>
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>P&L</span>
              <span className={css({ color: '#3fb950', fontWeight: 'semibold' })}>
                ${analytics.bestTrade.pnl?.toFixed(2) || '0.00'}
              </span>
            </div>
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Time</span>
              <span className={css({ color: '#7d8590', fontSize: 'xs' })}>
                {formatTimeAgo(analytics.bestTrade.timestamp)}
              </span>
            </div>
          </>
        )}

        {analytics.worstTrade && (
          <>
            <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
            <div className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
              Worst Trade
            </div>
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>P&L</span>
              <span className={css({ color: '#f85149', fontWeight: 'semibold' })}>
                ${analytics.worstTrade.pnl?.toFixed(2) || '0.00'}
              </span>
            </div>
            <div className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            })}>
              <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Time</span>
              <span className={css({ color: '#7d8590', fontSize: 'xs' })}>
                {formatTimeAgo(analytics.worstTrade.timestamp)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

