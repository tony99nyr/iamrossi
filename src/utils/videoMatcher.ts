import type { Game } from '@/types';

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

export function matchVideosToGames(games: Game[], videos: Video[]): EnrichedGame[] {
    return games.map(game => {
        const gameDate = new Date(game.game_date_format || game.game_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const gameDateOnly = new Date(gameDate);
        gameDateOnly.setHours(0, 0, 0, 0);
        
        // Find videos that match this game's date
        const matchingVideos = videos.filter(video => {
            const videoDate = extractDateFromTitle(video.title);
            if (!videoDate) return false;
            
            return isSameDay(gameDate, videoDate);
        });

        if (matchingVideos.length === 0) return game;

        // Categorize videos by type
        let highlightsUrl: string | undefined;
        let fullGameUrl: string | undefined;
        let upcomingStreamUrl: string | undefined;
        let liveStreamUrl: string | undefined;

        matchingVideos.forEach(video => {
            const isHighlights = video.title.toLowerCase().includes('highlights');
            
            // Handle based on video type
            if (video.videoType === 'live') {
                liveStreamUrl = video.url;
            } else if (video.videoType === 'upcoming') {
                upcomingStreamUrl = video.url;
            } else {
                // Regular past videos
                if (isHighlights) {
                    highlightsUrl = video.url;
                } else {
                    fullGameUrl = video.url;
                }
            }
        });

        return {
            ...game,
            highlightsUrl,
            fullGameUrl,
            upcomingStreamUrl,
            liveStreamUrl
        };
    });
}

function extractDateFromTitle(title: string): Date | null {
    // Common formats in the JSON:
    // "Nov 8 2025", "Nov. 8, 2025", "Oct 12 2025", "Sep. 28, 2025"
    // Regex to capture Month Day Year
    const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i;
    
    const match = title.match(dateRegex);
    if (match) {
        const monthStr = match[1];
        const dayStr = match[2];
        const yearStr = match[3];
        
        const dateStr = `${monthStr} ${dayStr} ${yearStr}`;
        const date = new Date(dateStr);
        
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    
    return null;
}

function isSameDay(d1: Date, d2: Date): boolean {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

