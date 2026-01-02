'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';
import { calculatePerformanceMetrics } from '@/lib/performance-metrics';

interface PerformanceMetricsPanelProps {
  ethSession: EnhancedPaperTradingSession | null;
  btcSession: EnhancedPaperTradingSession | null;
}

interface MetricRowProps {
  label: string;
  ethValue: number | null | undefined;
  btcValue: number | null | undefined;
  format?: (value: number) => string;
  color?: (value: number) => string;
}

const MetricRow = ({ label, ethValue, btcValue, format, color }: MetricRowProps) => {
  const defaultFormat = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };
  const formatter = format || defaultFormat;
  
  return (
    <div className={flex({ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' })}>
      <span className={css({ color: '#7d8590', fontSize: 'sm', flex: '1' })}>{label}</span>
      <div className={flex({ gap: '24px', flex: '2' })}>
        <span className={css({ 
          color: ethValue !== null && ethValue !== undefined 
            ? (color ? color(ethValue) : '#e6edf3') 
            : '#7d8590', 
          fontSize: 'sm',
          fontWeight: 'medium',
          textAlign: 'right',
          minWidth: '80px'
        })}>
          {ethValue !== null && ethValue !== undefined ? formatter(ethValue) : '—'}
        </span>
        <span className={css({ 
          color: btcValue !== null && btcValue !== undefined 
            ? (color ? color(btcValue) : '#e6edf3') 
            : '#7d8590', 
          fontSize: 'sm',
          fontWeight: 'medium',
          textAlign: 'right',
          minWidth: '80px'
        })}>
          {btcValue !== null && btcValue !== undefined ? formatter(btcValue) : '—'}
        </span>
      </div>
    </div>
  );
};

export default function PerformanceMetricsPanel({ ethSession, btcSession }: PerformanceMetricsPanelProps) {
  const ethMetrics = useMemo(() => {
    if (!ethSession) return null;
    return calculatePerformanceMetrics(ethSession);
  }, [ethSession]);

  const btcMetrics = useMemo(() => {
    if (!btcSession) return null;
    return calculatePerformanceMetrics(btcSession);
  }, [btcSession]);

  const formatUsd = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatNumber = (value: number, decimals: number = 2) => {
    if (value === Infinity) return '∞';
    if (value > 999) return value.toFixed(decimals);
    return value.toFixed(decimals);
  };

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        Performance Metrics
      </h2>

      <div className={stack({ gap: '16px' })}>
        {/* Returns Section */}
        <div>
          <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '8px', color: '#c9d1d9' })}>
            Returns
          </h3>
          <div className={css({ borderTop: '1px solid #30363d', paddingTop: '8px' })}>
            <MetricRow 
              label="Total Return" 
              ethValue={ethMetrics?.totalReturn} 
              btcValue={btcMetrics?.totalReturn}
              color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
            />
            <MetricRow 
              label="Daily Return" 
              ethValue={ethMetrics?.dailyReturn} 
              btcValue={btcMetrics?.dailyReturn}
              color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
            />
            <MetricRow 
              label="Weekly Return" 
              ethValue={ethMetrics?.weeklyReturn} 
              btcValue={btcMetrics?.weeklyReturn}
              color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
            />
          </div>
        </div>

        {/* Risk Metrics Section */}
        <div>
          <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '8px', color: '#c9d1d9' })}>
            Risk Metrics
          </h3>
          <div className={css({ borderTop: '1px solid #30363d', paddingTop: '8px' })}>
            <MetricRow 
              label="Max Drawdown" 
              ethValue={ethMetrics?.maxDrawdown} 
              btcValue={btcMetrics?.maxDrawdown}
              color={(v) => v > 20 ? '#f85149' : v > 10 ? '#f79009' : '#3fb950'}
            />
            <MetricRow 
              label="Current Drawdown" 
              ethValue={ethMetrics?.currentDrawdown} 
              btcValue={btcMetrics?.currentDrawdown}
              color={(v) => v > 15 ? '#f85149' : v > 5 ? '#f79009' : '#3fb950'}
            />
            <MetricRow 
              label="Sharpe Ratio" 
              ethValue={ethMetrics?.sharpeRatio} 
              btcValue={btcMetrics?.sharpeRatio}
              format={formatNumber}
              color={(v) => v > 2 ? '#3fb950' : v > 1 ? '#f79009' : '#7d8590'}
            />
            <MetricRow 
              label="Sortino Ratio" 
              ethValue={ethMetrics?.sortinoRatio} 
              btcValue={btcMetrics?.sortinoRatio}
              format={formatNumber}
              color={(v) => v > 2 ? '#3fb950' : v > 1 ? '#f79009' : '#7d8590'}
            />
            <MetricRow 
              label="Calmar Ratio" 
              ethValue={ethMetrics?.calmarRatio} 
              btcValue={btcMetrics?.calmarRatio}
              format={formatNumber}
              color={(v) => v > 1 ? '#3fb950' : v > 0.5 ? '#f79009' : '#7d8590'}
            />
          </div>
        </div>

        {/* Trade Metrics Section */}
        <div>
          <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '8px', color: '#c9d1d9' })}>
            Trade Metrics
          </h3>
          <div className={css({ borderTop: '1px solid #30363d', paddingTop: '8px' })}>
            <MetricRow 
              label="Trade Count" 
              ethValue={ethMetrics?.tradeCount} 
              btcValue={btcMetrics?.tradeCount}
              format={(v) => v.toString()}
            />
            <MetricRow 
              label="Win Rate" 
              ethValue={ethMetrics?.winRate} 
              btcValue={btcMetrics?.winRate}
              color={(v) => v > 60 ? '#3fb950' : v > 50 ? '#f79009' : '#7d8590'}
            />
            <MetricRow 
              label="Profit Factor" 
              ethValue={ethMetrics?.profitFactor} 
              btcValue={btcMetrics?.profitFactor}
              format={formatNumber}
              color={(v) => v > 2 ? '#3fb950' : v > 1.5 ? '#f79009' : '#7d8590'}
            />
            <MetricRow 
              label="Avg Win" 
              ethValue={ethMetrics?.averageWin} 
              btcValue={btcMetrics?.averageWin}
              format={formatUsd}
            />
            <MetricRow 
              label="Avg Loss" 
              ethValue={ethMetrics?.averageLoss} 
              btcValue={btcMetrics?.averageLoss}
              format={formatUsd}
            />
            <MetricRow 
              label="Avg Trade P&L" 
              ethValue={ethMetrics?.averageTradePnl} 
              btcValue={btcMetrics?.averageTradePnl}
              format={formatUsd}
              color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
            />
          </div>
        </div>

        {/* Performance Attribution Section */}
        {(ethMetrics?.returnsByRegime || btcMetrics?.returnsByRegime) && (
          <div>
            <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', marginBottom: '8px', color: '#c9d1d9' })}>
              Returns by Regime
            </h3>
            <div className={css({ borderTop: '1px solid #30363d', paddingTop: '8px' })}>
              <MetricRow 
                label="Bullish" 
                ethValue={ethMetrics?.returnsByRegime?.bullish} 
                btcValue={btcMetrics?.returnsByRegime?.bullish}
                color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
              />
              <MetricRow 
                label="Bearish" 
                ethValue={ethMetrics?.returnsByRegime?.bearish} 
                btcValue={btcMetrics?.returnsByRegime?.bearish}
                color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
              />
              <MetricRow 
                label="Neutral" 
                ethValue={ethMetrics?.returnsByRegime?.neutral} 
                btcValue={btcMetrics?.returnsByRegime?.neutral}
                color={(v) => v >= 0 ? '#3fb950' : '#f85149'}
              />
            </div>
          </div>
        )}

        {/* Column Headers */}
        <div className={css({ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '24px', 
          paddingTop: '8px',
          borderTop: '1px solid #30363d',
          marginTop: '8px'
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'xs', fontWeight: 'semibold', minWidth: '80px', textAlign: 'right' })}>
            ETH
          </span>
          <span className={css({ color: '#7d8590', fontSize: 'xs', fontWeight: 'semibold', minWidth: '80px', textAlign: 'right' })}>
            BTC
          </span>
        </div>
      </div>
    </div>
  );
}

