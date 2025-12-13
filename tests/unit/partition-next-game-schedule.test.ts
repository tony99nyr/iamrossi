import { describe, it, expect } from 'vitest';
import type { Game } from '@/types';
import { EASTERN_TIME_ZONE } from '@/lib/timezone';
import { partitionNextGameSchedule } from '@/lib/next-game/partition-games';

describe('partitionNextGameSchedule', () => {
  it('moves a same-day morning game into past after grace (no gap)', () => {
    const games: Game[] = [
      {
        game_nbr: 'mhr-1',
        game_date: '2025-12-13',
        game_time: '09:45:00',
        game_date_format: '2025-12-13',
        game_time_format: '09:45:00',
        game_date_format_pretty: 'Sat Dec 13',
        game_time_format_pretty: '9:45 AM',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Phoenix Coyotes AAA',
        rink_name: 'Test Rink',
        home_team_score: 4,
        visitor_team_score: 3,
      },
    ];

    // 12:00pm ET on Dec 13, 2025 (after start+1h grace)
    const now = new Date('2025-12-13T17:00:00.000Z');
    const result = partitionNextGameSchedule(games, now, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });

    expect(result.futureGames).toHaveLength(0);
    expect(result.pastGames).toHaveLength(1);
    expect(result.pastGames[0].visitor_team_name).toContain('Phoenix');
  });

  it('keeps an upcoming later-today game in future', () => {
    const games: Game[] = [
      {
        game_nbr: 'mhr-2',
        game_date: '2025-12-13',
        game_time: '20:00:00',
        game_date_format: '2025-12-13',
        game_time_format: '20:00:00',
        game_date_format_pretty: 'Sat Dec 13',
        game_time_format_pretty: '8:00 PM',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Opponent',
        rink_name: 'Test Rink',
      },
    ];

    // 12:00pm ET on Dec 13, 2025
    const now = new Date('2025-12-13T17:00:00.000Z');
    const result = partitionNextGameSchedule(games, now, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });

    expect(result.futureGames).toHaveLength(1);
    expect(result.pastGames).toHaveLength(0);
  });

  it('keeps placeholder events upcoming until end date passes (plus grace)', () => {
    const games: Game[] = [
      {
        game_nbr: 'ph-1',
        game_date: '2025-12-13',
        game_time: '00:00:00',
        game_date_format: '2025-12-13',
        game_time_format: '00:00:00',
        game_date_format_pretty: 'Dec 13-15',
        game_time_format_pretty: 'TBD',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'TBD',
        rink_name: 'Some Arena',
        isPlaceholder: true,
        placeholderStartDate: '2025-12-13T00:00:00.000Z',
        placeholderEndDate: '2025-12-15T23:59:59.000Z',
      },
    ];

    const nowDuring = new Date('2025-12-14T12:00:00.000Z');
    const nowAfter = new Date('2025-12-16T12:00:00.000Z');

    const during = partitionNextGameSchedule(games, nowDuring, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });
    expect(during.futureGames).toHaveLength(1);
    expect(during.pastGames).toHaveLength(0);

    const after = partitionNextGameSchedule(games, nowAfter, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });
    expect(after.futureGames).toHaveLength(0);
    expect(after.pastGames).toHaveLength(1);
  });

  it('treats TBD-time games as future (so they never disappear)', () => {
    const games: Game[] = [
      {
        game_nbr: 'tbd-1',
        game_date: '2025-12-13',
        game_time: '00:00:00',
        game_date_format: '2025-12-13',
        game_time_format: '00:00:00',
        game_date_format_pretty: 'Sat Dec 13',
        game_time_format_pretty: 'TBD',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Opponent',
        rink_name: 'TBD',
      },
    ];

    const now = new Date('2025-12-20T12:00:00.000Z');
    const result = partitionNextGameSchedule(games, now, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });

    expect(result.futureGames).toHaveLength(1);
    expect(result.pastGames).toHaveLength(0);
  });
});

