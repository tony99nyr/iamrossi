'use client';

import { css, cx } from '@styled-system/css';
import type { EnrichedGame } from '@/utils/videoMatcher';

interface LiveStreamAlertProps {
    liveGame: EnrichedGame;
}

export default function LiveStreamAlert({ liveGame }: LiveStreamAlertProps) {
    const opponent = liveGame.opponent || 'Game';
    const streamUrl = liveGame.liveStreamUrl;

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
                background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                marginBottom: '24px',
                boxShadow: '0 8px 32px rgba(220, 38, 38, 0.3)',
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
                    {/* Live indicator and text */}
                    <div className={css({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    })}>
                        {/* Pulsing red dot */}
                        <div className={css({
                            width: '12px',
                            height: '12px',
                            backgroundColor: '#fff',
                            borderRadius: '50%',
                            animation: 'pulse 1.5s ease-in-out infinite',
                            boxShadow: '0 0 0 0 rgba(255, 255, 255, 0.7)',
                        })} />
                        
                        <div>
                            <div className={css({
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#fff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '4px',
                            })}>
                                🔴 LIVE NOW
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
                            color: '#dc2626',
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
                        Watch Stream
                    </a>
                </div>
            </div>
        </>
    );
}
