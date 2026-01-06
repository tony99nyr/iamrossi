import { Metadata } from 'next';
import NextGameClient from './NextGameClient';
import { matchVideosToGames } from '@/utils/videoMatcher';
import { getSchedule, getMHRSchedule, getSettings, getYouTubeVideos, getEnrichedGames, setEnrichedGames, isEnrichedGamesCacheStale, getSyncStatus, getCalendarSyncStatus, setSyncStatus, setCalendarSyncStatus, getStatSessions } from '@/lib/kv';
import { enrichPastGamesWithStatScores, createGamesFromStatSessions } from '@/lib/enrich-game-scores';
import { Game } from '@/types';
import { EASTERN_TIME_ZONE, parseDateTimeInTimeZoneToUtc } from '@/lib/timezone';
import { partitionNextGameSchedule } from '@/lib/next-game/partition-games';
import { selectFeaturedStream } from '@/lib/next-game/featured-stream';
import { mergeScheduleCandidates } from '@/lib/next-game/merge-schedule-candidates';
import type { YouTubeVideo } from '@/lib/youtube-service';

// Force dynamic rendering since we're reading from KV
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Next Game - Junior Canes 10U Black | iamrossi.com',
    description: 'Track upcoming games, view past results, and access detailed team statistics for the Carolina Junior Canes 10U Black hockey team. Get game schedules, opponent information, and team performance data.',
    openGraph: {
        title: 'Next Game - Junior Canes 10U Black',
        description: 'Track upcoming games and view past results for the Carolina Junior Canes 10U Black hockey team.',
        url: 'https://iamrossi.com/tools/next-game',
        siteName: 'iamrossi.com',
        type: 'website',
        images: [
            {
                url: '/og-next-game.png',
                width: 1200,
                height: 630,
                alt: 'Junior Canes 10U Black Game Schedule',
            },
        ],
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Next Game - Junior Canes 10U Black',
        description: 'Track upcoming games and view past results for the Carolina Junior Canes 10U Black hockey team.',
        images: ['/og-next-game.png'],
    },
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
    other: {
        'ai-robots': 'noindex, noimageai',
    }
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function sanitizeGames(games: Game[]): Game[] {
    // KV data can contain nulls/invalid entries; filter to objects only.
    return (Array.isArray(games) ? games : []).filter((g): g is Game => isRecord(g));
}


/**
 * Safely enrich a past game with rating data from the combined schedule.
 * 
 * IMPORTANT: MHR data is the source of truth for game results.
 * This function ONLY adds rating data - it NEVER modifies:
 * - Team names
 * - Team IDs (game_home_team, game_visitor_team)
 * - Scores
 * - Game info (date, time, location, etc.)
 * 
 * Ratings are matched by team name to ensure correct assignment.
 */
export function enrichPastGameWithRatings(
    mhrGame: Game,
    enrichedGame: Game,
    ourTeamId: string
): Game {
    // Start with unchanged MHR game
    const result: Game = { ...mhrGame };
    
    // Determine which team is "us" in each game using team IDs
    const mhrHomeId = String(mhrGame.game_home_team || '');
    const mhrVisitorId = String(mhrGame.game_visitor_team || '');
    const enrichedHomeId = String(enrichedGame.game_home_team || '');
    const enrichedVisitorId = String(enrichedGame.game_visitor_team || '');
    
    // Find where "us" is in each game
    const mhrWeAreHome = mhrHomeId === ourTeamId;
    const mhrWeAreVisitor = mhrVisitorId === ourTeamId;
    const enrichedWeAreHome = enrichedHomeId === ourTeamId;
    const enrichedWeAreVisitor = enrichedVisitorId === ourTeamId;
    
    // Get our rating and opponent rating from enriched data
    let ourRatingFromEnriched: string | undefined;
    let ourRecordFromEnriched: string | undefined;
    let opponentRatingFromEnriched: string | undefined;
    let opponentRecordFromEnriched: string | undefined;
    
    if (enrichedWeAreHome) {
        ourRatingFromEnriched = enrichedGame.home_team_rating;
        ourRecordFromEnriched = enrichedGame.home_team_record;
        opponentRatingFromEnriched = enrichedGame.visitor_team_rating;
        opponentRecordFromEnriched = enrichedGame.visitor_team_record;
    } else if (enrichedWeAreVisitor) {
        ourRatingFromEnriched = enrichedGame.visitor_team_rating;
        ourRecordFromEnriched = enrichedGame.visitor_team_record;
        opponentRatingFromEnriched = enrichedGame.home_team_rating;
        opponentRecordFromEnriched = enrichedGame.home_team_record;
    }
    
    // Apply ratings to result based on where "us" is in MHR data
    if (mhrWeAreHome) {
        result.home_team_rating = mhrGame.home_team_rating || ourRatingFromEnriched;
        result.home_team_record = mhrGame.home_team_record || ourRecordFromEnriched;
        result.visitor_team_rating = mhrGame.visitor_team_rating || opponentRatingFromEnriched;
        result.visitor_team_record = mhrGame.visitor_team_record || opponentRecordFromEnriched;
    } else if (mhrWeAreVisitor) {
        result.visitor_team_rating = mhrGame.visitor_team_rating || ourRatingFromEnriched;
        result.visitor_team_record = mhrGame.visitor_team_record || ourRecordFromEnriched;
        result.home_team_rating = mhrGame.home_team_rating || opponentRatingFromEnriched;
        result.home_team_record = mhrGame.home_team_record || opponentRecordFromEnriched;
    }
    
    // Also set opponent_rating/opponent_record for convenience
    if (mhrWeAreHome) {
        result.opponent_rating = result.visitor_team_rating;
        result.opponent_record = result.visitor_team_record;
    } else if (mhrWeAreVisitor) {
        result.opponent_rating = result.home_team_rating;
        result.opponent_record = result.home_team_record;
    }
    
    return result;
}

function sanitizeYouTubeVideos(videos: Awaited<ReturnType<typeof getYouTubeVideos>>): YouTubeVideo[] {
    // Keep only entries with required fields for downstream usage.
    // KV historically stored entries without `videoType`; default those to 'regular' for type safety.
    return (Array.isArray(videos) ? videos : [])
        .filter((v) => {
            if (!isRecord(v)) return false;
            return typeof v.title === 'string' && typeof v.url === 'string';
        })
        .map((v) => {
            const videoType = v.videoType;
            const normalizedVideoType =
                videoType === 'live' || videoType === 'upcoming' || videoType === 'regular'
                    ? videoType
                    : 'regular';
            return {
                ...v,
                videoType: normalizedVideoType,
            };
        }) as YouTubeVideo[];
}

// async function triggerSync() {
//     try {
//         const headersList = await headers();
//         const host = headersList.get('host') || 'localhost:3000';
//         const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
        
//         // Fire and forget sync
//         fetch(`${protocol}://${host}/api/admin/sync-schedule`, { 
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' }
//         }).catch(err => console.error('Background sync failed:', err));
//     } catch (error) {
//         console.error('Failed to trigger sync:', error);
//     }
// }

// Note: Schedule staleness checking removed since KV is always fresh
// If you need to trigger periodic syncs, implement a cron job or webhook

export default async function NextGamePage() {
    let schedule: Game[] = [];
    let mhrSchedule: Awaited<ReturnType<typeof getMHRSchedule>> = [];
    let youtubeVideos: YouTubeVideo[] = [];

    // KV reads can fail in production (missing env, transient Redis outage, bad data).
    // This page should degrade gracefully instead of throwing a 500.
    try {
        schedule = sanitizeGames(await getSchedule());
    } catch (error) {
        console.error('[Next Game] Failed to load schedule from KV:', error);
    }

    try {
        // MHR schedule is a looser shape; keep only object entries to avoid null derefs.
        mhrSchedule = (await getMHRSchedule()).filter((g): g is (typeof mhrSchedule)[number] => isRecord(g));
    } catch (error) {
        console.error('[Next Game] Failed to load MHR schedule from KV:', error);
    }

    try {
        youtubeVideos = sanitizeYouTubeVideos(await getYouTubeVideos());
    } catch (error) {
        console.error('[Next Game] Failed to load YouTube videos from KV:', error);
    }

    // Read settings from KV
    let settingsData = null as Awaited<ReturnType<typeof getSettings>>;
    try {
        settingsData = await getSettings();
    } catch (error) {
        console.error('[Next Game] Failed to load settings from KV:', error);
    }
    const settings = {
        mhrTeamId: settingsData?.mhrTeamId || '19758',
        mhrYear: settingsData?.mhrYear || '2025',
        teamName: settingsData?.teamName || 'Carolina Junior Canes (Black) 10U AA',
        identifiers: settingsData?.identifiers || ['Black', 'Jr Canes', 'Carolina', 'Jr']
    };

    // Check sync status and trigger background syncs if needed (every 2 hours)
    let syncStatus = { lastSyncTime: null, isRevalidating: false, lastError: null } as Awaited<ReturnType<typeof getSyncStatus>>;
    let calendarSyncStatus = { lastSyncTime: null, isRevalidating: false, lastError: null } as Awaited<ReturnType<typeof getCalendarSyncStatus>>;

    try {
        syncStatus = await getSyncStatus();
    } catch (error) {
        console.error('[Next Game] Failed to load YouTube sync status from KV:', error);
    }

    try {
        calendarSyncStatus = await getCalendarSyncStatus();
    } catch (error) {
        console.error('[Next Game] Failed to load calendar sync status from KV:', error);
    }
    const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = process.env.VERCEL_URL || 'localhost:3000';
    const adminSecret = process.env.ADMIN_SECRET;
    
    // Trigger YouTube sync if needed
    const shouldTriggerYouTubeSync = !syncStatus.isRevalidating && 
        (!syncStatus.lastSyncTime || (new Date().getTime() - syncStatus.lastSyncTime) > COOLDOWN_MS);

    if (shouldTriggerYouTubeSync && adminSecret) {
        // Set revalidating flag optimistically before triggering background sync
        const optimisticSyncStatus = {
            ...syncStatus,
            isRevalidating: true,
            lastError: null
        };
        await setSyncStatus(optimisticSyncStatus);
        syncStatus.isRevalidating = true; // Update local status for rendering
        
        // Trigger YouTube sync in background (fire and forget)
        fetch(`${protocol}://${host}/api/admin/sync-youtube`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminSecret}`,
                'Content-Type': 'application/json'
            }
        }).catch(err => {
            console.error('Background YouTube sync failed:', err);
            // Reset revalidating flag on error
            setSyncStatus({
                ...optimisticSyncStatus,
                isRevalidating: false,
                lastError: err instanceof Error ? err.message : 'Sync failed'
            }).catch(console.error);
        });
    }

    // Trigger Schedule sync if needed
    const shouldTriggerScheduleSync = !calendarSyncStatus.isRevalidating && 
        (!calendarSyncStatus.lastSyncTime || (new Date().getTime() - calendarSyncStatus.lastSyncTime) > COOLDOWN_MS);

    if (shouldTriggerScheduleSync && adminSecret) {
        // Set revalidating flag optimistically before triggering background sync
        const optimisticCalendarStatus = {
            ...calendarSyncStatus,
            isRevalidating: true,
            lastError: null
        };
        await setCalendarSyncStatus(optimisticCalendarStatus);
        calendarSyncStatus.isRevalidating = true; // Update local status for rendering
        
        // Trigger schedule sync in background (fire and forget)
        fetch(`${protocol}://${host}/api/admin/sync-schedule`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminSecret}`,
                'Content-Type': 'application/json'
            }
        }).catch(err => {
            console.error('Background schedule sync failed:', err);
            // Reset revalidating flag on error
            setCalendarSyncStatus({
                ...optimisticCalendarStatus,
                isRevalidating: false,
                lastError: err instanceof Error ? err.message : 'Sync failed'
            }).catch(console.error);
        });
    }

    
    // Filter for upcoming games.
    // IMPORTANT: schedule times are Eastern; Vercel's server runtime is UTC.
    // Keep games visible until 1 hour after puck drop.
    const now = new Date();
    const UPCOMING_GRACE_PERIOD_MS = 60 * 60 * 1000;
    // Always union calendar-derived schedule + raw MHR schedule so we don't miss games
    // that failed to merge into `admin:schedule` (common for same-day edits / title mismatches).
    const combined = mergeScheduleCandidates(
        sanitizeGames(mhrSchedule as unknown as Game[]),
        schedule,
        {
            mhrTeamId: settings.mhrTeamId,
            teamName: settings.teamName,
            timeZone: EASTERN_TIME_ZONE,
        }
    );

    const { futureGames } = partitionNextGameSchedule(combined, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: UPCOMING_GRACE_PERIOD_MS,
    });

    // Past games should come from MHR (source of truth for season history).
    // This avoids accidentally treating calendar misc events as "past games".
    const mhrGames = sanitizeGames(mhrSchedule as unknown as Game[]);
    const { pastGames: pastFromMhr } = partitionNextGameSchedule(mhrGames, now, {
        timeZone: EASTERN_TIME_ZONE,
        upcomingGracePeriodMs: UPCOMING_GRACE_PERIOD_MS,
    });
    
    // Calculate season bounds for filtering
    const mhrYear = settings.mhrYear || '2025';
    const seasonStartYear = mhrYear;
    const seasonEndYear = String(parseInt(mhrYear) + 1);
    const currentSeasonStart = new Date(`${seasonStartYear}-08-01T00:00:00`);
    const currentSeasonEnd = new Date(`${seasonEndYear}-03-01T23:59:59`);
    
    // Get stat sessions early to create games from unmatched sessions
    let statSessions: Awaited<ReturnType<typeof getStatSessions>> = [];
    try {
        statSessions = await getStatSessions();
    } catch (error) {
        console.error('[Next Game] Failed to load stat sessions from KV:', error);
    }
    
    // Create games from stat sessions that don't match existing MHR games
    const gamesFromStatSessions = createGamesFromStatSessions(
        statSessions,
        pastFromMhr,
        settings.teamName,
        now,
        currentSeasonStart,
        currentSeasonEnd
    );
    
    // Merge MHR games with games from stat sessions
    // Deduplicate by game_nbr or date/opponent
    const allPastGames = [...pastFromMhr];
    for (const statGame of gamesFromStatSessions) {
        // Check if this game already exists (by game_nbr or date/opponent)
        const exists = allPastGames.some(existing => {
            // Check by game_nbr first
            if (statGame.game_nbr && existing.game_nbr) {
                if (String(statGame.game_nbr) === String(existing.game_nbr)) {
                    return true;
                }
            }
            // Check by date and opponent
            const statDate = statGame.game_date_format || statGame.game_date;
            const existingDate = existing.game_date_format || existing.game_date;
            if (statDate && existingDate && statDate === existingDate) {
                const statOpponent = statGame.home_team_name === settings.teamName 
                    ? statGame.visitor_team_name 
                    : statGame.home_team_name;
                const existingOpponent = existing.home_team_name === settings.teamName
                    ? existing.visitor_team_name
                    : existing.home_team_name;
                // Normalize team names for comparison (remove special chars, lowercase)
                const normalizeTeamName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (statOpponent && existingOpponent && 
                    normalizeTeamName(statOpponent) === normalizeTeamName(existingOpponent)) {
                    return true;
                }
            }
            return false;
        });
        
        if (!exists) {
            allPastGames.push(statGame);
        }
    }
    
    // Create a map from combined schedule to enrich past games with rating data
    // The combined schedule has ratings from calendar sync that raw MHR doesn't have
    // IMPORTANT: Normalize game_nbr to string to ensure consistent lookups (number vs string)
    const combinedByGameNbr = new Map<string, Game>();
    for (const game of combined) {
        if (game.game_nbr) {
            combinedByGameNbr.set(String(game.game_nbr), game);
        }
    }
    
    // Filter for past games (current season only)
    // Season runs from August 1st of MHR year to March 1st of (MHR year + 1)
    const pastGames = allPastGames
        .filter((game: Game) => {
            // Keep placeholders out of the past games list (they're not "results").
            if (game.isPlaceholder) return false;

            // Must be from current season.
            const dateStr = game.game_date_format || game.game_date;
            const timeStr = game.game_time_format || game.game_time;
            // Try to parse full date+time first
            let startUtc = typeof timeStr === 'string' && timeStr.trim() 
                ? parseDateTimeInTimeZoneToUtc(dateStr, timeStr, EASTERN_TIME_ZONE)
                : null;
            // For games with unknown/empty time, use end-of-day to check season bounds
            if (!startUtc && typeof dateStr === 'string') {
                startUtc = parseDateTimeInTimeZoneToUtc(dateStr, '23:59:59', EASTERN_TIME_ZONE);
            }
            if (!startUtc) return false;
            if (startUtc < currentSeasonStart || startUtc >= currentSeasonEnd) return false;

            return true;
        })
        .map((game: Game) => {
            // Enrich with rating data from combined schedule if available
            // MHR data is source of truth for game results - NEVER modify team names/scores/IDs
            // Match ratings using team IDs rather than team names (names can vary between sources)
            if (game.game_nbr) {
                const enriched = combinedByGameNbr.get(String(game.game_nbr));
                if (enriched) {
                    return enrichPastGameWithRatings(game, enriched, settings.mhrTeamId);
                }
            }
            return game;
        })
        .sort((a: Game, b: Game) => {
            // Sort descending (most recent first)
            const getGameTime = (g: Game) => {
                const date = g.game_date_format || g.game_date;
                const time = g.game_time_format || g.game_time;
                if (typeof time === 'string' && time.trim()) {
                    return parseDateTimeInTimeZoneToUtc(date, time, EASTERN_TIME_ZONE);
                }
                // For unknown times, use end-of-day
                return parseDateTimeInTimeZoneToUtc(date, '23:59:59', EASTERN_TIME_ZONE);
            };
            const dateA = getGameTime(a);
            const dateB = getGameTime(b);
            return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
        });
    
    // Check cache for enriched games (video-matched)
    let enrichedPastGames: Game[];
    let cachedEnrichedGames: Awaited<ReturnType<typeof getEnrichedGames>> = null;
    try {
        cachedEnrichedGames = await getEnrichedGames();
    } catch (error) {
        console.error('[Next Game] Failed to load enriched games cache from KV:', error);
    }

    const cacheIsStale = cachedEnrichedGames ? isEnrichedGamesCacheStale(cachedEnrichedGames) : true;
    // Invalidate cache if game count changed (e.g., games moved from future to past)
    const cacheCountMismatch = cachedEnrichedGames && cachedEnrichedGames.games.length !== pastGames.length;
    // Also treat cache as invalid if it has no games but we have games to process
    const cacheIsEmpty = (cachedEnrichedGames?.games?.length ?? 0) === 0 && pastGames.length > 0;
    const shouldUseCache = cachedEnrichedGames && !cacheIsStale && !cacheIsEmpty && !cacheCountMismatch;

    if (shouldUseCache && cachedEnrichedGames) {
        // Use cached enriched games
        enrichedPastGames = cachedEnrichedGames.games;
    } else {
        // Cache miss, stale, or empty - compute and cache
        enrichedPastGames = matchVideosToGames(pastGames as Game[], youtubeVideos);
        try {
            await setEnrichedGames(enrichedPastGames);
        } catch (error) {
            console.error('[Next Game] Failed to write enriched games cache to KV:', error);
        }
    }
    
    // Ensure past games have rating data from combined schedule
    // This uses the same safe enrichment function that matches by team name
    enrichedPastGames = enrichedPastGames.map((game: Game) => {
        if (game.game_nbr) {
            const enriched = combinedByGameNbr.get(String(game.game_nbr));
            if (enriched) {
                return enrichPastGameWithRatings(game, enriched, settings.mhrTeamId);
            }
        }
        return game;
    });

    // Enrich past games with stat session scores when MHR scores are invalid
    // (statSessions already loaded earlier for createGamesFromStatSessions)
    enrichedPastGames = enrichPastGamesWithStatScores(
        enrichedPastGames,
        statSessions,
        settings.teamName
    );

    // Enrich future games with upcoming/live video data.
    // IMPORTANT: For upcoming games, we only want stream links (not VOD "full game"/"highlights" links).
    const enrichedFutureGames = matchVideosToGames(futureGames as Game[], youtubeVideos, { includeVodLinks: false });

    // Check if there are any live games (games with live stream URLs)
    const liveGames = enrichedFutureGames.filter((game: Game) => (game as unknown as { liveStreamUrl?: string }).liveStreamUrl);

    // Featured stream at top of page (live video first; else nearest game w/ stream)
    const featuredStream = selectFeaturedStream({
        now,
        timeZone: EASTERN_TIME_ZONE,
        futureGames: enrichedFutureGames,
        youtubeVideos,
    });

    // Keep backwards-compatible prop for "standalone YouTube stream" alert.
    // We ONLY set this for actual live streams; upcoming streams should be tied to the schedule.
    const activeLiveStream =
        featuredStream?.kind === 'youtube' && featuredStream.state === 'live'
            ? featuredStream.video
            : null;

    return <NextGameClient 
        futureGames={enrichedFutureGames} 
        pastGames={enrichedPastGames} 
        settings={settings} 
        syncStatus={syncStatus} 
        calendarSyncStatus={calendarSyncStatus} 
        liveGames={liveGames}
        activeLiveStream={activeLiveStream}
        featuredStream={featuredStream}
    />;
}
