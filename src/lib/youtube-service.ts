import { chromium, Page } from 'playwright-core';
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
 * Retry a page navigation with exponential backoff
 */
async function retryNavigation(
    page: Page,
    url: string,
    options: { waitUntil: 'domcontentloaded' | 'networkidle'; timeout: number },
    maxRetries: number = 3
): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, options);
            return; // Success
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const isLastAttempt = attempt === maxRetries;
            
            if (isLastAttempt) {
                throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts: ${lastError.message}`);
            }
            
            // Exponential backoff: 1s, 2s, 4s
            const backoffMs = Math.pow(2, attempt - 1) * 1000;
            debugLog(`[YouTube] Navigation attempt ${attempt} failed, retrying in ${backoffMs}ms...`);
            await page.waitForTimeout(backoffMs);
        }
    }
    
    throw lastError || new Error('Navigation failed');
}

/**
 * Scrape videos from the YouTube channel's videos tab
 */
async function scrapeVideosTab(page: Page): Promise<YouTubeVideo[]> {
    debugLog('[YouTube] Scraping videos tab...');
    
    const url = `https://www.youtube.com/${CHANNEL_HANDLE}/videos`;
    await retryNavigation(page, url, {
        waitUntil: 'networkidle',
        timeout: 45000
    });

    // Wait for YouTube's JavaScript to fully render content
    await page.waitForTimeout(2000);

    // Wait for video grid to load
    await page.waitForSelector('ytd-rich-grid-media, ytd-grid-video-renderer', { timeout: 15000 });

    // Scroll to load more videos
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
    }

    // Extract video data
    const videos = await page.evaluate(() => {
        const videoElements = document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer');
        const results: YouTubeVideo[] = [];

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
async function scrapeStreamsTab(page: Page): Promise<YouTubeVideo[]> {
    debugLog('[YouTube] Scraping streams tab...');
    
    const url = `https://www.youtube.com/${CHANNEL_HANDLE}/streams`;
    await retryNavigation(page, url, {
        waitUntil: 'networkidle',
        timeout: 45000
    });

    // Wait for YouTube's JavaScript to fully render content
    await page.waitForTimeout(2000);

    // Scroll to load more content
    for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
    }

    // Extract stream data
    const streams = await page.evaluate(() => {
        const streamElements = document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer');
        const results: YouTubeVideo[] = [];

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
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',
            timezoneId: 'America/New_York'
        });

        // Create separate pages for each tab to avoid navigation conflicts
        const videosPage = await context.newPage();
        const streamsPage = await context.newPage();

        // Scrape both tabs in parallel with separate pages
        const [videos, streams] = await Promise.all([
            scrapeVideosTab(videosPage).catch(error => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                debugLog(`[YouTube] Error scraping videos tab: ${errorMessage}`);
                console.error('[YouTube] Error scraping videos tab:', error);
                return [];
            }),
            scrapeStreamsTab(streamsPage).catch(error => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                debugLog(`[YouTube] Error scraping streams tab: ${errorMessage}`);
                console.error('[YouTube] Error scraping streams tab:', error);
                return [];
            })
        ]);

        // Close pages
        await Promise.all([
            videosPage.close().catch(() => {}),
            streamsPage.close().catch(() => {})
        ]);

        // Combine and deduplicate by URL
        const allVideos = [...videos, ...streams];
        const uniqueVideos = Array.from(
            new Map(allVideos.map(v => [v.url, v])).values()
        );

        debugLog(`[YouTube] Total unique videos: ${uniqueVideos.length} (${videos.length} from videos tab, ${streams.length} from streams tab)`);
        
        if (videos.length === 0 && streams.length === 0) {
            throw new Error('Failed to scrape any videos from both tabs. This may indicate YouTube is blocking the scraper or the channel structure has changed.');
        }
        
        if (videos.length === 0) {
            debugLog('[YouTube] Warning: Videos tab returned no results, but streams tab succeeded');
        }
        
        if (streams.length === 0) {
            debugLog('[YouTube] Warning: Streams tab returned no results, but videos tab succeeded');
        }

        return uniqueVideos;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[YouTube] Scraping failed:', error);
        throw new Error(`YouTube scraping failed: ${errorMessage}`);
    } finally {
        await browser.close();
    }
}
