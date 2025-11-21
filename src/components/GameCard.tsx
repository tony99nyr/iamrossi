'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '../../styled-system/css';

interface TeamDetails {
    record?: string;
    goals?: string;
    rating?: number;
}

interface Game {
    game_date: string;
    game_time: string;
    home_team_name: string;
    visitor_team_name: string;
    rink_name: string;
    home_team_logo?: string;
    visitor_team_logo?: string;
    game_date_format_pretty?: string;
    game_time_format_pretty?: string;
    game_home_team?: number;
    game_visitor_team?: number;
    game_home_score?: number;
    game_visitor_score?: number;
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
    borderRadius: '16px',
    padding: '2rem',
    marginBottom: '2rem',
    fontFamily: 'var(--font-geist-sans)',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
    '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
    },
    '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
});

const badgeStyle = css({
    position: 'absolute',
    top: 0,
    right: '2rem',
    padding: '0.5rem 1.5rem',
    fontSize: '0.75rem',
    fontWeight: '700',
    letterSpacing: '1px',
    borderRadius: '0 0 8px 8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
});

const homeBadgeStyle = css({
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    color: '#fff',
});

const awayBadgeStyle = css({
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
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
    gap: '1.5rem',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 0',
});

const teamStyle = css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    width: '40%',
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
    width: '80px',
    height: '80px',
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
});

const locationStyle = css({
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.9rem',
    color: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '0.5rem',
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
    '&:hover': {
        color: '#6366f1',
    },
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
    const [homeTeamDetails, setHomeTeamDetails] = useState<TeamDetails | null>(null);
    const [visitorTeamDetails, setVisitorTeamDetails] = useState<TeamDetails | null>(null);
    const [loading, setLoading] = useState(false);

    const year = new Date().getFullYear();

    // Reset details when the game prop changes (e.g., selecting a different upcoming game)
    useEffect(() => {
        // Clear previous details so they are refetched for the new game
        setHomeTeamDetails(null);
        setVisitorTeamDetails(null);
        setLoading(false);
        setShowDetails(false);
    }, [game]);

    // Fetch team details when details section is opened
    useEffect(() => {
        if (showDetails && game && !homeTeamDetails && !visitorTeamDetails && !loading) {
            fetchTeamDetails();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDetails, game, homeTeamDetails, visitorTeamDetails, loading]);

    const fetchTeamDetails = async () => {
        if (!game) return;
        
        // Store the current game IDs to check if game changed during fetch
        const currentHomeTeamId = game.game_home_team;
        const currentVisitorTeamId = game.game_visitor_team;
        
        setLoading(true);
        try {
            const [homeRes, visitorRes] = await Promise.all([
                fetch(`/api/team-details?teamId=${currentHomeTeamId}&year=${year}`),
                fetch(`/api/team-details?teamId=${currentVisitorTeamId}&year=${year}`)
            ]);

            // Only update state if the game hasn't changed
            if (game?.game_home_team === currentHomeTeamId && game?.game_visitor_team === currentVisitorTeamId) {
                if (homeRes.ok) {
                    const homeData = await homeRes.json();
                    setHomeTeamDetails(homeData);
                }
                if (visitorRes.ok) {
                    const visitorData = await visitorRes.json();
                    setVisitorTeamDetails(visitorData);
                }
            }
        } catch (error) {
            console.error('Failed to fetch team details:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!game) {
        return (
            <div className={cardStyle}>
                <h2 className={titleStyle}>{title}</h2>
                <p className={noGameStyle}>No upcoming game scheduled.</p>
            </div>
        );
    }

    return (
        <div className={cardStyle}>
            <div className={cx(badgeStyle, isHome ? homeBadgeStyle : awayBadgeStyle)}>
                {isHome ? 'HOME' : 'AWAY'}
            </div>
            <h2 className={titleStyle}>{title}</h2>
            <div className={contentStyle}>
                <div className={dateRowStyle}>
                    <span>{game.game_date_format_pretty || game.game_date}</span>
                    <span>{game.game_time_format_pretty || game.game_time}</span>
                </div>
                
                <div className={matchupStyle}>
                    <div className={teamStyle}>
                        <a 
                            href={`https://myhockeyrankings.com/team-info/${game.game_visitor_team}/${year}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={teamLinkStyle}
                        >
                            {game.visitor_team_logo && <img src={game.visitor_team_logo} alt="Visitor Logo" className={logoStyle} />}
                            <span className={teamNameStyle}>{game.visitor_team_name}</span>
                        </a>
                    </div>
                    <div className={vsStyle}>AT</div>
                    <div className={teamStyle}>
                        <a 
                            href={`https://myhockeyrankings.com/team-info/${game.game_home_team}/${year}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={teamLinkStyle}
                        >
                            {game.home_team_logo && <img src={game.home_team_logo} alt="Home Logo" className={logoStyle} />}
                            <span className={teamNameStyle}>{game.home_team_name}</span>
                        </a>
                    </div>
                </div>

                <div className={locationStyle}>
                    <span className={rinkLabelStyle}>Rink:</span>
                    <span className={rinkNameStyle}>{game.rink_name}</span>
                </div>
            </div>

            <button 
                className={detailsButtonStyle}
                onClick={() => setShowDetails(!showDetails)}
                aria-label={showDetails ? "Hide details" : "Show details"}
            >
                <svg 
                    className={cx(detailsIconStyle, showDetails && detailsIconOpenStyle)}
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
                <div className={detailsStyle}>
                    {loading ? (
                        <p className={loadingStyle}>Loading team details...</p>
                    ) : (
                        <div className={teamStatsStyle}>
                            <div className={teamStatStyle}>
                                <a 
                                    href={`https://myhockeyrankings.com/team-info/${game.game_visitor_team}/${year}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={statTeamNameStyle}
                                >
                                    {game.visitor_team_name}
                                </a>
                                {visitorTeamDetails?.record && (
                                    <div className={statValueStyle}>
                                        <span className={statLabelStyle}>Record:</span> {visitorTeamDetails.record}
                                    </div>
                                )}
                                {visitorTeamDetails?.goals && (
                                    <div className={statValueStyle}>
                                        <span className={statLabelStyle}>Goals:</span> {visitorTeamDetails.goals}
                                    </div>
                                )}
                                {visitorTeamDetails?.rating && (
                                    <div className={statValueStyle}>
                                        <span className={statLabelStyle}>Rating:</span> {visitorTeamDetails.rating}
                                    </div>
                                )}
                            </div>
                            
                            <div className={statDividerStyle}></div>
                            
                            <div className={teamStatStyle}>
                                <a 
                                    href={`https://myhockeyrankings.com/team-info/${game.game_home_team}/${year}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={statTeamNameStyle}
                                >
                                    {game.home_team_name}
                                </a>
                                {homeTeamDetails?.record && (
                                    <div className={statValueStyle}>
                                        <span className={statLabelStyle}>Record:</span> {homeTeamDetails.record}
                                    </div>
                                )}
                                {homeTeamDetails?.goals && (
                                    <div className={statValueStyle}>
                                        <span className={statLabelStyle}>Goals:</span> {homeTeamDetails.goals}
                                    </div>
                                )}
                                {homeTeamDetails?.rating && (
                                    <div className={statValueStyle}>
                                        <span className={statLabelStyle}>Rating:</span> {homeTeamDetails.rating}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
