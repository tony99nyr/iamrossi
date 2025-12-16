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

// Chromium version should match @sparticuz/chromium-min package version
const CHROMIUM_VERSION = '143.0.0';
const CHROMIUM_URL = `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.x64.tar`;

/**
 * Retry a page navigation with exponential backoff
 * Handles 429 rate limiting with longer backoff
 */
async function retryNavigation(
    page: Page,
    url: string,
    options: { waitUntil: 'domcontentloaded' | 'networkidle'; timeout: number },
    maxRetries: number = 3
): Promise<void> {
    let lastError: Error | null = null;
    
    // Set up response listener to detect 429 errors
    let rateLimited = false;
    const responseHandler = (response: { status?: () => number }) => {
        if (response && response.status?.() === 429) {
            rateLimited = true;
        }
    };
    page.on('response', responseHandler);
    
    try {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            rateLimited = false;
            try {
                const response = await page.goto(url, options);
                
                // Check for 429 rate limiting
                if (response && response.status() === 429) {
                    rateLimited = true;
                }
                
                if (rateLimited) {
                    const retryAfter = response?.headers()?.['retry-after'];
                    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 5000;
                    const isLastAttempt = attempt === maxRetries;
                    
                    if (isLastAttempt) {
                        throw new Error(`Rate limited by YouTube after ${maxRetries} attempts. Please wait before trying again.`);
                    }
                    
                    debugLog(`[YouTube] Rate limited (429), waiting ${waitTime}ms before retry ${attempt}/${maxRetries}...`);
                    await page.waitForTimeout(waitTime);
                    continue;
                }
                
                // Success
                page.off('response', responseHandler);
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMessage = lastError.message.toLowerCase();
                const isLastAttempt = attempt === maxRetries;
                
                // Check if it's a rate limit error
                if (rateLimited || errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('rate limit')) {
                    const waitTime = Math.pow(2, attempt) * 5000; // 10s, 20s, 40s for rate limits
                    if (isLastAttempt) {
                        throw new Error(`Rate limited by YouTube after ${maxRetries} attempts. Please wait before trying again.`);
                    }
                    debugLog(`[YouTube] Rate limited, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}...`);
                    await page.waitForTimeout(waitTime);
                    continue;
                }
                
                if (isLastAttempt) {
                    page.off('response', responseHandler);
                    throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts: ${lastError.message}`);
                }
                
                // Exponential backoff: 2s, 4s, 8s for other errors
                const backoffMs = Math.pow(2, attempt) * 1000;
                debugLog(`[YouTube] Navigation attempt ${attempt} failed, retrying in ${backoffMs}ms...`);
                await page.waitForTimeout(backoffMs);
            }
        }
    } finally {
        page.off('response', responseHandler);
    }
    
    throw lastError || new Error('Navigation failed');
}

/**
 * Fallback extraction method using watch links when primary selectors fail
 * This is more resilient to YouTube DOM changes
 */
async function extractVideosFromWatchLinks(page: Page): Promise<YouTubeVideo[]> {
    debugLog('[YouTube] Using fallback extraction via watch links...');
    
    const videos = await page.evaluate(() => {
        const results: YouTubeVideo[] = [];
        const seenUrls = new Set<string>();
        
        // Find all watch links and extract video info from their parent containers
        const watchLinks = document.querySelectorAll('a[href*="/watch"]');
        
        watchLinks.forEach((link) => {
            try {
                const href = (link as HTMLAnchorElement).href;
                
                // Skip duplicate URLs and non-video links
                if (seenUrls.has(href) || !href.includes('/watch?v=')) return;
                
                // Try to find the video container (parent element with video info)
                const container = link.closest('ytd-rich-item-renderer, ytd-rich-grid-media, ytd-grid-video-renderer, ytd-video-renderer');
                if (!container) return;
                
                // Get title from the container
                const titleElement = container.querySelector('#video-title, yt-formatted-string#video-title');
                const title = titleElement?.textContent?.trim();
                
                // Skip if no title or title is just duration/metadata
                if (!title || title.match(/^\d+:\d+$/)) return;
                
                // Get metadata
                const metadataElement = container.querySelector('#metadata-line span');
                const publishDate = metadataElement?.textContent?.trim();
                
                // Clean the URL (remove tracking params)
                const cleanUrl = href.split('&pp=')[0];
                
                if (title && cleanUrl && !seenUrls.has(cleanUrl)) {
                    seenUrls.add(cleanUrl);
                    results.push({
                        title,
                        url: cleanUrl,
                        videoType: 'regular' as const,
                        publishDate
                    });
                }
            } catch {
                // Ignore individual element errors
            }
        });
        
        return results;
    });
    
    debugLog(`[YouTube] Fallback extraction found ${videos.length} videos`);
    return videos;
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
    // Increased wait time for serverless environments
    await page.waitForTimeout(3000);

    // Try to wait for video grid, but don't fail if not found
    let selectorFound = false;
    try {
        await page.waitForSelector('ytd-rich-grid-media, ytd-grid-video-renderer', { timeout: 20000 });
        selectorFound = true;
        debugLog('[YouTube] Video grid selector found');
    } catch {
        debugLog('[YouTube] Primary video grid selector not found, will try fallback');
    }

    // Scroll to load more videos
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
    }

    // Extract video data using primary method
    let videos = await page.evaluate(() => {
        const videoElements = document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer');
        const results: YouTubeVideo[] = [];

        videoElements.forEach((element: Element) => {
            try {
                // Get title
                const titleElement = element.querySelector('#video-title');
                const title = titleElement?.textContent?.trim();

                // Get URL - try multiple selectors
                let href: string | null = null;
                const linkSelectors = ['a#video-title-link', 'a#thumbnail', 'a[href*="/watch"]'];
                for (const selector of linkSelectors) {
                    const linkElement = element.querySelector(selector);
                    href = linkElement?.getAttribute('href') ?? null;
                    if (href) break;
                }
                const url = href ? `https://www.youtube.com${href.split('&pp=')[0]}` : null;

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

    debugLog(`[YouTube] Primary extraction found ${videos.length} videos`);
    
    // If primary extraction failed, try fallback
    if (videos.length === 0 && !selectorFound) {
        videos = await extractVideosFromWatchLinks(page);
    }

    debugLog(`[YouTube] Total videos from videos tab: ${videos.length}`);
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
    // Increased wait time for serverless environments
    await page.waitForTimeout(3000);

    // Scroll to load more content
    for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
    }

    // Extract stream data
    let streams = await page.evaluate(() => {
        const streamElements = document.querySelectorAll('ytd-rich-grid-media, ytd-grid-video-renderer');
        const results: YouTubeVideo[] = [];

        streamElements.forEach((element: Element) => {
            try {
                // Get title
                const titleElement = element.querySelector('#video-title');
                const title = titleElement?.textContent?.trim();

                // Get URL - try multiple selectors
                let href: string | null = null;
                const linkSelectors = ['a#video-title-link', 'a#thumbnail', 'a[href*="/watch"]'];
                for (const selector of linkSelectors) {
                    const linkElement = element.querySelector(selector);
                    href = linkElement?.getAttribute('href') ?? null;
                    if (href) break;
                }
                const url = href ? `https://www.youtube.com${href.split('&pp=')[0]}` : null;

                // Get metadata line text (YouTube uses this for "Scheduled for …" and "Streamed …")
                const metadataSpans = Array.from(element.querySelectorAll('#metadata-line span'))
                    .map(s => s.textContent?.trim())
                    .filter((s): s is string => Boolean(s));
                const metadataText = metadataSpans.join(' • ');

                // Detect live/upcoming. YouTube's markup changes frequently, so we use multiple signals:
                // - thumbnail overlay status renderer (LIVE / UPCOMING)
                // - badge classes (older markup)
                // - metadata text ("Scheduled", "Streaming in", "Starts in")
                let sawLive = false;
                let sawUpcoming = false;

                const overlayEls = element.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer');
                overlayEls.forEach((overlay) => {
                    const overlayStyle = overlay.getAttribute('overlay-style')?.toLowerCase() || '';
                    const overlayText = overlay.textContent?.toLowerCase() || '';

                    if (overlayStyle.includes('live') || overlayText.includes('live')) {
                        sawLive = true;
                    }
                    if (overlayStyle.includes('upcoming') || overlayText.includes('upcoming') || overlayText.includes('scheduled')) {
                        sawUpcoming = true;
                    }
                });

                const legacyBadges = element.querySelectorAll('.badge-style-type-live-now, .badge-style-type-upcoming');
                legacyBadges.forEach((badge) => {
                    const badgeText = badge.textContent?.toLowerCase() || '';
                    if (badgeText.includes('live')) sawLive = true;
                    if (badgeText.includes('upcoming') || badgeText.includes('scheduled')) sawUpcoming = true;
                });

                const lowerMeta = metadataText.toLowerCase();
                if (lowerMeta.includes('scheduled') || lowerMeta.includes('streaming in') || lowerMeta.includes('starts in')) {
                    sawUpcoming = true;
                }
                if (lowerMeta.includes('watching') && lowerMeta.includes('now')) {
                    sawLive = true;
                }

                const videoType: 'live' | 'upcoming' | 'regular' = sawLive ? 'live' : sawUpcoming ? 'upcoming' : 'regular';

                // Prefer the most useful publishDate string for upcoming/live parsing.
                const publishDate =
                    metadataSpans.find((s) => /scheduled|streaming in|starts in|watching now/i.test(s)) ??
                    metadataSpans[0];

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

    debugLog(`[YouTube] Primary streams extraction found ${streams.length} streams`);
    
    // If primary extraction failed, try fallback
    if (streams.length === 0) {
        streams = await extractVideosFromWatchLinks(page);
        // Mark these as regular since we can't detect live/upcoming without proper selectors
    }

    debugLog(`[YouTube] Total streams: ${streams.length}`);
    return streams;
}

/**
 * Fetch all videos from the YouTube channel (regular videos + live/upcoming streams)
 */
export async function fetchYouTubeVideos(): Promise<YouTubeVideo[]> {
    debugLog(`[YouTube] Starting scrape for channel: ${CHANNEL_HANDLE}`);
    
    // Prepare browser args - ensure no user data directory issues in serverless
    const browserArgs = [
        ...chromiumPkg.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ];
    
    debugLog(`[YouTube] Using Chromium v${CHROMIUM_VERSION}`);
    const browser = await chromium.launch({
        args: browserArgs,
        executablePath: await chromiumPkg.executablePath(CHROMIUM_URL),
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

        // Scrape sequentially to avoid rate limiting (429 errors)
        // Add delay between tabs to respect YouTube's rate limits
        let videos: YouTubeVideo[] = [];
        let streams: YouTubeVideo[] = [];
        let videosError: string | null = null;
        let streamsError: string | null = null;
        
        try {
            videos = await scrapeVideosTab(videosPage);
            debugLog(`[YouTube] Successfully scraped ${videos.length} videos`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            videosError = errorMessage;
            debugLog(`[YouTube] Error scraping videos tab: ${errorMessage}`);
            console.error('[YouTube] Error scraping videos tab:', error);
            
            // Capture diagnostic info when videos tab fails
            try {
                const diagnostics = await videosPage.evaluate(() => ({
                    title: document.title,
                    url: window.location.href,
                    bodyLength: document.body?.innerHTML?.length ?? 0,
                    hasConsentBanner: !!document.querySelector('[aria-label*="consent"], ytd-consent-bump-v2-lightbox'),
                    watchLinksCount: document.querySelectorAll('a[href*="/watch"]').length,
                    richGridCount: document.querySelectorAll('ytd-rich-grid-media').length
                }));
                console.error('[YouTube] Videos page diagnostics:', diagnostics);
            } catch {
                console.error('[YouTube] Could not capture diagnostics');
            }
        }
        
        // Wait between requests to avoid rate limiting
        await videosPage.waitForTimeout(3000);
        
        try {
            streams = await scrapeStreamsTab(streamsPage);
            debugLog(`[YouTube] Successfully scraped ${streams.length} streams`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            streamsError = errorMessage;
            debugLog(`[YouTube] Error scraping streams tab: ${errorMessage}`);
            console.error('[YouTube] Error scraping streams tab:', error);
        }

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
            // Include error details in the failure message
            const errorDetails = [
                videosError ? `Videos tab error: ${videosError}` : null,
                streamsError ? `Streams tab error: ${streamsError}` : null
            ].filter(Boolean).join('; ');
            
            throw new Error(`Failed to scrape any videos from both tabs. ${errorDetails || 'This may indicate YouTube is blocking the scraper or the channel structure has changed.'}`);
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
