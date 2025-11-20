'use client';

import { useState } from 'react';
import GameCard from '@/components/GameCard';
import styles from './page.module.css';

interface NextGameClientProps {
    futureGames: any[];
}

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
        <div className={styles.container}>
            <h1 className={styles.header}>Game Schedule</h1>
            
            {selectedGame && (
                <GameCard title="" game={selectedGame} isHome={isFeaturedHome} />
            )}
            
            {!selectedGame && (
                <>
                    <GameCard title="Next Game" game={nextGame} isHome={isNextGameHome} />
                    {nextHomeGame && <GameCard title="Next Home Game" game={nextHomeGame} isHome={true} />}
                </>
            )}

            <div className={styles.fullSchedule}>
                <h2>Upcoming Games</h2>
                {futureGames.length === 0 ? (
                    <p>No upcoming games found. Please sync the schedule in the Admin dashboard.</p>
                ) : (
                    <ul className={styles.list}>
                        {futureGames.slice(0, 5).map((game: any, index: number) => {
                            const isHomeGame = game.home_team_name.includes('Carolina Junior Canes');
                            return (
                                <li 
                                    key={game.game_nbr || `game-${index}`} 
                                    className={`${styles.listItem} ${selectedGame?.game_nbr === game.game_nbr ? styles.listItemActive : ''}`}
                                    onClick={() => handleGameClick(game)}
                                >
                                    <span className={styles.date}>{game.game_date_format_pretty}</span>
                                    <span className={styles.opponent}>
                                        {isHomeGame ? 'vs ' + game.visitor_team_name : '@ ' + game.home_team_name}
                                        {isHomeGame && <span className={styles.homeBadgeSmall}>HOME</span>}
                                    </span>
                                    <span className={styles.time}>{game.game_time_format_pretty}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
