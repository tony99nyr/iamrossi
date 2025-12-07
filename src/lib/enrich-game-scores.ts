import { Game, StatSession } from '@/types';

/**
 * Validates if a score is valid (not a placeholder or invalid value)
 */
function isValidScore(score: number | undefined | null): boolean {
  if (score === undefined || score === null) return false;
  if (typeof score !== 'number') return false;
  if (score < 0 || score > 50) return false; // Reasonable range for hockey scores
  return true;
}

/**
 * Validates if both scores are valid and not placeholder values
 */
function hasValidScores(homeScore: number | undefined | null, visitorScore: number | undefined | null): boolean {
  if (!isValidScore(homeScore) || !isValidScore(visitorScore)) return false;
  
  // Reject clearly invalid placeholder values
  if (homeScore === 999 && visitorScore === 999) return false; // 999-999 is clearly placeholder
  if (homeScore === 0 && visitorScore === 0) return false; // 0-0 is likely a placeholder when MHR doesn't have scores yet
  
  return true;
}

/**
 * Normalizes team names for matching (removes special chars, lowercases)
 */
function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if two team names match (with normalization)
 */
function teamNamesMatch(name1: string, name2: string): boolean {
  const normalized1 = normalizeTeamName(name1);
  const normalized2 = normalizeTeamName(name2);
  
  // Check if one contains the other or they're equal
  return normalized1 === normalized2 || 
         normalized1.includes(normalized2) || 
         normalized2.includes(normalized1);
}

/**
 * Checks if a game date matches a stat session date
 */
function datesMatch(gameDate: string, sessionDate: string): boolean {
  try {
    const gameDateObj = new Date(gameDate);
    const sessionDateObj = new Date(sessionDate);
    
    // Compare dates only (ignore time)
    return gameDateObj.toDateString() === sessionDateObj.toDateString();
  } catch {
    return false;
  }
}

/**
 * Finds a matching stat session for a game
 */
function findMatchingStatSession(game: Game, statSessions: StatSession[], ourTeamName: string): StatSession | null {
  // First try to match by gameId
  if (game.game_nbr !== undefined) {
    const gameIdMatch = statSessions.find(session => 
      session.gameId && String(session.gameId) === String(game.game_nbr)
    );
    if (gameIdMatch) return gameIdMatch;
  }
  
  // Then try to match by date and opponent
  const gameDate = game.game_date_format || game.game_date;
  if (!gameDate) return null;
  
  // Check both home and visitor team names to find the opponent
  const homeTeamName = game.home_team_name;
  const visitorTeamName = game.visitor_team_name;
  
  return statSessions.find(session => {
    if (!datesMatch(gameDate, session.date)) return false;
    
    // Check if session opponent matches the opponent team name in the game
    const sessionOpponent = session.opponent;
    
    // Determine which team is the opponent (the one that's not our team)
    const isHomeGame = teamNamesMatch(homeTeamName || '', ourTeamName);
    const opponentTeamName = isHomeGame ? visitorTeamName : homeTeamName;
    
    // Match session opponent against the game's opponent team
    if (opponentTeamName && teamNamesMatch(sessionOpponent, opponentTeamName)) {
      return true;
    }
    
    // Fallback: try matching against either team name (excluding our team)
    if (homeTeamName && !teamNamesMatch(homeTeamName, ourTeamName)) {
      if (teamNamesMatch(sessionOpponent, homeTeamName)) return true;
    }
    
    if (visitorTeamName && !teamNamesMatch(visitorTeamName, ourTeamName)) {
      if (teamNamesMatch(sessionOpponent, visitorTeamName)) return true;
    }
    
    return false;
  }) || null;
}

/**
 * Enriches past games with scores from stat sessions when MHR scores are invalid
 */
export function enrichPastGamesWithStatScores(
  games: Game[], 
  statSessions: StatSession[],
  ourTeamName: string
): Game[] {
  return games.map(game => {
    // Check both possible field name variations from MHR
    const homeScore = game.home_team_score ?? (game as any).game_home_score;
    const visitorScore = game.visitor_team_score ?? (game as any).game_visitor_score;
    
    // If MHR scores are valid, use them (don't overwrite)
    if (hasValidScores(homeScore, visitorScore)) {
      return game;
    }
    
    // Try stat session fallback if scores are invalid (999-999, 0-0) or missing
    const isInvalidPlaceholder = (homeScore === 999 && visitorScore === 999) || 
                                 (homeScore === 0 && visitorScore === 0);
    const isMissing = (homeScore === undefined || homeScore === null) || 
                      (visitorScore === undefined || visitorScore === null);
    
    // If scores exist and are valid, use them (don't overwrite)
    if (!isInvalidPlaceholder && !isMissing && hasValidScores(homeScore, visitorScore)) {
      return game;
    }
    
    // Try to find a matching stat session
    const matchingSession = findMatchingStatSession(game, statSessions, ourTeamName);
    
    if (!matchingSession) {
      // No stat session found - remove invalid scores (0-0, 999-999) so they don't display
      if (isInvalidPlaceholder || isMissing) {
        return {
          ...game,
          home_team_score: undefined,
          visitor_team_score: undefined,
        };
      }
      // Keep original game as-is (preserves any existing valid scores)
      return game;
    }
    
    // Extract scores from stat session
    const usGoals = matchingSession.usStats.goals;
    const themGoals = matchingSession.themStats.goals;
    
    // Determine if we're home or visitor
    const isHomeGame = teamNamesMatch(game.home_team_name, ourTeamName);
    
    // Map stat session scores to home/visitor
    const enrichedHomeScore = isHomeGame ? usGoals : themGoals;
    const enrichedVisitorScore = isHomeGame ? themGoals : usGoals;
    
    // Use stat session scores if they're valid, otherwise keep original scores
    if (hasValidScores(enrichedHomeScore, enrichedVisitorScore)) {
      return {
        ...game,
        home_team_score: enrichedHomeScore,
        visitor_team_score: enrichedVisitorScore,
      };
    }
    
    // Stat session scores are invalid - only remove if original was 999-999, otherwise keep original
    if (isInvalidPlaceholder) {
      return {
        ...game,
        home_team_score: undefined,
        visitor_team_score: undefined,
      };
    }
    
    // Keep original game as-is
    return game;
  });
}

