'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { css } from '@styled-system/css';
import type { PortfolioSnapshot, Trade, PriceCandle } from '@/types';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD } from '@/lib/indicators';
import { detectMarketRegimeCached, clearIndicatorCache } from '@/lib/market-regime-detector-cached';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';

interface PriceChartProps {
  portfolioHistory: PortfolioSnapshot[];
  trades: Trade[];
  timeRange?: 'all' | 'ytd' | '6m' | '3m' | '1m' | '14d' | '7d' | '48h';
  session?: EnhancedPaperTradingSession | null;
}

export default function PriceChart({ portfolioHistory: _portfolioHistory, trades, timeRange = 'all', session }: PriceChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [actualCandles, setActualCandles] = useState<PriceCandle[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch appropriate candles based on timeRange
  // For 48h: use 5m candles, for all others: use 8h candles
  useEffect(() => {
    if (!session) {
      setActualCandles(null);
      return;
    }

    const fetchCandles = async () => {
      try {
        // Determine timeframe based on timeRange
        const timeframe = timeRange === '48h' ? '5m' : (session.config.bullishStrategy.timeframe || '8h');
        
        // Calculate startDate based on timeRange
        const now = Date.now();
        let startDate: string;
        const endDate = new Date().toISOString().split('T')[0];
        
        switch (timeRange) {
          case '48h':
            // For 48h, fetch last 48 hours (add buffer for 5m candles)
            const cutoff48h = now - (48 * 60 * 60 * 1000);
            startDate = new Date(cutoff48h - (24 * 60 * 60 * 1000)).toISOString().split('T')[0]; // Add 1 day buffer
            break;
          case '7d':
            startDate = new Date(now - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            break;
          case '14d':
            startDate = new Date(now - (14 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            break;
          case '1m':
            startDate = new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            break;
          case '3m':
            startDate = new Date(now - (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            break;
          case '6m':
            startDate = new Date(now - (180 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            break;
          case 'ytd': {
            const ytdDate = new Date();
            ytdDate.setMonth(0, 1);
            startDate = ytdDate.toISOString().split('T')[0];
            break;
          }
          case 'all':
          default:
            // For 'all', fetch from earliest available date
            startDate = '2020-01-01';
            break;
        }
        
        // Fetch candles using the same parameters as the strategy
        // Use skipAPIFetch=false to match strategy behavior
        const response = await fetch(`/api/trading/candles?symbol=ETHUSDT&timeframe=${timeframe}&startDate=${startDate}&endDate=${endDate}&skipAPIFetch=false`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setActualCandles(data.candles || []);
        } else {
          console.warn('Failed to fetch candles for chart');
          setActualCandles(null);
        }
      } catch (error) {
        console.warn('Error fetching candles for chart:', error);
        setActualCandles(null);
      }
    };

    fetchCandles();
  }, [session, timeRange]);

  // Filter candles based on time range
  // Use actual candles instead of portfolioHistory for consistent intervals
  const filteredCandles = useMemo(() => {
    if (!actualCandles || actualCandles.length === 0) return [];
    
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
      case '48h':
        cutoffTime = now - 48 * 60 * 60 * 1000;
        break;
      case 'all':
      default:
        return actualCandles;
    }
    
    return actualCandles.filter(c => c.timestamp >= cutoffTime);
  }, [actualCandles, timeRange]);

  const width = 1200;
  const height = 550;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Use candle close prices instead of portfolioHistory
  const prices = useMemo(() => filteredCandles.map(c => c.close), [filteredCandles]);
  const min = useMemo(() => prices.length > 0 ? Math.min(...prices) : 0, [prices]);
  const max = useMemo(() => prices.length > 0 ? Math.max(...prices) : 0, [prices]);
  const pad = useMemo(() => (max - min) * 0.1 || 10, [max, min]);
  const yMin = useMemo(() => min - pad, [min, pad]);
  const yMax = useMemo(() => max + pad, [max, pad]);

  // Calculate moving averages (matching strategy indicators)
  // Strategy uses SMA 20, SMA 50, SMA 200 for regime detection
  const sma20 = useMemo(() => {
    const ma = calculateSMA(prices, 20);
    // Pad with nulls at the beginning to align with price data
    return Array(prices.length - ma.length).fill(null).concat(ma);
  }, [prices]);

  const sma50 = useMemo(() => {
    const ma = calculateSMA(prices, 50);
    return Array(prices.length - ma.length).fill(null).concat(ma);
  }, [prices]);

  const sma200 = useMemo(() => {
    const ma = calculateSMA(prices, 200);
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

  // Calculate regimes for visualization
  // For data BEFORE session started: calculate using detectMarketRegimeCached (same algorithm strategy uses)
  // For data AFTER session started: use session.regimeHistory (actual recorded changes)
  const regimeRegions = useMemo(() => {
    if (!session || filteredCandles.length === 0) return [];
    
    // Get the time range of the filtered candles for mapping
    const historyStart = filteredCandles[0]?.timestamp;
    const historyEnd = filteredCandles[filteredCandles.length - 1]?.timestamp;
    if (!historyStart || !historyEnd) return [];
    
    // Get session start time to know when regimeHistory data begins
    const sessionStartTime = session.startedAt;
    const regimeHistory = session.regimeHistory || [];
    
    // We need candles for calculating historical regimes
    // Use actualCandles if available (they have buffer for calculation), otherwise filteredCandles
    const candlesForRegime = actualCandles && actualCandles.length > 0 ? actualCandles : filteredCandles;
    
    // Clear indicator cache for fresh calculation
    clearIndicatorCache();
    
    // Build regions
    const regions: Array<{ 
      startTime: number; 
      endTime: number; 
      regime: 'bullish' | 'bearish' | 'neutral'; 
      confidence: number 
    }> = [];
    
    // PART 1: Calculate regimes for period BEFORE session started
    // This uses the same algorithm the strategy would use
    if (historyStart < sessionStartTime && candlesForRegime.length >= 50) {
      let lastRegime: 'bullish' | 'bearish' | 'neutral' | null = null;
      let regionStart = historyStart;
      let regionConfidence = 0;
      
      // Iterate through candles in the historical period
      for (let i = 50; i < candlesForRegime.length; i++) {
        const candle = candlesForRegime[i];
        if (!candle) continue;
        
        // Stop if we've passed session start (we'll use regimeHistory from here)
        if (candle.timestamp >= sessionStartTime) break;
        
        // Skip candles before our visible range
        if (candle.timestamp < historyStart) continue;
        
        const signal = detectMarketRegimeCached(candlesForRegime, i);
        const regime = signal.regime;
        
        if (regime !== lastRegime) {
          // Save previous region
          if (lastRegime !== null && candle.timestamp > regionStart) {
            regions.push({
              startTime: regionStart,
              endTime: candle.timestamp - 1,
              regime: lastRegime,
              confidence: regionConfidence,
            });
          }
          // Start new region
          lastRegime = regime;
          regionStart = candle.timestamp;
          regionConfidence = signal.confidence;
        } else {
          regionConfidence = Math.max(regionConfidence, signal.confidence);
        }
      }
      
      // Close the last pre-session region at session start (or historyEnd if session is after)
      const preSessionEnd = Math.min(sessionStartTime - 1, historyEnd);
      if (lastRegime !== null && preSessionEnd >= regionStart) {
        regions.push({
          startTime: regionStart,
          endTime: preSessionEnd,
          regime: lastRegime,
          confidence: regionConfidence,
        });
      }
    }
    
    // PART 2: Use regimeHistory for period AFTER session started
    if (historyEnd >= sessionStartTime && regimeHistory.length > 0) {
      // Sort history by timestamp
      const sortedHistory = [...regimeHistory].sort((a, b) => a.timestamp - b.timestamp);
      
      // Start from session start (or historyStart if it's after session start)
      const sessionPeriodStart = Math.max(historyStart, sessionStartTime);
      
      // Find the regime that was active at sessionPeriodStart
      let activeRegimeIndex = -1;
      for (let i = sortedHistory.length - 1; i >= 0; i--) {
        if (sortedHistory[i]!.timestamp <= sessionPeriodStart) {
          activeRegimeIndex = i;
          break;
        }
      }
      
      // If no regime before sessionPeriodStart, use first one
      let currentRegimeEntry = activeRegimeIndex >= 0 
        ? sortedHistory[activeRegimeIndex]! 
        : sortedHistory[0]!;
      
      let regionStart = sessionPeriodStart;
      
      // Iterate through regime changes after our start point
      for (let i = Math.max(0, activeRegimeIndex + 1); i < sortedHistory.length; i++) {
        const change = sortedHistory[i]!;
        
        // Skip changes before our start
        if (change.timestamp <= sessionPeriodStart) continue;
        
        // Stop if past visible range
        if (change.timestamp > historyEnd) break;
        
        // Create region up to this change
        if (change.timestamp > regionStart) {
          regions.push({
            startTime: regionStart,
            endTime: change.timestamp - 1,
            regime: currentRegimeEntry.regime,
            confidence: currentRegimeEntry.confidence,
          });
        }
        
        currentRegimeEntry = change;
        regionStart = change.timestamp;
      }
      
      // Add final region using session.currentRegime
      if (historyEnd >= regionStart) {
        regions.push({
          startTime: regionStart,
          endTime: historyEnd,
          regime: session.currentRegime.regime,
          confidence: session.currentRegime.confidence,
        });
      }
    } else if (historyEnd >= sessionStartTime && regimeHistory.length === 0) {
      // Session started but no history - use current regime for session period
      const sessionPeriodStart = Math.max(historyStart, sessionStartTime);
      regions.push({
        startTime: sessionPeriodStart,
        endTime: historyEnd,
        regime: session.currentRegime.regime,
        confidence: session.currentRegime.confidence,
      });
    }
    
    // Convert time-based regions to chart coordinates
    const timeRangeMs = historyEnd - historyStart;
    
    const mappedRegions = regions.map(region => {
      // Check if region overlaps with visible time range
      if (region.startTime > historyEnd || region.endTime < historyStart) {
        return null;
      }
      
      // Clamp region to visible time range
      const visibleStart = Math.max(region.startTime, historyStart);
      const visibleEnd = Math.min(region.endTime, historyEnd);
      
      // Calculate X positions based on timestamp
      const startX = padding.left + ((visibleStart - historyStart) / timeRangeMs) * chartWidth;
      const endX = padding.left + ((visibleEnd - historyStart) / timeRangeMs) * chartWidth;
      
      // Ensure positions are within chart bounds
      const clampedStartX = Math.max(padding.left, Math.min(padding.left + chartWidth, startX));
      const clampedEndX = Math.max(padding.left, Math.min(padding.left + chartWidth, endX));
      
      const regionWidth = Math.max(1, clampedEndX - clampedStartX);
      
      return {
        regime: region.regime,
        confidence: region.confidence,
        x: clampedStartX,
        width: regionWidth,
      };
    }).filter((region): region is NonNullable<typeof region> => region !== null);
    
    return mappedRegions;
  }, [session, filteredCandles, actualCandles, chartWidth, padding.left]);

  // Calculate regime for hovered point (for tooltip) - must be before early return
  // For historical data: calculate using detectMarketRegimeCached
  // For session data: use regimeHistory
  const hoveredRegime = useMemo(() => {
    if (!session || hoveredIndex === null || filteredCandles.length === 0) return null;
    
    const hoveredCandle = filteredCandles[hoveredIndex];
    if (!hoveredCandle) return null;
    
    const hoveredTime = hoveredCandle.timestamp;
    const sessionStartTime = session.startedAt;
    
    // If this is the most recent point, use session.currentRegime
    if (hoveredIndex === filteredCandles.length - 1) {
      return session.currentRegime;
    }
    
    // For data BEFORE session started, calculate the regime
    if (hoveredTime < sessionStartTime) {
      const candlesForRegime = actualCandles && actualCandles.length > 0 ? actualCandles : filteredCandles;
      
      // Find the index in candlesForRegime for this timestamp
      const candleIndex = candlesForRegime.findIndex(c => c.timestamp === hoveredTime);
      
      if (candleIndex >= 50) {
        clearIndicatorCache();
        return detectMarketRegimeCached(candlesForRegime, candleIndex);
      }
      
      // Not enough data for calculation, use session current
      return session.currentRegime;
    }
    
    // For data AFTER session started, look up from regimeHistory
    const regimeHistory = session.regimeHistory || [];
    if (regimeHistory.length === 0) {
      return session.currentRegime;
    }
    
    // Find the regime that was active at hoveredTime
    let activeRegime = null;
    for (let i = regimeHistory.length - 1; i >= 0; i--) {
      if (regimeHistory[i]!.timestamp <= hoveredTime) {
        activeRegime = regimeHistory[i];
        break;
      }
    }
    
    if (activeRegime) {
      return {
        regime: activeRegime.regime,
        confidence: activeRegime.confidence,
        indicators: session.currentRegime.indicators,
      };
    }
    
    // If hovered time is before all regime history, use first regime
    const firstRegime = regimeHistory[0];
    if (firstRegime) {
      return {
        regime: firstRegime.regime,
        confidence: firstRegime.confidence,
        indicators: session.currentRegime.indicators,
      };
    }
    
    return session.currentRegime;
  }, [session, hoveredIndex, filteredCandles, actualCandles]);

  const project = (value: number, index: number): { x: number; y: number } => {
    const x = (index / Math.max(filteredCandles.length - 1, 1)) * chartWidth + padding.left;
    const ratio = (value - yMin) / (yMax - yMin || 1);
    const y = padding.top + chartHeight - ratio * chartHeight;
    return { x, y };
  };

  // Build price line path using candle close prices
  const pricePath = filteredCandles
    .map((c, i) => {
      const { x, y } = project(c.close, i);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Build moving average paths using polyline format (like Pokemon chart)
  const buildMAPath = (maValues: (number | null)[]): string | null => {
    const points: string[] = [];
    maValues.forEach((value, i) => {
      if (value !== null && i < filteredCandles.length) {
        const { x, y } = project(value, i);
        points.push(`${x},${y}`);
      }
    });
    return points.length > 0 ? points.join(' ') : null;
  };

  const sma20Path = buildMAPath(sma20);
  const sma50Path = buildMAPath(sma50);
  const sma200Path = buildMAPath(sma200);
  const ema12Path = buildMAPath(ema12);
  const ema26Path = buildMAPath(ema26);

  // Map trades to chart positions (align with nearest candle)
  const tradeMarkers = trades
    .filter(t => {
      const tradeTime = t.timestamp;
      return filteredCandles.some(c => Math.abs(c.timestamp - tradeTime) < 60 * 60 * 1000); // Within 1 hour
    })
    .map(trade => {
      const closestCandle = filteredCandles.reduce((closest, c) => {
        return Math.abs(c.timestamp - trade.timestamp) < Math.abs(closest.timestamp - trade.timestamp) ? c : closest;
      }, filteredCandles[0]!);
      const index = filteredCandles.indexOf(closestCandle);
      const { x, y } = project(closestCandle.close, index);
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
    // Note: x is mouse position WITHOUT padding.left, px is WITH padding.left
    // So we need to add padding.left to x when calculating distance
    let closestIndex = 0;
    let minDistance = Infinity;
    
    filteredCandles.forEach((_, index) => {
      const { x: px } = project(filteredCandles[index]!.close, index);
      // Add padding.left back to x to match px coordinates
      const distance = Math.abs((x + padding.left) - px);
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
      const dataPoint = project(filteredCandles[closestIndex]!.close, closestIndex);
      
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

  const hoveredCandle = hoveredIndex !== null && hoveredIndex < filteredCandles.length ? filteredCandles[hoveredIndex] : null;

  // Early return if no candles available (after all hooks)
  if (filteredCandles.length === 0) {
    return (
      <div className={css({
        padding: { base: '12px', md: '24px' },
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
      })}>
        <h2 className={css({ 
          fontSize: { base: 'md', md: 'lg' }, 
          fontWeight: 'semibold', 
          marginBottom: { base: '12px', md: '16px' }, 
          color: '#e6edf3' 
        })}>
          Price Chart ({timeRange === 'all' ? 'All' : timeRange === 'ytd' ? 'YTD' : timeRange === '6m' ? '6M' : timeRange === '3m' ? '3M' : timeRange === '1m' ? '1M' : timeRange === '14d' ? '14D' : timeRange === '7d' ? '7D' : '48H'})
        </h2>
        <div className={css({
          padding: '24px',
          bg: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#7d8590',
        })}>
          {!actualCandles ? 'Loading chart data...' : 'No price data available for selected time range'}
        </div>
      </div>
    );
  }

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
        Price Chart ({timeRange === 'all' ? 'All' : timeRange === 'ytd' ? 'YTD' : timeRange === '6m' ? '6M' : timeRange === '3m' ? '3M' : timeRange === '1m' ? '1M' : timeRange === '14d' ? '14D' : timeRange === '7d' ? '7D' : '48H'})
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
          
          {/* Regime background regions - render first so they're behind price line */}
          {regimeRegions.map((region, i) => {
            const color = region.regime === 'bullish' ? 'rgba(63, 185, 80, 0.2)' :
                          region.regime === 'bearish' ? 'rgba(248, 81, 73, 0.2)' :
                          'rgba(125, 133, 144, 0.1)';
            // Ensure width is at least 1px and region is within chart bounds
            const validWidth = Math.max(1, region.width);
            const validX = Math.max(padding.left, Math.min(padding.left + chartWidth - validWidth, region.x));
            
            // Only render if region is actually visible
            if (validWidth <= 0 || validX >= padding.left + chartWidth || validX + validWidth <= padding.left) {
              return null;
            }
            
            return (
              <rect
                key={`regime-${i}-${region.regime}-${region.x}-${region.width}`}
                x={validX}
                y={padding.top}
                width={validWidth}
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

          {/* SMA 200 (long-term trend) */}
          {sma200Path && (
            <polyline
              points={sma200Path}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeDasharray="6 6"
              opacity={0.7}
            />
          )}

          {/* SMA 50 (medium-term trend) */}
          {sma50Path && (
            <polyline
              points={sma50Path}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}

          {/* SMA 20 (short-term trend) */}
          {sma20Path && (
            <polyline
              points={sma20Path}
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
          {hoveredCandle && hoveredIndex !== null && (
            <>
              <line
                x1={project(hoveredCandle.close, hoveredIndex).x}
                y1={padding.top}
                x2={project(hoveredCandle.close, hoveredIndex).x}
                y2={height - padding.bottom}
                stroke="#7d8590"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle
                cx={project(hoveredCandle.close, hoveredIndex).x}
                cy={project(hoveredCandle.close, hoveredIndex).y}
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
        {tooltipPosition && hoveredCandle && hoveredIndex !== null && (
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
              {new Date(hoveredCandle.timestamp).toLocaleString()}
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
                <span className={css({ color: '#9ca3af' })}>Close:</span>
                <span className={css({ color: '#58a6ff', fontWeight: 500 })}>
                  ${hoveredCandle.close.toFixed(2)}
                </span>
              </div>
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              })}>
                <span className={css({ color: '#9ca3af' })}>Open:</span>
                <span className={css({ color: '#e5e7eb', fontWeight: 500 })}>
                  ${hoveredCandle.open.toFixed(2)}
                </span>
              </div>
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              })}>
                <span className={css({ color: '#9ca3af' })}>High:</span>
                <span className={css({ color: '#3fb950', fontWeight: 500 })}>
                  ${hoveredCandle.high.toFixed(2)}
                </span>
              </div>
              <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              })}>
                <span className={css({ color: '#9ca3af' })}>Low:</span>
                <span className={css({ color: '#f85149', fontWeight: 500 })}>
                  ${hoveredCandle.low.toFixed(2)}
                </span>
              </div>
              {hoveredCandle.volume > 0 && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>Volume:</span>
                  <span className={css({ color: '#e5e7eb', fontWeight: 500 })}>
                    {hoveredCandle.volume.toLocaleString()}
                  </span>
                </div>
              )}
              {sma20[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>SMA 20:</span>
                  <span className={css({ color: '#60a5fa', fontWeight: 500 })}>
                    ${sma20[hoveredIndex]!.toFixed(2)}
                  </span>
                </div>
              )}
              {sma50[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>SMA 50:</span>
                  <span className={css({ color: '#22c55e', fontWeight: 500 })}>
                    ${sma50[hoveredIndex]!.toFixed(2)}
                  </span>
                </div>
              )}
              {sma200[hoveredIndex] !== null && (
                <div className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                })}>
                  <span className={css({ color: '#9ca3af' })}>SMA 200:</span>
                  <span className={css({ color: '#8b5cf6', fontWeight: 500 })}>
                    ${sma200[hoveredIndex]!.toFixed(2)}
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
        {sma20Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '1.5px', bg: '#60a5fa', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#60a5fa' })} />
            <span>SMA 20</span>
          </div>
        )}
        {sma50Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '2px', bg: '#22c55e', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#22c55e' })} />
            <span>SMA 50</span>
          </div>
        )}
        {sma200Path && (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
            <div className={css({ width: '12px', height: '2px', bg: '#8b5cf6', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8b5cf6' })} />
            <span>SMA 200</span>
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

