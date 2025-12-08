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
    
    // Check if dates are valid
    if (isNaN(gameDateObj.getTime()) || isNaN(sessionDateObj.getTime())) {
      return false;
    }
    
    // Compare dates only (ignore time) - use YYYY-MM-DD format for reliable comparison
    const gameDateStr = gameDateObj.toISOString().split('T')[0];
    const sessionDateStr = sessionDateObj.toISOString().split('T')[0];
    
    return gameDateStr === sessionDateStr;
  } catch {
    return false;
  }
}

/**
 * Finds a matching stat session for a game
 */
function findMatchingStatSession(game: Game, statSessions: StatSession[], ourTeamName: string): StatSession | null {
  // First try to match by gameId (most reliable)
  if (game.game_nbr !== undefined && game.game_nbr !== null) {
    const gameNbr = String(game.game_nbr);
    const gameIdMatch = statSessions.find(session => {
      if (!session.gameId) return false;
      // Handle both string and number gameIds
      const sessionGameId = String(session.gameId).trim();
      return sessionGameId === gameNbr;
    });
    if (gameIdMatch) {
      console.log(`[Stat Session Match] ✅ Found by gameId: game_nbr=${game.game_nbr}, sessionId=${gameIdMatch.id}, opponent=${gameIdMatch.opponent}`);
      return gameIdMatch;
    } else {
      // Log available gameIds for debugging
      const sessionsWithGameIds = statSessions.filter(s => s.gameId).map(s => ({ id: s.id, gameId: s.gameId, opponent: s.opponent }));
      if (sessionsWithGameIds.length > 0) {
        console.log(`[Stat Session Match] ⚠️ No match by gameId for game_nbr=${game.game_nbr}. Available gameIds:`, sessionsWithGameIds);
      }
    }
  }
  
  // Then try to match by date and opponent
  const gameDate = game.game_date_format || game.game_date;
  if (!gameDate) return null;
  
  // Check both home and visitor team names to find the opponent
  const homeTeamName = game.home_team_name;
  const visitorTeamName = game.visitor_team_name;
  
  const match = statSessions.find(session => {
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
  });
  
  if (match) {
    console.log(`[Stat Session Match] ✅ Found by date/opponent: gameDate=${gameDate}, game_nbr=${game.game_nbr}, opponent=${match.opponent}, sessionId=${match.id}`);
  } else {
    // Log potential matches for debugging
    const dateMatches = statSessions.filter(s => datesMatch(gameDate, s.date));
    if (dateMatches.length > 0) {
      console.log(`[Stat Session Match] ⚠️ Date matches but no opponent match for game_nbr=${game.game_nbr}, date=${gameDate}. Date-matched sessions:`, dateMatches.map(s => ({ id: s.id, opponent: s.opponent, gameId: s.gameId })));
    }
  }
  
  return match || null;
}

/**
 * Enriches past games with scores from stat sessions when MHR scores are invalid
 */
export function enrichPastGamesWithStatScores(
  games: Game[], 
  statSessions: StatSession[],
  ourTeamName: string
): Game[] {
  console.log(`[Stat Session Enrichment] Processing ${games.length} games with ${statSessions.length} stat sessions`);
  
  // Track which stat sessions have been used to prevent multiple games from using the same session
  const usedSessionIds = new Set<string>();
  
  return games.map(game => {
    // Check both possible field name variations from MHR
    const gameWithLegacyFields = game as Game & { game_home_score?: number; game_visitor_score?: number };
    const homeScore = game.home_team_score ?? gameWithLegacyFields.game_home_score;
    const visitorScore = game.visitor_team_score ?? gameWithLegacyFields.game_visitor_score;
    
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
    
    // Try to find a matching stat session (excluding already used ones)
    const availableSessions = statSessions.filter(s => !usedSessionIds.has(s.id));
    const matchingSession = findMatchingStatSession(game, availableSessions, ourTeamName);
    
    if (!matchingSession) {
      // No stat session found - remove invalid scores (0-0, 999-999) so they don't display
      if (isInvalidPlaceholder || isMissing) {
        console.log(`[Stat Session Match] No match found for game: game_nbr=${game.game_nbr}, date=${game.game_date_format || game.game_date}, opponent=${game.home_team_name} vs ${game.visitor_team_name}`);
        return {
          ...game,
          home_team_score: undefined,
          visitor_team_score: undefined,
        };
      }
      // Keep original game as-is (preserves any existing valid scores)
      return game;
    }
    
    // Mark this session as used
    usedSessionIds.add(matchingSession.id);
    
    // Extract scores from stat session
    const usGoals = matchingSession.usStats.goals;
    const themGoals = matchingSession.themStats.goals;
    
    console.log(`[Stat Session Match] Using scores from session: sessionId=${matchingSession.id}, usGoals=${usGoals}, themGoals=${themGoals}, opponent=${matchingSession.opponent}`);
    
    // Determine which team is "us" by checking which team name matches
    // First try using the stat session's ourTeamName if available
    const sessionOurTeamName = matchingSession.ourTeamName || ourTeamName;
    let isHomeGame = teamNamesMatch(game.home_team_name, sessionOurTeamName);
    
    // Also check the opponent field - if opponent matches visitor, we're home; if opponent matches home, we're visitor
    const opponentMatchesVisitor = teamNamesMatch(matchingSession.opponent, game.visitor_team_name);
    const opponentMatchesHome = teamNamesMatch(matchingSession.opponent, game.home_team_name);
    
    if (opponentMatchesVisitor) {
      // Opponent is visitor, so we're home
      isHomeGame = true;
    } else if (opponentMatchesHome) {
      // Opponent is home, so we're visitor
      isHomeGame = false;
    }
    // Otherwise fall back to team name matching
    
    // Map stat session scores to home/visitor correctly
    // If we're home, usGoals goes to home, themGoals goes to visitor
    // If we're visitor, usGoals goes to visitor, themGoals goes to home
    const enrichedHomeScore = isHomeGame ? usGoals : themGoals;
    const enrichedVisitorScore = isHomeGame ? themGoals : usGoals;
    
    console.log(`[Stat Session Match] Team mapping: sessionOurTeamName=${sessionOurTeamName}, opponent=${matchingSession.opponent}, isHomeGame=${isHomeGame}, homeTeam=${game.home_team_name}, visitorTeam=${game.visitor_team_name}, enrichedHome=${enrichedHomeScore}, enrichedVisitor=${enrichedVisitorScore}`);
    
    // Use stat session scores if they're valid, otherwise keep original scores
    if (hasValidScores(enrichedHomeScore, enrichedVisitorScore)) {
      console.log(`[Stat Session Match] Applied scores: home=${enrichedHomeScore}, visitor=${enrichedVisitorScore}, isHomeGame=${isHomeGame}`);
      // Store which team is "us" in the game object so GameListItem can use it correctly
      return {
        ...game,
        home_team_score: enrichedHomeScore,
        visitor_team_score: enrichedVisitorScore,
        // Store metadata about which team is "us" based on stat session
        _statSessionIsHomeGame: isHomeGame,
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

