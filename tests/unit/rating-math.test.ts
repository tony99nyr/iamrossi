import { describe, it, expect } from 'vitest';
import {
    calculateGoalDifferential,
    calculateExpectedGoalDifferential,
    calculatePerformanceDifferential,
    calculatePoints,
    getGameResult,
    formatGameDate,
    calculateRatingMath,
} from '@/lib/next-game/rating-math';
import type { Game } from '@/types';

describe('rating-math', () => {
    describe('calculateGoalDifferential', () => {
        it('should calculate positive goal differential', () => {
            expect(calculateGoalDifferential(5, 2)).toBe(3);
            expect(calculateGoalDifferential(10, 1)).toBe(7); // Capped at 7
        });

        it('should calculate negative goal differential', () => {
            expect(calculateGoalDifferential(2, 5)).toBe(-3);
            expect(calculateGoalDifferential(1, 10)).toBe(-7); // Capped at -7
        });

        it('should cap goal differential at ±7', () => {
            expect(calculateGoalDifferential(20, 1)).toBe(7);
            expect(calculateGoalDifferential(1, 20)).toBe(-7);
            expect(calculateGoalDifferential(8, 0)).toBe(7);
            expect(calculateGoalDifferential(0, 8)).toBe(-7);
        });

        it('should handle tie games', () => {
            expect(calculateGoalDifferential(3, 3)).toBe(0);
        });
    });

    describe('calculateExpectedGoalDifferential', () => {
        it('should calculate expected GD from rating difference', () => {
            // 93.0 vs 91.0 = 2.0 rating diff = 2 goal expected
            expect(calculateExpectedGoalDifferential(93.0, 91.0)).toBe(2);
            
            // 91.3 vs 89.6 = 1.7 rating diff = 2 goal expected (rounded)
            expect(calculateExpectedGoalDifferential(91.3, 89.6)).toBe(2);
            
            // 89.0 vs 91.0 = -2.0 rating diff = -2 goal expected
            expect(calculateExpectedGoalDifferential(89.0, 91.0)).toBe(-2);
        });

        it('should round rating differences correctly', () => {
            expect(calculateExpectedGoalDifferential(91.3, 91.3)).toBe(0);
            expect(calculateExpectedGoalDifferential(91.6, 91.3)).toBe(0); // 0.3 rounds to 0
            expect(calculateExpectedGoalDifferential(92.0, 91.3)).toBe(1); // 0.7 rounds to 1
            expect(calculateExpectedGoalDifferential(92.5, 91.3)).toBe(1); // 1.2 rounds to 1
            expect(calculateExpectedGoalDifferential(93.0, 91.3)).toBe(2); // 1.7 rounds to 2
        });
    });

    describe('calculatePerformanceDifferential', () => {
        it('should calculate positive performance when exceeding expectations', () => {
            // Expected: 2 goals, Actual: 5 goals = +3 better than expected
            expect(calculatePerformanceDifferential(5, 2)).toBe(3);
        });

        it('should calculate negative performance when underperforming', () => {
            // Expected: 2 goals, Actual: 0 goals = -2 worse than expected
            expect(calculatePerformanceDifferential(0, 2)).toBe(-2);
        });

        it('should show zero when meeting expectations', () => {
            expect(calculatePerformanceDifferential(2, 2)).toBe(0);
        });

        it('should handle negative expected values', () => {
            // Expected: -2 goals (we're underdogs), Actual: 1 goal = +3 better
            expect(calculatePerformanceDifferential(1, -2)).toBe(3);
        });
    });

    describe('calculatePoints', () => {
        it('should calculate points from opponent rating and goal differential', () => {
            // Opponent: 89.0, GD: +3 = 92.0 points
            expect(calculatePoints(91.3, 89.0, 3)).toBe(92.0);
            
            // Opponent: 91.0, GD: -2 = 89.0 points
            expect(calculatePoints(91.3, 91.0, -2)).toBe(89.0);
        });

        it('should return null when ratings are missing', () => {
            expect(calculatePoints(null, 89.0, 3)).toBeNull();
            expect(calculatePoints(91.3, null, 3)).toBeNull();
            expect(calculatePoints(null, null, 3)).toBeNull();
        });

        it('should handle capped goal differentials', () => {
            // Even if actual GD is capped at 7, points should use the capped value
            expect(calculatePoints(91.3, 85.0, 7)).toBe(92.0);
            expect(calculatePoints(91.3, 95.0, -7)).toBe(88.0);
        });
    });

    describe('getGameResult', () => {
        it('should return W for wins', () => {
            expect(getGameResult(5, 2)).toBe('W');
            expect(getGameResult(10, 0)).toBe('W');
        });

        it('should return L for losses', () => {
            expect(getGameResult(2, 5)).toBe('L');
            expect(getGameResult(0, 10)).toBe('L');
        });

        it('should return T for ties', () => {
            expect(getGameResult(3, 3)).toBe('T');
            expect(getGameResult(0, 0)).toBe('T');
        });
    });

    describe('formatGameDate', () => {
        it('should format US date format correctly', () => {
            expect(formatGameDate('10/24/2025')).toBe('Oct 24');
            expect(formatGameDate('8/29/2025')).toBe('Aug 29');
            expect(formatGameDate('12/15/2025')).toBe('Dec 15');
        });

        it('should format ISO date format correctly', () => {
            expect(formatGameDate('2025-10-24')).toBe('Oct 24');
            expect(formatGameDate('2025-08-29')).toBe('Aug 29');
        });

        it('should handle invalid dates gracefully', () => {
            expect(formatGameDate('invalid')).toBe('invalid');
            expect(formatGameDate('')).toBe('');
            expect(formatGameDate(undefined)).toBe('');
        });
    });

    describe('calculateRatingMath', () => {
        const ourTeamId = '19758';
        const ourCurrentRating = 91.3;

        function createGame(overrides: Partial<Game> = {}): Game {
            return {
                game_nbr: '12345',
                game_date: '2025-10-24',
                game_date_format: '10/24/2025',
                game_time: '7:00 PM',
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Opponent Team',
                game_home_team: ourTeamId,
                game_visitor_team: '20001',
                home_team_score: 5,
                visitor_team_score: 2,
                home_team_rating: '91.3',
                visitor_team_rating: '89.0',
                ...overrides,
            } as Game;
        }

        it('should calculate rating math for a single game', () => {
            const games = [createGame()];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.rows).toHaveLength(1);
            const row = result.rows[0];
            expect(row.date).toBe('Oct 24');
            expect(row.opponent).toBe('Opponent Team');
            expect(row.result).toBe('W');
            expect(row.score).toBe('5-2');
            expect(row.goalDifferential).toBe(3);
            expect(row.opponentRating).toBe(89.0);
            expect(row.points).toBe(92.0); // 89.0 + 3
            expect(row.performanceDiff).toBe(1); // Actual 3 - Expected 2 (91.3 - 89.0 = 2.3 rounded to 2)
        });

        it('should handle away games correctly', () => {
            const games = [createGame({
                game_home_team: '20001',
                game_visitor_team: ourTeamId,
                home_team_name: 'Opponent Team',
                visitor_team_name: 'Jr Canes 10U Black',
                home_team_score: 2,
                visitor_team_score: 5,
                home_team_rating: '89.0',
                visitor_team_rating: '91.3',
            })];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.rows).toHaveLength(1);
            const row = result.rows[0];
            expect(row.result).toBe('W');
            expect(row.score).toBe('5-2');
            expect(row.goalDifferential).toBe(3);
            expect(row.opponentRating).toBe(89.0);
        });

        it('should calculate totals correctly', () => {
            const games = [
                createGame({ home_team_score: 5, visitor_team_score: 2 }), // W
                createGame({ 
                    game_nbr: '12346',
                    home_team_score: 2, 
                    visitor_team_score: 5,
                    visitor_team_rating: '95.0',
                }), // L
                createGame({ 
                    game_nbr: '12347',
                    home_team_score: 3, 
                    visitor_team_score: 3,
                    visitor_team_rating: '90.0',
                }), // T
            ];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.totals.wins).toBe(1);
            expect(result.totals.losses).toBe(1);
            expect(result.totals.ties).toBe(1);
            expect(result.totals.goalsFor).toBe(10); // 5 + 2 + 3
            expect(result.totals.goalsAgainst).toBe(10); // 2 + 5 + 3
            expect(result.totals.goalDifferential).toBe(0); // 3 + (-3) + 0
        });

        it('should calculate averages correctly', () => {
            const games = [
                createGame({ visitor_team_rating: '89.0' }),
                createGame({ 
                    game_nbr: '12346',
                    visitor_team_rating: '91.0',
                }),
            ];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.averages.opponentRating).toBe(90.0); // (89.0 + 91.0) / 2
        });

        it('should cap goal differential at ±7', () => {
            const games = [createGame({
                home_team_score: 20,
                visitor_team_score: 1,
            })];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.rows[0].goalDifferential).toBe(7);
            expect(result.rows[0].points).toBe(96.0); // 89.0 + 7
        });

        it('should skip games without scores', () => {
            const games = [
                createGame(),
                createGame({
                    game_nbr: '12346',
                    home_team_score: undefined,
                    visitor_team_score: undefined,
                }),
            ];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.rows).toHaveLength(1);
        });

        it('should handle missing ratings gracefully', () => {
            const games = [createGame({
                visitor_team_rating: undefined,
            })];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.rows[0].opponentRating).toBeNull();
            expect(result.rows[0].points).toBeNull();
            expect(result.rows[0].performanceDiff).toBeNull();
        });

        it('should format dates correctly in results', () => {
            const games = [
                createGame({ game_date_format: '8/29/2025' }),
                createGame({ game_nbr: '12346', game_date_format: '10/24/2025' }),
                createGame({ game_nbr: '12347', game_date_format: '12/15/2025' }),
            ];
            const result = calculateRatingMath(games, ourTeamId, ourCurrentRating);

            expect(result.rows[0].date).toBe('Aug 29');
            expect(result.rows[1].date).toBe('Oct 24');
            expect(result.rows[2].date).toBe('Dec 15');
        });
    });
});

