import { describe, it, expect } from 'vitest';
import type { Game } from '@/types';
import { EASTERN_TIME_ZONE } from '@/lib/timezone';
import { mergeScheduleCandidates } from '@/lib/next-game/merge-schedule-candidates';

describe('mergeScheduleCandidates', () => {
  it('prefers calendar home/away (override) over raw MHR when duplicates exist', () => {
    const teamName = 'Carolina Junior Canes (Black) 10U AA';
    const mhrTeamId = '19758';
    const opponentId = '55555';

    // Raw MHR says we're HOME (incorrect for this regression scenario).
    const mhrGame: Game = {
      game_nbr: 123456,
      game_date: '2025-12-13',
      game_time: '6:30 PM',
      home_team_name: teamName,
      visitor_team_name: 'Ohio Blue Jackets',
      game_home_team: mhrTeamId,
      game_visitor_team: opponentId,
      rink_name: 'Some Arena',
    };

    // Calendar override says we're AWAY (home team is opponent).
    const calendarGame: Game = {
      game_nbr: 'deadbeef',
      game_date: '2025-12-13',
      game_time: '18:30:00',
      game_date_format: '2025-12-13',
      game_time_format: '18:30:00',
      home_team_name: 'Ohio Blue Jackets',
      visitor_team_name: teamName,
      rink_name: 'Some Arena',
      source: 'calendar' as unknown as Game['source'],
    };

    const merged = mergeScheduleCandidates([mhrGame], [calendarGame], {
      mhrTeamId,
      teamName,
      timeZone: EASTERN_TIME_ZONE,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].home_team_name).toBe('Ohio Blue Jackets');
    expect(merged[0].visitor_team_name).toBe(teamName);

    // Critical for UI: isHomeGame is computed via game_home_team === mhrTeamId.
    expect(String(merged[0].game_home_team)).toBe(opponentId);
    expect(String(merged[0].game_visitor_team)).toBe(mhrTeamId);

    // Prefer MHR game_nbr for linking when calendar had a short hash.
    expect(merged[0].game_nbr).toBe(123456);
  });

  it('merges even when MHR time is in a weird but common format (e.g. "18:30 PM")', () => {
    const teamName = 'Carolina Junior Canes (Black) 10U AA';
    const mhrTeamId = '19758';
    const opponentId = '55555';

    // MHR source occasionally provides 24h time plus AM/PM. Treat it as 24h.
    const mhrGame: Game = {
      game_nbr: 999001,
      game_date: '2025-12-13',
      game_time: '18:30 PM',
      home_team_name: teamName,
      visitor_team_name: 'Rangers',
      game_home_team: mhrTeamId,
      game_visitor_team: opponentId,
      rink_name: 'Some Arena',
    };

    // Calendar override says we're away.
    const calendarGame: Game = {
      game_nbr: 'deadbeef',
      game_date: '2025-12-13',
      game_time: '18:30:00',
      game_date_format: '2025-12-13',
      game_time_format: '18:30:00',
      home_team_name: 'Rangers',
      visitor_team_name: teamName,
      rink_name: 'Some Arena',
      source: 'calendar' as unknown as Game['source'],
    };

    const merged = mergeScheduleCandidates([mhrGame], [calendarGame], {
      mhrTeamId,
      teamName,
      timeZone: EASTERN_TIME_ZONE,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].home_team_name).toBe('Rangers');
    expect(merged[0].visitor_team_name).toBe(teamName);
    expect(merged[0].game_nbr).toBe(999001);
  });
});

