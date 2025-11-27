import { Game } from '@/types';
import { css, cx } from '@styled-system/css';
import GameListItem from './GameListItem';
import { fullScheduleStyle } from '../styles';

interface UpcomingGamesListProps {
    games: Game[];
    expandedGameId: string | number | null;
    onGameClick: (gameId: string | number | undefined, event: React.MouseEvent<HTMLDivElement>) => void;
    mhrTeamId: string;
}

export default function UpcomingGamesList({ 
    games, 
    expandedGameId, 
    onGameClick,
    mhrTeamId 
}: UpcomingGamesListProps) {
    if (games.length === 0) {
        return (
            <div className={cx('full-schedule', fullScheduleStyle)}>
                <h2>Upcoming Games</h2>
                <p>No upcoming games found. Please sync the schedule in the Admin dashboard.</p>
            </div>
        );
    }

    return (
        <div className={cx('full-schedule', fullScheduleStyle)}>
            <h2>Upcoming Games</h2>
            <div className={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
                {games.map((game: Game, index: number) => {
                    const isHomeGame = String(game.game_home_team) === String(mhrTeamId);
                    const isExpanded = expandedGameId === game.game_nbr;

                    return (
                        <GameListItem
                            key={`${game.game_nbr}-${index}`}
                            game={game}
                            isHomeGame={isHomeGame}
                            isExpanded={isExpanded}
                            onGameClick={onGameClick}
                        />
                    );
                })}
            </div>
        </div>
    );
}
