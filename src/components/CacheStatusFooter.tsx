'use client';

import { useState, useEffect } from 'react';
import { css } from '@styled-system/css';
import type { SyncStatus, CalendarSyncStatus } from '@/lib/kv';

interface CacheStatusFooterProps {
  initialYouTubeStatus: SyncStatus;
  initialCalendarStatus: CalendarSyncStatus;
  isOpen: boolean;
  onClose: () => void;
}

export default function CacheStatusFooter({ 
  initialYouTubeStatus, 
  initialCalendarStatus,
  isOpen,
  onClose
}: CacheStatusFooterProps) {
  const [youtubeStatus, setYoutubeStatus] = useState<SyncStatus>(initialYouTubeStatus);
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus>(initialCalendarStatus);
  const [enrichedGamesCache, setEnrichedGamesCache] = useState<{ lastUpdated: number | null }>({ lastUpdated: null });

  // Fetch cache info on mount
  useEffect(() => {
    const fetchCacheInfo = async () => {
      try {
        // Fetch enriched games cache info
        const response = await fetch('/api/admin/cache-info');
        if (response.ok) {
          const data = await response.json();
          setEnrichedGamesCache({ lastUpdated: data.enrichedGamesLastUpdated });
        }
      } catch (error) {
        console.error('Failed to fetch cache info:', error);
      }
    };

    fetchCacheInfo();
    
    // Poll for status updates every 30 seconds
    const pollInterval = setInterval(async () => {
      try {
        // Fetch YouTube sync status
        const youtubeResponse = await fetch('/api/admin/sync-youtube');
        if (youtubeResponse.ok) {
          const youtubeData = await youtubeResponse.json();
          setYoutubeStatus(youtubeData);
        }

        // Fetch calendar sync status
        const calendarResponse = await fetch('/api/admin/sync-schedule-status');
        if (calendarResponse.ok) {
          const calendarData = await calendarResponse.json();
          setCalendarStatus(calendarData);
        }

        // Fetch cache info
        const cacheResponse = await fetch('/api/admin/cache-info');
        if (cacheResponse.ok) {
          const cacheData = await cacheResponse.json();
          setEnrichedGamesCache({ lastUpdated: cacheData.enrichedGamesLastUpdated });
        }
      } catch (error) {
        console.error('Failed to poll status:', error);
      }
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(pollInterval);
  }, []);

  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleString();
  };

  const getStatusColor = (timestamp: number | null, isRevalidating: boolean): string => {
    if (isRevalidating) return '#60a5fa'; // Blue for syncing
    if (!timestamp) return '#888'; // Gray for never
    const diffMs = Date.now() - timestamp;
    const diffHours = diffMs / 3600000;
    if (diffHours < 2) return '#4ade80'; // Green for recent (< 2 hours)
    if (diffHours < 24) return '#fbbf24'; // Yellow for old (< 24 hours)
    return '#f87171'; // Red for very old (> 24 hours)
  };

  return (
    <>
      {/* Modal */}
      {isOpen && (
        <div 
          className={css({
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(5px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          })}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <div className={css({
            backgroundColor: '#1a1a1a',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            position: 'relative',
          })}>
            {/* Close Button */}
            <button
              onClick={onClose}
              className={css({
                position: 'absolute',
                top: '16px',
                right: '16px',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: '1',
                transition: 'all 0.2s ease',
                _hover: {
                  color: '#fff',
                  transform: 'scale(1.1)',
                },
              })}
            >
              ✕
            </button>

            {/* Header */}
            <h2 className={css({
              color: '#ededed',
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '20px',
              paddingRight: '32px',
            })}>
              Cache & Sync Status
            </h2>
            
            {/* Status Content */}
            <div className={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              fontSize: '0.875rem',
            })}>
              {/* Calendar Sync */}
              <div>
                <div className={css({ 
                  color: 'rgba(255, 255, 255, 0.5)', 
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                })}>
                  Calendar Sync
                </div>
                <div className={css({
                  color: getStatusColor(calendarStatus.lastSyncTime, calendarStatus.isRevalidating),
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                })}>
                  {calendarStatus.isRevalidating && (
                    <span className={css({
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#60a5fa',
                      animation: 'pulse 2s ease-in-out infinite',
                    })} />
                  )}
                  {formatTime(calendarStatus.lastSyncTime)}
                  {calendarStatus.isRevalidating && ' (syncing...)'}
                </div>
                {calendarStatus.lastError && (
                  <div className={css({ color: '#f87171', fontSize: '0.75rem', marginTop: '0.5rem' })}>
                    Error: {calendarStatus.lastError}
                  </div>
                )}
              </div>

              {/* YouTube Sync */}
              <div>
                <div className={css({ 
                  color: 'rgba(255, 255, 255, 0.5)', 
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                })}>
                  YouTube Sync
                </div>
                <div className={css({
                  color: getStatusColor(youtubeStatus.lastSyncTime, youtubeStatus.isRevalidating),
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                })}>
                  {youtubeStatus.isRevalidating && (
                    <span className={css({
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#60a5fa',
                      animation: 'pulse 2s ease-in-out infinite',
                    })} />
                  )}
                  {formatTime(youtubeStatus.lastSyncTime)}
                  {youtubeStatus.isRevalidating && ' (syncing...)'}
                </div>
                {youtubeStatus.lastError && (
                  <div className={css({ color: '#f87171', fontSize: '0.75rem', marginTop: '0.5rem' })}>
                    Error: {youtubeStatus.lastError}
                  </div>
                )}
              </div>

              {/* Enriched Games Cache */}
              <div>
                <div className={css({ 
                  color: 'rgba(255, 255, 255, 0.5)', 
                  marginBottom: '0.5rem',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                })}>
                  Games Cache
                </div>
                <div className={css({
                  color: getStatusColor(enrichedGamesCache.lastUpdated, false),
                  fontWeight: '500',
                })}>
                  {formatTime(enrichedGamesCache.lastUpdated)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

