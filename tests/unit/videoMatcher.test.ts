import { describe, expect, it } from 'vitest';
import { matchVideosToGames } from '@/utils/videoMatcher';
import type { Game } from '@/types';

describe('matchVideosToGames (upcoming streams)', () => {
  it('matches upcoming streams to upcoming games using publishDate scheduled time (Eastern)', () => {
    const games: Game[] = [
      {
        game_nbr: 1,
        game_date: '2025-12-13',
        game_time: '18:00:00',
        game_date_format: '2025-12-13',
        game_time_format: '18:00:00',
        game_date_format_pretty: 'Sat Dec 13',
        game_time_format_pretty: '6:00 PM',
        home_team_name: 'Junior Canes',
        visitor_team_name: 'Opponent A',
        rink_name: 'Rink 1',
      },
      {
        game_nbr: 2,
        game_date: '2025-12-14',
        game_time: '12:15:00',
        game_date_format: '2025-12-14',
        game_time_format: '12:15:00',
        game_date_format_pretty: 'Sun Dec 14',
        game_time_format_pretty: '12:15 PM',
        home_team_name: 'Opponent B',
        visitor_team_name: 'Junior Canes',
        rink_name: 'Rink 2',
      },
      {
        game_nbr: 3,
        game_date: '2025-12-15',
        game_time: '09:30:00',
        game_date_format: '2025-12-15',
        game_time_format: '09:30:00',
        game_date_format_pretty: 'Mon Dec 15',
        game_time_format_pretty: '9:30 AM',
        home_team_name: 'Junior Canes',
        visitor_team_name: 'Opponent C',
        rink_name: 'Rink 3',
      },
    ];

    const videos = [
      {
        title: 'Junior Canes vs Opponent A (Live Stream)',
        url: 'https://www.youtube.com/watch?v=aaa',
        videoType: 'upcoming' as const,
        publishDate: 'Scheduled for Dec 13, 2025 at 6:00 PM',
      },
      {
        title: 'Junior Canes @ Opponent B',
        url: 'https://www.youtube.com/watch?v=bbb',
        videoType: 'upcoming' as const,
        publishDate: 'Scheduled for Dec 14, 2025 at 12:15 PM',
      },
      {
        title: 'Opponent C vs Junior Canes',
        url: 'https://www.youtube.com/watch?v=ccc',
        videoType: 'upcoming' as const,
        publishDate: 'Scheduled for Dec 15, 2025 at 9:30 AM',
      },
    ];

    const enriched = matchVideosToGames(games, videos);

    expect(enriched[0]?.upcomingStreamUrl).toBe('https://www.youtube.com/watch?v=aaa');
    expect(enriched[1]?.upcomingStreamUrl).toBe('https://www.youtube.com/watch?v=bbb');
    expect(enriched[2]?.upcomingStreamUrl).toBe('https://www.youtube.com/watch?v=ccc');
  });

  it('falls back to matching by date in title when publishDate is missing', () => {
    const games: Game[] = [
      {
        game_nbr: 10,
        game_date: '2025-12-14',
        game_time: '12:15:00',
        game_date_format: '2025-12-14',
        game_time_format: '12:15:00',
        game_date_format_pretty: 'Sun Dec 14',
        game_time_format_pretty: '12:15 PM',
        home_team_name: 'Opponent B',
        visitor_team_name: 'Junior Canes',
        rink_name: 'Rink',
      },
    ];

    const videos = [
      {
        title: 'Junior Canes @ Opponent B 12/14/2025 (Scheduled Stream)',
        url: 'https://www.youtube.com/watch?v=ddd',
        videoType: 'upcoming' as const,
      },
    ];

    const enriched = matchVideosToGames(games, videos);
    expect(enriched[0]?.upcomingStreamUrl).toBe('https://www.youtube.com/watch?v=ddd');
  });

  it('assigns live streams to liveStreamUrl when videoType is live', () => {
    const games: Game[] = [
      {
        game_nbr: 20,
        game_date: '2025-12-13',
        game_time: '18:00:00',
        game_date_format: '2025-12-13',
        game_time_format: '18:00:00',
        game_date_format_pretty: 'Sat Dec 13',
        game_time_format_pretty: '6:00 PM',
        home_team_name: 'Junior Canes',
        visitor_team_name: 'Opponent A',
        rink_name: 'Rink',
      },
    ];

    const videos = [
      {
        title: 'Junior Canes vs Opponent A',
        url: 'https://www.youtube.com/watch?v=live1',
        videoType: 'live' as const,
        publishDate: 'Dec 13, 2025 6:00 PM',
      },
    ];

    const enriched = matchVideosToGames(games, videos);
    expect(enriched[0]?.liveStreamUrl).toBe('https://www.youtube.com/watch?v=live1');
    expect(enriched[0]?.upcomingStreamUrl).toBeUndefined();
  });
});

