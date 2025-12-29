'use client';

import { useMemo } from 'react';
import { css } from '@styled-system/css';
import { stack } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface PositionRiskPanelProps {
  session: EnhancedPaperTradingSession;
}

export default function PositionRiskPanel({ session }: PositionRiskPanelProps) {
  const { portfolio, lastSignal, lastPrice } = session;

  const positionMetrics = useMemo(() => {
    const totalValue = portfolio.totalValue;
    const ethValue = portfolio.ethBalance * lastPrice;
    const usdcValue = portfolio.usdcBalance;
    
    const currentPositionPct = totalValue > 0 ? (ethValue / totalValue) * 100 : 0;
    
    // Calculate target position from strategy
    const activeStrategy = lastSignal.activeStrategy;
    const maxPositionPct = activeStrategy?.maxPositionPct || 0.75;
    const positionSizeMultiplier = lastSignal.positionSizeMultiplier || 1.0;
    const adjustedPositionPct = Math.min(
      maxPositionPct * positionSizeMultiplier,
      session.config.maxBullishPosition || 0.95
    );
    
    const targetPositionPct = lastSignal.action === 'buy' && lastSignal.signal > 0
      ? adjustedPositionPct * 100
      : lastSignal.action === 'sell' && lastSignal.signal < 0
      ? (maxPositionPct * 0.5) * 100 // Sell target is typically lower
      : currentPositionPct;
    
    const positionDeviation = Math.abs(currentPositionPct - targetPositionPct);
    
    // Calculate risk per trade (simplified - based on confidence and position size)
    const confidence = lastSignal.confidence || 0;
    const riskPerTrade = totalValue * confidence * (adjustedPositionPct / 100);
    
    // Portfolio heat (concentration risk) - how much is in a single position
    const portfolioHeat = currentPositionPct; // For single asset, this is the concentration
    
    return {
      currentPositionPct,
      targetPositionPct,
      positionDeviation,
      positionMultiplier: positionSizeMultiplier,
      riskPerTrade,
      portfolioHeat,
      ethValue,
      usdcValue,
    };
  }, [portfolio, lastSignal, lastPrice, session.config]);

  return (
    <div className={css({
      padding: '24px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        Position & Risk
      </h2>
      
      <div className={stack({ gap: '12px' })}>
        {/* Current Position */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Current Position</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            {positionMetrics.currentPositionPct.toFixed(1)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Target Position</span>
          <span className={css({ color: '#7d8590' })}>
            {positionMetrics.targetPositionPct.toFixed(1)}%
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Position Deviation</span>
          <span className={css({
            color: positionMetrics.positionDeviation > 20 ? '#f85149' : positionMetrics.positionDeviation > 10 ? '#eab308' : '#3fb950',
            fontWeight: 'semibold',
          })}>
            {positionMetrics.positionDeviation.toFixed(1)}%
          </span>
        </div>

        {positionMetrics.positionMultiplier !== 1.0 && (
          <div className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Position Multiplier</span>
            <span className={css({
              color: positionMetrics.positionMultiplier > 1 ? '#3fb950' : '#7d8590',
              fontWeight: 'semibold',
            })}>
              {positionMetrics.positionMultiplier.toFixed(2)}x
            </span>
          </div>
        )}

        <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />

        {/* Position Breakdown */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>ETH Value</span>
          <span className={css({ color: '#e6edf3' })}>
            ${positionMetrics.ethValue.toFixed(2)}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>USDC Balance</span>
          <span className={css({ color: '#e6edf3' })}>
            ${positionMetrics.usdcValue.toFixed(2)}
          </span>
        </div>

        <div className={css({ height: '1px', bg: '#30363d', margin: '8px 0' })} />

        {/* Risk Metrics */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Risk per Trade</span>
          <span className={css({ color: '#e6edf3', fontWeight: 'semibold' })}>
            ${positionMetrics.riskPerTrade.toFixed(2)}
          </span>
        </div>

        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}>
          <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Portfolio Heat</span>
          <span className={css({
            color: positionMetrics.portfolioHeat > 80 ? '#f85149' : positionMetrics.portfolioHeat > 60 ? '#eab308' : '#3fb950',
            fontWeight: 'semibold',
          })}>
            {positionMetrics.portfolioHeat.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

