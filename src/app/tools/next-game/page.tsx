import { Metadata } from 'next';
import NextGameClient from './NextGameClient';
import { matchVideosToGames } from '@/utils/videoMatcher';
import { getSchedule, getMHRSchedule, getSettings, getYouTubeVideos, getEnrichedGames, setEnrichedGames, isEnrichedGamesCacheStale, getSyncStatus, getCalendarSyncStatus, getStatSessions } from '@/lib/kv';
import { enrichPastGamesWithStatScores } from '@/lib/enrich-game-scores';
import { Game } from '@/types';

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
    const schedule = await getSchedule();
    const mhrSchedule = await getMHRSchedule();
    const youtubeVideos = await getYouTubeVideos();
    
    // Read settings from KV
    const settingsData = await getSettings();
    const settings = {
        mhrTeamId: settingsData?.mhrTeamId || '19758',
        mhrYear: settingsData?.mhrYear || '2025',
        teamName: settingsData?.teamName || 'Carolina Junior Canes (Black) 10U AA',
        identifiers: settingsData?.identifiers || ['Black', 'Jr Canes', 'Carolina', 'Jr']
    };

    // Check sync status and trigger background syncs if needed (every 2 hours)
    const syncStatus = await getSyncStatus();
    const calendarSyncStatus = await getCalendarSyncStatus();
    const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = process.env.VERCEL_URL || 'localhost:3000';
    const adminSecret = process.env.ADMIN_SECRET;
    
    // Trigger YouTube sync if needed
    const shouldTriggerYouTubeSync = !syncStatus.isRevalidating && 
        (!syncStatus.lastSyncTime || (new Date().getTime() - syncStatus.lastSyncTime) > COOLDOWN_MS);

    if (shouldTriggerYouTubeSync && adminSecret) {
        // Trigger YouTube sync in background (fire and forget)
        fetch(`${protocol}://${host}/api/admin/sync-youtube`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminSecret}`,
                'Content-Type': 'application/json'
            }
        }).catch(err => console.error('Background YouTube sync failed:', err));
    }

    // Trigger Schedule sync if needed
    const shouldTriggerScheduleSync = !calendarSyncStatus.isRevalidating && 
        (!calendarSyncStatus.lastSyncTime || (new Date().getTime() - calendarSyncStatus.lastSyncTime) > COOLDOWN_MS);

    if (shouldTriggerScheduleSync && adminSecret) {
        // Trigger schedule sync in background (fire and forget)
        fetch(`${protocol}://${host}/api/admin/sync-schedule`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminSecret}`,
                'Content-Type': 'application/json'
            }
        }).catch(err => console.error('Background schedule sync failed:', err));
    }

    
    // Filter for future games
    const now = new Date();
    const futureGames = schedule.filter((game: Game) => {
        const gameDateTime = new Date(`${game.game_date_format}T${game.game_time_format}`);
        return gameDateTime >= now;
    }).sort((a: Game, b: Game) => {
        const dateA = new Date(`${a.game_date_format}T${a.game_time_format}`);
        const dateB = new Date(`${b.game_date_format}T${b.game_time_format}`);
        return dateA.getTime() - dateB.getTime();
    });

    // Filter for past games from MHR (current season only)
    // Season runs from August 1st of MHR year to March 1st of (MHR year + 1)
    const mhrYear = settings.mhrYear || '2025';
    const seasonStartYear = mhrYear;
    const seasonEndYear = String(parseInt(mhrYear) + 1);
    const currentSeasonStart = new Date(`${seasonStartYear}-08-01T00:00:00`);
    const currentSeasonEnd = new Date(`${seasonEndYear}-03-01T23:59:59`);
    const pastGames = (mhrSchedule as unknown as Game[]).filter((game: Game) => {
        const gameDate = new Date(game.game_date_format || game.game_date);

        // Must be from current season
        if (gameDate < currentSeasonStart || gameDate >= currentSeasonEnd) return false;

        // Must be in the past (before today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return gameDate < today;
    }).sort((a: Game, b: Game) => {
        // Sort descending (most recent first)
        const dateA = new Date(a.game_date_format || a.game_date);
        const dateB = new Date(b.game_date_format || b.game_date);
        return dateB.getTime() - dateA.getTime();
    });

    // Check cache for enriched games (video-matched)
    let enrichedPastGames: Game[];
    const cachedEnrichedGames = await getEnrichedGames();

    if (cachedEnrichedGames && !isEnrichedGamesCacheStale(cachedEnrichedGames)) {
        // Use cached enriched games
        enrichedPastGames = cachedEnrichedGames.games;
    } else {
        // Cache miss or stale - compute and cache
        enrichedPastGames = matchVideosToGames(pastGames as Game[], youtubeVideos);
        await setEnrichedGames(enrichedPastGames);
    }

    // Enrich past games with stat session scores when MHR scores are invalid
    const statSessions = await getStatSessions();
    console.log(`[Next Game] Loaded ${statSessions.length} stat sessions for matching`);
    if (statSessions.length > 0) {
      console.log(`[Next Game] Sample stat sessions:`, statSessions.slice(0, 3).map(s => ({
        id: s.id,
        gameId: s.gameId,
        date: s.date,
        opponent: s.opponent,
        usGoals: s.usStats.goals,
        themGoals: s.themStats.goals
      })));
    }
    enrichedPastGames = enrichPastGamesWithStatScores(
        enrichedPastGames,
        statSessions,
        settings.teamName
    );

    // Enrich future games with upcoming/live video data
    const enrichedFutureGames = matchVideosToGames(futureGames as Game[], youtubeVideos);

    // Check if there are any live games (games with live stream URLs)
    const liveGames = enrichedFutureGames.filter((game: Game) => (game as unknown as { liveStreamUrl?: string }).liveStreamUrl);

    // Detect active live streams from YouTube videos (not just matched to games)
    // Prioritize actually live streams over upcoming ones
    const activeLiveStreams = youtubeVideos.filter((video): video is import('@/lib/youtube-service').YouTubeVideo => {
        return video.videoType === 'live' || video.videoType === 'upcoming';
    });

    // Get the most recent active live stream (prioritize live over upcoming)
    const activeLiveStream = activeLiveStreams
        .sort((a, b) => {
            // Sort live streams first, then upcoming
            if (a.videoType === 'live' && b.videoType !== 'live') return -1;
            if (a.videoType !== 'live' && b.videoType === 'live') return 1;
            return 0;
        })[0] || null;

    return <NextGameClient 
        futureGames={enrichedFutureGames} 
        pastGames={enrichedPastGames} 
        settings={settings} 
        syncStatus={syncStatus} 
        calendarSyncStatus={calendarSyncStatus} 
        liveGames={liveGames}
        activeLiveStream={activeLiveStream}
    />;
}
