import type { Game } from '@/types';
import { EASTERN_TIME_ZONE, parseDateTimeInTimeZoneToUtc } from '@/lib/timezone';

interface Video {
    title: string;
    url: string;
    videoType?: 'regular' | 'upcoming' | 'live';
    publishDate?: string;
}

export interface EnrichedGame extends Game {
    highlightsUrl?: string;
    fullGameUrl?: string;
    upcomingStreamUrl?: string;
    liveStreamUrl?: string;
}

export interface MatchVideosOptions {
    /**
     * When false, we will only attach stream URLs (live/upcoming) and will
     * explicitly clear any VOD URLs (highlights/full game). This is useful for
     * upcoming games where "Watch Full Game" links should never appear.
     */
    includeVodLinks?: boolean;
}

export function matchVideosToGames(games: Game[], videos: Video[], options: MatchVideosOptions = {}): EnrichedGame[] {
    const includeVodLinks = options.includeVodLinks ?? true;

    // 1) Match live/upcoming streams to games using scheduled time (from publishDate) when possible.
    //    This is the most reliable way to match "upcoming streams", since titles often don't include a date.
    const gameWithStartTimes = games
        .map((game) => {
            const dateStr = coerceToIsoDate(game.game_date_format || game.game_date);
            const timeStr = coerceTo24hTime(game.game_time_format || game.game_time);
            const startUtc = dateStr && timeStr ? parseDateTimeInTimeZoneToUtc(dateStr, timeStr, EASTERN_TIME_ZONE) : null;
            return { game, startUtc };
        })
        .map(({ game, startUtc }) => ({ game, startUtc, key: String(game.game_nbr ?? `${game.game_date_format ?? game.game_date}-${game.game_time_format ?? game.game_time}`) }));

    const streamCandidates = videos
        .filter((v) => v.videoType === 'live' || v.videoType === 'upcoming')
        .map((v) => ({
            video: v,
            scheduledUtc: parseYouTubeScheduledUtc(v.publishDate),
            titleDate: extractDateFromTitle(v.title),
        }));

    const remainingStreams = new Map<string, (typeof streamCandidates)[number]>();
    streamCandidates.forEach((c) => remainingStreams.set(c.video.url, c));

    const assignments = new Map<string, { liveStreamUrl?: string; upcomingStreamUrl?: string }>();

    // Greedy: assign each game the closest unassigned stream (within threshold).
    // This avoids one stream being attached to multiple games when there are multiple upcoming games.
    const MATCH_WINDOW_MS = 8 * 60 * 60 * 1000; // 8 hours

    const sortedGames = [...gameWithStartTimes].sort((a, b) => {
        const at = a.startUtc?.getTime() ?? Number.POSITIVE_INFINITY;
        const bt = b.startUtc?.getTime() ?? Number.POSITIVE_INFINITY;
        return at - bt;
    });

    for (const { startUtc, key } of sortedGames) {
        if (!startUtc) continue;

        let bestUrl: string | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        let bestIsLive = false;

        for (const [url, candidate] of remainingStreams) {
            // Prefer scheduledUtc matching; otherwise fall back to title date matching (day-level).
            let score: number | null = null;

            if (candidate.scheduledUtc) {
                const diff = Math.abs(candidate.scheduledUtc.getTime() - startUtc.getTime());
                if (diff <= MATCH_WINDOW_MS) score = diff;
            } else if (candidate.titleDate) {
                // Date-only match, looser score.
                const gameDate = new Date(startUtc);
                const titleDate = candidate.titleDate;
                if (isSameDay(gameDate, titleDate)) score = MATCH_WINDOW_MS - 1;
            }

            if (score === null) continue;

            const isLive = candidate.video.videoType === 'live';
            const effectiveScore = isLive ? score - 1 : score; // tie-break: prefer live if equally close

            if (effectiveScore < bestScore) {
                bestScore = effectiveScore;
                bestUrl = url;
                bestIsLive = isLive;
            }
        }

        if (bestUrl) {
            const chosen = remainingStreams.get(bestUrl);
            remainingStreams.delete(bestUrl);

            if (chosen) {
                assignments.set(key, bestIsLive ? { liveStreamUrl: chosen.video.url } : { upcomingStreamUrl: chosen.video.url });
            }
        }
    }

    // 2) Match regular videos (highlights/full game) by date extracted from title.
    return gameWithStartTimes.map(({ game, startUtc, key }) => {
        const streamUrls = assignments.get(key) ?? {};

        // For upcoming games we do NOT want VOD buttons ("Watch Full Game"/"Highlights") to appear.
        // Only attach stream URLs and explicitly clear any existing VOD URLs.
        if (!includeVodLinks) {
            return {
                ...game,
                highlightsUrl: undefined,
                fullGameUrl: undefined,
                ...streamUrls,
            };
        }

        const gameDate = startUtc ? new Date(startUtc) : new Date(game.game_date_format || game.game_date);

        const matchingVideos = videos.filter((video) => {
            const videoDate = extractDateFromTitle(video.title);
            if (!videoDate) return false;
            return isSameDay(gameDate, videoDate);
        });

        if (matchingVideos.length === 0 && !assignments.has(key)) return game;

        let highlightsUrl: string | undefined;
        let fullGameUrl: string | undefined;

        matchingVideos.forEach((video) => {
            // Don't treat live/upcoming streams as VOD links.
            if (video.videoType === 'live' || video.videoType === 'upcoming') return;

            const isHighlights = video.title.toLowerCase().includes('highlights');
            if (isHighlights) {
                highlightsUrl = video.url;
            } else {
                fullGameUrl = video.url;
            }
        });

        return {
            ...game,
            highlightsUrl,
            fullGameUrl,
            ...streamUrls,
        };
    });
}

function extractDateFromTitle(title: string): Date | null {
    const ymd = extractIsoDateFromText(title);
    if (!ymd) return null;
    const parsed = new Date(`${ymd}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameDay(d1: Date, d2: Date): boolean {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function parseYouTubeScheduledUtc(publishDate?: string): Date | null {
    if (!publishDate) return null;
    const text = publishDate.trim();
    if (!text) return null;

    // Examples:
    // - "Scheduled for Dec 15, 2025 at 6:00 PM"
    // - "Dec 15, 2025 6:00 PM"
    // - "12/15/2025 6:00 PM"
    // - "12/15/25 at 6:00 PM"
    const monthName = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*';
    const ampm = '(AM|PM)';

    const monthNameMatch = text.match(
        new RegExp(`${monthName}\\s+(\\d{1,2}),?\\s+(\\d{4})(?:\\s+at)?\\s+(\\d{1,2}):(\\d{2})\\s*${ampm}`, 'i')
    );
    if (monthNameMatch) {
        const isoDate = extractIsoDateFromText(monthNameMatch[0]);
        const time = `${monthNameMatch[4]}:${monthNameMatch[5]} ${monthNameMatch[6]}`;
        const time24 = coerceTo24hTime(time);
        if (isoDate && time24) return parseDateTimeInTimeZoneToUtc(isoDate, time24, EASTERN_TIME_ZONE);
    }

    const numericMatch = text.match(new RegExp(`(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})(?:\\s+at)?\\s+(\\d{1,2}):(\\d{2})\\s*${ampm}`, 'i'));
    if (numericMatch) {
        const mm = numericMatch[1];
        const dd = numericMatch[2];
        const yy = numericMatch[3];
        const yyyy = yy.length === 2 ? `20${yy}` : yy;
        const isoDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        const time = `${numericMatch[4]}:${numericMatch[5]} ${numericMatch[6]}`;
        const time24 = coerceTo24hTime(time);
        if (time24) return parseDateTimeInTimeZoneToUtc(isoDate, time24, EASTERN_TIME_ZONE);
    }

    return null;
}

function extractIsoDateFromText(text: unknown): string | null {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    // ISO YYYY-MM-DD
    const iso = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    // YYYYMMDD
    const yyyymmdd = trimmed.match(/\b(\d{4})(\d{2})(\d{2})\b/);
    if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;

    // MM/DD/YYYY or M/D/YY
    const numeric = trimmed.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
    if (numeric) {
        const mm = numeric[1].padStart(2, '0');
        const dd = numeric[2].padStart(2, '0');
        const yy = numeric[3];
        const yyyy = yy.length === 2 ? `20${yy}` : yy;
        return `${yyyy}-${mm}-${dd}`;
    }

    // Month name formats: "Nov 8 2025", "Nov. 8, 2025"
    const monthRegex = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;
    const monthMatch = trimmed.match(monthRegex);
    if (monthMatch) {
        const month = monthToNumber(monthMatch[1]);
        if (!month) return null;
        const day = monthMatch[2].padStart(2, '0');
        const year = monthMatch[3];
        return `${year}-${month}-${day}`;
    }

    return null;
}

function monthToNumber(month: string): string | null {
    const m = month.toLowerCase().slice(0, 3);
    const map: Record<string, string> = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        sep: '09',
        oct: '10',
        nov: '11',
        dec: '12',
    };
    return map[m] ?? null;
}

function coerceToIsoDate(dateStr: unknown): string | null {
    return extractIsoDateFromText(dateStr);
}

function coerceTo24hTime(timeStr: unknown): string | null {
    if (typeof timeStr !== 'string') return null;
    const trimmed = timeStr.trim();
    if (!trimmed || trimmed.toUpperCase() === 'TBD') return null;

    // Already 24h "HH:MM" or "HH:MM:SS"
    const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (twentyFour) {
        const hh = Number(twentyFour[1]);
        const mm = Number(twentyFour[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    // 12h "h:mm AM/PM"
    const twelve = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (twelve) {
        let hour = Number(twelve[1]);
        const minute = Number(twelve[2]);
        const ap = twelve[3].toUpperCase();

        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
        if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

        if (ap === 'AM') {
            if (hour === 12) hour = 0;
        } else {
            if (hour !== 12) hour += 12;
        }

        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    return null;
}

