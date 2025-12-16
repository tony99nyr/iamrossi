import { Game } from '@/types';

export interface RatingMathRow {
    date: string;
    opponent: string;
    result: 'W' | 'L' | 'T';
    score: string;
    goalDifferential: number;
    opponentRating: number | null;
    points: number | null;
    performanceDiff: number | null;
}

export interface RatingMathSummary {
    rows: RatingMathRow[];
    totals: {
        wins: number;
        losses: number;
        ties: number;
        goalsFor: number;
        goalsAgainst: number;
        goalDifferential: number;
        opponentRatingSum: number;
        pointsSum: number;
        performanceDiffSum: number;
    };
    averages: {
        goalDifferential: number;
        opponentRating: number;
        points: number;
        performanceDiff: number;
    };
}

/**
 * Calculate goal differential, capped at ±7 per MHR rules
 */
export function calculateGoalDifferential(ourScore: number, theirScore: number): number {
    const diff = ourScore - theirScore;
    // Cap at ±7 as per MHR rules
    return Math.max(-7, Math.min(7, diff));
}

/**
 * Calculate expected goal differential based on rating difference
 * Each whole number difference in rating equals 1 goal
 */
export function calculateExpectedGoalDifferential(ourRating: number, opponentRating: number): number {
    const ratingDiff = ourRating - opponentRating;
    return Math.round(ratingDiff);
}

/**
 * Calculate performance differential (+/-)
 * This is the difference between actual and expected goal differential
 */
export function calculatePerformanceDifferential(
    actualGD: number,
    expectedGD: number
): number {
    return actualGD - expectedGD;
}

/**
 * Calculate "Points" - this appears to be our team's rating at the time of the game
 * For now, we'll use the current rating, but this could be enhanced to track rating progression
 */
export function calculatePoints(
    ourRating: number | null,
    opponentRating: number | null,
    actualGD: number
): number | null {
    if (ourRating === null || opponentRating === null) {
        return null;
    }
    
    // Based on MHR formula: Points = Opponent Rating + Actual Goal Differential
    // This gives us the "effective rating" for this game
    return opponentRating + actualGD;
}

/**
 * Determine game result (W/L/T) from scores
 */
export function getGameResult(ourScore: number, theirScore: number): 'W' | 'L' | 'T' {
    if (ourScore > theirScore) return 'W';
    if (ourScore < theirScore) return 'L';
    return 'T';
}

/**
 * Format date for display (e.g., "Aug 29", "Oct 24")
 */
export function formatGameDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    
    try {
        // Parse date components directly to avoid timezone issues
        let year: number, month: number, day: number;
        
        if (dateStr.includes('/')) {
            // Format: "10/24/2025" or "2025/10/24"
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    // ISO-like: 2025/10/24
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10) - 1; // 0-indexed
                    day = parseInt(parts[2], 10);
                } else {
                    // US format: 10/24/2025
                    year = parseInt(parts[2], 10);
                    month = parseInt(parts[0], 10) - 1; // 0-indexed
                    day = parseInt(parts[1], 10);
                }
            } else {
                return dateStr;
            }
        } else if (dateStr.includes('-')) {
            // Format: "2025-10-24"
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10) - 1; // 0-indexed
                day = parseInt(parts[2], 10);
            } else {
                return dateStr;
            }
        } else {
            return dateStr;
        }
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            return dateStr;
        }
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[month];
        return `${monthName} ${day}`;
    } catch {
        return dateStr;
    }
}

/**
 * Calculate rating math for all past games
 */
export function calculateRatingMath(
    games: Game[],
    ourTeamId: string,
    ourCurrentRating: number | null
): RatingMathSummary {
    const rows: RatingMathRow[] = [];
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let goalDifferentialSum = 0;
    let opponentRatingSum = 0;
    let pointsSum = 0;
    let performanceDiffSum = 0;
    let gamesWithRatings = 0;
    let gamesWithPoints = 0;
    let gamesWithPerformance = 0;

    for (const game of games) {
        // Determine if we're home or away
        const isHome = String(game.game_home_team) === String(ourTeamId);
        
        // Get scores
        const gameWithScores = game as Game & { game_home_score?: number; game_visitor_score?: number };
        const homeScore = game.home_team_score ?? gameWithScores.game_home_score ?? null;
        const visitorScore = game.visitor_team_score ?? gameWithScores.game_visitor_score ?? null;
        
        if (homeScore === null || visitorScore === null) {
            continue; // Skip games without scores
        }
        
        const ourScore = isHome ? homeScore : visitorScore;
        const theirScore = isHome ? visitorScore : homeScore;
        
        // Get ratings
        const ourRating = isHome 
            ? (game.home_team_rating ? parseFloat(String(game.home_team_rating)) : null)
            : (game.visitor_team_rating ? parseFloat(String(game.visitor_team_rating)) : null);
        const opponentRating = isHome
            ? (game.visitor_team_rating ? parseFloat(String(game.visitor_team_rating)) : null)
            : (game.home_team_rating ? parseFloat(String(game.home_team_rating)) : null);
        
        // Calculate metrics
        const goalDiff = calculateGoalDifferential(ourScore, theirScore);
        const expectedGD = (ourRating !== null && opponentRating !== null)
            ? calculateExpectedGoalDifferential(ourRating, opponentRating)
            : null;
        const performanceDiff = expectedGD !== null
            ? calculatePerformanceDifferential(goalDiff, expectedGD)
            : null;
        
        // Calculate points (using current rating for now, could be enhanced to track progression)
        const points = calculatePoints(ourRating || ourCurrentRating, opponentRating, goalDiff);
        
        // Get opponent name
        const opponentName = isHome ? game.visitor_team_name : game.home_team_name;
        
        // Format date
        const dateStr = formatGameDate(game.game_date_format || game.game_date);
        
        // Get result
        const result = getGameResult(ourScore, theirScore);
        
        rows.push({
            date: dateStr,
            opponent: opponentName || 'Unknown',
            result,
            score: `${ourScore}-${theirScore}`,
            goalDifferential: goalDiff,
            opponentRating,
            points,
            performanceDiff,
        });
        
        // Update totals
        if (result === 'W') wins++;
        else if (result === 'L') losses++;
        else ties++;
        
        goalsFor += ourScore;
        goalsAgainst += theirScore;
        goalDifferentialSum += goalDiff;
        
        if (opponentRating !== null) {
            opponentRatingSum += opponentRating;
            gamesWithRatings++;
        }
        
        if (points !== null) {
            pointsSum += points;
            gamesWithPoints++;
        }
        
        if (performanceDiff !== null) {
            performanceDiffSum += performanceDiff;
            gamesWithPerformance++;
        }
    }

    // Calculate averages
    const gameCount = rows.length;
    const averages = {
        goalDifferential: gameCount > 0 ? goalDifferentialSum / gameCount : 0,
        opponentRating: gamesWithRatings > 0 ? opponentRatingSum / gamesWithRatings : 0,
        points: gamesWithPoints > 0 ? pointsSum / gamesWithPoints : 0,
        performanceDiff: gamesWithPerformance > 0 ? performanceDiffSum / gamesWithPerformance : 0,
    };

    return {
        rows,
        totals: {
            wins,
            losses,
            ties,
            goalsFor,
            goalsAgainst,
            goalDifferential: goalDifferentialSum,
            opponentRatingSum,
            pointsSum,
            performanceDiffSum,
        },
        averages,
    };
}

