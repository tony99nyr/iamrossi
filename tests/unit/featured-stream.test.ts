import { describe, it, expect } from 'vitest';
import type { Game } from '@/types';
import type { YouTubeVideo } from '@/lib/youtube-service';
import type { EnrichedGame } from '@/utils/videoMatcher';
import { EASTERN_TIME_ZONE } from '@/lib/timezone';
import { matchVideosToGames } from '@/utils/videoMatcher';
import { partitionNextGameSchedule } from '@/lib/next-game/partition-games';
import { selectFeaturedStream } from '@/lib/next-game/featured-stream';

describe('selectFeaturedStream', () => {
  it('prefers a live YouTube stream over any game-matched stream', () => {
    const futureGames: EnrichedGame[] = [];
    const youtubeVideos: YouTubeVideo[] = [
      {
        title: 'Live now',
        url: 'https://www.youtube.com/watch?v=live',
        videoType: 'live',
        publishDate: 'Watching now',
      },
    ];

    const featured = selectFeaturedStream({
      now: new Date('2025-12-13T17:00:00.000Z'),
      timeZone: EASTERN_TIME_ZONE,
      futureGames,
      youtubeVideos,
    });

    expect(featured?.kind).toBe('youtube');
    expect(featured && featured.kind === 'youtube' ? featured.video.url : null).toContain('watch?v=live');
  });

  it('picks the later-today game if it is the nearest game with a stream (two games same day)', () => {
    const games: Game[] = [
      // Morning game (already happened)
      {
        game_nbr: 'm1',
        game_date: '2025-12-13',
        game_time: '09:00:00',
        game_date_format: '2025-12-13',
        game_time_format: '09:00:00',
        home_team_name: 'Us',
        visitor_team_name: 'Them',
        rink_name: 'Rink',
      },
      // Later today (should be the featured upcoming stream)
      {
        game_nbr: 'm2',
        game_date: '2025-12-13',
        game_time: '18:45:00',
        game_date_format: '2025-12-13',
        game_time_format: '18:45:00',
        home_team_name: 'Us',
        visitor_team_name: 'Them 2',
        rink_name: 'Rink',
      },
      // Tomorrow
      {
        game_nbr: 'm3',
        game_date: '2025-12-14',
        game_time: '10:00:00',
        game_date_format: '2025-12-14',
        game_time_format: '10:00:00',
        home_team_name: 'Us',
        visitor_team_name: 'Them 3',
        rink_name: 'Rink',
      },
    ];

    // 12:00pm ET on Dec 13, 2025
    const now = new Date('2025-12-13T17:00:00.000Z');
    const { futureGames } = partitionNextGameSchedule(games, now, {
      timeZone: EASTERN_TIME_ZONE,
      upcomingGracePeriodMs: 60 * 60 * 1000,
    });

    // YouTube provides an upcoming stream scheduled for the 6:45pm game (text-only scheduled string)
    const videos: YouTubeVideo[] = [
      {
        title: 'Stream for later today',
        url: 'https://www.youtube.com/watch?v=3pUMjoTHck4',
        videoType: 'upcoming',
        publishDate: 'Scheduled for Dec 13, 2025 at 6:45 PM',
      },
      {
        title: 'Stream for tomorrow',
        url: 'https://www.youtube.com/watch?v=tomorrow',
        videoType: 'upcoming',
        publishDate: 'Scheduled for Dec 14, 2025 at 10:00 AM',
      },
    ];

    const enrichedFutureGames = matchVideosToGames(futureGames, videos, { includeVodLinks: false });
    const featured = selectFeaturedStream({
      now,
      timeZone: EASTERN_TIME_ZONE,
      futureGames: enrichedFutureGames,
      youtubeVideos: videos,
    });

    expect(featured?.kind).toBe('game');
    expect(featured && featured.kind === 'game' ? featured.url : null).toBe('https://www.youtube.com/watch?v=3pUMjoTHck4');
    expect(featured && featured.kind === 'game' ? featured.game.game_nbr : null).toBe('m2');
  });
});

