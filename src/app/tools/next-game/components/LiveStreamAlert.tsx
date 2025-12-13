'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';
import type { EnrichedGame } from '@/utils/videoMatcher';
import type { YouTubeVideo } from '@/lib/youtube-service';

interface LiveStreamAlertProps {
    liveGame?: EnrichedGame;
    liveStream?: YouTubeVideo;
    isStandalone?: boolean;
}

/**
 * Parse scheduled time from YouTube publishDate string
 * Handles formats like:
 * - "Streaming in 4 hours"
 * - "Scheduled for Dec 15, 2024 at 6:00 PM"
 * - "Starts in 2 hours"
 * - "Dec 15, 2024 6:00 PM"
 * - "Scheduled for 6:00 PM"
 * 
 * Returns the scheduled Date if parseable, null otherwise
 */
function parseScheduledTime(publishDate?: string): Date | null {
    if (!publishDate) return null;

    const now = new Date();
    const lowerDate = publishDate.toLowerCase().trim();

    // Check for "in X hours/minutes" format (e.g., "Streaming in 4 hours", "Starts in 2 hours")
    const inTimeMatch = lowerDate.match(/in\s+(\d+)\s+(hour|minute|hr|min|h|m)(?:s)?/);
    if (inTimeMatch) {
        const amount = parseInt(inTimeMatch[1], 10);
        const unit = inTimeMatch[2].toLowerCase();
        const scheduledTime = new Date(now);
        
        if (unit === 'hour' || unit === 'hr' || unit === 'h') {
            scheduledTime.setHours(scheduledTime.getHours() + amount);
        } else if (unit === 'minute' || unit === 'min' || unit === 'm') {
            scheduledTime.setMinutes(scheduledTime.getMinutes() + amount);
        }
        
        return scheduledTime;
    }

    // Try to parse as a date string with time
    // Common formats: "Dec 15, 2024 at 6:00 PM", "Dec 15, 2024 6:00 PM", etc.
    const dateMatch = publishDate.match(/(\w+\s+\d{1,2},?\s+\d{4}(?:\s+at)?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    if (dateMatch) {
        const dateStr = dateMatch[1].replace(/\s+at\s+/i, ' ');
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    // Try parsing as a standard date string
    const parsed = new Date(publishDate);
    if (!isNaN(parsed.getTime())) {
        // Only return if it's in the future (scheduled) or very recent (might have just started)
        const timeDiff = parsed.getTime() - now.getTime();
        // Allow up to 1 hour in the past (stream might have just started)
        if (timeDiff > -3600000) {
            return parsed;
        }
    }

    return null;
}

export default function LiveStreamAlert({ liveGame, liveStream, isStandalone = false }: LiveStreamAlertProps) {
    const [isScheduledTimePassed, setIsScheduledTimePassed] = useState(false);

    // Check if scheduled time has passed for upcoming streams
    const scheduledTime = liveStream?.publishDate ? parseScheduledTime(liveStream.publishDate) : null;
    const isUpcoming = liveStream?.videoType === 'upcoming';

    // Update current time every minute to check if scheduled time has passed
    useEffect(() => {
        if (!isUpcoming || !scheduledTime) return;

        // Check immediately using a callback to avoid cascading renders
        const checkScheduledTime = () => {
            setIsScheduledTimePassed(new Date() >= scheduledTime);
        };
        
        // Check immediately
        checkScheduledTime();

        // Then check every minute
        const interval = setInterval(checkScheduledTime, 60000);

        return () => clearInterval(interval);
    }, [isUpcoming, scheduledTime]);

    // Handle standalone YouTube video (not matched to a game)
    if (isStandalone && liveStream) {
        const streamUrl = liveStream.url;
        const title = liveStream.title;
        const isLive = liveStream.videoType === 'live';

        if (!streamUrl) return null;

        // Determine display state - show as live if actually live OR if scheduled time has passed
        const displayAsLive = isLive || (isUpcoming && isScheduledTimePassed);

        return (
            <>
                <style>{`
                    @keyframes pulse {
                        0%, 100% {
                            opacity: 1;
                        }
                        50% {
                            opacity: 0.5;
                        }
                    }
                    
                    @keyframes slideDown {
                        from {
                            opacity: 0;
                            transform: translateY(-20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                `}</style>
                
                <div className={cx('live-stream-alert', css({
                    background: displayAsLive 
                        ? 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)'
                        : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                    borderRadius: '16px',
                    padding: '20px 24px',
                    marginBottom: '24px',
                    boxShadow: displayAsLive 
                        ? '0 8px 32px rgba(220, 38, 38, 0.3)'
                        : '0 8px 32px rgba(37, 99, 235, 0.3)',
                    border: '2px solid rgba(255, 255, 255, 0.1)',
                    animation: 'slideDown 0.5s ease-out',
                    position: 'relative',
                    overflow: 'hidden',
                    _before: {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                        animation: 'shimmer 2s infinite',
                    }
                }))}>
                    <div className={css({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        position: 'relative',
                        zIndex: 1,
                        flexWrap: 'wrap',
                        '@media (max-width: 640px)': {
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                        }
                    })}>
                        {/* Live/Upcoming indicator and text */}
                        <div className={css({
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        })}>
                            {/* Pulsing dot */}
                            {displayAsLive && (
                                <div className={css({
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: '#fff',
                                    borderRadius: '50%',
                                    animation: 'pulse 1.5s ease-in-out infinite',
                                    boxShadow: '0 0 0 0 rgba(255, 255, 255, 0.7)',
                                })} />
                            )}
                            
                            <div>
                                <div className={css({
                                    fontSize: '14px',
                                    fontWeight: '700',
                                    color: '#fff',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '4px',
                                })}>
                                    {displayAsLive ? '🔴 LIVE NOW' : '⏰ UPCOMING STREAM'}
                                </div>
                                <div className={css({
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: '#fff',
                                })}>
                                    {title}
                                </div>
                            </div>
                        </div>

                        {/* Watch button */}
                        <a
                            href={streamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={css({
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 24px',
                                backgroundColor: '#fff',
                                color: displayAsLive ? '#dc2626' : '#2563eb',
                                fontSize: '16px',
                                fontWeight: '700',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                _hover: {
                                    backgroundColor: '#fef2f2',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
                                },
                                _active: {
                                    transform: 'translateY(0)',
                                },
                                '@media (max-width: 640px)': {
                                    width: '100%',
                                    justifyContent: 'center',
                                }
                            })}
                        >
                            <span>▶</span>
                            {displayAsLive ? 'Watch Stream' : 'View Stream'}
                        </a>
                    </div>
                </div>
            </>
        );
    }

    // Handle game-matched live stream
    if (!liveGame) return null;
    
    const opponent = liveGame.opponent || 'Game';
    const streamUrl = liveGame.liveStreamUrl ?? liveGame.upcomingStreamUrl;
    const isLive = Boolean(liveGame.liveStreamUrl);

    if (!streamUrl) return null;

    return (
        <>
            <style>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.5;
                    }
                }
                
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
            
            <div className={cx('live-stream-alert', css({
                background: isLive
                    ? 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)'
                    : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                marginBottom: '24px',
                boxShadow: isLive
                    ? '0 8px 32px rgba(220, 38, 38, 0.3)'
                    : '0 8px 32px rgba(37, 99, 235, 0.3)',
                border: '2px solid rgba(255, 255, 255, 0.1)',
                animation: 'slideDown 0.5s ease-out',
                position: 'relative',
                overflow: 'hidden',
                _before: {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                    animation: 'shimmer 2s infinite',
                }
            }))}>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    position: 'relative',
                    zIndex: 1,
                    flexWrap: 'wrap',
                    '@media (max-width: 640px)': {
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                    }
                })}>
                    {/* Live/Upcoming indicator and text */}
                    <div className={css({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    })}>
                        {/* Pulsing dot (only for live) */}
                        {isLive && (
                            <div className={css({
                                width: '12px',
                                height: '12px',
                                backgroundColor: '#fff',
                                borderRadius: '50%',
                                animation: 'pulse 1.5s ease-in-out infinite',
                                boxShadow: '0 0 0 0 rgba(255, 255, 255, 0.7)',
                            })} />
                        )}
                        
                        <div>
                            <div className={css({
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#fff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '4px',
                            })}>
                                {isLive ? '🔴 LIVE NOW' : '⏰ UPCOMING STREAM'}
                            </div>
                            <div className={css({
                                fontSize: '18px',
                                fontWeight: '600',
                                color: '#fff',
                            })}>
                                {opponent}
                            </div>
                        </div>
                    </div>

                    {/* Watch button */}
                    <a
                        href={streamUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={css({
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 24px',
                            backgroundColor: '#fff',
                            color: isLive ? '#dc2626' : '#2563eb',
                            fontSize: '16px',
                            fontWeight: '700',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                            _hover: {
                                backgroundColor: isLive ? '#fef2f2' : '#eff6ff',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
                            },
                            _active: {
                                transform: 'translateY(0)',
                            },
                            '@media (max-width: 640px)': {
                                width: '100%',
                                justifyContent: 'center',
                            }
                        })}
                    >
                        <span>▶</span>
                        {isLive ? 'Watch Stream' : 'View Stream'}
                    </a>
                </div>
            </div>
        </>
    );
}
