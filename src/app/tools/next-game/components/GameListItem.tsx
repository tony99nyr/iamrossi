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
    // Check both possible field name variations from MHR
    const gameWithLegacyFields = game as Game & { game_home_score?: number; game_visitor_score?: number; _statSessionIsHomeGame?: boolean };
    const homeScore = game.home_team_score ?? gameWithLegacyFields.game_home_score;
    const visitorScore = game.visitor_team_score ?? gameWithLegacyFields.game_visitor_score;
    
    // If we have stat session metadata about which team is "us", use that
    // Otherwise fall back to the isHomeGame prop
    const effectiveIsHomeGame = gameWithLegacyFields._statSessionIsHomeGame !== undefined 
        ? gameWithLegacyFields._statSessionIsHomeGame 
        : isHomeGame;
    
    const ourScore = isPastGame && effectiveIsHomeGame ? homeScore : visitorScore;
    const theirScore = isPastGame && effectiveIsHomeGame ? visitorScore : homeScore;
    
    // Check if scores are valid (both defined and not invalid placeholders)
    // Reject 0-0 and 999-999 as invalid placeholders
    const hasValidScores = isPastGame && 
        ourScore !== undefined && 
        theirScore !== undefined &&
        typeof ourScore === 'number' &&
        typeof theirScore === 'number' &&
        !(ourScore === 0 && theirScore === 0) && // Not 0-0 placeholder
        !(ourScore === 999 && theirScore === 999) && // Not 999-999 placeholder
        ourScore >= 0 && ourScore <= 50 && // Reasonable range
        theirScore >= 0 && theirScore <= 50;
    
    const won = hasValidScores && ourScore > theirScore;

    const opponentName = isHomeGame ? game.visitor_team_name : game.home_team_name;
    // For past games, don't show "@ " prefix - just show opponent name
    const displayOpponent = isPlaceholder 
        ? (game.placeholderLabel || 'Event')
        : (isPastGame ? opponentName : (isHomeGame ? opponentName : '@ ' + opponentName));

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
                    {!isPlaceholder && !isPastGame && (
                        <span className={cx('badges-container', badgesContainerStyle)}>
                            {isHomeGame && <span className={cx('home-badge', homeBadgeSmallStyle)}>HOME</span>}
                            {isLocalRink && <span className={cx('local-badge', localBadgeSmallStyle)}>LOCAL</span>}
                        </span>
                    )}
                </span>
                {!isPlaceholder && (
                    <span 
                        className={cx('game-time', timeStyle)} 
                        style={isPastGame && hasValidScores ? { 
                            fontWeight: 'bold', 
                            color: won ? '#4ade80' : '#f87171' 
                        } : undefined}
                    >
                        {isPastGame && hasValidScores 
                            ? `${won ? 'W' : 'L'} ${ourScore}-${theirScore}` 
                            : game.game_time_format_pretty}
                    </span>
                )}
            </div>


            {/* Accordion Content */}
            {isExpanded && !isPlaceholder && (
                <div>
                    <GameCard title="" game={game} isHome={isHomeGame} isPastGame={isPastGame} />
                </div>
            )}
        </div>
    );
}
