import fs from 'fs';
import path from 'path';
import { headers } from 'next/headers';
import NextGameClient from './NextGameClient';
import { matchVideosToGames } from '@/utils/videoMatcher';
import youtubeVideos from '@/data/youtube-videos.json';

async function triggerSync() {
    try {
        const headersList = await headers();
        const host = headersList.get('host') || 'localhost:3000';
        const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
        
        // Fire and forget sync
        fetch(`${protocol}://${host}/api/admin/sync-schedule`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error('Background sync failed:', err));
    } catch (error) {
        console.error('Failed to trigger sync:', error);
    }
}

async function getSchedule() {
    const filePath = path.join(process.cwd(), 'src/data/schedule.json');
    
    // If file doesn't exist, we must sync and wait
    if (!fs.existsSync(filePath)) {
        console.log('Schedule missing, syncing synchronously...');
        // We can't easily call the API route synchronously here without full URL
        // So we'll return empty array and let the client side or background sync handle it?
        // Better: Import the sync logic directly for the "missing file" case to ensure we have data
        // But for now, let's try to trigger sync and return empty, or better yet, just return empty 
        // and let the user refresh. Or we could try to fetch from the API and await it.
        
        // For simplicity and robustness, if missing, we return empty but trigger sync
        await triggerSync();
        return [];
    }

    // Check if stale
    const stats = fs.statSync(filePath);
    const now = new Date();
    const ageInMs = now.getTime() - stats.mtime.getTime();
    const ONE_HOUR = 60 * 60 * 1000;

    if (ageInMs > ONE_HOUR) {
        console.log('Schedule stale, triggering background sync...');
        triggerSync(); // Fire and forget
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    try {
        return JSON.parse(fileContents);
    } catch (e) {
        return [];
    }
}

async function getMHRSchedule() {
    const filePath = path.join(process.cwd(), 'src/data/mhr-schedule.json');
    if (!fs.existsSync(filePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return [];
    }
}

export default async function NextGamePage() {
    const schedule = await getSchedule();
    const mhrSchedule = await getMHRSchedule();
    
    // Filter for future games
    const now = new Date();
    const futureGames = schedule.filter((game: any) => {
        const gameDateTime = new Date(`${game.game_date_format}T${game.game_time_format}`);
        return gameDateTime >= now;
    }).sort((a: any, b: any) => {
        const dateA = new Date(`${a.game_date_format}T${a.game_time_format}`);
        const dateB = new Date(`${b.game_date_format}T${b.game_time_format}`);
        return dateA.getTime() - dateB.getTime();
    });

    // Filter for past games from MHR (current season only: 2025-2026)
    const currentSeasonStart = new Date('2025-08-01'); // Season typically starts in August
    const pastGames = mhrSchedule.filter((game: any) => {
        const gameDate = new Date(game.game_date_format || game.game_date);
        
        // Must be from current season (after Aug 1, 2024)
        if (gameDate < currentSeasonStart) return false;
        
        // Must be in the past (before today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return gameDate < today;
    }).sort((a: any, b: any) => {
        // Sort descending (most recent first)
        const dateA = new Date(a.game_date_format || a.game_date);
        const dateB = new Date(b.game_date_format || b.game_date);
        return dateB.getTime() - dateA.getTime();
    });

    // Enrich past games with video links
    const enrichedPastGames = matchVideosToGames(pastGames, youtubeVideos);

    return <NextGameClient futureGames={futureGames} pastGames={enrichedPastGames} />;
}
