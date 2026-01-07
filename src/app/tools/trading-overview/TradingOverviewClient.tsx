'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { EnhancedPaperTradingSession } from '@/lib/paper-trading-enhanced';
import { getAssetConfig } from '@/lib/asset-config';
import { isTradingBlocked } from '@/lib/risk-management-utils';
import { getNextAction } from '@/lib/next-action-utils';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import PerformanceMetricsPanel from './components/PerformanceMetricsPanel';
import CorrelationIndicator from './components/CorrelationIndicator';
import PerformanceAttributionPanel from './components/PerformanceAttributionPanel';
import TradeAnalysisPanel from './components/TradeAnalysisPanel';

interface OverviewData {
  eth: EnhancedPaperTradingSession | null;
  btc: EnhancedPaperTradingSession | null;
  correlation?: {
    value: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
}

export default function TradingOverviewClient() {
  const [overview, setOverview] = useState<OverviewData>({ eth: null, btc: null });
  const [, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Get auth headers
  const getAuthHeaders = (): HeadersInit => {
    return {
      'Content-Type': 'application/json',
    };
  };

  // Check authentication and fetch overview data
  const fetchOverview = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch both ETH and BTC sessions in parallel
      const [ethRes, btcRes] = await Promise.all([
        fetch('/api/trading/paper/status?asset=eth', {
          headers: getAuthHeaders(),
          credentials: 'include',
        }),
        fetch('/api/trading/paper/status?asset=btc', {
          headers: getAuthHeaders(),
          credentials: 'include',
        }),
      ]);

      if (ethRes.status === 401 || btcRes.status === 401) {
        setIsAuthenticated(false);
        setShowPinModal(true);
        return;
      }

      setIsAuthenticated(true);
      
      const ethData = ethRes.ok ? await ethRes.json() : { session: null };
      const btcData = btcRes.ok ? await btcRes.json() : { session: null };

      setOverview({
        eth: ethData.session,
        btc: btcData.session,
      });
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Refresh data when tab/window regains focus
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleFocus = () => {
      // Refresh overview when tab/window regains focus
      fetchOverview();
    };

    const handleVisibilityChange = () => {
      // Refresh when tab becomes visible
      if (!document.hidden) {
        fetchOverview();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, fetchOverview]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      fetchOverview();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchOverview]);

  const handlePinSuccess = () => {
    setIsAuthenticated(true);
    setShowPinModal(false);
    fetchOverview();
  };

  const handlePinCancel = () => {
    // Don't allow canceling
  };

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const formatUsd = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(2)}%`;
  };

  const containerStyles = css({
    minHeight: '100vh',
    padding: '16px',
    maxWidth: '1400px',
    margin: '0 auto',
    color: '#c9d1d9',
  });

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

  const ethConfig = getAssetConfig('eth');
  const btcConfig = getAssetConfig('btc');
  const combinedValue = (overview.eth?.portfolio.totalValue || 0) + (overview.btc?.portfolio.totalValue || 0);
  const ethReturn = overview.eth?.portfolio.totalReturn || 0;
  const btcReturn = overview.btc?.portfolio.totalReturn || 0;
  const ethNextAction = getNextAction(overview.eth);
  const btcNextAction = getNextAction(overview.btc);

  return (
    <div className={containerStyles}>
      <div className={stack({ gap: '16px' })}>
        <div className={flex({ justifyContent: 'space-between', alignItems: 'center' })}>
          <h1 className={css({ fontSize: '2xl', fontWeight: 'bold', color: '#e6edf3' })}>
            Trading Overview
          </h1>
          {lastUpdate && (
            <span className={css({ color: '#7d8590', fontSize: 'sm' })}>
              Last updated: {formatTimeAgo(lastUpdate)}
            </span>
          )}
        </div>

        {/* Combined Portfolio Summary */}
        <div className={css({
          padding: '16px',
          bg: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
        })}>
          <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
            Combined Portfolio
          </h2>
          <div className={flex({ gap: '24px', flexWrap: 'wrap' })}>
            <div>
              <div className={css({ color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>Total Value</div>
              <div className={css({ color: '#e6edf3', fontSize: 'xl', fontWeight: 'bold' })}>
                {formatUsd(combinedValue)}
              </div>
            </div>
            <div>
              <div className={css({ color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>ETH Return</div>
              <div className={css({ 
                color: ethReturn >= 0 ? '#3fb950' : '#f85149', 
                fontSize: 'lg', 
                fontWeight: 'semibold' 
              })}>
                {formatPercent(ethReturn / 100)}
              </div>
            </div>
            <div>
              <div className={css({ color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>BTC Return</div>
              <div className={css({ 
                color: btcReturn >= 0 ? '#3fb950' : '#f85149', 
                fontSize: 'lg', 
                fontWeight: 'semibold' 
              })}>
                {formatPercent(btcReturn / 100)}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Management Status */}
        {(isTradingBlocked(overview.eth) || isTradingBlocked(overview.btc)) && (
          <div className={css({
            padding: '16px',
            bg: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            borderRadius: '8px',
          })}>
            <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold', marginBottom: '12px', color: '#f85149' })}>
              ⚠️ Trading Blocked by Risk Management
            </h2>
            <div className={stack({ gap: '8px' })}>
              {isTradingBlocked(overview.eth) && (
                <div className={css({ color: '#f85149', fontSize: 'sm' })}>
                  • {ethConfig.displayName}: Trading is currently blocked by risk management filters
                </div>
              )}
              {isTradingBlocked(overview.btc) && (
                <div className={css({ color: '#f85149', fontSize: 'sm' })}>
                  • {btcConfig.displayName}: Trading is currently blocked by risk management filters
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next Actions */}
        {(ethNextAction || btcNextAction) && (
          <div className={css({
            display: 'grid',
            gridTemplateColumns: { base: '1fr', md: 'repeat(2, 1fr)' },
            gap: '16px',
          })}>
            {ethNextAction && (
              <div className={css({
                padding: '12px',
                bg: ethNextAction.bgColor,
                border: `1px solid ${ethNextAction.borderColor}`,
                borderRadius: '8px',
              })}>
                <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '4px' })}>
                  {ethConfig.displayName} - Next Action
                </div>
                <div className={css({ 
                  fontSize: 'sm', 
                  fontWeight: 'semibold',
                  color: ethNextAction.color,
                })}>
                  {ethNextAction.message}
                </div>
              </div>
            )}
            {btcNextAction && (
              <div className={css({
                padding: '12px',
                bg: btcNextAction.bgColor,
                border: `1px solid ${btcNextAction.borderColor}`,
                borderRadius: '8px',
              })}>
                <div className={css({ fontSize: 'xs', color: '#7d8590', marginBottom: '4px' })}>
                  {btcConfig.displayName} - Next Action
                </div>
                <div className={css({ 
                  fontSize: 'sm', 
                  fontWeight: 'semibold',
                  color: btcNextAction.color,
                })}>
                  {btcNextAction.message}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Asset Health Cards */}
        <div className={css({
          display: 'grid',
          gridTemplateColumns: { base: '1fr', md: 'repeat(2, 1fr)' },
          gap: '16px',
        })}>
          {/* ETH Health Card */}
          <div className={css({
            padding: '16px',
            bg: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
          })}>
            <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' })}>
              <h3 className={css({ fontSize: 'md', fontWeight: 'semibold', color: '#e6edf3' })}>
                {ethConfig.displayName}
              </h3>
              <Link
                href="/tools/eth-trading"
                className={css({
                  padding: '4px 12px',
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
                View
              </Link>
            </div>
            {overview.eth ? (
              <div className={stack({ gap: '8px' })}>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Status</span>
                  <span className={css({ 
                    color: overview.eth.isActive ? '#3fb950' : '#7d8590',
                    fontSize: 'sm',
                    fontWeight: 'semibold'
                  })}>
                    {overview.eth.isActive ? 'Active' : 'Stopped'}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Portfolio</span>
                  <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>
                    {formatUsd(overview.eth.portfolio.totalValue)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Return</span>
                  <span className={css({ 
                    color: overview.eth.portfolio.totalReturn >= 0 ? '#3fb950' : '#f85149',
                    fontSize: 'sm',
                    fontWeight: 'semibold'
                  })}>
                    {formatPercent(overview.eth.portfolio.totalReturn / 100)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trades</span>
                  <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>
                    {overview.eth.trades.length}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Regime</span>
                  <span className={css({ 
                    color: overview.eth.currentRegime.regime === 'bullish' ? '#3fb950' : 
                            overview.eth.currentRegime.regime === 'bearish' ? '#f85149' : '#7d8590',
                    fontSize: 'sm',
                    fontWeight: 'semibold',
                    textTransform: 'capitalize'
                  })}>
                    {overview.eth.currentRegime.regime}
                  </span>
                </div>
              </div>
            ) : (
              <div className={css({ color: '#7d8590', fontSize: 'sm', textAlign: 'center', padding: '8px' })}>
                No active session
              </div>
            )}
          </div>

          {/* BTC Health Card */}
          <div className={css({
            padding: '16px',
            bg: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
          })}>
            <div className={flex({ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' })}>
              <h3 className={css({ fontSize: 'md', fontWeight: 'semibold', color: '#e6edf3' })}>
                {btcConfig.displayName}
              </h3>
              <Link
                href="/tools/btc-trading"
                className={css({
                  padding: '4px 12px',
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
                View
              </Link>
            </div>
            {overview.btc ? (
              <div className={stack({ gap: '8px' })}>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Status</span>
                  <span className={css({ 
                    color: overview.btc.isActive ? '#3fb950' : '#7d8590',
                    fontSize: 'sm',
                    fontWeight: 'semibold'
                  })}>
                    {overview.btc.isActive ? 'Active' : 'Stopped'}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Portfolio</span>
                  <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>
                    {formatUsd(overview.btc.portfolio.totalValue)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Return</span>
                  <span className={css({ 
                    color: overview.btc.portfolio.totalReturn >= 0 ? '#3fb950' : '#f85149',
                    fontSize: 'sm',
                    fontWeight: 'semibold'
                  })}>
                    {formatPercent(overview.btc.portfolio.totalReturn / 100)}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Trades</span>
                  <span className={css({ color: '#e6edf3', fontSize: 'sm' })}>
                    {overview.btc.trades.length}
                  </span>
                </div>
                <div className={flex({ justifyContent: 'space-between' })}>
                  <span className={css({ color: '#7d8590', fontSize: 'sm' })}>Regime</span>
                  <span className={css({ 
                    color: overview.btc.currentRegime.regime === 'bullish' ? '#3fb950' : 
                            overview.btc.currentRegime.regime === 'bearish' ? '#f85149' : '#7d8590',
                    fontSize: 'sm',
                    fontWeight: 'semibold',
                    textTransform: 'capitalize'
                  })}>
                    {overview.btc.currentRegime.regime}
                  </span>
                </div>
              </div>
            ) : (
              <div className={css({ color: '#7d8590', fontSize: 'sm', textAlign: 'center', padding: '8px' })}>
                No active session
              </div>
            )}
          </div>
        </div>

        {/* Correlation Indicator */}
        <CorrelationIndicator />

        {/* Performance Metrics Panel */}
        {(overview.eth || overview.btc) && (
          <PerformanceMetricsPanel 
            ethSession={overview.eth} 
            btcSession={overview.btc} 
          />
        )}

        {/* Analytics Panels */}
        <div className={css({
          display: 'grid',
          gridTemplateColumns: { base: '1fr', md: 'repeat(2, 1fr)' },
          gap: '16px',
        })}>
          {overview.eth && (
            <>
              <PerformanceAttributionPanel asset="eth" />
              <TradeAnalysisPanel asset="eth" />
            </>
          )}
          {overview.btc && (
            <>
              <PerformanceAttributionPanel asset="btc" />
              <TradeAnalysisPanel asset="btc" />
            </>
          )}
        </div>

        {/* Quick Navigation */}
        <div className={css({
          padding: '16px',
          bg: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
        })}>
          <h3 className={css({ fontSize: 'md', fontWeight: 'semibold', marginBottom: '12px', color: '#e6edf3' })}>
            Quick Navigation
          </h3>
          <div className={flex({ gap: '12px', flexWrap: 'wrap' })}>
            <Link
              href="/tools/eth-trading"
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
              {ethConfig.displayName} Trading
            </Link>
            <Link
              href="/tools/btc-trading"
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
              {btcConfig.displayName} Trading
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

