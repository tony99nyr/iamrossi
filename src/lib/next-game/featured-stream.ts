import type { Game } from '@/types';
import type { EnrichedGame } from '@/utils/videoMatcher';
import type { YouTubeVideo } from '@/lib/youtube-service';
import { parseDateTimeInTimeZoneToUtc } from '@/lib/timezone';

export type FeaturedStream =
  | {
      kind: 'youtube';
      video: YouTubeVideo;
      state: 'live';
    }
  | {
      kind: 'game';
      game: EnrichedGame;
      state: 'live' | 'upcoming';
      url: string;
    }
  | null;

function getGameStartUtc(game: Game, timeZone: string): Date | null {
  const dateStr = game.game_date_format || game.game_date;
  const timeStr = game.game_time_format || game.game_time;
  return parseDateTimeInTimeZoneToUtc(dateStr, timeStr, timeZone);
}

/**
 * Picks the stream that should be featured at the top of the Next Game page.
 *
 * Priority:
 * 1) Any currently-live YouTube stream (even if it doesn't match a game)
 * 2) The nearest upcoming game that has a stream URL (live or upcoming)
 */
export function selectFeaturedStream(options: {
  now: Date;
  timeZone: string;
  futureGames: EnrichedGame[];
  youtubeVideos: YouTubeVideo[];
}): FeaturedStream {
  const liveVideo = options.youtubeVideos.find((v) => v.videoType === 'live');
  if (liveVideo) {
    return { kind: 'youtube', video: liveVideo, state: 'live' };
  }

  const candidates = options.futureGames
    .map((g) => {
      const url = g.liveStreamUrl ?? g.upcomingStreamUrl ?? null;
      if (!url) return null;
      const startUtc = getGameStartUtc(g, options.timeZone);
      const sortTime = startUtc?.getTime() ?? Number.POSITIVE_INFINITY;
      const state: 'live' | 'upcoming' = g.liveStreamUrl ? 'live' : 'upcoming';
      return { game: g, url, state, sortTime };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.sortTime - b.sortTime);
  const best = candidates[0];
  return { kind: 'game', game: best.game, url: best.url, state: best.state };
}

