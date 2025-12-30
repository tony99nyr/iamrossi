'use client';

import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { Portfolio } from '@/types';

interface PortfolioDisplayProps {
  portfolio: Portfolio;
}

export default function PortfolioDisplay({ portfolio }: PortfolioDisplayProps) {
  const returnColor = portfolio.totalReturn >= 0 ? '#3fb950' : '#f85149';
  const returnSign = portfolio.totalReturn >= 0 ? '+' : '';

  return (
    <div className={css({
      padding: '16px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
        Portfolio
      </h2>
      <div className={stack({ gap: '8px' })}>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590' })}>Total Value</span>
          <span className={css({ fontSize: 'xl', fontWeight: 'bold', color: '#e6edf3' })}>
            ${portfolio.totalValue.toFixed(2)}
          </span>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590' })}>Total Return</span>
          <span className={css({ fontSize: 'lg', fontWeight: 'semibold', color: returnColor })}>
            {returnSign}{portfolio.totalReturn.toFixed(2)}%
          </span>
        </div>
        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590' })}>USDC Balance</span>
          <span className={css({ color: '#e6edf3' })}>${portfolio.usdcBalance.toFixed(2)}</span>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590' })}>ETH Balance</span>
          <span className={css({ color: '#e6edf3' })}>{portfolio.ethBalance.toFixed(4)} ETH</span>
        </div>
        <div className={css({ height: '1px', bg: '#30363d', margin: '6px 0' })} />
        <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
          <span className={css({ color: '#7d8590' })}>Trades</span>
          <span className={css({ color: '#e6edf3' })}>
            {portfolio.tradeCount} ({portfolio.winCount} wins)
          </span>
        </div>
      </div>
    </div>
  );
}

