'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import PortfolioDisplay from './components/PortfolioDisplay';
import RegimeDisplay from './components/RegimeDisplay';
import PriceChart from './components/PriceChart';

export default function EthTradingBotClient() {
  const [session, setSession] = useState<EnhancedPaperTradingSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // Get auth headers - cookies are automatically sent with credentials: 'include'
  const getAuthHeaders = (): HeadersInit => {
    return {
      'Content-Type': 'application/json',
    };
  };

  // Check authentication on mount by attempting to fetch status
  useEffect(() => {
    checkAuth();
  }, []);

  // Check authentication by attempting to fetch status
  const checkAuth = async () => {
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
    } catch (err) {
      setIsAuthenticated(false);
      setShowPinModal(true);
    } finally {
      setIsLoading(false);
    }
  };

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
    padding: '24px',
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
      <div className={stack({ gap: '24px' })}>
        <h1 className={css({ fontSize: '2xl', fontWeight: 'bold', color: '#e6edf3' })}>
          ETH Trading Bot - Paper Trading
        </h1>

        {error && (
          <div className={css({
            padding: '12px',
            bg: 'rgba(248, 81, 73, 0.1)',
            color: '#f85149',
            borderRadius: '8px',
            border: '1px solid rgba(248, 81, 73, 0.2)',
          })}>
            {error}
          </div>
        )}

        {/* Controls */}
        <div className={flex({ gap: '12px', alignItems: 'center', flexWrap: 'wrap' })}>
          {!session?.isActive ? (
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
                disabled={isUpdating}
                className={css({
                  padding: '8px 16px',
                  bg: '#1f6feb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isUpdating ? 'not-allowed' : 'pointer',
                  opacity: isUpdating ? 0.6 : 1,
                  fontWeight: 'semibold',
                  _hover: {
                    bg: '#2c7ceb',
                  },
                })}
              >
                {isUpdating ? 'Updating...' : 'Refresh Now'}
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
          <div className={stack({ gap: '24px' })}>
            {/* Portfolio and Regime */}
            <div className={flex({ gap: '24px', flexWrap: 'wrap' })}>
              <div className={css({ flex: '1', minWidth: '300px' })}>
                <PortfolioDisplay portfolio={session.portfolio} />
              </div>
              <div className={css({ flex: '1', minWidth: '300px' })}>
                <RegimeDisplay
                  regime={session.currentRegime}
                  activeStrategy={session.lastSignal.activeStrategy?.name}
                  momentumConfirmed={session.lastSignal.momentumConfirmed}
                />
              </div>
            </div>

            {/* Price Chart */}
            <div>
              <div className={flex({ gap: '8px', marginBottom: '12px' })}>
                {(['24h', '7d', '30d', 'all'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={css({
                      padding: '4px 12px',
                      bg: timeRange === range ? '#1f6feb' : '#21262d',
                      color: timeRange === range ? '#fff' : '#c9d1d9',
                      border: '1px solid #30363d',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: 'sm',
                      _hover: {
                        bg: timeRange === range ? '#1f6feb' : '#30363d',
                      },
                    })}
                  >
                    {range === 'all' ? 'All' : range.toUpperCase()}
                  </button>
                ))}
              </div>
              <PriceChart
                portfolioHistory={session.portfolioHistory}
                trades={session.trades}
                timeRange={timeRange}
              />
            </div>

            {/* Recent Trades */}
            {session.trades.length > 0 && (
              <div className={css({
                padding: '24px',
                bg: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
              })}>
                <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '16px', color: '#e6edf3' })}>
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
              Click "Start Paper Trading" to begin using the enhanced adaptive strategy
            </p>
          </div>
        )}

        <div className={css({
          marginTop: '48px',
          paddingTop: '24px',
          borderTop: '1px solid #30363d',
        })}>
          <Link
            href="/"
            className={css({
              color: '#58a6ff',
              textDecoration: 'none',
              fontSize: 'sm',
              _hover: {
                textDecoration: 'underline',
              },
            })}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
