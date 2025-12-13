'use client';

import { useEffect, useRef, useState } from 'react';
import { css, cx } from '@styled-system/css';
import type { SyncStatus, CalendarSyncStatus } from '@/lib/kv';

interface SyncStatusIndicatorProps {
    initialStatus: SyncStatus;
    initialCalendarStatus: CalendarSyncStatus;
}

export default function SyncStatusIndicator({ initialStatus, initialCalendarStatus }: SyncStatusIndicatorProps) {
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(initialStatus);
    const [calendarSyncStatus, setCalendarSyncStatus] = useState<CalendarSyncStatus>(initialCalendarStatus);
    const [showRefresh, setShowRefresh] = useState(false);

    const isRevalidating = syncStatus.isRevalidating || calendarSyncStatus.isRevalidating;

    // We only want to show the "complete + refresh" UI if the revalidation
    // both starts AND finishes while the user is on the page.
    // That means we need to observe a false -> true transition after mount,
    // then later a true -> false transition.
    const lastPolledRef = useRef<{
        youtube: SyncStatus | null;
        calendar: CalendarSyncStatus | null;
    }>({ youtube: null, calendar: null });

    const startedInSessionRef = useRef<{ youtube: boolean; calendar: boolean }>({
        youtube: false,
        calendar: false,
    });

    // Poll for status updates - check on mount and while revalidating
    useEffect(() => {
        const pollStatus = async () => {
            try {
                // Fetch both sync statuses
                const [youtubeResponse, calendarResponse] = await Promise.all([
                    fetch('/api/admin/sync-youtube').then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch('/api/admin/sync-schedule-status').then(r => r.ok ? r.json() : null).catch(() => null)
                ]);

                if (youtubeResponse) {
                    const prevPolledYoutube = lastPolledRef.current.youtube;

                    // Establish baseline on first successful poll (do not trigger UI)
                    if (prevPolledYoutube) {
                        // If sync started while on page, clear any previous refresh UI
                        if (!prevPolledYoutube.isRevalidating && youtubeResponse.isRevalidating) {
                            startedInSessionRef.current.youtube = true;
                            setShowRefresh(false);
                        }

                        // If sync completed and we observed it start in-session, show refresh
                        if (
                            prevPolledYoutube.isRevalidating &&
                            !youtubeResponse.isRevalidating &&
                            startedInSessionRef.current.youtube
                        ) {
                            setShowRefresh(true);
                            startedInSessionRef.current.youtube = false;
                        }
                    }

                    lastPolledRef.current.youtube = youtubeResponse;
                    setSyncStatus(youtubeResponse);
                }
                if (calendarResponse) {
                    const prevPolledCalendar = lastPolledRef.current.calendar;

                    // Establish baseline on first successful poll (do not trigger UI)
                    if (prevPolledCalendar) {
                        // If sync started while on page, clear any previous refresh UI
                        if (!prevPolledCalendar.isRevalidating && calendarResponse.isRevalidating) {
                            startedInSessionRef.current.calendar = true;
                            setShowRefresh(false);
                        }

                        // If sync completed and we observed it start in-session, show refresh
                        if (
                            prevPolledCalendar.isRevalidating &&
                            !calendarResponse.isRevalidating &&
                            startedInSessionRef.current.calendar
                        ) {
                            setShowRefresh(true);
                            startedInSessionRef.current.calendar = false;
                        }
                    }

                    lastPolledRef.current.calendar = calendarResponse;
                    setCalendarSyncStatus(calendarResponse);
                }
            } catch (error) {
                console.error('Failed to fetch sync status:', error);
            }
        };

        // Poll immediately on mount
        pollStatus();

        // Poll more frequently when revalidating, otherwise poll occasionally so we can
        // detect revalidations that start while the user is on the page.
        const pollInterval = setInterval(pollStatus, isRevalidating ? 5000 : 30000);

        return () => clearInterval(pollInterval);
    }, [isRevalidating]);

    // Don't show anything if not revalidating and no refresh needed
    if (!isRevalidating && !showRefresh) {
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
                flexDirection: 'column',
                gap: '12px',
                animation: 'slideInUp 0.3s ease-out',
                minWidth: '280px',
            }))}>
                {isRevalidating ? (
                    <>
                        {/* Show both syncs separately when both are active */}
                        {syncStatus.isRevalidating && calendarSyncStatus.isRevalidating ? (
                            <>
                                <div className={css({
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                })}>
                                    <div className={css({
                                        width: '16px',
                                        height: '16px',
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
                                        Syncing schedule...
                                    </span>
                                </div>
                                <div className={css({
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                })}>
                                    <div className={css({
                                        width: '16px',
                                        height: '16px',
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
                                        Syncing videos...
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Single sync indicator */}
                                <div className={css({
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                })}>
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
                                        {syncStatus.isRevalidating 
                                            ? 'Syncing videos...'
                                            : 'Syncing schedule...'}
                                    </span>
                                </div>
                            </>
                        )}
                    </>
                ) : showRefresh ? (
                    <div className={css({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    })}>
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
                            Schedule and videos updated
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
                    </div>
                ) : null}
            </div>
        </>
    );
}
