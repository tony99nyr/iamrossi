'use client';

import { useEffect, useState } from 'react';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';

interface CorrelationData {
  correlation: number;
  averageCorrelation: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  history?: Array<{
    correlation: number;
    timestamp: number;
  }>;
}

export default function CorrelationIndicator() {
  const [correlation, setCorrelation] = useState<CorrelationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCorrelation = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch('/api/trading/correlation?period=30&lookback=90', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: Failed to fetch correlation`);
        }
        
        const data = await response.json();
        setCorrelation(data);
      } catch (err) {
        console.error('Error fetching correlation:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCorrelation();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchCorrelation, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const getCorrelationColor = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 0.7) return '#3fb950'; // Strong - green
    if (abs >= 0.4) return '#d29922'; // Moderate - yellow
    if (abs >= 0.2) return '#f85149'; // Weak - red
    return '#7d8590'; // None - gray
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return '↗';
      case 'decreasing':
        return '↘';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return '#3fb950';
      case 'decreasing':
        return '#f85149';
      default:
        return '#7d8590';
    }
  };

  if (isLoading) {
    return (
      <div className={css({
        padding: '16px',
        bg: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
      })}>
        <div className={css({ color: '#7d8590', fontSize: 'sm' })}>Loading correlation...</div>
      </div>
    );
  }

  if (error || !correlation) {
    // Check if it's an authentication error
    const isAuthError = error?.includes('Unauthorized') || error?.includes('401');
    const isDataError = error?.includes('Insufficient') || error?.includes('data');
    
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
          marginBottom: '8px', 
          color: '#e6edf3' 
        })}>
          ETH-BTC Correlation
        </h3>
        <div className={css({ 
          color: isAuthError ? '#f85149' : '#7d8590', 
          fontSize: 'sm',
          lineHeight: '1.5'
        })}>
          {isAuthError 
            ? 'Authentication required. Please refresh the page.'
            : isDataError
            ? 'Insufficient data available. Correlation will be available once more data is collected.'
            : error || 'Unable to load correlation'}
        </div>
        {!isAuthError && (
          <div className={css({ 
            color: '#7d8590', 
            fontSize: 'xs', 
            marginTop: '8px',
            fontStyle: 'italic'
          })}>
            This feature requires at least 30 days of aligned ETH and BTC data.
          </div>
        )}
      </div>
    );
  }

  const correlationPercent = (correlation.correlation * 100).toFixed(1);
  const avgCorrelationPercent = (correlation.averageCorrelation * 100).toFixed(1);

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
        ETH-BTC Correlation
      </h3>
      
      <div className={stack({ gap: '12px' })}>
        {/* Current Correlation */}
        <div>
          <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' })}>
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Current</span>
            <div className={flex({ alignItems: 'center', gap: '8px' })}>
              <span className={css({ 
                color: getCorrelationColor(correlation.correlation),
                fontSize: 'lg',
                fontWeight: 'bold'
              })}>
                {correlationPercent}%
              </span>
              <span className={css({
                color: getTrendColor(correlation.trend),
                fontSize: 'md',
              })}>
                {getTrendIcon(correlation.trend)}
              </span>
            </div>
          </div>
          
          {/* Correlation Bar */}
          <div className={css({
            width: '100%',
            height: '8px',
            bg: '#21262d',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative',
          })}>
            {/* Average line */}
            <div className={css({
              position: 'absolute',
              left: `${((correlation.averageCorrelation + 1) / 2) * 100}%`,
              top: 0,
              bottom: 0,
              width: '2px',
              bg: '#7d8590',
              zIndex: 1,
            })} />
            
            {/* Current correlation indicator */}
            <div className={css({
              position: 'absolute',
              left: `${((correlation.correlation + 1) / 2) * 100}%`,
              top: '-2px',
              width: '12px',
              height: '12px',
              bg: getCorrelationColor(correlation.correlation),
              borderRadius: '50%',
              border: '2px solid #161b22',
              transform: 'translateX(-50%)',
              zIndex: 2,
            })} />
            
            {/* Correlation gradient background */}
            <div className={css({
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              background: 'linear-gradient(to right, #f85149 0%, #7d8590 50%, #3fb950 100%)',
              opacity: 0.3,
            })} />
          </div>
          
          <div className={flex({ justifyContent: 'space-between', marginTop: '4px' })}>
            <span className={css({ color: '#7d8590', fontSize: 'xs' })}>-100%</span>
            <span className={css({ color: '#7d8590', fontSize: 'xs' })}>0%</span>
            <span className={css({ color: '#7d8590', fontSize: 'xs' })}>+100%</span>
          </div>
        </div>
        
        {/* Stats */}
        <div className={flex({ justifyContent: 'space-between', gap: '16px' })}>
          <div>
            <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '2px' })}>Average</div>
            <div className={css({ color: '#c9d1d9', fontSize: 'sm', fontWeight: 'semibold' })}>
              {avgCorrelationPercent}%
            </div>
          </div>
          <div>
            <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '2px' })}>Strength</div>
            <div className={css({ 
              color: getCorrelationColor(correlation.correlation),
              fontSize: 'sm',
              fontWeight: 'semibold',
              textTransform: 'capitalize'
            })}>
              {correlation.strength}
            </div>
          </div>
          <div>
            <div className={css({ color: '#7d8590', fontSize: 'xs', marginBottom: '2px' })}>Trend</div>
            <div className={css({ 
              color: getTrendColor(correlation.trend),
              fontSize: 'sm',
              fontWeight: 'semibold',
              textTransform: 'capitalize'
            })}>
              {correlation.trend}
            </div>
          </div>
        </div>
        
        {/* Interpretation */}
        <div className={css({
          padding: '8px',
          bg: '#0d1117',
          borderRadius: '4px',
          border: '1px solid #21262d',
        })}>
          <div className={css({ color: '#7d8590', fontSize: 'xs', lineHeight: '1.4' })}>
            {correlation.correlation > 0.7 
              ? 'ETH and BTC are highly correlated. Market moves together.'
              : correlation.correlation > 0.4
              ? 'Normal correlation. ETH may have some independent movement.'
              : correlation.correlation > 0
              ? 'Low correlation. ETH is moving independently from BTC.'
              : 'Negative correlation. ETH and BTC are moving in opposite directions.'}
          </div>
        </div>
      </div>
    </div>
  );
}

