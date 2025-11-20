'use client';

import { useState, useEffect } from 'react';
import styles from './GameCard.module.css';

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

export default function GameCard({ title, game, isHome }: GameCardProps) {
    const [showDetails, setShowDetails] = useState(false);
    const [homeTeamDetails, setHomeTeamDetails] = useState<TeamDetails | null>(null);
    const [visitorTeamDetails, setVisitorTeamDetails] = useState<TeamDetails | null>(null);
    const [loading, setLoading] = useState(false);

    const year = new Date().getFullYear();

    useEffect(() => {
        if (showDetails && game && !homeTeamDetails && !visitorTeamDetails) {
            fetchTeamDetails();
        }
    }, [showDetails]);

    const fetchTeamDetails = async () => {
        if (!game) return;
        
        setLoading(true);
        try {
            const [homeRes, visitorRes] = await Promise.all([
                fetch(`/api/team-details?teamId=${game.game_home_team}&year=${year}`),
                fetch(`/api/team-details?teamId=${game.game_visitor_team}&year=${year}`)
            ]);

            if (homeRes.ok) {
                const homeData = await homeRes.json();
                setHomeTeamDetails(homeData);
            }
            if (visitorRes.ok) {
                const visitorData = await visitorRes.json();
                setVisitorTeamDetails(visitorData);
            }
        } catch (error) {
            console.error('Failed to fetch team details:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!game) {
        return (
            <div className={styles.card}>
                <h2 className={styles.title}>{title}</h2>
                <p className={styles.noGame}>No upcoming game scheduled.</p>
            </div>
        );
    }

    return (
        <div className={styles.card}>
            <div className={`${styles.badge} ${isHome ? styles.homeBadge : styles.awayBadge}`}>
                {isHome ? 'HOME' : 'AWAY'}
            </div>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.content}>
                <div className={styles.dateRow}>
                    <span className={styles.date}>{game.game_date_format_pretty || game.game_date}</span>
                    <span className={styles.time}>{game.game_time_format_pretty || game.game_time}</span>
                </div>
                
                <div className={styles.matchup}>
                    <div className={styles.team}>
                        <a 
                            href={`https://myhockeyrankings.com/team-info/${game.game_visitor_team}/${year}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.teamLink}
                        >
                            {game.visitor_team_logo && <img src={game.visitor_team_logo} alt="Visitor Logo" className={styles.logo} />}
                            <span className={styles.teamName}>{game.visitor_team_name}</span>
                        </a>
                    </div>
                    <div className={styles.vs}>AT</div>
                    <div className={styles.team}>
                        <a 
                            href={`https://myhockeyrankings.com/team-info/${game.game_home_team}/${year}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.teamLink}
                        >
                            {game.home_team_logo && <img src={game.home_team_logo} alt="Home Logo" className={styles.logo} />}
                            <span className={styles.teamName}>{game.home_team_name}</span>
                        </a>
                    </div>
                </div>

                <div className={styles.location}>
                    <span className={styles.rinkLabel}>Rink:</span>
                    <span className={styles.rinkName}>{game.rink_name}</span>
                </div>
            </div>

            <button 
                className={styles.detailsButton}
                onClick={() => setShowDetails(!showDetails)}
                aria-label={showDetails ? "Hide details" : "Show details"}
            >
                <svg 
                    className={`${styles.detailsIcon} ${showDetails ? styles.detailsIconOpen : ''}`}
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
                <div className={styles.details}>
                    {loading ? (
                        <p className={styles.loading}>Loading team details...</p>
                    ) : (
                        <div className={styles.teamStats}>
                            <div className={styles.teamStat}>
                                <a 
                                    href={`https://myhockeyrankings.com/team-info/${game.game_visitor_team}/${year}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.statTeamName}
                                >
                                    {game.visitor_team_name}
                                </a>
                                {visitorTeamDetails?.record && (
                                    <div className={styles.statValue}>
                                        <span className={styles.statLabel}>Record:</span> {visitorTeamDetails.record}
                                    </div>
                                )}
                                {visitorTeamDetails?.goals && (
                                    <div className={styles.statValue}>
                                        <span className={styles.statLabel}>Goals:</span> {visitorTeamDetails.goals}
                                    </div>
                                )}
                                {visitorTeamDetails?.rating && (
                                    <div className={styles.statValue}>
                                        <span className={styles.statLabel}>Rating:</span> {visitorTeamDetails.rating}
                                    </div>
                                )}
                            </div>
                            
                            <div className={styles.statDivider}></div>
                            
                            <div className={styles.teamStat}>
                                <a 
                                    href={`https://myhockeyrankings.com/team-info/${game.game_home_team}/${year}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.statTeamName}
                                >
                                    {game.home_team_name}
                                </a>
                                {homeTeamDetails?.record && (
                                    <div className={styles.statValue}>
                                        <span className={styles.statLabel}>Record:</span> {homeTeamDetails.record}
                                    </div>
                                )}
                                {homeTeamDetails?.goals && (
                                    <div className={styles.statValue}>
                                        <span className={styles.statLabel}>Goals:</span> {homeTeamDetails.goals}
                                    </div>
                                )}
                                {homeTeamDetails?.rating && (
                                    <div className={styles.statValue}>
                                        <span className={styles.statLabel}>Rating:</span> {homeTeamDetails.rating}
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
