'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import PriceChart from './components/PriceChart';
import HealthStatusPanel from './components/HealthStatusPanel';
import PortfolioPerformancePanel from './components/PortfolioPerformancePanel';
import RegimeDisplay from './components/RegimeDisplay';
import StrategySignalPanel from './components/StrategySignalPanel';
import TradeAnalyticsPanel from './components/TradeAnalyticsPanel';
import RiskManagementPanel from './components/RiskManagementPanel';

type TimeRange = 'all' | 'ytd' | '6m' | '3m' | '1m' | '14d' | '7d' | '48h';

export default function EthTradingBotClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [session, setSession] = useState<EnhancedPaperTradingSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Initialize timeRange from URL params, default to '1m'
  const getInitialTimeRange = (): TimeRange => {
    const urlRange = searchParams.get('range');
    const validRanges: TimeRange[] = ['all', 'ytd', '6m', '3m', '1m', '14d', '7d', '48h'];
    if (urlRange && validRanges.includes(urlRange as TimeRange)) {
      return urlRange as TimeRange;
    }
    return '1m'; // Default to 1m for good balance of detail and regime visibility
  };
  
  const [timeRange, setTimeRange] = useState<TimeRange>(getInitialTimeRange);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  
  // Update URL when timeRange changes
  const handleTimeRangeChange = useCallback((newRange: TimeRange) => {
    setTimeRange(newRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newRange);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Get auth headers - cookies are automatically sent with credentials: 'include'
  const getAuthHeaders = (): HeadersInit => {
    return {
      'Content-Type': 'application/json',
    };
  };

  // Check authentication by attempting to fetch status
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/paper/status', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (res.ok) {
        setIsAuthenticated(true);
        const data = await res.json();
        setSession(data.session);
        setLastUpdate(new Date());
      } else if (res.status === 401) {
        setIsAuthenticated(false);
        setShowPinModal(true);
      } else {
        setIsAuthenticated(false);
        setShowPinModal(true);
      }
    } catch {
      setIsAuthenticated(false);
      setShowPinModal(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check authentication on mount by attempting to fetch status
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  
  // Sync timeRange with URL params when they change (e.g., browser back/forward)
  useEffect(() => {
    const urlRange = searchParams.get('range');
    const validRanges: TimeRange[] = ['all', 'ytd', '6m', '3m', '1m', '14d', '7d', '48h'];
    if (urlRange && validRanges.includes(urlRange as TimeRange) && urlRange !== timeRange) {
      setTimeRange(urlRange as TimeRange);
    } else if (!urlRange && timeRange !== '1m') {
      // If no URL param and not default, set default and update URL
      const params = new URLSearchParams(searchParams.toString());
      params.set('range', '1m');
      router.push(`?${params.toString()}`, { scroll: false });
      setTimeRange('7d');
    }
  }, [searchParams, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle PIN success - token is now in HTTP-only cookie, no need to store it
  const handlePinSuccess = () => {
    setIsAuthenticated(true);
    setShowPinModal(false);
    fetchStatus();
  };

  // Handle PIN cancel
  const handlePinCancel = () => {
    // Don't allow canceling - user must authenticate
    // Could redirect to home page if needed
  };

  // Fetch session status
  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/trading/paper/status', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          setShowPinModal(true);
          throw new Error('Unauthorized. Please authenticate first.');
        }
        throw new Error('Failed to fetch session status');
      }
      
      const data = await res.json();
      setSession(data.session);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // Update session (fetch price, calculate regime, execute trades)
  const updateSession = async () => {
    if (!session?.isActive) return;
    
    try {
      setIsUpdating(true);
      setError(null);
      const res = await fetch('/api/trading/paper/update', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to update session');
      }
      
      const data = await res.json();
      setSession(data.session);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Start session
  const startSession = async () => {
    try {
      setIsStarting(true);
      setError(null);
      const res = await fetch('/api/trading/paper/start', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({}),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start session');
      }
      
      const data = await res.json();
      setSession(data.session);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStarting(false);
    }
  };

  // Stop session
  const stopSession = async () => {
    try {
      setIsStopping(true);
      setError(null);
      const res = await fetch('/api/trading/paper/stop', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to stop session');
      }
      
      const data = await res.json();
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStopping(false);
    }
  };

  // Auto-refresh every 5 minutes if session is active (only when tab is visible)
  useEffect(() => {
    if (!session?.isActive || !isAuthenticated) return;

    const handleVisibilityChange = () => {
      // Pause/resume refresh based on tab visibility
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    const interval = setInterval(() => {
      // Only refresh if tab is visible
      if (!document.hidden) {
        updateSession();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.isActive, isAuthenticated]);

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const containerStyles = css({
    minHeight: '100vh',
    padding: '16px',
    maxWidth: '1400px',
    margin: '0 auto',
    color: '#c9d1d9',
  });

  // Don't render UI until authenticated - show only PIN modal
  if (!isAuthenticated) {
    return (
      <>
        {showPinModal && (
          <PinEntryModal
            onSuccess={handlePinSuccess}
            onCancel={handlePinCancel}
            verifyEndpoint="/api/admin/verify"
            pinFieldName="secret"
          />
        )}
      </>
    );
  }

  return (
    <div className={containerStyles}>
      <div className={stack({ gap: '16px' })}>
        <div className={flex({ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' })}>
          <h1 className={css({ fontSize: '2xl', fontWeight: 'bold', color: '#e6edf3', display: 'flex', alignItems: 'center', gap: '8px' })}>
            <span>Ξ</span>
            <span>ETH Trading Bot - Paper Trading</span>
          </h1>
          <div className={flex({ gap: '8px', alignItems: 'center' })}>
            <Link
              href="/tools/trading-overview"
              className={css({
                padding: '8px 16px',
                bg: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                cursor: 'pointer',
                fontSize: 'sm',
                textDecoration: 'none',
                display: 'inline-block',
                _hover: {
                  bg: '#30363d',
                },
              })}
            >
              ← Overview
            </Link>
            {session && (
              <Link
                href="/tools/eth-trading/audit"
                className={css({
                  padding: '8px 16px',
                  bg: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontSize: 'sm',
                  textDecoration: 'none',
                  display: 'inline-block',
                  _hover: {
                    bg: '#30363d',
                  },
                })}
              >
                View Audit
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className={css({
            padding: '12px',
            bg: '#da3633',
            color: '#fff',
            borderRadius: '6px',
            fontSize: 'sm',
          })}>
            {error}
          </div>
        )}

        <div className={flex({ gap: '8px', flexWrap: 'wrap', alignItems: 'center' })}>
          {!session ? (
            <button
              onClick={startSession}
              disabled={isStarting || isLoading}
              className={css({
                padding: '8px 16px',
                bg: '#238636',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading || isStarting ? 'not-allowed' : 'pointer',
                opacity: isLoading || isStarting ? 0.6 : 1,
                fontWeight: 'semibold',
                fontSize: 'sm',
                _hover: {
                  bg: '#2ea043',
                },
              })}
            >
              {isStarting ? 'Starting...' : 'Start Paper Trading'}
            </button>
          ) : (
            <>
              <button
                onClick={updateSession}
                disabled={isUpdating || !session.isActive}
                className={css({
                  padding: '8px 16px',
                  bg: '#1f6feb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isUpdating || !session.isActive ? 'not-allowed' : 'pointer',
                  opacity: isUpdating || !session.isActive ? 0.6 : 1,
                  fontWeight: 'semibold',
                  fontSize: 'sm',
                  _hover: {
                    bg: '#388bfd',
                  },
                })}
              >
                {isUpdating ? 'Updating...' : 'Update Now'}
              </button>
              <button
                onClick={stopSession}
                disabled={isStopping}
                className={css({
                  padding: '8px 16px',
                  bg: '#da3633',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isStopping ? 'not-allowed' : 'pointer',
                  opacity: isStopping ? 0.6 : 1,
                  fontWeight: 'semibold',
                  fontSize: 'sm',
                  _hover: {
                    bg: '#f85149',
                  },
                })}
              >
                {isStopping ? 'Stopping...' : 'Stop Trading'}
              </button>
            </>
          )}
          {lastUpdate && (
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>
              Last updated: {formatTimeAgo(lastUpdate)}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className={css({ color: '#7d8590', padding: '24px', textAlign: 'center' })}>
            Loading...
          </div>
        ) : session ? (
          <div className={stack({ gap: '16px' })}>
            {/* Dashboard Cards Grid - Consolidated 6 Panels */}
            <div className={css({
              display: 'grid',
              gridTemplateColumns: { base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              gap: '12px',
            })}>
              {/* Row 1: System Status, Portfolio, Regime */}
              <HealthStatusPanel session={session} />
              <PortfolioPerformancePanel session={session} />
              <RegimeDisplay regime={session.currentRegime} />
              
              {/* Row 2: Strategy, Trades, Risk */}
              <StrategySignalPanel session={session} />
              <TradeAnalyticsPanel session={session} />
              <RiskManagementPanel session={session} />
            </div>

            {/* Price Chart */}
            <div>
              <div className={flex({ gap: '0px', marginBottom: '12px', flexDirection: 'column', overflowX: 'auto' })}>
                {/* First row: All, YTD, 6M, 3M, 1M */}
                <div className={flex({ gap: '0px', minWidth: 'fit-content' })}>
                  {(['all', 'ytd', '6m', '3m', '1m'] as const).map((range, index) => {
                    const isFirst = index === 0;
                    const isLast = index === 4;
                    return (
                      <button
                        key={range}
                        onClick={() => handleTimeRangeChange(range)}
                        className={css({
                          padding: { base: '4px 12px', md: '6px 16px' },
                          bg: timeRange === range ? '#111827' : 'transparent',
                          color: timeRange === range ? '#e5e7eb' : '#6b7280',
                          border: '1px solid #1f2937',
                          borderRight: !isLast ? 'none' : '1px solid #1f2937',
                          borderRadius: isFirst ? '6px 0 0 0' : isLast ? '0 6px 0 0' : '0',
                          cursor: 'pointer',
                          fontSize: { base: 'xs', md: 'sm' },
                          fontWeight: timeRange === range ? 'semibold' : 'normal',
                          whiteSpace: 'nowrap',
                          _hover: {
                            bg: timeRange === range ? '#111827' : '#1f2937',
                            color: timeRange === range ? '#e5e7eb' : '#9ca3af',
                          },
                        })}
                      >
                        {range === 'all' ? 'All' : range === 'ytd' ? 'YTD' : range === '6m' ? '6M' : range === '3m' ? '3M' : '1M'}
                      </button>
                    );
                  })}
                </div>
                {/* Second row: 14D, 7D, 48H */}
                <div className={flex({ gap: '0px', minWidth: 'fit-content' })}>
                  {(['14d', '7d', '48h'] as const).map((range, index) => {
                    const isFirst = index === 0;
                    const isLast = index === 2;
                    return (
                      <button
                        key={range}
                        onClick={() => handleTimeRangeChange(range)}
                        className={css({
                          padding: { base: '4px 12px', md: '6px 16px' },
                          bg: timeRange === range ? '#111827' : 'transparent',
                          color: timeRange === range ? '#e5e7eb' : '#6b7280',
                          border: '1px solid #1f2937',
                          borderTop: 'none',
                          borderRight: !isLast ? 'none' : '1px solid #1f2937',
                          borderRadius: isFirst ? '0 0 0 6px' : isLast ? '0 6px 6px 0' : '0',
                          cursor: 'pointer',
                          fontSize: { base: 'xs', md: 'sm' },
                          fontWeight: timeRange === range ? 'semibold' : 'normal',
                          whiteSpace: 'nowrap',
                          _hover: {
                            bg: timeRange === range ? '#111827' : '#1f2937',
                            color: timeRange === range ? '#e5e7eb' : '#9ca3af',
                          },
                        })}
                      >
                        {range === '14d' ? '14D' : range === '7d' ? '7D' : '48H'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <PriceChart
                trades={session.trades}
                timeRange={timeRange}
                session={session}
              />
            </div>

            {/* Recent Trades */}
            {session.trades.length > 0 && (
              <div className={css({
                padding: '16px',
                bg: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
              })}>
                <h2 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
                  Recent Trades ({session.trades.length})
                </h2>
                <div className={stack({ gap: '8px' })}>
                  {session.trades.slice(-10).reverse().map(trade => (
                    <div
                      key={trade.id}
                      className={css({
                        padding: '12px',
                        bg: '#0d1117',
                        border: '1px solid #30363d',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      })}
                    >
                      <div className={flex({ gap: '16px', alignItems: 'center' })}>
                        <span className={css({
                          padding: '2px 8px',
                          bg: trade.type === 'buy' ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                          color: trade.type === 'buy' ? '#3fb950' : '#f85149',
                          borderRadius: '4px',
                          fontSize: 'sm',
                          fontWeight: 'semibold',
                        })}>
                          {trade.type.toUpperCase()}
                        </span>
                        <span className={css({ color: '#e6edf3' })}>
                          {trade.ethAmount.toFixed(4)} ETH @ ${trade.ethPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className={css({ color: '#7d8590', fontSize: 'sm' })}>
                        {formatTimeAgo(new Date(trade.timestamp))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={css({
            padding: '24px',
            bg: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            color: '#7d8590',
            textAlign: 'center',
          })}>
            <p className={css({ marginBottom: '8px', fontSize: 'lg', color: '#c9d1d9' })}>
              No active paper trading session
            </p>
            <p className={css({ fontSize: 'sm' })}>
              Click &quot;Start Paper Trading&quot; to begin using the enhanced adaptive strategy
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
