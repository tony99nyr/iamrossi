import { describe, it, expect } from 'vitest';
import type { Game, StatSession } from '@/types';
import { enrichPastGamesWithStatScores } from '@/lib/enrich-game-scores';

describe('enrichPastGamesWithStatScores', () => {
  it('fills missing/placeholder MHR scores from a matching stat session', () => {
    const ourTeamName = 'Carolina Junior Canes (Black) 10U AA';

    const games: Game[] = [
      {
        game_nbr: '123',
        game_date: '2025-12-13',
        game_time: '09:45:00',
        game_date_format: '2025-12-13',
        game_time_format: '09:45:00',
        home_team_name: ourTeamName,
        visitor_team_name: 'Phoenix Coyotes AAA',
        rink_name: 'Rink',
        home_team_score: 0,
        visitor_team_score: 0, // placeholder
      },
    ];

    const sessions: StatSession[] = [
      {
        id: 's1',
        date: '2025-12-13T14:45:00.000Z',
        opponent: 'Phoenix Coyotes AAA',
        recorderName: 'test',
        usStats: { goals: 4, shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0 },
        themStats: { goals: 3, shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0 },
        events: [],
        isCustomGame: false,
        startTime: new Date('2025-12-13T14:45:00.000Z').getTime(),
      },
    ];

    const result = enrichPastGamesWithStatScores(games, sessions, ourTeamName);
    expect(result[0].home_team_score).toBe(4);
    expect(result[0].visitor_team_score).toBe(3);
  });

  it('uses scheduledGameDate when present to match sessions to games', () => {
    const ourTeamName = 'Carolina Junior Canes (Black) 10U AA';

    const games: Game[] = [
      {
        game_nbr: '999',
        game_date: '2025-12-13',
        game_time: '09:45:00',
        game_date_format: '2025-12-13',
        game_time_format: '09:45:00',
        home_team_name: ourTeamName,
        visitor_team_name: 'Opponent',
        rink_name: 'Rink',
        home_team_score: undefined,
        visitor_team_score: undefined,
      },
    ];

    const sessions: StatSession[] = [
      {
        id: 's2',
        // intentionally "different day" in UTC to prove we key off scheduledGameDate
        date: '2025-12-14T00:10:00.000Z',
        scheduledGameDate: '2025-12-13',
        opponent: 'Opponent',
        recorderName: 'test',
        usStats: { goals: 2, shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0 },
        themStats: { goals: 1, shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0 },
        events: [],
        isCustomGame: false,
        startTime: new Date('2025-12-14T00:10:00.000Z').getTime(),
      },
    ];

    const result = enrichPastGamesWithStatScores(games, sessions, ourTeamName);
    expect(result[0].home_team_score).toBe(2);
    expect(result[0].visitor_team_score).toBe(1);
  });
});

