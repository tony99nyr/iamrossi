'use client';

import { useEffect, useState } from 'react';
import { css } from '@styled-system/css';
import type { StrategyRun } from '@/types';

interface StrategyComparisonTableProps {
  runIds: string[];
}

export default function StrategyComparisonTable({ runIds }: StrategyComparisonTableProps) {
  const [runs, setRuns] = useState<StrategyRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComparison = async () => {
      if (runIds.length === 0) return;

      setIsLoading(true);
      setError(null);
      try {
        const idsParam = runIds.join(',');
        const res = await fetch(`/api/trading/strategies/compare?ids=${idsParam}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 404) {
            // Endpoint not implemented yet - gracefully handle
            setError('Comparison feature not available');
            return;
          }
          throw new Error('Failed to fetch comparison data');
        }
        const data = await res.json();
        setRuns(data.runs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchComparison();
  }, [runIds]);

  if (isLoading) return <div className={css({ color: '#7d8590' })}>Loading comparison...</div>;
  if (error) return <div className={css({ color: '#f85149' })}>Error: {error}</div>;
  if (runs.length === 0) return null;

  const tableStyles = css({
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid',
    borderColor: '#30363d',
    bg: '#161b22',
  });

  const cellStyles = css({
    padding: '12px',
    border: '1px solid',
    borderColor: '#30363d',
    textAlign: 'left',
    color: '#c9d1d9',
  });

  const headerStyles = css({
    padding: '12px',
    border: '1px solid',
    borderColor: '#30363d',
    textAlign: 'left',
    bg: '#21262d',
    fontWeight: 'semibold',
    color: '#e6edf3',
  });

  return (
    <div className={css({ overflowX: 'auto' })}>
      <table className={tableStyles}>
        <thead>
          <tr>
            <th className={headerStyles}>Run</th>
            <th className={headerStyles}>Return</th>
            <th className={headerStyles}>Sharpe</th>
            <th className={headerStyles}>Calmar</th>
            <th className={headerStyles}>Drawdown</th>
            <th className={headerStyles}>Sortino</th>
            <th className={headerStyles}>Trades</th>
            <th className={headerStyles}>Win Rate</th>
            <th className={headerStyles}>Profit Factor</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => (
            <tr key={run.id}>
              <td className={cellStyles}>{run.name || run.id.substring(0, 8)}</td>
              <td
                className={css({
                  padding: '12px',
                  border: '1px solid',
                  borderColor: '#30363d',
                  textAlign: 'left',
                  color: run.results.totalReturn >= 0 ? '#3fb950' : '#f85149',
                  fontWeight: 'semibold',
                })}
              >
                {run.results.totalReturn.toFixed(2)}%
              </td>
              <td className={cellStyles}>{run.riskMetrics.sharpeRatio.toFixed(2)}</td>
              <td className={cellStyles}>{run.riskMetrics.calmarRatio.toFixed(2)}</td>
              <td className={cellStyles}>{run.riskMetrics.maxDrawdown.toFixed(2)}%</td>
              <td className={cellStyles}>{run.riskMetrics.sortinoRatio.toFixed(2)}</td>
              <td className={cellStyles}>{run.results.tradeCount}</td>
              <td className={cellStyles}>{run.results.winRate.toFixed(2)}%</td>
              <td className={cellStyles}>{run.results.profitFactor.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

