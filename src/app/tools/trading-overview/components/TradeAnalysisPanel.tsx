'use client';

import { useEffect, useState } from 'react';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { TradingAsset } from '@/lib/asset-config';

interface TradeAnalysisData {
  overall: {
    totalTrades: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  };
  byTimeOfDay: Array<{
    hour: number;
    hourLabel: string;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  }>;
  byRegime: Array<{
    regime: string;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  }>;
  bySignalStrength: Array<{
    strength: string;
    minConfidence: number;
    maxConfidence: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
  }>;
}

interface TradeAnalysisPanelProps {
  asset: TradingAsset;
}

export default function TradeAnalysisPanel({ asset }: TradeAnalysisPanelProps) {
  const [data, setData] = useState<TradeAnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'time' | 'regime' | 'strength'>('time');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(`/api/trading/trade-analysis?asset=${asset}`, {
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error('Error fetching trade analysis:', err);
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

  const getStrengthLabel = (strength: string) => {
    const labels: Record<string, string> = {
      'very-high': 'Very High (80-100%)',
      'high': 'High (60-80%)',
      'medium': 'Medium (40-60%)',
      'low': 'Low (20-40%)',
      'very-low': 'Very Low (0-20%)',
    };
    return labels[strength] || strength;
  };

  if (isLoading) {
    return (
      <div className={css({
        padding: '16px',
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
      })}>
        <div className={css({ color: '#7d8590', fontSize: 'sm' })}>Loading trade analysis...</div>
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
          Trade Analysis
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
        Trade Analysis
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

        {/* Tabs */}
        <div className={flex({ gap: '8px', borderBottom: '1px solid #21262d' })}>
          <button
            onClick={() => setActiveTab('time')}
            className={css({
              padding: '8px 12px',
              borderBottom: activeTab === 'time' ? '2px solid #3fb950' : '2px solid transparent',
              color: activeTab === 'time' ? '#e6edf3' : '#7d8590',
              fontSize: 'sm',
              cursor: 'pointer',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              '&:hover': { color: '#e6edf3' },
            })}
          >
            Time of Day
          </button>
          <button
            onClick={() => setActiveTab('regime')}
            className={css({
              padding: '8px 12px',
              borderBottom: activeTab === 'regime' ? '2px solid #3fb950' : '2px solid transparent',
              color: activeTab === 'regime' ? '#e6edf3' : '#7d8590',
              fontSize: 'sm',
              cursor: 'pointer',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              '&:hover': { color: '#e6edf3' },
            })}
          >
            Regime
          </button>
          <button
            onClick={() => setActiveTab('strength')}
            className={css({
              padding: '8px 12px',
              borderBottom: activeTab === 'strength' ? '2px solid #3fb950' : '2px solid transparent',
              color: activeTab === 'strength' ? '#e6edf3' : '#7d8590',
              fontSize: 'sm',
              cursor: 'pointer',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              '&:hover': { color: '#e6edf3' },
            })}
          >
            Signal Strength
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'time' && data.byTimeOfDay.length > 0 && (
          <div className={stack({ gap: '8px' })}>
            {data.byTimeOfDay.map((item) => (
              <div key={item.hour} className={css({
                padding: '8px',
                bg: '#0d1117',
                borderRadius: '4px',
                border: '1px solid #21262d',
              })}>
                <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' })}>
                  <span className={css({ color: '#e6edf3', fontSize: 'sm', fontWeight: 'semibold' })}>
                    {item.hourLabel}
                  </span>
                  <span className={css({ 
                    color: getPnlColor(item.totalPnl),
                    fontSize: 'sm',
                    fontWeight: 'bold'
                  })}>
                    {formatCurrency(item.totalPnl)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between', gap: '12px', fontSize: 'xs', color: '#7d8590' })}>
                  <span>{item.tradeCount} trades</span>
                  <span>{item.winRate.toFixed(1)}% win rate</span>
                  <span>Avg: {formatCurrency(item.avgPnl)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'regime' && data.byRegime.length > 0 && (
          <div className={stack({ gap: '8px' })}>
            {data.byRegime.map((item) => (
              <div key={item.regime} className={css({
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
                    {item.regime}
                  </span>
                  <span className={css({ 
                    color: getPnlColor(item.totalPnl),
                    fontSize: 'sm',
                    fontWeight: 'bold'
                  })}>
                    {formatCurrency(item.totalPnl)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between', gap: '12px', fontSize: 'xs', color: '#7d8590' })}>
                  <span>{item.tradeCount} trades</span>
                  <span>{item.winRate.toFixed(1)}% win rate</span>
                  <span>Avg: {formatCurrency(item.avgPnl)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'strength' && data.bySignalStrength.length > 0 && (
          <div className={stack({ gap: '8px' })}>
            {data.bySignalStrength.map((item) => (
              <div key={item.strength} className={css({
                padding: '8px',
                bg: '#0d1117',
                borderRadius: '4px',
                border: '1px solid #21262d',
              })}>
                <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' })}>
                  <span className={css({ color: '#e6edf3', fontSize: 'sm', fontWeight: 'semibold' })}>
                    {getStrengthLabel(item.strength)}
                  </span>
                  <span className={css({ 
                    color: getPnlColor(item.totalPnl),
                    fontSize: 'sm',
                    fontWeight: 'bold'
                  })}>
                    {formatCurrency(item.totalPnl)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between', gap: '12px', fontSize: 'xs', color: '#7d8590' })}>
                  <span>{item.tradeCount} trades</span>
                  <span>{item.winRate.toFixed(1)}% win rate</span>
                  <span>Avg: {formatCurrency(item.avgPnl)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

