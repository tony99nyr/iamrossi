'use client';

import { css, cx } from '@styled-system/css';
import NextImage from 'next/image';
import type { Game } from '@/types';

interface GameCardProps {
    title: string;
    game: Game | null;
    isHome?: boolean;
    isPastGame?: boolean;
}

const LOGO_BLUR_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAj2bXfwAAAABJRU5ErkJggg==';

const TEAM_LOGO_PROPS = {
    width: 100,
    height: 100,
    sizes: '(max-width: 768px) 80px, 100px',
    placeholder: 'blur' as const,
    blurDataURL: LOGO_BLUR_DATA_URL,
    loading: 'lazy' as const,
};

/**
 * Check if a logo URL is valid and safe to use with next/image
 * Only allows URLs from configured remote patterns
 */
function isValidLogoUrl(url: string | undefined): boolean {
    if (!url) return false;

    // List of allowed hostnames (from next.config.ts)
    const allowedHostnames = [
        'myhockeyrankings.com',
        'ranktech-cdn.s3.us-east-2.amazonaws.com'
    ];

    try {
        const urlObj = new URL(url);
        return allowedHostnames.some(hostname => urlObj.hostname === hostname);
    } catch {
        return false;
    }
}

const cardStyle = css({
    background: 'rgba(20, 20, 20, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderTop: 'none',
    borderTopLeftRadius: '0',
    borderTopRightRadius: '0',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    padding: '1.5rem 1rem',
    marginBottom: '0',
    fontFamily: 'var(--font-geist-sans)',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
    transition: 'box-shadow 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
});

const placeholderCardStyle = css({
    background: 'rgba(60, 20, 20, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 100, 100, 0.15)',
});

const titleStyle = css({
    fontSize: '0.9rem',
    color: '#888',
    marginBottom: '1.5rem',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    fontWeight: '600',
    textAlign: 'center',
});

const noGameStyle = css({
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
});

const contentStyle = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
});

const dateRowStyle = css({
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    fontSize: '1rem',
    color: '#aaa',
    fontFamily: 'var(--font-geist-mono)',
    background: 'rgba(255, 255, 255, 0.03)',
    padding: '0.5rem',
    borderRadius: '100px',
    width: 'fit-content',
    margin: '0 auto',
    border: '1px solid rgba(255, 255, 255, 0.05)',
});

const matchupStyle = css({
    display: 'flex',
    flexDirection: { base: 'column', sm: 'row' },
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0',
    gap: { base: '1rem', sm: '0' },
});

const teamStyle = css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    width: { base: '100%', sm: '40%' },
    gap: '0.5rem',
});

const teamLinkStyle = css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '0.5rem',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'opacity 0.2s ease',
    '&:hover': {
        opacity: 0.8,
    },
});

const teamLinkDisabledStyle = css({
    cursor: 'default',
    opacity: 1,
});

const logoStyle = css({
    width: '100px',
    height: '100px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
    transition: 'transform 0.3s ease',
});

const teamNameStyle = css({
    fontSize: '1.1rem',
    lineHeight: '1.3',
    fontWeight: '700',
    color: '#fff',
});

const vsStyle = css({
    fontWeight: '800',
    color: '#444',
    fontSize: '1.2rem',
    fontStyle: 'italic',
    margin: { base: '0.5rem 0', sm: '0' },
});

const locationStyle = css({
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.9rem',
    color: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '0.5rem',
    flexWrap: 'wrap',
    paddingInline: { base: '2.5rem', sm: '0' }, // Prevent overlap with details button
});

const rinkLabelStyle = css({
    color: '#444',
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '1px',
    fontWeight: '700',
});

const rinkNameStyle = css({
    color: '#888',
});

const statValueStyle = css({
    fontSize: '0.85rem',
    color: '#aaa',
});

const statLabelStyle = css({
    color: '#666',
    fontWeight: '500',
});

const statsContainerStyle = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    marginTop: '0.5rem',
});

const linkContainerStyle = css({
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    textAlign: 'center'
});

const actionLinkStyle = css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    '&:hover': {
        transform: 'translateY(-1px)'
    }
});

const previewLinkStyle = css({
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    '&:hover': {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(59, 130, 246, 0.5)',
    }
});

const highlightsLinkStyle = css({
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(220, 38, 38, 0.3)',
    '&:hover': {
        backgroundColor: 'rgba(220, 38, 38, 0.2)',
        borderColor: 'rgba(220, 38, 38, 0.5)',
    }
});

const fullGameLinkStyle = css({
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#e5e5e5',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    '&:hover': {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
    }
});

const streamLinkStyle = css({
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.15))',
    color: '#a78bfa',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    '&:hover': {
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(99, 102, 241, 0.25))',
        borderColor: 'rgba(139, 92, 246, 0.5)',
    }
});

const videoLinksContainerStyle = css({
    paddingTop: '0.5rem',
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    flexWrap: 'wrap'
});

export default function GameCard({ title, game, isPastGame = false }: GameCardProps) {
    const year = new Date().getFullYear();

    if (!game) {
        return (
            <div className={cx('game-card', cardStyle)}>
                <h2 className={cx('game-title', titleStyle)}>{title}</h2>
                <p className={cx('no-game-message', noGameStyle)}>No upcoming game scheduled.</p>
            </div>
        );
    }

    return (
        <div className={cx('game-card', cardStyle, game.isPlaceholder && placeholderCardStyle)}>
            <div className={cx('game-content', contentStyle)}>
                <div className={cx('date-row', dateRowStyle)}>
                    <span>{game.game_date_format_pretty || game.game_date}</span>
                    <span>{game.game_time_format_pretty || game.game_time}</span>
                </div>
                
                <div className={cx('matchup', matchupStyle)}>
                    <div className={cx('team', teamStyle)}>
                        {game.game_visitor_team ? (
                            <a 
                                href={`https://myhockeyrankings.com/team-info/${game.game_visitor_team}/${year}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cx('team-link', teamLinkStyle)}
                            >
                                {isValidLogoUrl(game.visitor_team_logo) && (
                                    <NextImage
                                        src={game.visitor_team_logo!}
                                        alt="Visitor Logo"
                                        className={logoStyle}
                                        {...TEAM_LOGO_PROPS}
                                    />
                                )}
                                <span className={teamNameStyle}>{game.visitor_team_name}</span>
                            </a>
                        ) : (
                            <div className={cx('team-link', teamLinkStyle, teamLinkDisabledStyle)}>
                                {isValidLogoUrl(game.visitor_team_logo) && (
                                    <NextImage
                                        src={game.visitor_team_logo!}
                                        alt="Visitor Logo"
                                        className={cx('team-logo', logoStyle)}
                                        {...TEAM_LOGO_PROPS}
                                    />
                                )}
                                <span className={cx('team-name', teamNameStyle)}>{game.visitor_team_name}</span>
                            </div>
                        )}
                        <div className={statsContainerStyle}>
                            {game.visitor_team_record && (
                                <div className={statValueStyle}>
                                    <span className={statLabelStyle}>Record:</span> {game.visitor_team_record}
                                </div>
                            )}
                            {game.visitor_team_rating && (
                                <div className={statValueStyle}>
                                    <span className={statLabelStyle}>Rating:</span> {game.visitor_team_rating}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={cx('vs-label', vsStyle)}>AT</div>
                    <div className={cx('team', teamStyle)}>
                        {game.game_home_team ? (
                            <a 
                                href={`https://myhockeyrankings.com/team-info/${game.game_home_team}/${year}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cx('team-link', teamLinkStyle)}
                            >
                                {isValidLogoUrl(game.home_team_logo) && (
                                    <NextImage
                                        src={game.home_team_logo!}
                                        alt="Home Logo"
                                        className={cx('team-logo', logoStyle)}
                                        {...TEAM_LOGO_PROPS}
                                    />
                                )}
                                <span className={cx('team-name', teamNameStyle)}>{game.home_team_name}</span>
                            </a>
                        ) : (
                            <div className={cx('team-link', teamLinkStyle, teamLinkDisabledStyle)}>
                                {isValidLogoUrl(game.home_team_logo) && (
                                    <NextImage
                                        src={game.home_team_logo!}
                                        alt="Home Logo"
                                        className={cx('team-logo', logoStyle)}
                                        {...TEAM_LOGO_PROPS}
                                    />
                                )}
                                <span className={cx('team-name', teamNameStyle)}>{game.home_team_name}</span>
                            </div>
                        )}
                        <div className={statsContainerStyle}>
                            {game.home_team_record && (
                                <div className={statValueStyle}>
                                    <span className={statLabelStyle}>Record:</span> {game.home_team_record}
                                </div>
                            )}
                            {game.home_team_rating && (
                                <div className={statValueStyle}>
                                    <span className={statLabelStyle}>Rating:</span> {game.home_team_rating}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={cx('location', locationStyle)}>
                    <span className={cx('rink-label', rinkLabelStyle)}>Rink:</span>
                    <span className={cx('rink-name', rinkNameStyle)}>{game.rink_name}</span>
                </div>

                {/* Game Preview Link - Only show for MHR games with numeric game_nbr */}
                {game.game_nbr && typeof game.game_nbr === 'number' && (
                    <div className={linkContainerStyle}>
                        <a 
                            href={`https://myhockeyrankings.com/game-preview?g=${game.game_nbr}&y=2025`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cx(actionLinkStyle, previewLinkStyle)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                            </svg>
                            View Game Preview on MHR
                        </a>
                    </div>
                )}

                {/* Video Links (Past games only) */}
                {isPastGame && (game.highlightsUrl || game.fullGameUrl) && (
                    <div className={videoLinksContainerStyle}>
                        {game.highlightsUrl && (
                            <a 
                                href={game.highlightsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cx(actionLinkStyle, highlightsLinkStyle)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"></path>
                                    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                                </svg>
                                Watch Highlights
                            </a>
                        )}
                        {game.fullGameUrl && (
                            <a 
                                href={game.fullGameUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cx(actionLinkStyle, fullGameLinkStyle)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                                </svg>
                                Watch Full Game
                            </a>
                        )}
                    </div>
                )}

                {/* Upcoming Stream Link */}
                {!isPastGame && game.upcomingStreamUrl && (
                    <div className={css({
                        paddingTop: '0.5rem',
                        display: 'flex',
                        justifyContent: 'center'
                    })}>
                        <a 
                            href={game.upcomingStreamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cx(actionLinkStyle, streamLinkStyle)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            Scheduled Stream
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
