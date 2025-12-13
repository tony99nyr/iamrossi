import { describe, it, expect } from 'vitest';
import type { Game } from '@/types';
import { hasValidFinalScore, getNormalizedGameScore } from '@/lib/game-scores';

describe('game-scores', () => {
  it('accepts normal scores (including shutouts)', () => {
    const g: Game = {
      game_date: '2025-12-13',
      game_time: '09:45:00',
      home_team_name: 'Us',
      visitor_team_name: 'Them',
      rink_name: 'Rink',
      home_team_score: 0,
      visitor_team_score: 3,
    };

    expect(hasValidFinalScore(g)).toBe(true);
  });

  it('rejects 0-0 placeholder', () => {
    const g: Game = {
      game_date: '2025-12-13',
      game_time: '09:45:00',
      home_team_name: 'Us',
      visitor_team_name: 'Them',
      rink_name: 'Rink',
      home_team_score: 0,
      visitor_team_score: 0,
    };

    expect(hasValidFinalScore(g)).toBe(false);
  });

  it('rejects 999-999 placeholder', () => {
    const g: Game = {
      game_date: '2025-12-13',
      game_time: '09:45:00',
      home_team_name: 'Us',
      visitor_team_name: 'Them',
      rink_name: 'Rink',
      home_team_score: 999,
      visitor_team_score: 999,
    };

    expect(hasValidFinalScore(g)).toBe(false);
  });

  it('supports legacy MHR score fields', () => {
    const g = {
      game_date: '2025-12-13',
      game_time: '09:45:00',
      home_team_name: 'Us',
      visitor_team_name: 'Them',
      rink_name: 'Rink',
      game_home_score: 4,
      game_visitor_score: 2,
    } as unknown as Game;

    expect(getNormalizedGameScore(g)).toEqual({ homeScore: 4, visitorScore: 2 });
    expect(hasValidFinalScore(g)).toBe(true);
  });
});

