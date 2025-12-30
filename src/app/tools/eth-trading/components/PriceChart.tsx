'use client';

import { useRef, useState, useMemo } from 'react';
import { css } from '@styled-system/css';
import type { PortfolioSnapshot, Trade, PriceCandle } from '@/types';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD } from '@/lib/indicators';
import { detectMarketRegimeCached, clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface PriceChartProps {
  portfolioHistory: PortfolioSnapshot[];
  trades: Trade[];
  timeRange?: 'all' | 'ytd' | '6m' | '3m' | '1m' | '14d' | '7d' | '1d';
  session?: EnhancedPaperTradingSession | null;
}

export default function PriceChart({ portfolioHistory, trades, timeRange = 'all', session }: PriceChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter history based on time range (matching Pokemon chart logic)
  const filteredHistory = useMemo(() => {
    if (timeRange === 'all') return portfolioHistory;
    
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in useMemo
    const now = Date.now();
    let cutoffTime: number;
    
    switch (timeRange) {
      case 'ytd': {
        const cutoffDate = new Date();
        cutoffDate.setMonth(0, 1); // January 1st
        cutoffDate.setHours(0, 0, 0, 0);
        cutoffTime = cutoffDate.getTime();
        break;
      }
      case '6m': {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 6);
        cutoffTime = cutoffDate.getTime();
        break;
      }
      case '3m': {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 3);
        cutoffTime = cutoffDate.getTime();
        break;
      }
      case '1m': {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
        cutoffTime = cutoffDate.getTime();
        break;
      }
      case '14d':
        cutoffTime = now - 14 * 24 * 60 * 60 * 1000;
        break;
      case '7d':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '1d':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      default:
        return portfolioHistory;
    }
    
    return portfolioHistory.filter(p => p.timestamp >= cutoffTime);
  }, [portfolioHistory, timeRange]);

  const width = 1200;
  const height = 550;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const prices = useMemo(() => filteredHistory.map(p => p.ethPrice), [filteredHistory]);
  const min = useMemo(() => Math.min(...prices), [prices]);
  const max = useMemo(() => Math.max(...prices), [prices]);
  const pad = useMemo(() => (max - min) * 0.1 || 10, [max, min]);
  const yMin = useMemo(() => min - pad, [min, pad]);
  const yMax = useMemo(() => max + pad, [max, pad]);

  // Calculate moving averages
  const sma7 = useMemo(() => {
    const ma = calculateSMA(prices, 7);
    // Pad with nulls at the beginning to align with price data
    return Array(prices.length - ma.length).fill(null).concat(ma);
  }, [prices]);

  const sma30 = useMemo(() => {
    const ma = calculateSMA(prices, 30);
    return Array(prices.length - ma.length).fill(null).concat(ma);
  }, [prices]);

  const ema12 = useMemo(() => {
    const ma = calculateEMA(prices, 12);
    return Array(prices.length - ma.length).fill(null).concat(ma);
  }, [prices]);

  const ema26 = useMemo(() => {
    const ma = calculateEMA(prices, 26);
    return Array(prices.length - ma.length).fill(null).concat(ma);
  }, [prices]);

  // Calculate RSI
  const rsi = useMemo(() => {
    const rsiValues = calculateRSI(prices, 14);
    return Array(prices.length - rsiValues.length).fill(null).concat(rsiValues);
  }, [prices]);

  // Calculate MACD
  const macdData = useMemo(() => {
    const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);
    const macdOffset = prices.length - macd.length;
    const signalOffset = prices.length - signal.length;
    return {
      macd: Array(macdOffset).fill(null).concat(macd),
      signal: Array(signalOffset).fill(null).concat(signal),
      histogram: Array(signalOffset).fill(null).concat(histogram),
    };
  }, [prices]);

  // Calculate regimes for visualization (if session is available) - must be before early return
  const regimeRegions = useMemo(() => {
    if (!session || filteredHistory.length < 50) return [];
    
    // Clear cache to ensure fresh calculation with proper smoothing and hysteresis
    // This ensures the smoothing builds up correctly from the start
    clearIndicatorCache();
    
    // Create synthetic candles from portfolioHistory for regime detection
    const candles: PriceCandle[] = filteredHistory.map((snapshot, index) => {
      const prevPrice = index > 0 ? filteredHistory[index - 1]!.ethPrice : snapshot.ethPrice;
      return {
        timestamp: snapshot.timestamp,
        open: prevPrice,
        high: Math.max(snapshot.ethPrice, prevPrice),
        low: Math.min(snapshot.ethPrice, prevPrice),
        close: snapshot.ethPrice,
        volume: 0,
      };
    });
    
    // Calculate regimes for all points
    const regions: Array<{ start: number; end: number; regime: 'bullish' | 'bearish' | 'neutral'; confidence: number }> = [];
    let currentRegime: 'bullish' | 'bearish' | 'neutral' | null = null;
    let currentStart = 0;
    let currentConfidence = 0;
    
    for (let i = 50; i < candles.length; i++) {
      const regimeSignal = detectMarketRegimeCached(candles, i);
      const regime = regimeSignal.regime;
      const confidence = regimeSignal.confidence;
      
      if (regime !== currentRegime) {
        // Save previous region
        if (currentRegime !== null && i > currentStart) {
          regions.push({
            start: currentStart,
            end: i - 1,
            regime: currentRegime,
            confidence: currentConfidence,
          });
        }
        // Start new region
        currentRegime = regime;
        currentStart = i;
        currentConfidence = confidence;
      } else {
        // Update confidence for current region
        currentConfidence = Math.max(currentConfidence, confidence);
      }
    }
    
    // Add final region
    if (currentRegime !== null && candles.length > currentStart) {
      regions.push({
        start: currentStart,
        end: candles.length - 1,
        regime: currentRegime,
        confidence: currentConfidence,
      });
    }
    
    // Convert to chart coordinates
    return regions.map(region => {
      const startX = (region.start / Math.max(filteredHistory.length - 1, 1)) * chartWidth + padding.left;
      const endX = (region.end / Math.max(filteredHistory.length - 1, 1)) * chartWidth + padding.left;
      return {
        ...region,
        x: startX,
        width: endX - startX,
      };
    });
  }, [session, filteredHistory, chartWidth, padding.left]);

  // Calculate regime for hovered point (for tooltip) - must be before early return
  const hoveredRegime = useMemo(() => {
    if (!session || hoveredIndex === null || hoveredIndex < 50) return null;
    
    const candles: PriceCandle[] = filteredHistory.map((snapshot, index) => {
      const prevPrice = index > 0 ? filteredHistory[index - 1]!.ethPrice : snapshot.ethPrice;
      return {
        timestamp: snapshot.timestamp,
        open: prevPrice,
        high: Math.max(snapshot.ethPrice, prevPrice),
        low: Math.min(snapshot.ethPrice, prevPrice),
        close: snapshot.ethPrice,
        volume: 0,
      };
    });
    
    return detectMarketRegimeCached(candles, hoveredIndex);
  }, [session, hoveredIndex, filteredHistory]);

  // Early return after all hooks
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

  // Build moving average paths using polyline format (like Pokemon chart)
  const buildMAPath = (maValues: (number | null)[]): string | null => {
    const points: string[] = [];
    maValues.forEach((value, i) => {
      if (value !== null && i < filteredHistory.length) {
        const { x, y } = project(value, i);
        points.push(`${x},${y}`);
      }
    });
    return points.length > 0 ? points.join(' ') : null;
  };

  const sma7Path = buildMAPath(sma7);
  const sma30Path = buildMAPath(sma30);
  const ema12Path = buildMAPath(ema12);
  const ema26Path = buildMAPath(ema26);

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
    if (!svgRef.current || !containerRef.current) return;
    
    const svgRect = svgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // Calculate the scale factor for responsive SVG
    const scaleX = width / svgRect.width;
    const scaleY = height / svgRect.height;
    
    // Convert mouse position to SVG coordinates
    const x = (e.clientX - svgRect.left) * scaleX - padding.left;
    const y = (e.clientY - svgRect.top) * scaleY;
    
    // Find the closest data point
    let closestIndex = 0;
    let minDistance = Infinity;
    
    filteredHistory.forEach((_, index) => {
      const { x: px } = project(filteredHistory[index].ethPrice, index);
      const distance = Math.abs(x - px);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });
    
    // Only show tooltip if we're within the chart area
    if (x >= 0 && x <= chartWidth && 
        y >= padding.top && y <= height - padding.bottom) {
      setHoveredIndex(closestIndex);
      
      // Get the actual data point's position in SVG coordinates
      const dataPoint = project(filteredHistory[closestIndex].ethPrice, closestIndex);
      
      // Convert data point's SVG X position to container-relative coordinates
      // SVG X is in viewBox coordinates (0 to width), convert to actual pixel position
      const svgOffsetX = svgRect.left - containerRect.left;
      const dataPointXInContainer = (dataPoint.x / width) * svgRect.width + svgOffsetX;
      
      // Use cursor Y position for vertical alignment (follows cursor)
      const relativeY = e.clientY - containerRect.top;
      
      setTooltipPosition({ x: dataPointXInContainer, y: relativeY });
      
      // Calculate tooltip style to prevent going off-screen
      const containerWidth = containerRef.current?.offsetWidth || 0;
      const tooltipWidth = 200;
      // Position tooltip at the data point's X position, with offset
      const left = dataPointXInContainer + 15 > containerWidth - tooltipWidth
        ? dataPointXInContainer - tooltipWidth - 15
        : dataPointXInContainer + 15;
      const top = relativeY < 100
        ? relativeY + 15
        : relativeY - 10;
      const transform = relativeY < 100 ? 'none' : 'translateY(-100%)';
      
      setTooltipStyle({
        left: `${left}px`,
        top: `${top}px`,
        transform,
      });
    } else {
      setHoveredIndex(null);
      setTooltipPosition(null);
      setTooltipStyle({});
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipPosition(null);
    setTooltipStyle({});
  };

  const hoveredData = hoveredIndex !== null ? filteredHistory[hoveredIndex] : null;

  return (
    <div className={css({
      padding: { base: '12px', md: '24px' },
      bg: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
      overflowX: 'auto',
    })}>
      <h2 className={css({ 
        fontSize: { base: 'md', md: 'lg' }, 
        fontWeight: 'semibold', 
        marginBottom: { base: '12px', md: '16px' }, 
        color: '#e6edf3' 
      })}>
        Price Chart ({timeRange === 'all' ? 'All' : timeRange === 'ytd' ? 'YTD' : timeRange === '6m' ? '6M' : timeRange === '3m' ? '3M' : timeRange === '1m' ? '1M' : timeRange === '14d' ? '14D' : timeRange === '7d' ? '7D' : '1D'})
      </h2>
      <div 
        ref={containerRef}
        className={css({ position: 'relative', width: '100%' })}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={css({
            width: '100%',
            height: 'auto',
            cursor: 'crosshair',
          })}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <rect x="0" y="0" width={width} height={height} fill="#161b22" />
          
          {/* Regime background regions */}
          {regimeRegions.map((region, i) => {
            const color = region.regime === 'bullish' ? 'rgba(63, 185, 80, 0.1)' :
                          region.regime === 'bearish' ? 'rgba(248, 81, 73, 0.1)' :
                          'rgba(125, 133, 144, 0.05)';
            return (
              <rect
                key={i}
                x={region.x}
                y={padding.top}
                width={region.width}
                height={chartHeight}
                fill={color}
              />
            );
          })}
          
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

          {/* EMA 26 (slow) */}
          {ema26Path && (
            <polyline
              points={ema26Path}
              fill="none"
              stroke="#eab308"
              strokeWidth="2"
              strokeDasharray="2 6"
            />
          )}

          {/* EMA 12 (fast) */}
          {ema12Path && (
            <polyline
              points={ema12Path}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeDasharray="2 2"
              opacity={0.8}
            />
          )}

          {/* SMA 30 */}
          {sma30Path && (
            <polyline
              points={sma30Path}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}

          {/* SMA 7 */}
          {sma7Path && (
            <polyline
              points={sma7Path}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="1.5"
              strokeDasharray="2 2"
              opacity={0.8}
            />
          )}

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
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            // Calculate value from bottom (yMin) to top (yMax)
            const value = yMin + (yMax - yMin) * ratio;
            // Calculate Y position from top (low ratio = bottom, high ratio = top)
            const y = padding.top + chartHeight - ratio * chartHeight;
            return (
              <text
                key={i}
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
        {tooltipPosition && hoveredData && hoveredIndex !== null && (
          <div
            className={css({
              position: 'absolute',
              bg: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '10px 12px',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              minWidth: '160px',
              maxWidth: '200px',
            })}
            style={tooltipStyle}
          >
            <div className={css({
              color: '#e5e7eb',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '6px',
            })}>
              {new Date(hoveredData.timestamp).toLocaleString()}
            </div>
            <div className={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '0.8rem',
            })}>
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              })}>
                <span className={css({ color: '#9ca3af' })}>Price:</span>
                <span className={css({ color: '#58a6ff', fontWeight: 500 })}>
                  ${hoveredData.ethPrice.toFixed(2)}
                </span>
              </div>
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              })}>
                <span className={css({ color: '#9ca3af' })}>Value:</span>
                <span className={css({ color: '#e5e7eb', fontWeight: 500 })}>
                  ${hoveredData.totalValue.toFixed(2)}
                </span>
              </div>
              {sma7[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>SMA 7:</span>
                  <span className={css({ color: '#60a5fa', fontWeight: 500 })}>
                    ${sma7[hoveredIndex]!.toFixed(2)}
                  </span>
                </div>
              )}
              {sma30[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>SMA 30:</span>
                  <span className={css({ color: '#22c55e', fontWeight: 500 })}>
                    ${sma30[hoveredIndex]!.toFixed(2)}
                  </span>
                </div>
              )}
              {ema12[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>EMA 12:</span>
                  <span className={css({ color: '#3b82f6', fontWeight: 500 })}>
                    ${ema12[hoveredIndex]!.toFixed(2)}
                  </span>
                </div>
              )}
              {ema26[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>EMA 26:</span>
                  <span className={css({ color: '#eab308', fontWeight: 500 })}>
                    ${ema26[hoveredIndex]!.toFixed(2)}
                  </span>
                </div>
              )}
              {rsi[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginTop: '4px',
                  paddingTop: '4px',
                  borderTop: '1px solid #374151',
                })}>
                  <span className={css({ color: '#9ca3af' })}>RSI (14):</span>
                  <span className={css({ 
                    color: rsi[hoveredIndex]! > 70 ? '#f85149' : rsi[hoveredIndex]! < 30 ? '#3fb950' : '#e6edf3',
                    fontWeight: 500 
                  })}>
                    {rsi[hoveredIndex]!.toFixed(1)}
                  </span>
                </div>
              )}
              {macdData.macd[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>MACD:</span>
                  <span className={css({ 
                    color: macdData.macd[hoveredIndex]! > 0 ? '#3fb950' : '#f85149',
                    fontWeight: 500 
                  })}>
                    {macdData.macd[hoveredIndex]!.toFixed(4)}
                  </span>
                </div>
              )}
              {macdData.signal[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>MACD Signal:</span>
                  <span className={css({ color: '#9ca3af', fontWeight: 500 })}>
                    {macdData.signal[hoveredIndex]!.toFixed(4)}
                  </span>
                </div>
              )}
              {macdData.histogram[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>MACD Hist:</span>
                  <span className={css({ 
                    color: macdData.histogram[hoveredIndex]! > 0 ? '#3fb950' : '#f85149',
                    fontWeight: 500 
                  })}>
                    {macdData.histogram[hoveredIndex]!.toFixed(4)}
                  </span>
                </div>
              )}
              {hoveredRegime && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginTop: '4px',
                  paddingTop: '4px',
                  borderTop: '1px solid #374151',
                })}>
                  <span className={css({ color: '#9ca3af' })}>Regime:</span>
                  <span className={css({ 
                    color: hoveredRegime.regime === 'bullish' ? '#3fb950' :
                           hoveredRegime.regime === 'bearish' ? '#f85149' : '#7d8590',
                    fontWeight: 500,
                    textTransform: 'capitalize'
                  })}>
                    {hoveredRegime.regime} ({(hoveredRegime.confidence * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className={css({ display: 'flex', gap: '16px', marginTop: '12px', fontSize: 'sm', color: '#7d8590', flexWrap: 'wrap' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
          <div className={css({ width: '12px', height: '2px', bg: '#58a6ff' })} />
          <span>Price</span>
        </div>
        {sma7Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '1.5px', bg: '#60a5fa', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#60a5fa' })} />
            <span>SMA 7</span>
          </div>
        )}
        {sma30Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '2px', bg: '#22c55e', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#22c55e' })} />
            <span>SMA 30</span>
          </div>
        )}
        {ema12Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '1.5px', bg: '#3b82f6', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#3b82f6' })} />
            <span>EMA 12</span>
          </div>
        )}
        {ema26Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '1.5px', bg: '#eab308', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#eab308' })} />
            <span>EMA 26</span>
          </div>
        )}
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
          <div className={css({ width: '12px', height: '12px', borderRadius: '50%', bg: '#3fb950' })} />
          <span>Buy</span>
        </div>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
          <div className={css({ width: '12px', height: '12px', borderRadius: '50%', bg: '#f85149' })} />
          <span>Sell</span>
        </div>
        {regimeRegions.length > 0 && (
          <>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
              <div className={css({ width: '12px', height: '12px', bg: 'rgba(63, 185, 80, 0.3)' })} />
              <span>Bullish</span>
            </div>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
              <div className={css({ width: '12px', height: '12px', bg: 'rgba(248, 81, 73, 0.3)' })} />
              <span>Bearish</span>
            </div>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
              <div className={css({ width: '12px', height: '12px', bg: 'rgba(125, 133, 144, 0.15)' })} />
              <span>Neutral</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

