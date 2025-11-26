'use client';

import { useState } from 'react';
import GameCard from '@/components/GameCard';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { ThunderstormBackground } from '@/components/ThunderstormBackground';
import { css, cx } from '@styled-system/css';

import { Game } from '@/types';

interface NextGameClientProps {
    futureGames: Game[];
    pastGames?: Game[];
    settings: { mhrTeamId: string; mhrYear: string };
}

const containerStyle = css({
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem 2rem 6rem',
    fontFamily: 'var(--font-geist-sans)',
    minHeight: '100vh',
    color: '#fff',
});

const heroSectionStyle = css({
    textAlign: 'center',
    marginBottom: '4rem',
    paddingTop: '2rem',
});

const logoContainerStyle = css({
    maxWidth: '200px',
    margin: '0 auto 2rem',
    animation: 'fadeInDown 0.8s ease-out',
});

const teamNameStyle = css({
    fontSize: '2.5rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    backgroundClip: 'text',
    color: 'transparent',
    letterSpacing: '-0.03em',
    marginBottom: '0.5rem',
    animation: 'fadeIn 1s ease-out 0.3s backwards',
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, opacity 0.2s ease',
    '&:hover': {
        transform: 'translateY(-2px)',
        opacity: 0.8,
    },
});

const subtitleStyle = css({
    fontSize: '1rem',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    fontWeight: '600',
    marginBottom: '1.5rem',
    animation: 'fadeIn 1s ease-out 0.5s backwards',
});

const descriptionStyle = css({
    fontSize: '0.95rem',
    color: '#aaa',
    lineHeight: '1.6',
    maxWidth: '600px',
    margin: '0 auto',
    animation: 'fadeIn 1s ease-out 0.7s backwards',
});

// const headerStyle = css({
//     fontSize: '3rem',
//     marginBottom: '3rem',
//     textAlign: 'center',
//     fontWeight: '800',
//     background: 'linear-gradient(to right, #fff, #888)',
//     backgroundClip: 'text',
//     color: 'transparent',
//     letterSpacing: '-0.05em',
// });

const fullScheduleStyle = css({
    marginTop: '4rem',
    paddingTop: '2rem',
    '& h2': {
        fontSize: '1.5rem',
        color: '#fff',
        marginBottom: '1.5rem',
        fontWeight: '600',
        letterSpacing: '-0.02em',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        paddingBottom: '1rem',
    },
});

// const listStyle = css({
//     listStyle: 'none',
//     padding: 0,
//     display: 'flex',
//     flexDirection: 'column',
//     gap: '0.5rem',
// });

const listItemStyle = css({
    display: 'flex',
    flexWrap: { base: 'wrap', sm: 'nowrap' },
    justifyContent: 'space-between',
    alignItems: { base: 'center', sm: 'center' },
    padding: '0.75rem 1rem',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
});

const listItemActiveStyle = css({
    background: 'rgba(220, 38, 38, 0.15)',
    borderLeft: '3px solid #991b1b',
    borderBottom: 'none',
    borderBottomLeftRadius: '0',
    borderBottomRightRadius: '0',
    paddingLeft: 'calc(1rem - 3px)',
    '&:hover': {
        background: 'rgba(220, 38, 38, 0.2)',
    },
});

const dateStyle = css({
    color: '#888',
    width: { base: '50%', sm: '120px' },
    fontFamily: 'var(--font-geist-mono)',
    fontSize: '0.9rem',
    paddingRight: { base: '0', sm: '1.5rem' },
    whiteSpace: 'nowrap',
    order: { base: 1, sm: 0 },
});

const opponentStyle = css({
    color: '#eee',
    flex: 1,
    padding: { base: '0.5rem 0', sm: '0 1rem' },
    fontWeight: '500',
    width: { base: '100%', sm: 'auto' },
    order: { base: 3, sm: 0 },
    display: 'flex',
    flexDirection: { base: 'column', sm: 'row' },
    alignItems: { base: 'flex-start', sm: 'center' },
    gap: { base: '0.25rem', sm: '0.5rem' },
});

const timeStyle = css({
    color: '#888',
    textAlign: 'right',
    fontFamily: 'var(--font-geist-mono)',
    fontSize: '0.9rem',
    width: { base: '50%', sm: 'auto' },
    order: { base: 2, sm: 0 },
});

const homeBadgeSmallStyle = css({
    display: 'inline-block',
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    letterSpacing: '0.5px',
});

const localBadgeSmallStyle = css({
    display: 'inline-block',
    background: 'rgba(74, 222, 128, 0.2)',
    color: '#4ade80',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    border: '1px solid rgba(74, 222, 128, 0.3)',
});

const badgesContainerStyle = css({
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
});

const placeholderBadgeStyle = css({
    display: 'inline-block',
    background: 'rgba(156, 163, 175, 0.2)',
    color: '#9ca3af',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    border: '1px solid rgba(156, 163, 175, 0.3)',
});

const placeholderItemStyle = css({
    opacity: 0.6,
    borderStyle: 'dashed',
    cursor: 'default',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.02)',
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
});

// interface NextGameClientProps {
//     futureGames: any[];
//     pastGames?: any[];
// }

// ... (styles remain same)

export default function NextGameClient({ futureGames, pastGames = [], settings }: NextGameClientProps) {
    // State for accordion - first game expanded by default
    const [expandedGameId, setExpandedGameId] = useState<string | number | null>(
        futureGames.length > 0 ? (futureGames[0].game_nbr ?? null) : null
    );
    
    // State for Past Games section
    const [isPastGamesExpanded, setIsPastGamesExpanded] = useState(false);
    const [showAllPastGames, setShowAllPastGames] = useState(false);

    const handleGameClick = (gameId: string | number | undefined, event: React.MouseEvent<HTMLDivElement>) => {
        if (gameId === undefined) return;
        // Toggle accordion - if clicking the same game, collapse it; otherwise expand the new one
        setExpandedGameId(expandedGameId === gameId ? null : gameId);
        
        // Scroll the clicked item into view
        const target = event.currentTarget;
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100); // Small delay to allow accordion animation to start
    };

    return (
        <>
            <ThunderstormBackground />
            <div className={cx('next-game-client', containerStyle)}>
                <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes fadeInDown {
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
            
            {/* Hero Section */}
            <div className={cx('hero-section', heroSectionStyle)}>
                <div className={cx('logo-container', logoContainerStyle)}>
                    <AnimatedLogo />
                </div>
                <a 
                    href={`https://myhockeyrankings.com/team-info/${settings.mhrTeamId}/${settings.mhrYear}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={cx('team-name', teamNameStyle)}
                >
                    <h1 style={{ fontSize: 'inherit', fontWeight: 'inherit', margin: 0, background: 'inherit', backgroundClip: 'inherit', color: 'inherit', letterSpacing: 'inherit' }}>
                        Junior Canes 10U Black
                    </h1>
                </a>
                <p className={cx('subtitle', subtitleStyle)}>Game Schedule</p>
                <p className={cx('description', descriptionStyle)}>
                    Track upcoming games, view past results, and access detailed team statistics. 
                    Click any game to expand and see full details including team records, ratings, and game previews.
                </p>
            </div>
            
            <div className={css({ textAlign: 'center', marginBottom: '3rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' })}>
                <a 
                    href="https://www.youtube.com/@2015JuniorCanes" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={cx('youtube-link', css({
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: 'rgba(255, 0, 0, 0.1)',
                        border: '1px solid rgba(255, 0, 0, 0.2)',
                        borderRadius: '100px',
                        color: '#ff4444',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            background: 'rgba(255, 0, 0, 0.2)',
                            transform: 'translateY(-1px)',
                        }
                    }))}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                    </svg>
                    Visit YouTube Channel
                </a>
                
                <a 
                    href="https://www.instagram.com/juniorcanes10ublack/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={cx('instagram-link', css({
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: 'rgba(225, 48, 108, 0.1)',
                        border: '1px solid rgba(225, 48, 108, 0.2)',
                        borderRadius: '100px',
                        color: '#e1306c',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            background: 'rgba(225, 48, 108, 0.2)',
                            transform: 'translateY(-1px)',
                        }
                    }))}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                    Follow on Instagram
                </a>
            </div>

            <div className={cx('full-schedule', fullScheduleStyle)}>
                <h2>Upcoming Games</h2>
                {futureGames.length === 0 ? (
                    <p>No upcoming games found. Please sync the schedule in the Admin dashboard.</p>
                ) : (
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
                        {futureGames.map((game: Game, index: number) => {
                            // Determine if this is a home game based on mhrTeamId
                            const isHomeGame = String(game.game_home_team) === String(settings.mhrTeamId);
                            const isExpanded = expandedGameId === game.game_nbr;
                            const isPlaceholder = game.isPlaceholder;

                            // Date is already formatted correctly for both regular games and placeholders
                            const displayDate = game.game_date_format_pretty;

                            return (
                                <div key={`${game.game_nbr}-${index}`}>
                                    {/* Accordion Header */}
                                    <div
                                        className={cx(
                                            'game-list-item',
                                            listItemStyle,
                                            isExpanded && !isPlaceholder && listItemActiveStyle
                                        )}
                                        onClick={(e) => !isPlaceholder && handleGameClick(game.game_nbr, e)}
                                        style={{ cursor: isPlaceholder ? 'default' : 'pointer' }}
                                    >
                                        <span className={dateStyle}>{displayDate}</span>
                                        <span className={opponentStyle}>
                                            <span>
                                                {isPlaceholder
                                                    ? game.placeholderLabel || 'Event'
                                                    : (isHomeGame ? game.visitor_team_name : '@ ' + game.home_team_name)
                                                }
                                            </span>
                                            {!isPlaceholder && (
                                                <span className={cx('badges-container', badgesContainerStyle)}>
                                                    {isHomeGame && <span className={cx('home-badge', homeBadgeSmallStyle)}>HOME</span>}
                                                    {(game.rink_name?.toLowerCase().includes('raleigh') ||
                                                      game.rink_name?.toLowerCase().includes('wake') ||
                                                      game.rink_name?.toLowerCase().includes('garner') ||
                                                      game.rink_name?.toLowerCase().includes('cary') ||
                                                      game.rink_name?.toLowerCase().includes('invisalign')) && (
                                                        <span className={cx('local-badge', localBadgeSmallStyle)}>LOCAL</span>
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                        {!isPlaceholder && <span className={cx('game-time', timeStyle)}>{game.game_time_format_pretty}</span>}
                                    </div>

                                    {/* Accordion Content - Only for non-placeholder games */}
                                    {isExpanded && !isPlaceholder && (
                                        <div>
                                            <GameCard title="" game={game} isHome={isHomeGame} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {pastGames && pastGames.length > 0 && (
                <div className={cx('full-schedule', fullScheduleStyle)}>
                    {/* Collapsible Header */}
                    <h2 
                        onClick={() => setIsPastGamesExpanded(!isPastGamesExpanded)}
                        className={css({
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'color 0.2s ease',
                            '&:hover': {
                                color: '#dc2626',
                            }
                        })}
                    >
                        <span>Past Games ({pastGames.length})</span>
                        <svg 
                            width="20" 
                            height="20" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2"
                            className={css({
                                transition: 'transform 0.3s ease',
                                transform: isPastGamesExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                            })}
                        >
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </h2>
                    
                    {isPastGamesExpanded && (
                        <>
                            <div className={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
                                {(showAllPastGames ? pastGames : pastGames.slice(0, 10)).map((game: Game, index: number) => {
                                    // Determine if we were home or away based on mhrTeamId
                                    const isHomeGame = String(game.game_home_team) === String(settings.mhrTeamId);
                                    const opponentName = isHomeGame ? game.visitor_team_name : game.home_team_name;
                                    const ourScore = isHomeGame ? game.game_home_score : game.game_visitor_score;
                                    const theirScore = isHomeGame ? game.game_visitor_score : game.game_home_score;
                                    const won = ourScore > theirScore;
                                    const isExpanded = expandedGameId === game.game_nbr;
                                    
                                    return (
                                        <div key={`past-${index}`}>
                                            {/* Accordion Header */}
                                            <div 
                                                className={cx('game-list-item', listItemStyle, isExpanded && listItemActiveStyle)}
                                                onClick={(e) => handleGameClick(game.game_nbr, e)}
                                            >
                                                <span className={cx('game-date', dateStyle)}>{game.game_date_format_pretty}</span>
                                                <span className={cx('game-opponent', opponentStyle)}>
                                                    <span>{isHomeGame ? opponentName : '@ ' + opponentName}</span>
                                                    <span className={cx('badges-container', badgesContainerStyle)}>
                                                        {isHomeGame && <span className={cx('home-badge', homeBadgeSmallStyle)}>HOME</span>}
                                                    </span>
                                                </span>
                                                <span className={cx('game-time', timeStyle)} style={{ fontWeight: 'bold', color: won ? '#4ade80' : '#f87171' }}>
                                                    {won ? 'W' : 'L'} {ourScore}-{theirScore}
                                                </span>
                                            </div>
                                            
                                            {/* Accordion Content */}
                                            {isExpanded && (
                                                <div>
                                                    <GameCard title="" game={game} isHome={isHomeGame} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* Show All Button */}
                            {!showAllPastGames && pastGames.length > 10 && (
                                <button
                                    onClick={() => setShowAllPastGames(true)}
                                    className={css({
                                        marginTop: '1rem',
                                        padding: '0.75rem 1.5rem',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '8px',
                                        color: '#aaa',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        width: '100%',
                                        '&:hover': {
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            borderColor: 'rgba(255, 255, 255, 0.2)',
                                            color: '#fff',
                                        }
                                    })}
                                >
                                    Show All Past Games ({pastGames.length - 10} more)
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
            </div>
        </>
    );
}
