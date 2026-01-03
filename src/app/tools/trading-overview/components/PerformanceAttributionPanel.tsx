'use client';

import { useEffect, useState } from 'react';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { TradingAsset } from '@/lib/asset-config';

interface PerformanceAttributionData {
  overall: {
    totalTrades: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  };
  byRegime: Array<{
    regime: string;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  }>;
  byStrategy: Array<{
    strategy: string;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  }>;
}

interface PerformanceAttributionPanelProps {
  asset: TradingAsset;
}

export default function PerformanceAttributionPanel({ asset }: PerformanceAttributionPanelProps) {
  const [data, setData] = useState<PerformanceAttributionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(`/api/trading/performance-attribution?asset=${asset}`, {
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error('Error fetching performance attribution:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [asset]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getPnlColor = (value: number) => {
    if (value > 0) return '#3fb950';
    if (value < 0) return '#f85149';
    return '#7d8590';
  };

  if (isLoading) {
    return (
      <div className={css({
        padding: '16px',
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
      })}>
        <div className={css({ color: '#7d8590', fontSize: 'sm' })}>Loading performance attribution...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={css({
        padding: '16px',
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
      })}>
        <h3 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '8px', color: '#e6edf3' })}>
          Performance Attribution
        </h3>
        <div className={css({ color: '#7d8590', fontSize: 'sm' })}>
          {error || 'No data available'}
        </div>
      </div>
    );
  }

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h3 className={css({ 
        fontSize: 'md', 
        fontWeight: 'semibold', 
        marginBottom: '12px', 
        color: '#e6edf3' 
      })}>
        Performance Attribution
      </h3>

      <div className={stack({ gap: '16px' })}>
        {/* Overall Stats */}
        <div>
          <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '8px', textTransform: 'uppercase' })}>
            Overall
          </div>
          <div className={flex({ gap: '16px', flexWrap: 'wrap' })}>
            <div>
              <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Total P&L</div>
              <div className={css({ 
                color: getPnlColor(data.overall.totalPnl),
                fontSize: 'lg',
                fontWeight: 'bold'
              })}>
                {formatCurrency(data.overall.totalPnl)}
              </div>
            </div>
            <div>
              <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Win Rate</div>
              <div className={css({ color: '#e6edf3', fontSize: 'lg', fontWeight: 'bold' })}>
                {data.overall.winRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className={css({ color: '#7d8590', fontSize: 'xs' })}>Trades</div>
              <div className={css({ color: '#e6edf3', fontSize: 'lg', fontWeight: 'bold' })}>
                {data.overall.totalTrades}
              </div>
            </div>
          </div>
        </div>

        {/* By Regime */}
        {data.byRegime.length > 0 && (
          <div>
            <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '8px', textTransform: 'uppercase' })}>
              By Regime
            </div>
            <div className={stack({ gap: '8px' })}>
              {data.byRegime.map((regime) => (
                <div key={regime.regime} className={css({
                  padding: '8px',
                  bg: '#0d1117',
                  borderRadius: '4px',
                  border: '1px solid #21262d',
                })}>
                  <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' })}>
                    <span className={css({ 
                      color: '#e6edf3', 
                      fontSize: 'sm',
                      fontWeight: 'semibold',
                      textTransform: 'capitalize'
                    })}>
                      {regime.regime}
                    </span>
                    <span className={css({ 
                      color: getPnlColor(regime.totalPnl),
                      fontSize: 'sm',
                      fontWeight: 'bold'
                    })}>
                      {formatCurrency(regime.totalPnl)}
                    </span>
                  </div>
                  <div className={flex({ justifyContent: 'space-between', gap: '12px', fontSize: 'xs', color: '#7d8590' })}>
                    <span>{regime.tradeCount} trades</span>
                    <span>{regime.winRate.toFixed(1)}% win rate</span>
                    <span>Avg: {formatCurrency(regime.avgPnl)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Strategy */}
        {data.byStrategy.length > 0 && (
          <div>
            <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '8px', textTransform: 'uppercase' })}>
              By Strategy
            </div>
            <div className={stack({ gap: '8px' })}>
              {data.byStrategy.map((strategy) => (
                <div key={strategy.strategy} className={css({
                  padding: '8px',
                  bg: '#0d1117',
                  borderRadius: '4px',
                  border: '1px solid #21262d',
                })}>
                  <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' })}>
                    <span className={css({ 
                      color: '#e6edf3', 
                      fontSize: 'sm',
                      fontWeight: 'semibold'
                    })}>
                      {strategy.strategy}
                    </span>
                    <span className={css({ 
                      color: getPnlColor(strategy.totalPnl),
                      fontSize: 'sm',
                      fontWeight: 'bold'
                    })}>
                      {formatCurrency(strategy.totalPnl)}
                    </span>
                  </div>
                  <div className={flex({ justifyContent: 'space-between', gap: '12px', fontSize: 'xs', color: '#7d8590' })}>
                    <span>{strategy.tradeCount} trades</span>
                    <span>{strategy.winRate.toFixed(1)}% win rate</span>
                    <span>Avg: {formatCurrency(strategy.avgPnl)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

