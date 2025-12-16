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

  it('treats TBD-time games on today/future dates as future', () => {
    const games: Game[] = [
      {
        game_nbr: 'tbd-1',
        game_date: '2025-12-20',
        game_time: '00:00:00',
        game_date_format: '2025-12-20',
        game_time_format: '00:00:00',
        game_date_format_pretty: 'Sat Dec 20',
        game_time_format_pretty: 'TBD',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Opponent',
        rink_name: 'TBD',
      },
    ];

    // Same day - game should stay in future
    const now = new Date('2025-12-20T12:00:00.000Z');
    const result = partitionNextGameSchedule(games, now, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });

    expect(result.futureGames).toHaveLength(1);
    expect(result.pastGames).toHaveLength(0);
  });

  it('moves TBD-time games with past dates to past', () => {
    const games: Game[] = [
      {
        game_nbr: 'tbd-past',
        game_date: '2025-08-30',
        game_time: '00:00:00',
        game_date_format: '2025-08-30',
        game_time_format: '',
        game_date_format_pretty: 'Sat Aug 30',
        game_time_format_pretty: '',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Ramapo Saints 10U AA',
        rink_name: 'Test Rink',
      },
    ];

    // December - game from August should be in past
    const now = new Date('2025-12-16T12:00:00.000Z');
    const result = partitionNextGameSchedule(games, now, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });

    expect(result.futureGames).toHaveLength(0);
    expect(result.pastGames).toHaveLength(1);
    expect(result.pastGames[0].visitor_team_name).toContain('Ramapo');
  });

  describe('games without game times', () => {
    it('moves game with empty game_time_format to past when date is clearly past', () => {
      const games: Game[] = [
        {
          game_nbr: 'no-time-1',
          game_date: '2025-08-30',
          game_time: '00:00:00',
          game_date_format: '2025-08-30',
          game_time_format: '', // Empty time
          game_date_format_pretty: 'Sat Aug 30',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'Woodbridge Wolfpack 10U AA',
          rink_name: 'Skylands Ice World',
        },
      ];

      // December 16, 2025 - game from August 30 should be in past
      const now = new Date('2025-12-16T17:00:00.000Z'); // 12pm ET
      const result = partitionNextGameSchedule(games, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: 60 * 60 * 1000,
      });

      expect(result.futureGames).toHaveLength(0);
      expect(result.pastGames).toHaveLength(1);
      expect(result.pastGames[0].visitor_team_name).toBe('Woodbridge Wolfpack 10U AA');
    });

    it('moves game with TBD game_time_format_pretty to past when date is clearly past', () => {
      const games: Game[] = [
        {
          game_nbr: 'tbd-time-1',
          game_date: '2025-09-15',
          game_time: '00:00:00',
          game_date_format: '2025-09-15',
          game_time_format: '00:00:00',
          game_date_format_pretty: 'Mon Sep 15',
          game_time_format_pretty: 'TBD',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'Some Opponent',
          rink_name: 'Some Rink',
        },
      ];

      // December - game from September should be in past
      const now = new Date('2025-12-16T17:00:00.000Z');
      const result = partitionNextGameSchedule(games, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: 60 * 60 * 1000,
      });

      expect(result.futureGames).toHaveLength(0);
      expect(result.pastGames).toHaveLength(1);
    });

    it('handles multiple games without times - some past, some future', () => {
      const games: Game[] = [
        {
          game_nbr: 'past-no-time',
          game_date: '2025-08-30',
          game_time: '00:00:00',
          game_date_format: '2025-08-30',
          game_time_format: '',
          game_date_format_pretty: 'Sat Aug 30',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'Past Opponent',
          rink_name: 'Rink A',
        },
        {
          game_nbr: 'future-no-time',
          game_date: '2026-01-15',
          game_time: '00:00:00',
          game_date_format: '2026-01-15',
          game_time_format: '',
          game_date_format_pretty: 'Thu Jan 15',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'Future Opponent',
          rink_name: 'Rink B',
        },
      ];

      // December 16, 2025 - Aug 30 should be past, Jan 15 2026 should be future
      const now = new Date('2025-12-16T17:00:00.000Z');
      const result = partitionNextGameSchedule(games, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: 60 * 60 * 1000,
      });

      expect(result.futureGames).toHaveLength(1);
      expect(result.futureGames[0].visitor_team_name).toBe('Future Opponent');
      expect(result.pastGames).toHaveLength(1);
      expect(result.pastGames[0].visitor_team_name).toBe('Past Opponent');
    });

    it('keeps game without time in future when date is today', () => {
      const games: Game[] = [
        {
          game_nbr: 'today-no-time',
          game_date: '2025-12-16',
          game_time: '00:00:00',
          game_date_format: '2025-12-16',
          game_time_format: '',
          game_date_format_pretty: 'Tue Dec 16',
          game_time_format_pretty: 'TBD',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'Today Opponent',
          rink_name: 'Some Rink',
        },
      ];

      // Early on Dec 16, 2025 - game today without time should stay in future
      const now = new Date('2025-12-16T15:00:00.000Z'); // 10am ET
      const result = partitionNextGameSchedule(games, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: 60 * 60 * 1000,
      });

      expect(result.futureGames).toHaveLength(1);
      expect(result.pastGames).toHaveLength(0);
    });

    it('moves game without time to past after end-of-day plus grace period', () => {
      const games: Game[] = [
        {
          game_nbr: 'yesterday-no-time',
          game_date: '2025-12-15',
          game_time: '00:00:00',
          game_date_format: '2025-12-15',
          game_time_format: '',
          game_date_format_pretty: 'Mon Dec 15',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'Yesterday Opponent',
          rink_name: 'Some Rink',
        },
      ];

      // Dec 16, 2025 at 2am ET - Dec 15 end-of-day (11:59pm) + 1h grace = 12:59am Dec 16
      // At 2am, we're past the grace period, so game should be in past
      const now = new Date('2025-12-16T07:00:00.000Z'); // 2am ET
      const result = partitionNextGameSchedule(games, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: 60 * 60 * 1000,
      });

      expect(result.futureGames).toHaveLength(0);
      expect(result.pastGames).toHaveLength(1);
      expect(result.pastGames[0].visitor_team_name).toBe('Yesterday Opponent');
    });

    it('sorts past games with unknown times correctly by date', () => {
      const games: Game[] = [
        {
          game_nbr: 'oct-no-time',
          game_date: '2025-10-15',
          game_time: '00:00:00',
          game_date_format: '2025-10-15',
          game_time_format: '',
          game_date_format_pretty: 'Wed Oct 15',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'October Opponent',
          rink_name: 'Rink',
        },
        {
          game_nbr: 'sep-no-time',
          game_date: '2025-09-01',
          game_time: '00:00:00',
          game_date_format: '2025-09-01',
          game_time_format: '',
          game_date_format_pretty: 'Mon Sep 1',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'September Opponent',
          rink_name: 'Rink',
        },
        {
          game_nbr: 'nov-no-time',
          game_date: '2025-11-20',
          game_time: '00:00:00',
          game_date_format: '2025-11-20',
          game_time_format: '',
          game_date_format_pretty: 'Thu Nov 20',
          game_time_format_pretty: '',
          home_team_name: 'Carolina Junior Canes (Black) 10U AA',
          visitor_team_name: 'November Opponent',
          rink_name: 'Rink',
        },
      ];

      const now = new Date('2025-12-16T17:00:00.000Z');
      const result = partitionNextGameSchedule(games, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: 60 * 60 * 1000,
      });

      expect(result.pastGames).toHaveLength(3);
      // Past games should be sorted descending (most recent first)
      expect(result.pastGames[0].visitor_team_name).toBe('November Opponent');
      expect(result.pastGames[1].visitor_team_name).toBe('October Opponent');
      expect(result.pastGames[2].visitor_team_name).toBe('September Opponent');
    });
  });
});

