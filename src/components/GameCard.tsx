'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';

interface TeamDetails {
    record?: string;
    goals?: string;
    rating?: number;
}

export interface Game {
    game_date: string;
    game_time: string;
    home_team_name: string;
    visitor_team_name: string;
    rink_name: string;
    home_team_logo?: string;
    visitor_team_logo?: string;
    game_date_format?: string;
    game_date_format_pretty?: string;
    game_time_format_pretty?: string;
    game_home_team?: number | string;
    game_visitor_team?: number | string;
    game_home_score?: number;
    game_visitor_score?: number;
    opponent_record?: string;
    opponent_rating?: string;
    home_team_record?: string;
    home_team_rating?: string;
    visitor_team_record?: string;
    visitor_team_rating?: string;
    game_nbr?: string | number;
    highlightsUrl?: string;
    fullGameUrl?: string;
}

interface GameCardProps {
    title: string;
    game: Game | null;
    isHome?: boolean;
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

const badgeStyle = css({
    position: 'absolute',
    top: 0,
    right: { base: '1rem', sm: '2rem' },
    padding: '0.5rem 1.5rem',
    fontSize: '0.75rem',
    fontWeight: '700',
    letterSpacing: '1px',
    borderRadius: '0 0 8px 8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    zIndex: 1,
});

const homeBadgeStyle = css({
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    color: '#fff',
});

const awayBadgeStyle = css({
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    color: '#fff',
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

const detailsButtonStyle = css({
    position: 'absolute',
    bottom: '1rem',
    right: '1rem',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    padding: 0,
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        transform: 'scale(1.05)',
    },
});

const detailsIconStyle = css({
    width: '18px',
    height: '18px',
    color: '#888',
    transition: 'transform 0.3s ease',
});

const detailsIconOpenStyle = css({
    transform: 'rotate(45deg)',
});

const detailsStyle = css({
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    animation: 'slideDown 0.3s ease',
});

const loadingStyle = css({
    textAlign: 'center',
    color: '#888',
    fontSize: '0.9rem',
    fontStyle: 'italic',
});

const teamStatsStyle = css({
    display: 'flex',
    gap: '2rem',
    justifyContent: 'space-around',
});

const teamStatStyle = css({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
});

const statTeamNameStyle = css({
    fontWeight: '600',
    fontSize: '0.9rem',
    color: '#fff',
    textDecoration: 'none',
    transition: 'color 0.2s ease',
    marginBottom: '0.25rem',
});

const statValueStyle = css({
    fontSize: '0.85rem',
    color: '#aaa',
});

const statLabelStyle = css({
    color: '#666',
    fontWeight: '500',
});

const statDividerStyle = css({
    width: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
});

export default function GameCard({ title, game, isHome }: GameCardProps) {
    const [showDetails, setShowDetails] = useState(false);

    const year = new Date().getFullYear();

    // For the opponent team, we use the data from schedule.json
    // The schedule already has opponent_record and opponent_rating populated
    const opponentDetails: TeamDetails = {
        record: game?.opponent_record,
        rating: game?.opponent_rating ? parseFloat(game.opponent_rating) : undefined,
    };

    if (!game) {
        return (
            <div className={cx('game-card', cardStyle)}>
                <h2 className={cx('game-title', titleStyle)}>{title}</h2>
                <p className={cx('no-game-message', noGameStyle)}>No upcoming game scheduled.</p>
            </div>
        );
    }

    return (
        <div className={cx('game-card', cardStyle)}>
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
                                {game.visitor_team_logo && <img src={game.visitor_team_logo} alt="Visitor Logo" className={logoStyle} />}
                                <span className={teamNameStyle}>{game.visitor_team_name}</span>
                            </a>
                        ) : (
                            <div className={cx('team-link', teamLinkStyle)} style={{ cursor: 'default', opacity: 1 }}>
                                {game.visitor_team_logo && <img src={game.visitor_team_logo} alt="Visitor Logo" className={cx('team-logo', logoStyle)} />}
                                <span className={cx('team-name', teamNameStyle)}>{game.visitor_team_name}</span>
                            </div>
                        )}
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
                                {game.home_team_logo && <img src={game.home_team_logo} alt="Home Logo" className={cx('team-logo', logoStyle)} />}
                                <span className={cx('team-name', teamNameStyle)}>{game.home_team_name}</span>
                            </a>
                        ) : (
                            <div className={cx('team-link', teamLinkStyle)} style={{ cursor: 'default', opacity: 1 }}>
                                {game.home_team_logo && <img src={game.home_team_logo} alt="Home Logo" className={cx('team-logo', logoStyle)} />}
                                <span className={cx('team-name', teamNameStyle)}>{game.home_team_name}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className={cx('location', locationStyle)}>
                    <span className={cx('rink-label', rinkLabelStyle)}>Rink:</span>
                    <span className={cx('rink-name', rinkNameStyle)}>{game.rink_name}</span>
                </div>
            </div>

            <button 
                className={cx('details-button', detailsButtonStyle)}
                onClick={() => setShowDetails(!showDetails)}
                aria-label={showDetails ? "Hide details" : "Show details"}
            >
                <svg 
                    className={cx('details-icon', detailsIconStyle, showDetails && detailsIconOpenStyle)}
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </button>

            {showDetails && (
                <div className={cx('details-section', detailsStyle)}>
                    <div className={cx('team-stats', teamStatsStyle)}>
                        {/* Visitor Team */}
                        <div className={cx('team-stat-column', teamStatStyle)}>
                            <div className={cx('stat-team-name', statTeamNameStyle)}>
                                {game.visitor_team_name}
                            </div>
                            {game.visitor_team_record ? (
                                <div className={cx('stat-value', statValueStyle)}>
                                    <span className={cx('stat-label', statLabelStyle)}>Record:</span> {game.visitor_team_record}
                                </div>
                            ) : (
                                <div className={statValueStyle} style={{ fontStyle: 'italic', color: '#666' }}>
                                    No record
                                </div>
                            )}
                            {game.visitor_team_rating ? (
                                <div className={cx('stat-value', statValueStyle)}>
                                    <span className={cx('stat-label', statLabelStyle)}>Rating:</span> {game.visitor_team_rating}
                                </div>
                            ) : (
                                <div className={statValueStyle} style={{ fontStyle: 'italic', color: '#666' }}>
                                    No rating
                                </div>
                            )}
                        </div>

                        <div className={cx('stat-divider', statDividerStyle)} />

                        {/* Home Team */}
                        <div className={cx('team-stat-column', teamStatStyle)}>
                            <div className={cx('stat-team-name', statTeamNameStyle)}>
                                {game.home_team_name}
                            </div>
                            {game.home_team_record ? (
                                <div className={cx('stat-value', statValueStyle)}>
                                    <span className={cx('stat-label', statLabelStyle)}>Record:</span> {game.home_team_record}
                                </div>
                            ) : (
                                <div className={statValueStyle} style={{ fontStyle: 'italic', color: '#666' }}>
                                    No record
                                </div>
                            )}
                            {game.home_team_rating ? (
                                <div className={cx('stat-value', statValueStyle)}>
                                    <span className={cx('stat-label', statLabelStyle)}>Rating:</span> {game.home_team_rating}
                                </div>
                            ) : (
                                <div className={statValueStyle} style={{ fontStyle: 'italic', color: '#666' }}>
                                    No rating
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Game Preview Link - Only show for MHR games with numeric game_nbr */}
                    {game.game_nbr && typeof game.game_nbr === 'number' && (
                        <div className={css({
                            marginTop: '1.5rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                            textAlign: 'center'
                        })}>
                            <a 
                                href={`https://myhockeyrankings.com/game-preview?g=${game.game_nbr}&y=2025`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={css({
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    color: '#60a5fa',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    textDecoration: 'none',
                                    fontSize: '0.875rem',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                        borderColor: 'rgba(59, 130, 246, 0.5)',
                                        transform: 'translateY(-1px)'
                                    }
                                })}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                                View Game Preview on MHR
                            </a>
                        </div>
                    )}

                    {/* Video Links */}
                    {(game.highlightsUrl || game.fullGameUrl) && (
                        <div className={css({
                            marginTop: '1.5rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            gap: '1rem',
                            justifyContent: 'center',
                            flexWrap: 'wrap'
                        })}>
                            {game.highlightsUrl && (
                                <a 
                                    href={game.highlightsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={css({
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                                        color: '#f87171',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(220, 38, 38, 0.3)',
                                        textDecoration: 'none',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            backgroundColor: 'rgba(220, 38, 38, 0.2)',
                                            borderColor: 'rgba(220, 38, 38, 0.5)',
                                            transform: 'translateY(-1px)'
                                        }
                                    })}
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
                                    className={css({
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        color: '#e5e5e5',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        textDecoration: 'none',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            borderColor: 'rgba(255, 255, 255, 0.2)',
                                            transform: 'translateY(-1px)'
                                        }
                                    })}
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
                </div>
            )}
        </div>
    );
}
