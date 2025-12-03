'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';
import type { SyncStatus } from '@/lib/kv';

interface SyncStatusIndicatorProps {
    initialStatus: SyncStatus;
}

export default function SyncStatusIndicator({ initialStatus }: SyncStatusIndicatorProps) {
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(initialStatus);
    const [showRefresh, setShowRefresh] = useState(false);

    // Poll for status updates while revalidating
    useEffect(() => {
        if (!syncStatus.isRevalidating) {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/admin/sync-youtube');
                if (response.ok) {
                    const status = await response.json();
                    setSyncStatus(status);

                    // If sync just completed, show refresh button
                    if (!status.isRevalidating && syncStatus.isRevalidating) {
                        setShowRefresh(true);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch sync status:', error);
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(pollInterval);
    }, [syncStatus.isRevalidating]);

    // Don't show anything if not revalidating and no refresh needed
    if (!syncStatus.isRevalidating && !showRefresh) {
        return null;
    }

    const handleRefresh = () => {
        window.location.reload();
    };

    return (
        <>
            <style>{`
                @keyframes slideInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
            
            <div className={cx('sync-status-indicator', css({
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: 1000,
                backgroundColor: 'rgba(26, 26, 26, 0.95)',
                border: '1px solid #333',
                borderRadius: '12px',
                padding: '16px 20px',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                animation: 'slideInUp 0.3s ease-out',
            }))}>
                {syncStatus.isRevalidating ? (
                    <>
                        {/* Spinner */}
                        <div className={css({
                            width: '20px',
                            height: '20px',
                            border: '2px solid #333',
                            borderTopColor: '#2563eb',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        })} />
                        <span className={css({
                            color: '#ededed',
                            fontSize: '14px',
                            fontWeight: '500',
                        })}>
                            Syncing latest videos...
                        </span>
                    </>
                ) : showRefresh ? (
                    <>
                        <span className={css({
                            color: '#4ade80',
                            fontSize: '20px',
                        })}>
                            ✓
                        </span>
                        <span className={css({
                            color: '#ededed',
                            fontSize: '14px',
                            fontWeight: '500',
                        })}>
                            New videos available
                        </span>
                        <button
                            onClick={handleRefresh}
                            className={css({
                                padding: '6px 12px',
                                backgroundColor: '#2563eb',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#fff',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                _hover: {
                                    backgroundColor: '#3b82f6',
                                    transform: 'translateY(-1px)',
                                },
                                _active: {
                                    transform: 'translateY(0)',
                                }
                            })}
                        >
                            Refresh
                        </button>
                    </>
                ) : null}
            </div>
        </>
    );
}
