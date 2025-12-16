'use client';

import { useState, useEffect } from 'react';
import { css } from '@styled-system/css';
import type { SyncStatus, CalendarSyncStatus } from '@/lib/kv';
import PinEntryModal from '@/components/rehab/PinEntryModal';

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
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [pendingSync, setPendingSync] = useState<'calendar' | 'youtube' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const isRevalidating = youtubeStatus.isRevalidating || calendarStatus.isRevalidating;

  // Fetch cache info and poll for status updates
  useEffect(() => {
    const pollStatus = async () => {
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
    };

    // Poll immediately on mount
    pollStatus();
    
    // Poll more frequently when revalidating (every 5 seconds), otherwise every 30 seconds
    const pollInterval = setInterval(pollStatus, isRevalidating ? 5000 : 30000);

    return () => clearInterval(pollInterval);
  }, [isRevalidating]);

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

  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update current time periodically for status color calculation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (timestamp: number | null, isRevalidating: boolean): string => {
    if (isRevalidating) return '#60a5fa'; // Blue for syncing
    if (!timestamp) return '#888'; // Gray for never
    const diffMs = currentTime - timestamp;
    const diffHours = diffMs / 3600000;
    if (diffHours < 2) return '#4ade80'; // Green for recent (< 2 hours)
    if (diffHours < 24) return '#fbbf24'; // Yellow for old (< 24 hours)
    return '#f87171'; // Red for very old (> 24 hours)
  };

  const handleSyncClick = (type: 'calendar' | 'youtube') => {
    // Check if already authenticated
    const adminSecret = sessionStorage.getItem('admin_secret');
    if (adminSecret) {
      triggerSync(type, adminSecret);
    } else {
      setPendingSync(type);
      setShowAdminPin(true);
    }
  };

  const handlePinSuccess = async (token: string) => {
    // Store the verified PIN/secret in sessionStorage
    sessionStorage.setItem('admin_secret', token);
    
    // Close the modal and trigger the sync
    setShowAdminPin(false);
    if (pendingSync) {
      const syncType = pendingSync;
      setPendingSync(null);
      triggerSync(syncType, token);
    }
  };

  const handlePinCancel = () => {
    setShowAdminPin(false);
    setPendingSync(null);
  };

  const triggerSync = async (type: 'calendar' | 'youtube', secret: string) => {
    setIsSyncing(true);
    try {
      const endpoint = type === 'calendar' ? '/api/admin/sync-schedule' : '/api/admin/sync-youtube';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Sync failed: ${error.error || 'Unknown error'}`);
        setIsSyncing(false);
        return;
      }

      // Immediately update status to show revalidating
      if (type === 'calendar') {
        setCalendarStatus(prev => ({ ...prev, isRevalidating: true, lastError: null }));
      } else {
        setYoutubeStatus(prev => ({ ...prev, isRevalidating: true, lastError: null }));
      }

      // Poll for status updates
      const pollInterval = setInterval(async () => {
        try {
          if (type === 'calendar') {
            const statusResponse = await fetch('/api/admin/sync-schedule-status');
            if (statusResponse.ok) {
              const status = await statusResponse.json();
              setCalendarStatus(status);
              if (!status.isRevalidating) {
                clearInterval(pollInterval);
                setIsSyncing(false);
              }
            }
          } else {
            const statusResponse = await fetch('/api/admin/sync-youtube');
            if (statusResponse.ok) {
              const status = await statusResponse.json();
              setYoutubeStatus(status);
              if (!status.isRevalidating) {
                clearInterval(pollInterval);
                setIsSyncing(false);
              }
            }
          }
        } catch (error) {
          console.error('Failed to poll status:', error);
        }
      }, 2000);

      // Clear polling after 5 minutes max
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsSyncing(false);
      }, 5 * 60 * 1000);
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Sync failed. Please try again.');
      setIsSyncing(false);
    }
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                })}>
                  <span>Calendar Sync</span>
                  <button
                    onClick={() => handleSyncClick('calendar')}
                    disabled={calendarStatus.isRevalidating || isSyncing}
                    className={css({
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      borderRadius: '4px',
                      color: '#60a5fa',
                      cursor: calendarStatus.isRevalidating || isSyncing ? 'not-allowed' : 'pointer',
                      opacity: calendarStatus.isRevalidating || isSyncing ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      _hover: calendarStatus.isRevalidating || isSyncing ? {} : {
                        backgroundColor: 'rgba(59, 130, 246, 0.3)',
                        borderColor: 'rgba(59, 130, 246, 0.6)',
                      },
                    })}
                  >
                    Sync
                  </button>
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                })}>
                  <span>YouTube Sync</span>
                  <button
                    onClick={() => handleSyncClick('youtube')}
                    disabled={youtubeStatus.isRevalidating || isSyncing}
                    className={css({
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: 'rgba(220, 38, 38, 0.2)',
                      border: '1px solid rgba(220, 38, 38, 0.4)',
                      borderRadius: '4px',
                      color: '#f87171',
                      cursor: youtubeStatus.isRevalidating || isSyncing ? 'not-allowed' : 'pointer',
                      opacity: youtubeStatus.isRevalidating || isSyncing ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      _hover: youtubeStatus.isRevalidating || isSyncing ? {} : {
                        backgroundColor: 'rgba(220, 38, 38, 0.3)',
                        borderColor: 'rgba(220, 38, 38, 0.6)',
                      },
                    })}
                  >
                    Sync
                  </button>
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

      {/* Admin PIN Modal */}
      {showAdminPin && (
        <PinEntryModal
          onSuccess={handlePinSuccess}
          onCancel={handlePinCancel}
          verifyEndpoint="/api/admin/verify"
          pinFieldName="secret"
        />
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

