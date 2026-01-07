'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { css, cx } from '@styled-system/css';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import type { PokemonCardConfig, PokemonIndexSettings, PokemonIndexPoint, PokemonCardPriceSnapshot } from '@/types';

interface PokemonPriceIndexClientProps {
    initialSettings: PokemonIndexSettings | null;
    initialSeries: PokemonIndexPoint[];
}

export default function PokemonPriceIndexClient({
    initialSettings,
    initialSeries,
}: PokemonPriceIndexClientProps) {
    const [settings, setSettings] = useState<PokemonIndexSettings | null>(initialSettings);
    const [series, setSeries] = useState<PokemonIndexPoint[]>(initialSeries || []);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingPrices, setIsFetchingPrices] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [snapshots, setSnapshots] = useState<PokemonCardPriceSnapshot[]>([]);
    
    // Initialize state with defaults (same on server and client to avoid hydration mismatch)
    // We'll sync from URL params in useEffect after hydration
    const [activeView, setActiveView] = useState<'chart' | 'table'>('chart');
    const [timeRange, setTimeRange] = useState<'all' | 'ytd' | '6m' | '3m' | '1m'>('all');
    
    // Sync state from URL params after hydration (client-side only)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        
        // Read view from URL
        const view = params.get('view');
        if (view === 'chart' || view === 'table') {
            setActiveView(view);
        }
        
        // Read range from URL
        const range = params.get('range');
        if (range === 'all' || range === 'ytd' || range === '6m' || range === '3m' || range === '1m') {
            setTimeRange(range);
        }
    }, []); // Only run once on mount
    
    // Update URL when view or time range changes
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        
        // Update view param
        if (activeView === 'chart') {
            params.delete('view'); // Default is chart, so we can omit it
        } else {
            params.set('view', activeView);
        }
        
        // Update range param
        if (timeRange === 'all') {
            params.delete('range'); // Default is all, so we can omit it
        } else {
            params.set('range', timeRange);
        }
        
        // Update URL without page reload
        const newUrl = params.toString() 
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;
        
        window.history.replaceState({}, '', newUrl);
    }, [activeView, timeRange]);

    // Check for existing auth cookie on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                // Try to make a request that requires auth - use HEAD to avoid side effects
                // We'll try to access the settings POST endpoint with invalid data
                // If we get 401, we're not authenticated; if we get 400 (validation error), we are authenticated
                const response = await fetch('/api/pokemon-index/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({}), // Invalid data, but will tell us if we're authenticated
                });
                
                // 401 = not authenticated, 400 = authenticated but invalid data (which is fine for our check)
                if (response.status === 400 || response.status === 200) {
                    setIsAuthenticated(true);
                } else if (response.status === 401) {
                    setIsAuthenticated(false);
                }
            } catch (error) {
                // If fetch fails, assume not authenticated
                console.error('Auth check failed:', error);
            }
        };
        checkAuth();
    }, []);

    useEffect(() => {
        // Hydrate from API to ensure we have latest data
                // Fetch data - don't use refresh=1 as it might trigger refreshTodaySnapshots
                // which could overwrite historical data. Just rebuild the series from existing snapshots.
                const fetchData = async () => {
                    setIsLoading(true);
                    setError(null);
                    try {
                        // Don't use refresh=1 - it might overwrite historical data
                        // The series will be built from existing snapshots
                        const res = await fetch('/api/pokemon-index/prices');
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to load index data');
                }
                const data = await res.json();
                setSettings(data.settings);
                setSeries(data.series);

                // Fetch all snapshots (no days limit to show all historical data)
                const snapsRes = await fetch('/api/pokemon-index/snapshots?days=0');
                if (snapsRes.ok) {
                    const snapsData = await snapsRes.json();
                    const allSnapshots = snapsData.snapshots || [];
                    console.log(`[Pokemon] Loaded ${allSnapshots.length} snapshots from API`);
                    setSnapshots(allSnapshots);
                } else {
                    console.error('[Pokemon] Failed to fetch snapshots:', snapsRes.status);
                }
            } catch (err) {
                console.error('Failed to fetch pokemon index data', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleOpenSettings = () => {
        if (isAuthenticated) {
            // Already authenticated, open settings directly
            setShowSettingsModal(true);
        } else {
            // Not authenticated, show PIN modal
            setShowPinModal(true);
        }
    };

    const handlePinSuccess = () => {
        setIsAuthenticated(true);
        setShowPinModal(false);
        setShowSettingsModal(true);
    };

    const handlePinCancel = () => {
        setShowPinModal(false);
    };

    const handleRefresh = async () => {
        setIsFetchingPrices(true);
        setError(null);
        try {
            // Force refresh - this will scrape today's prices and rebuild the index
            const pricesRes = await fetch('/api/pokemon-index/prices?refresh=1');
            if (!pricesRes.ok) {
                const data = await pricesRes.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to refresh index data');
            }
            const pricesData = await pricesRes.json();
            setSettings(pricesData.settings);
            setSeries(pricesData.series);
            
            // Also refresh snapshots
            const snapsRes = await fetch('/api/pokemon-index/snapshots?days=0');
            if (snapsRes.ok) {
                const snapsData = await snapsRes.json();
                setSnapshots(snapsData.snapshots || []);
            }
        } catch (err) {
            console.error('Failed to refresh pokemon index data', err);
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        } finally {
            setIsFetchingPrices(false);
        }
    };

    const handleSaveSettings = async (next: PokemonIndexSettings) => {
        setError(null);
        try {
            const res = await fetch('/api/pokemon-index/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(next),
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) {
                    // Auth expired, show PIN modal again
                    setIsAuthenticated(false);
                    setShowSettingsModal(false);
                    setShowPinModal(true);
                    return;
                }
                throw new Error(data.error || 'Failed to save settings');
            }
            setSettings(data);
            setShowSettingsModal(false);

            // Refresh prices with updated settings
            setIsFetchingPrices(true);
            try {
                const pricesRes = await fetch('/api/pokemon-index/prices?refresh=1');
                if (pricesRes.ok) {
                    const pricesData = await pricesRes.json();
                    setSeries(pricesData.series);
                    
                    // Also refresh snapshots (fetch all historical data)
                    const snapsRes = await fetch('/api/pokemon-index/snapshots?days=0');
                    if (snapsRes.ok) {
                        const snapsData = await snapsRes.json();
                        setSnapshots(snapsData.snapshots || []);
                    }
                }
            } finally {
                setIsFetchingPrices(false);
            }
        } catch (err) {
            console.error('Failed to save pokemon index settings', err);
            setError(err instanceof Error ? err.message : 'Failed to save settings');
        }
    };

    const latestPoint = series.length > 0 ? series[series.length - 1] : null;

    return (
        <div className={cx('pokemon-price-index-page', css({
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            padding: '16px',
            md: {
                padding: '24px',
            },
            position: 'relative',
        }))}>
            <div className={css({
                maxWidth: '1200px',
                margin: '0 auto',
            })}>
                <header className={css({
                    marginBottom: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                })}>
                    <div className={css({
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '16px',
                    })}>
                        <div className={css({ flex: 1 })}>
                            <h1 className={css({
                                fontSize: { base: '1.5rem', md: '1.75rem' },
                                fontWeight: 600,
                                color: '#e5e7eb',
                            })}>
                                Pokemon Card Price Index
                            </h1>
                            <p className={css({
                                fontSize: { base: '0.9rem', md: '1rem' },
                                color: '#9ca3af',
                            })}>
                                Track a custom basket of Pokemon cards using an index built from ungraded and PSA 10 prices.
                            </p>
                            {latestPoint && (
                                <p className={css({
                                    fontSize: '0.85rem',
                                    color: '#6b7280',
                                    marginTop: '4px',
                                })}>
                                    Latest value: <span className={css({ color: '#fbbf24' })}>{latestPoint.indexValue.toFixed(2)}</span>{' '}
                                    on {latestPoint.date}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isFetchingPrices}
                            className={css({
                                padding: '8px 16px',
                                fontSize: '0.875rem',
                                borderRadius: '8px',
                                border: '1px solid #374151',
                                backgroundColor: '#1f2937',
                                color: '#e5e7eb',
                                cursor: isFetchingPrices ? 'not-allowed' : 'pointer',
                                opacity: isFetchingPrices ? 0.6 : 1,
                                whiteSpace: 'nowrap',
                                _hover: isFetchingPrices ? {} : {
                                    backgroundColor: '#374151',
                                },
                            })}
                            title="Refresh index data and scrape today's prices"
                        >
                            {isFetchingPrices ? 'Refreshing...' : '🔄 Refresh'}
                        </button>
                    </div>
                </header>

                {/* View toggle and time range selector */}
                <div className={css({
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '12px',
                    alignItems: 'center',
                })}>
                    <div className={css({
                        display: 'inline-flex',
                        borderRadius: '9999px',
                        border: '1px solid #1f2937',
                        overflow: 'hidden',
                        backgroundColor: '#020617',
                    })}>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveView('chart');
                            }}
                            className={css({
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: activeView === 'chart' ? '#111827' : 'transparent',
                                color: activeView === 'chart' ? '#e5e7eb' : '#6b7280',
                            })}
                        >
                            Index Chart
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveView('table');
                            }}
                            className={css({
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: activeView === 'table' ? '#111827' : 'transparent',
                                color: activeView === 'table' ? '#e5e7eb' : '#6b7280',
                            })}
                        >
                            Per-Card Prices
                        </button>
                    </div>
                    
                    {activeView === 'chart' && (
                        <div className={css({
                            display: 'inline-flex',
                            borderRadius: '8px',
                            border: '1px solid #1f2937',
                            overflow: 'hidden',
                            backgroundColor: '#020617',
                        })}>
                            {(['all', 'ytd', '6m', '3m', '1m'] as const).map((range, index, array) => (
                                <button
                                    key={range}
                                    type="button"
                                    onClick={() => {
                                        setTimeRange(range);
                                    }}
                                    className={css({
                                        padding: '6px 12px',
                                        fontSize: '0.8rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: timeRange === range ? '#111827' : 'transparent',
                                        color: timeRange === range ? '#e5e7eb' : '#6b7280',
                                        borderRight: index < array.length - 1 ? '1px solid #1f2937' : 'none',
                                    })}
                                >
                                    {range === 'all' ? 'All' : range === 'ytd' ? 'YTD' : range === '6m' ? '6M' : range === '3m' ? '3M' : '1M'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <section className={css({
                    borderRadius: '12px',
                    border: '1px solid #1f2933',
                    padding: '16px',
                    marginBottom: '16px',
                    minHeight: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6b7280',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                })}>
                    {activeView === 'chart' ? (
                        isLoading ? (
                            <span>Loading index data…</span>
                        ) : series.length === 0 ? (
                            <span>
                                No index data yet. Configure cards in settings to start building the index and recording daily prices.
                            </span>
                        ) : (
                            <SimpleIndexChart series={series} timeRange={timeRange} />
                        )
                    ) : (
                        <PriceSnapshotsTable
                            settings={settings}
                            snapshots={snapshots}
                            isLoading={isLoading}
                        />
                    )}
                </section>

                <section className={css({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '0.85rem',
                    color: '#9ca3af',
                })}>
                    <div>
                        <strong className={css({ color: '#e5e7eb' })}>Configured cards:</strong>{' '}
                        {settings?.cards?.length ? settings.cards.length : 0}
                    </div>
                    {error && (
                        <div className={css({
                            color: '#fca5a5',
                        })}>
                            {error}
                        </div>
                    )}
                    <div>
                        This tool stores daily price snapshots from PriceCharting and computes multiple momentum indicators:
                        <ul className={css({ marginTop: '4px', paddingLeft: '20px', listStyle: 'disc' })}>
                            <li><strong>7-Day MA</strong> (blue) - Short-term momentum</li>
                            <li><strong>30-Day MA</strong> (green) - Medium-term trend</li>
                            <li><strong>120-Day MA</strong> (yellow) - Long-term trend</li>
                            <li><strong>MACD</strong> - Momentum convergence/divergence (shown in tooltip)</li>
                            <li><strong>ROC</strong> - Rate of change percentage (shown in tooltip)</li>
                        </ul>
                        See <code className={css({ color: '#60a5fa' })}>POKEMON_TRADING_INDICATORS.md</code> for buy/sell signal guidance.
                    </div>
                </section>
            </div>

            {/* Settings button (bottom-right) */}
            <button
                type="button"
                onClick={handleOpenSettings}
                className={cx('pokemon-settings-button', css({
                    position: 'fixed',
                    right: '1.5rem',
                    bottom: '1.5rem',
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: '#111827',
                    color: '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease',
                    _hover: {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 14px 30px rgba(0,0,0,0.75)',
                        backgroundColor: '#1f2937',
                    },
                    _active: {
                        transform: 'translateY(0)',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                    },
                }))}
                aria-label="Pokemon index settings"
            >
                ⚙️
            </button>

            {/* Loading spinner for price fetching */}
            {isFetchingPrices && (
                <div className={css({
                    position: 'fixed',
                    right: '1.5rem',
                    bottom: '5rem', // Above the settings button
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(17, 24, 39, 0.9)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                    zIndex: 100,
                })}>
                    <div className={css({
                        width: '1.25rem',
                        height: '1.25rem',
                        border: '2px solid rgba(59, 130, 246, 0.3)',
                        borderTopColor: '#60a5fa',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                    })} />
                </div>
            )}

            {/* PIN modal for unlocking settings (settings panel to be added) */}
            {showPinModal && (
                <PinEntryModal
                    onSuccess={handlePinSuccess}
                    onCancel={handlePinCancel}
                />
            )}
            {showSettingsModal && isAuthenticated && settings && (
                <PokemonSettingsModal
                    initialSettings={settings}
                    onSave={handleSaveSettings}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}
            
            {/* Spinner animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

interface SimpleIndexChartProps {
    series: PokemonIndexPoint[];
}

function SimpleIndexChart({ series, timeRange }: SimpleIndexChartProps & { timeRange: 'all' | 'ytd' | '6m' | '3m' | '1m' }) {
    // Hooks must be called unconditionally - move before early returns
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Filter series based on time range
    const filteredSeries = useMemo(() => {
        if (timeRange === 'all') return series;
        
         
        const now = new Date();
        const cutoffDate = new Date();
        
        switch (timeRange) {
            case 'ytd':
                cutoffDate.setMonth(0, 1); // January 1st
                cutoffDate.setHours(0, 0, 0, 0);
                break;
            case '6m':
                cutoffDate.setMonth(now.getMonth() - 6);
                break;
            case '3m':
                cutoffDate.setMonth(now.getMonth() - 3);
                break;
            case '1m':
                cutoffDate.setMonth(now.getMonth() - 1);
                break;
        }
        
        const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
        return series.filter(p => p.date >= cutoffDateStr);
    }, [series, timeRange]);
    
    if (filteredSeries.length === 0) {
        return (
            <div className={css({
                color: '#6b7280',
                fontSize: '0.9rem',
            })}>
                No data available for the selected time range.
            </div>
        );
    }
    
    // Use filtered series for all calculations
    const displaySeries = filteredSeries;
    
    const width = 1200;
    const height = 400;
    const padding = { top: 20, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    if (displaySeries.length === 0) return null;

    // Collect all values including index and all moving averages to ensure proper Y-axis range
    const allValues: number[] = [];
    displaySeries.forEach((p) => {
        allValues.push(p.indexValue);
        if (typeof p.ma7 === 'number') allValues.push(p.ma7);
        if (typeof p.ma30 === 'number') allValues.push(p.ma30);
        if (typeof p.ma120 === 'number') allValues.push(p.ma120);
    });
    
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const pad = (max - min) * 0.1 || 10;
    const yMin = min - pad;
    const yMax = max + pad;

    const project = (value: number, index: number): { x: number; y: number } => {
        const x = (index / Math.max(displaySeries.length - 1, 1)) * chartWidth + padding.left;
        const ratio = (value - yMin) / (yMax - yMin || 1);
        const y = padding.top + chartHeight - ratio * chartHeight;
        return { x, y };
    };

    const buildPath = (getter: (p: PokemonIndexPoint) => number | undefined): string | null => {
        const points: string[] = [];
        displaySeries.forEach((p, i) => {
            const v = getter(p);
            if (typeof v !== 'number') return;
            const { x, y } = project(v, i);
            points.push(`${x},${y}`);
        });
        return points.length ? points.join(' ') : null;
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current || !containerRef.current) return;
        
        const svgRect = svgRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - svgRect.left;
        const y = e.clientY - svgRect.top;
        
        // Find the closest data point
        let closestIndex = 0;
        let minDistance = Infinity;
        
        displaySeries.forEach((_, index) => {
            const { x: px } = project(displaySeries[index]!.indexValue, index);
            const distance = Math.abs(x - px);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        
        // Only show tooltip if we're within the chart area
        if (x >= padding.left && x <= width - padding.right && 
            y >= padding.top && y <= height - padding.bottom) {
            setHoveredIndex(closestIndex);
            // Calculate position relative to container
            const relativeX = e.clientX - containerRect.left;
            const relativeY = e.clientY - containerRect.top;
            setTooltipPosition({ x: relativeX, y: relativeY });
            
            // Calculate tooltip style to prevent going off-screen
            const containerWidth = containerRef.current?.offsetWidth || 0;
            const tooltipWidth = 200;
            const left = relativeX + 15 > containerWidth - tooltipWidth
                ? relativeX - tooltipWidth - 15
                : relativeX + 15;
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

    const indexPath = buildPath((p) => p.indexValue);
    const ma7Path = buildPath((p) => p.ma7);
    const ma30Path = buildPath((p) => p.ma30);
    const ma120Path = buildPath((p) => p.ma120);

    const hoveredPoint = hoveredIndex !== null ? displaySeries[hoveredIndex]! : null;

    // Format Y-axis labels
    const yAxisLabels: number[] = [];
    const numLabels = 6;
    for (let i = 0; i <= numLabels; i++) {
        yAxisLabels.push(yMin + (yMax - yMin) * (i / numLabels));
    }

    return (
        <div className={css({
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
        })}>
            {/* Legend */}
            <div className={css({
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                justifyContent: 'center',
                padding: '8px',
            })}>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                })}>
                    <div className={css({
                        width: '24px',
                        height: '3px',
                        backgroundColor: '#60a5fa',
                    })} />
                    <span className={css({ color: '#e5e7eb', fontSize: '0.85rem' })}>Index Value</span>
                </div>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                })}>
                    <div className={css({
                        width: '24px',
                        height: '3px',
                        backgroundColor: '#22c55e',
                        backgroundImage: 'repeating-linear-gradient(to right, #22c55e 0, #22c55e 4px, transparent 4px, transparent 8px)',
                    })} />
                    <span className={css({ color: '#e5e7eb', fontSize: '0.85rem' })}>30-Day MA</span>
                </div>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                })}>
                    <div className={css({
                        width: '24px',
                        height: '3px',
                        backgroundColor: '#eab308',
                        backgroundImage: 'repeating-linear-gradient(to right, #eab308 0, #eab308 2px, transparent 2px, transparent 8px)',
                    })} />
                    <span className={css({ color: '#e5e7eb', fontSize: '0.85rem' })}>120-Day MA</span>
                </div>
            </div>

            {/* Chart */}
            <div 
                ref={containerRef}
                className={css({
                    position: 'relative',
                    width: '100%',
                })}
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
                    <rect x="0" y="0" width={width} height={height} fill="#020617" />
                    
                    {/* Y-axis labels */}
                    {yAxisLabels.map((value, i) => {
                        const y = padding.top + chartHeight - (i / numLabels) * chartHeight;
                        return (
                            <g key={i}>
                                <line
                                    x1={padding.left - 5}
                                    y1={y}
                                    x2={padding.left}
                                    y2={y}
                                    stroke="#1f2937"
                                    strokeWidth="1"
                                />
                                <text
                                    x={padding.left - 10}
                                    y={y + 4}
                                    fill="#6b7280"
                                    fontSize="10"
                                    textAnchor="end"
                                >
                                    {value.toFixed(1)}
                                </text>
                            </g>
                        );
                    })}

                    {/* X-axis labels (show first, middle, last dates) */}
                    {displaySeries.length > 0 && (
                        <>
                            {[0, Math.floor(displaySeries.length / 2), displaySeries.length - 1].map((index) => {
                                const { x } = project(displaySeries[index]!.indexValue, index);
                                return (
                                    <g key={index}>
                                        <line
                                            x1={x}
                                            y1={height - padding.bottom}
                                            x2={x}
                                            y2={height - padding.bottom + 5}
                                            stroke="#1f2937"
                                            strokeWidth="1"
                                        />
                                        <text
                                            x={x}
                                            y={height - padding.bottom + 18}
                                            fill="#6b7280"
                                            fontSize="10"
                                            textAnchor="middle"
                                        >
                                            {displaySeries[index]!.date}
                                        </text>
                                    </g>
                                );
                            })}
                        </>
                    )}

                    {/* Grid lines */}
                    {yAxisLabels.map((_, i) => {
                        const y = padding.top + chartHeight - (i / numLabels) * chartHeight;
                        return (
                            <line
                                key={i}
                                x1={padding.left}
                                y1={y}
                                x2={width - padding.right}
                                y2={y}
                                stroke="#1f2937"
                                strokeWidth="0.5"
                                strokeDasharray="2 2"
                            />
                        );
                    })}

                    {/* Axes */}
                    <line
                        x1={padding.left}
                        y1={height - padding.bottom}
                        x2={width - padding.right}
                        y2={height - padding.bottom}
                        stroke="#1f2937"
                        strokeWidth="1"
                    />
                    <line
                        x1={padding.left}
                        y1={padding.top}
                        x2={padding.left}
                        y2={height - padding.bottom}
                        stroke="#1f2937"
                        strokeWidth="1"
                    />

                    {/* Index line */}
                    {indexPath && (
                        <polyline
                            fill="none"
                            stroke="#60a5fa"
                            strokeWidth="2.5"
                            points={indexPath}
                        />
                    )}

                    {/* 7-day MA (short-term momentum) */}
                    {ma7Path && (
                        <polyline
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                            points={ma7Path}
                            opacity={0.8}
                        />
                    )}

                    {/* 30-day MA */}
                    {ma30Path && (
                        <polyline
                            fill="none"
                            stroke="#22c55e"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            points={ma30Path}
                        />
                    )}

                    {/* 120-day MA */}
                    {ma120Path && (
                        <polyline
                            fill="none"
                            stroke="#eab308"
                            strokeWidth="2"
                            strokeDasharray="2 6"
                            points={ma120Path}
                        />
                    )}

                    {/* Hover indicator line and point */}
                    {hoveredIndex !== null && hoveredPoint && (() => {
                        const { x, y } = project(hoveredPoint.indexValue, hoveredIndex);
                        return (
                            <g>
                                {/* Vertical line */}
                                <line
                                    x1={x}
                                    y1={padding.top}
                                    x2={x}
                                    y2={height - padding.bottom}
                                    stroke="#4b5563"
                                    strokeWidth="1"
                                    strokeDasharray="3 3"
                                />
                                {/* Point on index line */}
                                <circle
                                    cx={x}
                                    cy={y}
                                    r="5"
                                    fill="#60a5fa"
                                    stroke="#020617"
                                    strokeWidth="2"
                                />
                                {/* Point on 7-day MA if available */}
                                {typeof hoveredPoint.ma7 === 'number' && (() => {
                                    const { x: mx, y: my } = project(hoveredPoint.ma7, hoveredIndex);
                                    return (
                                        <circle
                                            cx={mx}
                                            cy={my}
                                            r="3"
                                            fill="#3b82f6"
                                            stroke="#020617"
                                            strokeWidth="1.5"
                                            opacity={0.8}
                                        />
                                    );
                                })()}
                                {/* Point on 30-day MA if available */}
                                {typeof hoveredPoint.ma30 === 'number' && (() => {
                                    const { x: mx, y: my } = project(hoveredPoint.ma30, hoveredIndex);
                                    return (
                                        <circle
                                            cx={mx}
                                            cy={my}
                                            r="4"
                                            fill="#22c55e"
                                            stroke="#020617"
                                            strokeWidth="2"
                                        />
                                    );
                                })()}
                                {/* Point on 120-day MA if available */}
                                {typeof hoveredPoint.ma120 === 'number' && (() => {
                                    const { x: mx, y: my } = project(hoveredPoint.ma120, hoveredIndex);
                                    return (
                                        <circle
                                            cx={mx}
                                            cy={my}
                                            r="4"
                                            fill="#eab308"
                                            stroke="#020617"
                                            strokeWidth="2"
                                        />
                                    );
                                })()}
                            </g>
                        );
                    })()}
                </svg>
                
                {/* Legend */}
                <div className={css({
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginTop: '12px',
                    fontSize: '0.75rem',
                    justifyContent: 'center',
                })}>
                    <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
                        <div className={css({ width: '16px', height: '2px', backgroundColor: '#60a5fa' })} />
                        <span className={css({ color: '#9ca3af' })}>Index</span>
                    </div>
                    {displaySeries.some(p => typeof p.ma7 === 'number') && (
                        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
                            <div className={css({ width: '16px', height: '1.5px', backgroundColor: '#3b82f6', opacity: 0.8, borderStyle: 'dashed', borderWidth: '1px', borderColor: '#3b82f6' })} />
                            <span className={css({ color: '#9ca3af' })}>7-Day MA</span>
                        </div>
                    )}
                    {displaySeries.some(p => typeof p.ma30 === 'number') && (
                        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
                            <div className={css({ width: '16px', height: '2px', backgroundColor: '#22c55e', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#22c55e' })} />
                            <span className={css({ color: '#9ca3af' })}>30-Day MA</span>
                        </div>
                    )}
                    {displaySeries.some(p => typeof p.ma120 === 'number') && (
                        <div className={css({ display: 'flex', alignItems: 'center', gap: '6px' })}>
                            <div className={css({ width: '16px', height: '2px', backgroundColor: '#eab308', borderStyle: 'dashed', borderWidth: '1px', borderColor: '#eab308' })} />
                            <span className={css({ color: '#9ca3af' })}>120-Day MA</span>
                        </div>
                    )}
                </div>

                {/* Tooltip */}
                {tooltipPosition && hoveredPoint && (
                    <div
                        className={css({
                            position: 'absolute',
                            backgroundColor: '#111827',
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
                            {hoveredPoint.date}
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
                                <span className={css({ color: '#9ca3af' })}>Index:</span>
                                <span className={css({ color: '#60a5fa', fontWeight: 500 })}>
                                    {hoveredPoint.indexValue.toFixed(2)}
                                </span>
                            </div>
                            {typeof hoveredPoint.ma7 === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>7-Day MA:</span>
                                    <span className={css({ color: '#3b82f6', fontWeight: 500 })}>
                                        {hoveredPoint.ma7.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {typeof hoveredPoint.ma30 === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>30-Day MA:</span>
                                    <span className={css({ color: '#22c55e', fontWeight: 500 })}>
                                        {hoveredPoint.ma30.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {typeof hoveredPoint.ma120 === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>120-Day MA:</span>
                                    <span className={css({ color: '#eab308', fontWeight: 500 })}>
                                        {hoveredPoint.ma120.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {typeof hoveredPoint.macd === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    marginTop: '4px',
                                    paddingTop: '4px',
                                    borderTop: '1px solid #374151',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>MACD:</span>
                                    <span className={css({ 
                                        color: hoveredPoint.macd >= 0 ? '#22c55e' : '#ef4444', 
                                        fontWeight: 500 
                                    })}>
                                        {hoveredPoint.macd.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {typeof hoveredPoint.macdSignal === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>MACD Signal:</span>
                                    <span className={css({ color: '#9ca3af', fontWeight: 500 })}>
                                        {hoveredPoint.macdSignal.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {typeof hoveredPoint.roc7 === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    marginTop: '4px',
                                    paddingTop: '4px',
                                    borderTop: '1px solid #374151',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>7-Day ROC:</span>
                                    <span className={css({ 
                                        color: hoveredPoint.roc7 >= 0 ? '#22c55e' : '#ef4444', 
                                        fontWeight: 500 
                                    })}>
                                        {hoveredPoint.roc7 >= 0 ? '+' : ''}{hoveredPoint.roc7.toFixed(2)}%
                                    </span>
                                </div>
                            )}
                            {typeof hoveredPoint.roc30 === 'number' && (
                                <div className={css({
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                })}>
                                    <span className={css({ color: '#9ca3af' })}>30-Day ROC:</span>
                                    <span className={css({ 
                                        color: hoveredPoint.roc30 >= 0 ? '#22c55e' : '#ef4444', 
                                        fontWeight: 500 
                                    })}>
                                        {hoveredPoint.roc30 >= 0 ? '+' : ''}{hoveredPoint.roc30.toFixed(2)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface PriceSnapshotsTableProps {
    settings: PokemonIndexSettings | null;
    snapshots: PokemonCardPriceSnapshot[];
    isLoading: boolean;
}

function PriceSnapshotsTable({ settings, snapshots, isLoading }: PriceSnapshotsTableProps) {
    if (isLoading) {
        return <span>Loading price snapshots…</span>;
    }

    const cards = settings?.cards ?? [];
    if (!cards.length) {
        return <span>No cards configured. Add cards in settings to see per-card prices.</span>;
    }

    if (!snapshots.length) {
        return <span>No price snapshots recorded yet.</span>;
    }

    const byDate = new Map<string, PokemonCardPriceSnapshot[]>();
    for (const snap of snapshots) {
        if (!byDate.has(snap.date)) byDate.set(snap.date, []);
        byDate.get(snap.date)!.push(snap);
    }
    const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
    
    // Debug logging
    console.log(`[Pokemon] PriceSnapshotsTable: ${snapshots.length} snapshots, ${dates.length} unique dates`);
    if (dates.length > 0 && dates.length <= 10) {
        console.log(`[Pokemon] Dates:`, dates);
    }

    const findSnapshot = (date: string, cardId: string) =>
        (byDate.get(date) || []).find((s) => s.cardId === cardId);

    return (
        <div
            className={css({
                width: '100%',
                overflowX: 'auto',
                fontSize: '0.8rem',
                color: '#e5e7eb',
            })}
        >
            <table
                className={css({
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: '480px',
                })}
            >
                <thead>
                    <tr
                        className={css({
                            backgroundColor: '#020617',
                        })}
                    >
                        <th
                            className={css({
                                textAlign: 'left',
                                padding: '6px 8px',
                                borderBottom: '1px solid #1f2937',
                            })}
                        >
                            Date
                        </th>
                        {cards.map((card, index) => (
                            <th
                                key={`${card.id}-${card.conditionType}-${index}`}
                                className={css({
                                    textAlign: 'left',
                                    padding: '6px 8px',
                                    borderBottom: '1px solid #1f2937',
                                })}
                            >
                                {card.name || card.id}
                                <div
                                    className={css({
                                        fontSize: '0.7rem',
                                        color: '#9ca3af',
                                    })}
                                >
                                    {card.conditionType === 'ungraded'
                                        ? 'Ungraded'
                                        : card.conditionType === 'psa10'
                                        ? 'PSA 10'
                                        : 'Ungraded & PSA 10'}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dates.map((date) => (
                        <tr key={date}>
                            <td
                                className={css({
                                    padding: '4px 8px',
                                    borderBottom: '1px solid #111827',
                                    whiteSpace: 'nowrap',
                                })}
                            >
                                {date}
                            </td>
                            {cards.map((card, cardIndex) => {
                                const snap = findSnapshot(date, card.id);
                                const isIgnored = snap?.ignored === true;
                                const ungraded =
                                    typeof snap?.ungradedPrice === 'number'
                                        ? `$${snap.ungradedPrice.toFixed(2)}`
                                        : '-';
                                const psa10 =
                                    typeof snap?.psa10Price === 'number'
                                        ? `$${snap.psa10Price.toFixed(2)}`
                                        : '-';

                                return (
                                    <td
                                        key={`${card.id}-${card.conditionType}-${cardIndex}`}
                                        className={css({
                                            padding: '4px 8px',
                                            borderBottom: '1px solid #111827',
                                            whiteSpace: 'nowrap',
                                            color: isIgnored ? '#ef4444' : '#d1d5db', // Red for ignored, gray for normal
                                            opacity: isIgnored ? 0.7 : 1,
                                            textDecoration: isIgnored ? 'line-through' : 'none',
                                        })}
                                        title={isIgnored ? 'Anomalous price - ignored from index calculations' : undefined}
                                    >
                                        {card.conditionType === 'ungraded'
                                            ? ungraded
                                            : card.conditionType === 'psa10'
                                            ? psa10
                                            : `${ungraded} / ${psa10}`}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface PokemonSettingsModalProps {
    initialSettings: PokemonIndexSettings;
    onSave: (settings: PokemonIndexSettings) => void;
    onClose: () => void;
}

function PokemonSettingsModal({ initialSettings, onSave, onClose }: PokemonSettingsModalProps) {
    const [cards, setCards] = useState<PokemonCardConfig[]>(initialSettings.cards || []);
    const [refreshIntervalHours, setRefreshIntervalHours] = useState<number>(
        initialSettings.refreshIntervalHours || 24,
    );

    const handleAddCard = () => {
        setCards([
            ...cards,
            {
                id: '',
                name: '',
                conditionType: 'ungraded',
                weight: 1,
                source: 'pricecharting',
            },
        ]);
    };

    const handleUpdateCard = (index: number, partial: Partial<PokemonCardConfig>) => {
        const next = [...cards];
        next[index] = { ...next[index], ...partial };
        setCards(next);
    };

    const handleRemoveCard = (index: number) => {
        setCards(cards.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        onSave({
            cards,
            refreshIntervalHours,
        });
    };

    return (
        <div
            className={cx(
                'pokemon-settings-modal',
                css({
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                }),
            )}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={css({
                    backgroundColor: '#020617',
                    borderRadius: '16px',
                    padding: '20px',
                    width: '100%',
                    maxWidth: '900px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    border: '1px solid #1f2937',
                })}
            >
                <div
                    className={css({
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                    })}
                >
                    <h2
                        className={css({
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            color: '#e5e7eb',
                        })}
                    >
                        Pokemon Index Settings
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className={css({
                            border: 'none',
                            background: 'transparent',
                            color: '#9ca3af',
                            fontSize: '1.25rem',
                            cursor: 'pointer',
                        })}
                    >
                        ✕
                    </button>
                </div>

                <div
                    className={css({
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        fontSize: '0.85rem',
                        color: '#9ca3af',
                    })}
                >
                    <label
                        className={css({
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                        })}
                    >
                        <span>Refresh interval (hours)</span>
                        <input
                            type="number"
                            min={1}
                            max={48}
                            value={refreshIntervalHours}
                            onChange={(e) => setRefreshIntervalHours(Number(e.target.value) || 24)}
                            className={css({
                                backgroundColor: '#020617',
                                borderRadius: '8px',
                                border: '1px solid #374151',
                                padding: '6px 8px',
                                color: '#e5e7eb',
                            })}
                        />
                    </label>

                    <div>
                        <div
                            className={css({
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '8px',
                            })}
                        >
                            <span className={css({ color: '#e5e7eb' })}>Cards</span>
                            <button
                                type="button"
                                onClick={handleAddCard}
                                className={css({
                                    borderRadius: '9999px',
                                    border: 'none',
                                    padding: '4px 10px',
                                    backgroundColor: '#111827',
                                    color: '#e5e7eb',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                })}
                            >
                                + Add card
                            </button>
                        </div>

                        <div
                            className={css({
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                overflowX: 'auto',
                            })}
                        >
                            {cards.map((card, index) => (
                                <div
                                    key={index}
                                    className={css({
                                        borderRadius: '10px',
                                        border: '1px solid #1f2937',
                                        padding: '8px',
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(120px, 2fr) minmax(150px, 2.5fr) minmax(140px, 1.5fr) minmax(60px, 0.8fr) auto',
                                        gap: '8px',
                                        alignItems: 'center',
                                        minWidth: 0, // Allow grid items to shrink below content size
                                    })}
                                >
                                    <input
                                        placeholder="PriceCharting ID"
                                        value={card.id}
                                        onChange={(e) =>
                                            handleUpdateCard(index, { id: e.target.value })
                                        }
                                        className={css({
                                            backgroundColor: '#020617',
                                            borderRadius: '6px',
                                            border: '1px solid #374151',
                                            padding: '4px 6px',
                                            color: '#e5e7eb',
                                            fontSize: '0.8rem',
                                            minWidth: 0, // Allow input to shrink
                                            width: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        })}
                                    />
                                    <input
                                        placeholder="Name / label"
                                        value={card.name}
                                        onChange={(e) =>
                                            handleUpdateCard(index, { name: e.target.value })
                                        }
                                        className={css({
                                            backgroundColor: '#020617',
                                            borderRadius: '6px',
                                            border: '1px solid #374151',
                                            padding: '4px 6px',
                                            color: '#e5e7eb',
                                            fontSize: '0.8rem',
                                            minWidth: 0, // Allow input to shrink
                                            width: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        })}
                                    />
                                    <select
                                        value={card.conditionType}
                                        onChange={(e) =>
                                            handleUpdateCard(index, {
                                                conditionType: e.target
                                                    .value as PokemonCardConfig['conditionType'],
                                            })
                                        }
                                        className={css({
                                            backgroundColor: '#020617',
                                            borderRadius: '6px',
                                            border: '1px solid #374151',
                                            padding: '4px 6px',
                                            color: '#e5e7eb',
                                            fontSize: '0.8rem',
                                            minWidth: 0, // Allow select to shrink
                                            width: '100%',
                                        })}
                                    >
                                        <option value="ungraded">Ungraded</option>
                                        <option value="psa10">PSA 10</option>
                                        <option value="both">Average of ungraded &amp; PSA 10</option>
                                    </select>
                                    <input
                                        type="number"
                                        min={0.1}
                                        step={0.1}
                                        value={card.weight}
                                        onChange={(e) =>
                                            handleUpdateCard(index, {
                                                weight: Number(e.target.value) || 1,
                                            })
                                        }
                                        className={css({
                                            backgroundColor: '#020617',
                                            borderRadius: '6px',
                                            border: '1px solid #374151',
                                            padding: '4px 6px',
                                            color: '#e5e7eb',
                                            fontSize: '0.8rem',
                                            minWidth: 0, // Allow input to shrink
                                            width: '100%',
                                        })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveCard(index)}
                                        className={css({
                                            borderRadius: '9999px',
                                            border: 'none',
                                            padding: '4px 8px',
                                            backgroundColor: '#7f1d1d',
                                            color: '#fee2e2',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap', // Prevent button text from wrapping
                                            flexShrink: 0, // Don't shrink the button
                                        })}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div
                    className={css({
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        marginTop: '16px',
                    })}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className={css({
                            borderRadius: '9999px',
                            border: '1px solid #374151',
                            padding: '6px 12px',
                            backgroundColor: 'transparent',
                            color: '#9ca3af',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                        })}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className={css({
                            borderRadius: '9999px',
                            border: 'none',
                            padding: '6px 12px',
                            backgroundColor: '#2563eb',
                            color: '#e5e7eb',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                        })}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}



