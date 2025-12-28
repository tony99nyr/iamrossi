'use client';

import { css } from '@styled-system/css';
import { flex, stack } from '@styled-system/patterns';
import type { StrategyRun } from '@/types';

interface StrategyRunCardProps {
  run: StrategyRun;
  isSelected: boolean;
  onSelect: () => void;
}

export default function StrategyRunCard({ run, isSelected, onSelect }: StrategyRunCardProps) {
  const cardStyles = css({
    padding: '16px',
    border: '1px solid',
    borderColor: isSelected ? '#1f6feb' : '#30363d',
    borderRadius: '8px',
    bg: isSelected ? 'rgba(31, 111, 235, 0.1)' : '#161b22',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    _hover: {
      borderColor: '#1f6feb',
      bg: isSelected ? 'rgba(31, 111, 235, 0.15)' : '#1c2128',
    },
  });

  return (
    <div className={cardStyles} onClick={onSelect}>
      <div className={flex({ gap: '16px', alignItems: 'start' })}>
        <div className={stack({ gap: '8px', flex: 1 })}>
          <div className={flex({ gap: '12px', alignItems: 'center' })}>
            <h3 className={css({ fontSize: 'lg', fontWeight: 'semibold', color: '#e6edf3' })}>
              {run.name || `Run ${run.id.substring(0, 8)}`}
            </h3>
            <span
              className={css({
                px: '8px',
                py: '2px',
                borderRadius: '4px',
                fontSize: 'sm',
                bg: run.type === 'backtest' ? 'rgba(56, 178, 172, 0.2)' : 'rgba(31, 111, 235, 0.2)',
                color: run.type === 'backtest' ? '#56d4dd' : '#58a6ff',
              })}
            >
              {run.type}
            </span>
          </div>

          <div className={flex({ gap: '24px', flexWrap: 'wrap' })}>
            <div>
              <div className={css({ fontSize: 'sm', color: '#7d8590' })}>Total Return</div>
              <div
                className={css({
                  fontSize: 'lg',
                  fontWeight: 'bold',
                  color: run.results.totalReturn >= 0 ? '#3fb950' : '#f85149',
                })}
              >
                {run.results.totalReturn.toFixed(2)}%
              </div>
            </div>

            <div>
              <div className={css({ fontSize: 'sm', color: '#7d8590' })}>Sharpe Ratio</div>
              <div className={css({ fontSize: 'lg', fontWeight: 'bold', color: '#c9d1d9' })}>
                {run.riskMetrics.sharpeRatio.toFixed(2)}
              </div>
            </div>

            <div>
              <div className={css({ fontSize: 'sm', color: '#7d8590' })}>Max Drawdown</div>
              <div className={css({ fontSize: 'lg', fontWeight: 'bold', color: '#c9d1d9' })}>
                {run.riskMetrics.maxDrawdown.toFixed(2)}%
              </div>
            </div>

            <div>
              <div className={css({ fontSize: 'sm', color: '#7d8590' })}>Trades</div>
              <div className={css({ fontSize: 'lg', fontWeight: 'bold', color: '#c9d1d9' })}>
                {run.results.tradeCount}
              </div>
            </div>

            <div>
              <div className={css({ fontSize: 'sm', color: '#7d8590' })}>Win Rate</div>
              <div className={css({ fontSize: 'lg', fontWeight: 'bold', color: '#c9d1d9' })}>
                {run.results.winRate.toFixed(2)}%
              </div>
            </div>
          </div>

          {run.startDate && run.endDate && (
            <div className={css({ fontSize: 'sm', color: '#7d8590' })}>
              {run.startDate} to {run.endDate}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

