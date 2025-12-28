'use client';

import { useRef, useState } from 'react';
import { css } from '@styled-system/css';
import type { PortfolioSnapshot, Trade } from '@/types';

interface PriceChartProps {
  portfolioHistory: PortfolioSnapshot[];
  trades: Trade[];
  timeRange?: '24h' | '7d' | '30d' | 'all';
}

export default function PriceChart({ portfolioHistory, trades, timeRange = '7d' }: PriceChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Filter history based on time range
  const filteredHistory = (() => {
    if (timeRange === 'all') return portfolioHistory;
    
    const now = Date.now();
    const cutoffTime = now - (
      timeRange === '24h' ? 24 * 60 * 60 * 1000 :
      timeRange === '7d' ? 7 * 24 * 60 * 60 * 1000 :
      30 * 24 * 60 * 60 * 1000
    );
    
    return portfolioHistory.filter(p => p.timestamp >= cutoffTime);
  })();

  if (filteredHistory.length === 0) {
    return (
      <div className={css({
        padding: '24px',
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#7d8590',
      })}>
        No price data available
      </div>
    );
  }

  const width = 1200;
  const height = 300;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const prices = filteredHistory.map(p => p.ethPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.1 || 10;
  const yMin = min - pad;
  const yMax = max + pad;

  const project = (value: number, index: number): { x: number; y: number } => {
    const x = (index / Math.max(filteredHistory.length - 1, 1)) * chartWidth + padding.left;
    const ratio = (value - yMin) / (yMax - yMin || 1);
    const y = padding.top + chartHeight - ratio * chartHeight;
    return { x, y };
  };

  // Build price line path
  const pricePath = filteredHistory
    .map((p, i) => {
      const { x, y } = project(p.ethPrice, i);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Map trades to chart positions
  const tradeMarkers = trades
    .filter(t => {
      const tradeTime = t.timestamp;
      return filteredHistory.some(p => Math.abs(p.timestamp - tradeTime) < 60 * 60 * 1000); // Within 1 hour
    })
    .map(trade => {
      const closestSnapshot = filteredHistory.reduce((closest, p) => {
        return Math.abs(p.timestamp - trade.timestamp) < Math.abs(closest.timestamp - trade.timestamp) ? p : closest;
      }, filteredHistory[0]);
      const index = filteredHistory.indexOf(closestSnapshot);
      const { x, y } = project(closestSnapshot.ethPrice, index);
      return { ...trade, x, y };
    });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const index = Math.round((x / chartWidth) * (filteredHistory.length - 1));
    if (index >= 0 && index < filteredHistory.length) {
      setHoveredIndex(index);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const hoveredData = hoveredIndex !== null ? filteredHistory[hoveredIndex] : null;

  return (
    <div className={css({
      padding: '24px',
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
    })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
        Price Chart ({timeRange})
      </h2>
      <div className={css({ position: 'relative' })}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className={css({ cursor: 'crosshair' })}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = padding.top + chartHeight - ratio * chartHeight;
            return (
              <line
                key={ratio}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#30363d"
                strokeWidth="1"
              />
            );
          })}

          {/* Price line */}
          <path
            d={pricePath}
            fill="none"
            stroke="#58a6ff"
            strokeWidth="2"
          />

          {/* Trade markers */}
          {tradeMarkers.map(trade => (
            <circle
              key={trade.id}
              cx={trade.x}
              cy={trade.y}
              r="6"
              fill={trade.type === 'buy' ? '#3fb950' : '#f85149'}
              stroke="#161b22"
              strokeWidth="2"
            />
          ))}

          {/* Hover indicator */}
          {hoveredData && (
            <>
              <line
                x1={project(hoveredData.ethPrice, filteredHistory.indexOf(hoveredData)).x}
                y1={padding.top}
                x2={project(hoveredData.ethPrice, filteredHistory.indexOf(hoveredData)).x}
                y2={height - padding.bottom}
                stroke="#7d8590"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle
                cx={project(hoveredData.ethPrice, filteredHistory.indexOf(hoveredData)).x}
                cy={project(hoveredData.ethPrice, filteredHistory.indexOf(hoveredData)).y}
                r="4"
                fill="#58a6ff"
              />
            </>
          )}

          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const value = yMin + (yMax - yMin) * (1 - ratio);
            const y = padding.top + chartHeight - ratio * chartHeight;
            return (
              <text
                key={ratio}
                x={padding.left - 10}
                y={y + 4}
                fill="#7d8590"
                fontSize="12"
                textAnchor="end"
              >
                ${value.toFixed(0)}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredData && (
          <div
            className={css({
              position: 'absolute',
              left: `${project(hoveredData.ethPrice, filteredHistory.indexOf(hoveredData)).x}px`,
              top: '10px',
              transform: 'translateX(-50%)',
              bg: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '4px',
              padding: '8px',
              fontSize: '12px',
              color: '#e6edf3',
              pointerEvents: 'none',
              zIndex: 10,
            })}
          >
            <div>Price: ${hoveredData.ethPrice.toFixed(2)}</div>
            <div>Value: ${hoveredData.totalValue.toFixed(2)}</div>
            <div>{new Date(hoveredData.timestamp).toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className={css({ display: 'flex', gap: '16px', marginTop: '12px', fontSize: 'sm', color: '#7d8590' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
          <div className={css({ width: '12px', height: '2px', bg: '#58a6ff' })} />
          <span>Price</span>
        </div>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
          <div className={css({ width: '12px', height: '12px', borderRadius: '50%', bg: '#3fb950' })} />
          <span>Buy</span>
        </div>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
          <div className={css({ width: '12px', height: '12px', borderRadius: '50%', bg: '#f85149' })} />
          <span>Sell</span>
        </div>
      </div>
    </div>
  );
}

