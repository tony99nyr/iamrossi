import GameCard from '@/components/GameCard';
import { Game } from '@/types';
import { cx } from '@styled-system/css';
import {
    listItemStyle,
    listItemActiveStyle,
    listItemPlaceholderStyle,
    dateStyle,
    opponentStyle,
    timeStyle,
    badgesContainerStyle,
    homeBadgeSmallStyle,
    localBadgeSmallStyle,
} from '../styles';

interface GameListItemProps {
    game: Game;
    isHomeGame: boolean;
    isExpanded: boolean;
    isPastGame?: boolean;
    onGameClick: (gameId: string | number | undefined, event: React.MouseEvent<HTMLDivElement>) => void;
}

export default function GameListItem({ 
    game, 
    isHomeGame, 
    isExpanded, 
    isPastGame = false,
    onGameClick 
}: GameListItemProps) {
    const isPlaceholder = game.isPlaceholder;
    const displayDate = game.game_date_format_pretty;

    // For past games, calculate score
    const ourScore = isPastGame && isHomeGame ? game.game_home_score : game.game_visitor_score;
    const theirScore = isPastGame && isHomeGame ? game.game_visitor_score : game.game_home_score;
    const won = isPastGame && ourScore !== undefined && theirScore !== undefined && ourScore > theirScore;

    const opponentName = isHomeGame ? game.visitor_team_name : game.home_team_name;
    const displayOpponent = isPlaceholder 
        ? (game.placeholderLabel || 'Event')
        : (isHomeGame ? opponentName : '@ ' + opponentName);

    const isLocalRink = game.rink_name?.toLowerCase().includes('raleigh') ||
                       game.rink_name?.toLowerCase().includes('wake') ||
                       game.rink_name?.toLowerCase().includes('garner') ||
                       game.rink_name?.toLowerCase().includes('cary') ||
                       game.rink_name?.toLowerCase().includes('invisalign');

    return (
        <div>
            {/* Accordion Header */}
            <div
                className={cx(
                    'game-list-item',
                    listItemStyle,
                    isPlaceholder && listItemPlaceholderStyle,
                    isExpanded && !isPlaceholder && listItemActiveStyle
                )}
                onClick={(e) => !isPlaceholder && onGameClick(game.game_nbr, e)}
                style={{ cursor: isPlaceholder ? 'default' : 'pointer' }}
            >
                <span className={cx('game-date', dateStyle)}>{displayDate}</span>
                <span className={cx('game-opponent', opponentStyle)}>
                    <span>{displayOpponent}</span>
                    {!isPlaceholder && (
                        <span className={cx('badges-container', badgesContainerStyle)}>
                            {isHomeGame && <span className={cx('home-badge', homeBadgeSmallStyle)}>HOME</span>}
                            {isLocalRink && <span className={cx('local-badge', localBadgeSmallStyle)}>LOCAL</span>}
                        </span>
                    )}
                </span>
                {!isPlaceholder && (
                    <span 
                        className={cx('game-time', timeStyle)} 
                        style={isPastGame ? { 
                            fontWeight: 'bold', 
                            color: won ? '#4ade80' : '#f87171' 
                        } : undefined}
                    >
                        {isPastGame ? `${won ? 'W' : 'L'} ${ourScore}-${theirScore}` : game.game_time_format_pretty}
                    </span>
                )}
            </div>

            {/* Accordion Content */}
            {isExpanded && !isPlaceholder && (
                <div>
                    <GameCard title="" game={game} isHome={isHomeGame} />
                </div>
            )}
        </div>
    );
}
