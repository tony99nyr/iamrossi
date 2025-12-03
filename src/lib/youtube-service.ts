import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { debugLog } from '@/lib/logger';

export interface YouTubeVideo {
    title: string;
    url: string;
    videoType: 'regular' | 'upcoming' | 'live';
    publishDate?: string;
}

const CHANNEL_HANDLE = process.env.YOUTUBE_CHANNEL_HANDLE || '@2015JuniorCanes';

/**
 * Scrape videos from the YouTube channel's videos tab
 */
async function scrapeVideosTab(page: any): Promise<YouTubeVideo[]> {
    debugLog('[YouTube] Scraping videos tab...');
    
    await page.goto(`https://www.youtube.com/${CHANNEL_HANDLE}/videos`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    // Wait for video grid to load
    await page.waitForSelector('ytd-rich-grid-media, ytd-grid-video-renderer', { timeout: 10000 });

    // Scroll to load more videos
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
    }

    // Extract video data
    const videos = await page.evaluate(() => {
        const videoElements = document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer');
        const results: any[] = [];

        videoElements.forEach((element: Element) => {
            try {
                // Get title
                const titleElement = element.querySelector('#video-title');
                const title = titleElement?.textContent?.trim();

                // Get URL
                const linkElement = element.querySelector('a#video-title-link, a#thumbnail');
                const href = linkElement?.getAttribute('href');
                const url = href ? `https://www.youtube.com${href}` : null;

                // Get metadata text (includes date)
                const metadataElement = element.querySelector('#metadata-line span');
                const publishDate = metadataElement?.textContent?.trim();

                if (title && url) {
                    results.push({
                        title,
                        url,
                        videoType: 'regular',
                        publishDate
                    });
                }
            } catch (error) {
                console.error('Error parsing video element:', error);
            }
        });

        return results;
    });

    debugLog(`[YouTube] Found ${videos.length} videos`);
    return videos;
}

/**
 * Scrape live and upcoming streams from the YouTube channel's streams tab
 */
async function scrapeStreamsTab(page: any): Promise<YouTubeVideo[]> {
    debugLog('[YouTube] Scraping streams tab...');
    
    await page.goto(`https://www.youtube.com/${CHANNEL_HANDLE}/streams`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Scroll to load more content
    for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
    }

    // Extract stream data
    const streams = await page.evaluate(() => {
        const streamElements = document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer');
        const results: any[] = [];

        streamElements.forEach((element: Element) => {
            try {
                // Get title
                const titleElement = element.querySelector('#video-title');
                const title = titleElement?.textContent?.trim();

                // Get URL
                const linkElement = element.querySelector('a#video-title-link, a#thumbnail');
                const href = linkElement?.getAttribute('href');
                const url = href ? `https://www.youtube.com${href}` : null;

                // Check for live/upcoming badges
                const badges = element.querySelectorAll('.badge-style-type-live-now, .badge-style-type-upcoming');
                let videoType: 'live' | 'upcoming' | 'regular' = 'regular';
                
                badges.forEach((badge: Element) => {
                    const badgeText = badge.textContent?.toLowerCase() || '';
                    if (badgeText.includes('live')) {
                        videoType = 'live';
                    } else if (badgeText.includes('upcoming') || badgeText.includes('scheduled')) {
                        videoType = 'upcoming';
                    }
                });

                // Get metadata (date/time for upcoming, or streamed date for past)
                const metadataElement = element.querySelector('#metadata-line span');
                const publishDate = metadataElement?.textContent?.trim();

                if (title && url) {
                    results.push({
                        title,
                        url,
                        videoType,
                        publishDate
                    });
                }
            } catch (error) {
                console.error('Error parsing stream element:', error);
            }
        });

        return results;
    });

    debugLog(`[YouTube] Found ${streams.length} streams`);
    return streams;
}

/**
 * Fetch all videos from the YouTube channel (regular videos + live/upcoming streams)
 */
export async function fetchYouTubeVideos(): Promise<YouTubeVideo[]> {
    debugLog(`[YouTube] Starting scrape for channel: ${CHANNEL_HANDLE}`);
    
    const browser = await chromium.launch({
        args: chromiumPkg.args,
        executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar'),
        headless: true,
    });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();

        // Scrape both tabs
        const [videos, streams] = await Promise.all([
            scrapeVideosTab(page).catch(error => {
                console.error('[YouTube] Error scraping videos tab:', error);
                return [];
            }),
            scrapeStreamsTab(page).catch(error => {
                console.error('[YouTube] Error scraping streams tab:', error);
                return [];
            })
        ]);

        // Combine and deduplicate by URL
        const allVideos = [...videos, ...streams];
        const uniqueVideos = Array.from(
            new Map(allVideos.map(v => [v.url, v])).values()
        );

        debugLog(`[YouTube] Total unique videos: ${uniqueVideos.length}`);
        return uniqueVideos;

    } catch (error) {
        console.error('[YouTube] Scraping failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}
