'use client';

import { useState } from 'react';
import GameCard from '@/components/GameCard';
import { css, cx } from '../../../../styled-system/css';

interface NextGameClientProps {
    futureGames: any[];
}

const containerStyle = css({
    maxWidth: '800px',
    margin: '0 auto',
    padding: '6rem 2rem',
    fontFamily: 'var(--font-geist-sans)',
    minHeight: '100vh',
    color: '#fff',
});

const headerStyle = css({
    fontSize: '3rem',
    marginBottom: '3rem',
    textAlign: 'center',
    fontWeight: '800',
    background: 'linear-gradient(to right, #fff, #888)',
    backgroundClip: 'text',
    color: 'transparent',
    letterSpacing: '-0.05em',
});

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

const listStyle = css({
    listStyle: 'none',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
});

const listItemStyle = css({
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.05)',
        transform: 'translateX(4px)',
    },
});

const listItemActiveStyle = css({
    background: 'rgba(99, 102, 241, 0.15)',
    borderLeft: '3px solid #6366f1',
    paddingLeft: 'calc(1rem - 3px)',
    '&:hover': {
        background: 'rgba(99, 102, 241, 0.2)',
    },
});

const dateStyle = css({
    color: '#888',
    width: '100px',
    fontFamily: 'var(--font-geist-mono)',
    fontSize: '0.9rem',
    paddingRight: '1.5rem',
});

const opponentStyle = css({
    color: '#eee',
    flex: 1,
    padding: '0 1rem',
    fontWeight: '500',
});

const timeStyle = css({
    color: '#888',
    textAlign: 'right',
    fontFamily: 'var(--font-geist-mono)',
    fontSize: '0.9rem',
});

const homeBadgeSmallStyle = css({
    display: 'inline-block',
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    marginLeft: '0.5rem',
    letterSpacing: '0.5px',
});

export default function NextGameClient({ futureGames }: NextGameClientProps) {
    const nextGame = futureGames.length > 0 ? futureGames[0] : null;
    const isNextGameHome = nextGame ? nextGame.home_team_name.includes('Carolina Junior Canes') : false;
    
    const nextHomeGame = !isNextGameHome ? futureGames.find((game: any) => 
        game.home_team_name.includes('Carolina Junior Canes')
    ) || null : null;

    const [selectedGame, setSelectedGame] = useState<any>(null);

    const handleGameClick = (game: any) => {
        setSelectedGame(game);
        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Determine which game to show in the featured card
    const featuredGame = selectedGame || nextGame;
    const isFeaturedHome = featuredGame ? featuredGame.home_team_name.includes('Carolina Junior Canes') : false;

    return (
        <div className={containerStyle}>
            <h1 className={headerStyle}>Game Schedule</h1>
            
            {selectedGame && (
                <GameCard title="" game={selectedGame} isHome={isFeaturedHome} />
            )}
            
            {!selectedGame && (
                <>
                    <GameCard title="Next Game" game={nextGame} isHome={isNextGameHome} />
                    {nextHomeGame && <GameCard title="Next Home Game" game={nextHomeGame} isHome={true} />}
                </>
            )}

            <div className={fullScheduleStyle}>
                <h2>Upcoming Games</h2>
                {futureGames.length === 0 ? (
                    <p>No upcoming games found. Please sync the schedule in the Admin dashboard.</p>
                ) : (
                    <ul className={listStyle}>
                        {futureGames.slice(0, 5).map((game: any, index: number) => {
                            const isHomeGame = game.home_team_name.includes('Carolina Junior Canes');
                            return (
                                <li 
                                    key={game.game_nbr || `game-${index}`} 
                                    className={cx(listItemStyle, featuredGame?.game_nbr === game.game_nbr && listItemActiveStyle)}
                                    onClick={() => handleGameClick(game)}
                                >
                                    <span className={dateStyle}>{game.game_date_format_pretty}</span>
                                    <span className={opponentStyle}>
                                        {isHomeGame ? 'vs ' + game.visitor_team_name : '@ ' + game.home_team_name}
                                        {isHomeGame && <span className={homeBadgeSmallStyle}>HOME</span>}
                                    </span>
                                    <span className={timeStyle}>{game.game_time_format_pretty}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
