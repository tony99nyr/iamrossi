import { useState } from 'react';
import { Game } from '@/types';
import { css, cx } from '@styled-system/css';
import GameListItem from './GameListItem';
import { fullScheduleStyle } from '../styles';

interface PastGamesSectionProps {
    games: Game[];
    expandedGameId: string | number | null;
    onGameClick: (gameId: string | number | undefined, event: React.MouseEvent<HTMLDivElement>) => void;
    mhrTeamId: string;
}

export default function PastGamesSection({ 
    games, 
    expandedGameId, 
    onGameClick,
    mhrTeamId 
}: PastGamesSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);

    if (!games || games.length === 0) {
        return null;
    }

    const displayedGames = showAll ? games : games.slice(0, 10);

    return (
        <div className={cx('full-schedule', fullScheduleStyle)}>
            {/* Collapsible Header */}
            <h2 
                onClick={() => setIsExpanded(!isExpanded)}
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
                <span>Past Games ({games.length})</span>
                <svg 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    className={css({
                        transition: 'transform 0.3s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    })}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </h2>
            
            {isExpanded && (
                <>
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
                        {displayedGames.map((game: Game, index: number) => {
                            const isHomeGame = String(game.game_home_team) === String(mhrTeamId);
                            const isGameExpanded = expandedGameId === game.game_nbr;

                            return (
                                <GameListItem
                                    key={`past-${index}`}
                                    game={game}
                                    isHomeGame={isHomeGame}
                                    isExpanded={isGameExpanded}
                                    isPastGame={true}
                                    onGameClick={onGameClick}
                                />
                            );
                        })}
                    </div>
                    
                    {/* Show All Button */}
                    {!showAll && games.length > 10 && (
                        <button
                            onClick={() => setShowAll(true)}
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
                            Show All Past Games ({games.length - 10} more)
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
