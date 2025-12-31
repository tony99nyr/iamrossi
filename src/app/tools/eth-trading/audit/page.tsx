'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '@styled-system/css';
import { stack, flex } from '@styled-system/patterns';
import type { Trade, TradeAudit } from '@/types';
import PinEntryModal from '@/components/rehab/PinEntryModal';

interface TradeAuditResponse {
  trades: Trade[];
  total: number;
  sessionId: string;
  sessionStartedAt: number;
}

export default function TradeAuditPage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  
  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'buy' | 'sell' | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'win' | 'loss' | 'breakeven' | 'pending' | 'all'>('all');
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);

  // Fetch trades
  const fetchTrades = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (outcomeFilter !== 'all') params.set('outcome', outcomeFilter);
      
      const res = await fetch(`/api/trading/audit?${params.toString()}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          setShowPinModal(true);
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch trades');
      }
      
      const data: TradeAuditResponse = await res.json();
      setTrades(data.trades);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, typeFilter, outcomeFilter]);

  // Check authentication and fetch trades
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/trading/audit', {
          credentials: 'include',
        });
        
        if (res.ok) {
          setIsAuthenticated(true);
          // Fetch trades after authentication
          await fetchTrades();
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
    };
    
    checkAuth();
  }, [fetchTrades]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTrades();
    }
  }, [isAuthenticated, fetchTrades]);

  const handlePinSuccess = () => {
    setIsAuthenticated(true);
    setShowPinModal(false);
    fetchTrades();
  };

  const handlePinCancel = () => {
    // Don't allow canceling
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Type', 'ETH Price', 'ETH Amount', 'USDC Amount', 'Signal', 'Confidence', 'P&L', 'Outcome'];
    const rows = trades.map(trade => {
      const date = new Date(trade.timestamp).toISOString();
      const outcome = trade.type === 'buy' ? 'pending' : 
                     trade.pnl === undefined ? 'pending' :
                     trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'breakeven';
      return [
        date,
        trade.type,
        trade.ethPrice.toFixed(2),
        trade.ethAmount.toFixed(6),
        trade.usdcAmount.toFixed(2),
        trade.signal.toFixed(3),
        (trade.confidence * 100).toFixed(1) + '%',
        trade.pnl?.toFixed(2) || '',
        outcome,
      ];
    });
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getOutcome = (trade: Trade): 'win' | 'loss' | 'breakeven' | 'pending' => {
    if (trade.type === 'buy') return 'pending';
    if (trade.pnl === undefined) return 'pending';
    if (trade.pnl > 0) return 'win';
    if (trade.pnl < 0) return 'loss';
    return 'breakeven';
  };

  const getOutcomeColor = (outcome: string): string => {
    switch (outcome) {
      case 'win': return '#3fb950';
      case 'loss': return '#f85149';
      case 'breakeven': return '#7d8590';
      default: return '#7d8590';
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading && !isAuthenticated) {
    return (
      <div className={css({ padding: '24px', textAlign: 'center', color: '#7d8590' })}>
        Loading...
      </div>
    );
  }

  return (
    <>
      {showPinModal && (
        <PinEntryModal
          onSuccess={handlePinSuccess}
          onCancel={handlePinCancel}
        />
      )}
      
      <div className={css({
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
      })}>
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        })}>
          <div>
            <h1 className={css({ fontSize: '2xl', fontWeight: 'bold', color: '#e6edf3', marginBottom: '8px' })}>
              Trade Audit
            </h1>
            <p className={css({ color: '#7d8590', fontSize: 'sm' })}>
              Comprehensive audit of all trades with detailed analysis
            </p>
          </div>
          <div className={flex({ gap: '12px' })}>
            <button
              onClick={() => router.push('/tools/eth-trading')}
              className={css({
                padding: '8px 16px',
                bg: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#e6edf3',
                cursor: 'pointer',
                _hover: { bg: '#30363d' },
              })}
            >
              Back to Dashboard
            </button>
            <button
              onClick={exportToCSV}
              disabled={trades.length === 0}
              className={css({
                padding: '8px 16px',
                bg: '#238636',
                border: '1px solid #2ea043',
                borderRadius: '6px',
                color: '#fff',
                cursor: trades.length === 0 ? 'not-allowed' : 'pointer',
                opacity: trades.length === 0 ? 0.5 : 1,
                _hover: trades.length === 0 ? {} : { bg: '#2ea043' },
              })}
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className={css({
          padding: '16px',
          bg: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          marginBottom: '24px',
        })}>
          <div className={css({
            display: 'grid',
            gridTemplateColumns: { base: '1fr', md: 'repeat(4, 1fr)' },
            gap: '12px',
          })}>
            <div>
              <label className={css({ display: 'block', color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={css({
                  width: '100%',
                  padding: '8px',
                  bg: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#e6edf3',
                })}
              />
            </div>
            <div>
              <label className={css({ display: 'block', color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={css({
                  width: '100%',
                  padding: '8px',
                  bg: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#e6edf3',
                })}
              />
            </div>
            <div>
              <label className={css({ display: 'block', color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className={css({
                  width: '100%',
                  padding: '8px',
                  bg: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#e6edf3',
                })}
              >
                <option value="all">All</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className={css({ display: 'block', color: '#7d8590', fontSize: 'sm', marginBottom: '4px' })}>
                Outcome
              </label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as typeof outcomeFilter)}
                className={css({
                  width: '100%',
                  padding: '8px',
                  bg: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#e6edf3',
                })}
              >
                <option value="all">All</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="breakeven">Breakeven</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* Trades Table */}
        {error && (
          <div className={css({
            padding: '16px',
            bg: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            borderRadius: '8px',
            color: '#f85149',
            marginBottom: '24px',
          })}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div className={css({ padding: '24px', textAlign: 'center', color: '#7d8590' })}>
            Loading trades...
          </div>
        ) : trades.length === 0 ? (
          <div className={css({
            padding: '24px',
            textAlign: 'center',
            bg: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            color: '#7d8590',
          })}>
            No trades found matching the current filters.
          </div>
        ) : (
          <div className={css({
            bg: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            overflow: 'hidden',
          })}>
            <div className={css({
              padding: '12px 16px',
              borderBottom: '1px solid #30363d',
              bg: '#0d1117',
            })}>
              <div className={css({
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto auto auto auto auto',
                gap: '16px',
                alignItems: 'center',
                fontSize: 'sm',
                fontWeight: 'semibold',
                color: '#7d8590',
              })}>
                <div></div>
                <div>Timestamp</div>
                <div>Type</div>
                <div>Price</div>
                <div>Amount</div>
                <div>Signal</div>
                <div>P&L</div>
                <div>Outcome</div>
              </div>
            </div>
            <div className={stack({ gap: '0' })}>
              {trades.map((trade) => {
                const outcome = getOutcome(trade);
                const isExpanded = expandedTrade === trade.id;
                
                return (
                  <div key={trade.id}>
                    <div
                      onClick={() => setExpandedTrade(isExpanded ? null : trade.id)}
                      className={css({
                        padding: '12px 16px',
                        borderBottom: '1px solid #30363d',
                        cursor: 'pointer',
                        _hover: { bg: '#0d1117' },
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto auto auto auto auto auto',
                        gap: '16px',
                        alignItems: 'center',
                        fontSize: 'sm',
                      })}
                    >
                      <div className={css({ color: '#7d8590' })}>
                        {isExpanded ? '▼' : '▶'}
                      </div>
                      <div className={css({ color: '#e6edf3' })}>
                        {formatDate(trade.timestamp)}
                      </div>
                      <div className={css({
                        color: trade.type === 'buy' ? '#3fb950' : '#f85149',
                        fontWeight: 'semibold',
                        textTransform: 'uppercase',
                      })}>
                        {trade.type}
                      </div>
                      <div className={css({ color: '#e6edf3' })}>
                        ${trade.ethPrice.toFixed(2)}
                      </div>
                      <div className={css({ color: '#e6edf3' })}>
                        {trade.ethAmount.toFixed(4)} ETH
                      </div>
                      <div className={css({
                        color: trade.signal > 0 ? '#3fb950' : trade.signal < 0 ? '#f85149' : '#7d8590',
                      })}>
                        {trade.signal > 0 ? '+' : ''}{trade.signal.toFixed(3)}
                      </div>
                      <div className={css({
                        color: trade.pnl !== undefined 
                          ? (trade.pnl >= 0 ? '#3fb950' : '#f85149')
                          : '#7d8590',
                        fontWeight: 'semibold',
                      })}>
                        {trade.pnl !== undefined ? `$${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : '-'}
                      </div>
                      <div className={css({
                        color: getOutcomeColor(outcome),
                        fontWeight: 'semibold',
                        textTransform: 'capitalize',
                      })}>
                        {outcome}
                      </div>
                    </div>
                    
                    {/* Expanded Audit Details */}
                    {isExpanded && trade.audit && (
                      <div className={css({
                        padding: '16px',
                        bg: '#0d1117',
                        borderBottom: '1px solid #30363d',
                      })}>
                        <AuditDetails audit={trade.audit} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AuditDetails({ audit }: { audit: TradeAudit }) {
  return (
    <div className={stack({ gap: '16px' })}>
      <div>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
          When
        </h3>
        <div className={stack({ gap: '4px', fontSize: 'xs', color: '#7d8590' })}>
          <div>Date: {audit.date}</div>
          <div>Timeframe: {audit.timeframe}</div>
        </div>
      </div>

      <div>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
          Why - Signal Details
        </h3>
        <div className={stack({ gap: '4px', fontSize: 'xs', color: '#7d8590' })}>
          <div>Regime: <span className={css({ color: '#e6edf3' })}>{audit.regime}</span> ({Math.round(audit.regimeConfidence * 100)}% confidence)</div>
          <div>Active Strategy: <span className={css({ color: '#e6edf3' })}>{audit.activeStrategy}</span></div>
          <div>Momentum Confirmed: <span className={css({ color: audit.momentumConfirmed ? '#3fb950' : '#7d8590' })}>{audit.momentumConfirmed ? 'Yes' : 'No'}</span></div>
        </div>
      </div>

      <div>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
          Why - Indicators
        </h3>
        <div className={stack({ gap: '4px', fontSize: 'xs' })}>
          {Object.entries(audit.indicatorSignals).slice(0, 5).map(([key, value]) => (
            <div key={key} className={css({ display: 'flex', justifyContent: 'space-between' })}>
              <span className={css({ color: '#7d8590' })}>{key}</span>
              <span className={css({
                color: value > 0 ? '#3fb950' : value < 0 ? '#f85149' : '#7d8590',
              })}>
                {value > 0 ? '+' : ''}{value.toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
          Why - Risk Management
        </h3>
        <div className={stack({ gap: '4px', fontSize: 'xs', color: '#7d8590' })}>
          <div>Volatility Filter: {audit.riskFilters.volatilityFilter ? '❌ Blocked' : '✅ Passed'}</div>
          <div>Whipsaw Detection: {audit.riskFilters.whipsawDetection ? '❌ Blocked' : '✅ Passed'}</div>
          <div>Circuit Breaker: {audit.riskFilters.circuitBreaker ? '❌ Blocked' : '✅ Passed'}</div>
          <div>Regime Persistence: {audit.riskFilters.regimePersistence ? '✅ Passed' : '❌ Blocked'}</div>
        </div>
      </div>

      {audit.holdingPeriod !== undefined && (
        <div>
          <h3 className={css({ fontSize: 'sm', fontWeight: 'semibold', color: '#e6edf3', marginBottom: '8px' })}>
            How Successful
          </h3>
          <div className={stack({ gap: '4px', fontSize: 'xs', color: '#7d8590' })}>
            <div>Holding Period: {audit.holdingPeriod} days</div>
            {audit.maxFavorableExcursion !== undefined && (
              <div>MFE: <span className={css({ color: '#3fb950' })}>+{audit.maxFavorableExcursion.toFixed(2)}%</span></div>
            )}
            {audit.maxAdverseExcursion !== undefined && (
              <div>MAE: <span className={css({ color: '#f85149' })}>-{audit.maxAdverseExcursion.toFixed(2)}%</span></div>
            )}
            {audit.exitReason && (
              <div>Exit Reason: <span className={css({ color: '#e6edf3' })}>{audit.exitReason}</span></div>
            )}
            {audit.roi !== undefined && (
              <div>ROI: <span className={css({ color: audit.roi >= 0 ? '#3fb950' : '#f85149' })}>{audit.roi >= 0 ? '+' : ''}{audit.roi.toFixed(2)}%</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

