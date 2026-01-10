import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { logDebug } from '@/lib/logger';
import type { InstagramSavedPost, InstagramSavedPostsResponse } from '@/types';

/**
 * Instagram service for scraping saved/bookmarked posts
 * Uses Playwright with session cookie authentication
 * 
 * IMPORTANT: This uses scraping which may violate Instagram's Terms of Service.
 * Use at your own risk. Consider using Instagram's official data export instead.
 */

type InstagramCarouselEdge = {
  node: {
    display_url?: string;
    is_video?: boolean;
    video_url?: string;
    video_versions?: Array<{
      url: string;
      width: number;
      height: number;
    }>;
  };
};

interface InstagramPostNode {
  node: {
    id?: string; // Instagram post ID
    shortcode: string;
    display_url?: string;
    is_video?: boolean;
    video_url?: string;
    video_versions?: Array<{
      url: string;
      width: number;
      height: number;
    }>;
    edge_sidecar_to_children?: {
      edges?: Array<InstagramCarouselEdge>;
    };
    edge_media_to_caption?: {
      edges: Array<{
        node: {
          text: string;
        };
      }>;
    };
    owner?: {
      username?: string;
      full_name?: string;
    };
    edge_liked_by?: {
      count?: number;
    };
    edge_media_to_comment?: {
      count?: number;
    };
    taken_at_timestamp?: number;
  };
}

interface InstagramGraphQLResponse {
  data?: {
    user?: {
      saved?: {
        edges?: InstagramPostNode[];
        page_info?: {
          has_next_page?: boolean;
          end_cursor?: string;
        };
      };
    };
  };
}

/**
 * Parses Instagram session cookie string into Playwright cookie format
 * Expected format: "sessionid=value; csrftoken=value; ..."
 */
function parseInstagramCookies(cookieString: string): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
}> {
  const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];
  const parts = cookieString.split(';').map(p => p.trim());

  for (const part of parts) {
    const [name, ...valueParts] = part.split('=');
    if (name && valueParts.length > 0) {
      const value = valueParts.join('='); // Handle values that might contain '='
      cookies.push({
        name: name.trim(),
        value: value.trim(),
        domain: '.instagram.com',
        path: '/',
      });
    }
  }

  return cookies;
}

/**
 * Fetches saved posts from Instagram using GraphQL API
 * Requires a valid session cookie
 */
export async function fetchInstagramSavedPosts(
  sessionCookie?: string,
  maxPosts: number = 50
): Promise<InstagramSavedPostsResponse> {
  if (!sessionCookie) {
    throw new Error('Instagram session cookie is required. Set INSTAGRAM_SESSION_COOKIE environment variable.');
  }

  logDebug('[Instagram] Starting to fetch saved posts...');

  const browser = await chromium.launch({
    args: chromiumPkg.args,
    executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar'),
    headless: true,
  });

  try {
    const cookies = parseInstagramCookies(sessionCookie);
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    // Add session cookies
    await context.addCookies(cookies);

    const page = await context.newPage();

    // Navigate to saved posts page (user-specific URL)
    logDebug('[Instagram] Navigating to saved posts page...');
    await page.goto('https://www.instagram.com/tonyoftherossi/saved/all-posts/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000, // Increased timeout to 60 seconds
    });

    // Wait for content to load - Instagram can be slow
    logDebug('[Instagram] Waiting for page to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if we're logged in (look for login redirect or saved posts content)
    const currentUrl = page.url();
    if (currentUrl.includes('/accounts/login') || currentUrl.includes('/accounts/')) {
      throw new Error('Invalid session cookie. Please check your INSTAGRAM_SESSION_COOKIE.');
    }

    // Intercept GraphQL requests to get saved posts data
    const savedPostsDataRef: { data: InstagramGraphQLResponse | null } = { data: null };
    let allPosts: InstagramSavedPost[] = [];

    // Set up request interception to capture GraphQL responses
    await page.route('**/graphql/query/**', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      // Look for saved posts query
      if (postData && postData.includes('saved')) {
        try {
          logDebug('[Instagram] Intercepting GraphQL saved posts query');
          const response = await route.fetch();
          const json = await response.json() as InstagramGraphQLResponse;
          
          if (json && json.data && json.data.user && json.data.user.saved) {
            savedPostsDataRef.data = json;
            logDebug(`[Instagram] Captured GraphQL data: ${json.data.user.saved.edges?.length || 0} posts`);
          } else {
            logDebug('[Instagram] GraphQL response missing saved data', { hasData: !!json?.data, hasUser: !!json?.data?.user, hasSaved: !!json?.data?.user?.saved });
          }
        } catch (error) {
          logDebug('[Instagram] Error intercepting GraphQL response:', { error: error instanceof Error ? error.message : String(error) });
        }
      }
      
      await route.continue();
    });

    // Wait a bit more for content to fully render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Scroll to trigger loading more posts
    let scrollAttempts = 0;
    const maxScrollAttempts = 5;
    
    while (scrollAttempts < maxScrollAttempts && allPosts.length < maxPosts) {
      // Scroll down to load more content
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to extract posts from the page
      const posts = await page.evaluate((maxCount) => {
        const posts: InstagramSavedPost[] = [];
        
        // Look for post links in the saved posts grid
        const postLinks = document.querySelectorAll('a[href*="/p/"]');
        
        for (const link of Array.from(postLinks).slice(0, maxCount)) {
          const href = link.getAttribute('href');
          if (!href) continue;
          
          // Extract shortcode from URL (e.g., /p/ABC123/ -> ABC123)
          const shortcodeMatch = href.match(/\/p\/([^\/]+)/);
          if (!shortcodeMatch) continue;
          
          const shortcode = shortcodeMatch[1];
          
          // Avoid duplicates
          if (posts.some(p => p.shortcode === shortcode)) continue;
          
          // Find the best quality image/video URL
          let imageUrl: string | undefined;
          
          // Method 1: Look for img tag with srcset (highest quality)
          const img = link.querySelector('img') as HTMLImageElement | null;
          if (img) {
            const srcset = img.getAttribute('srcset');
            if (srcset) {
              // Get the highest resolution from srcset (last entry is usually highest)
              const srcsetEntries = srcset.split(',').map(s => s.trim());
              const highestRes = srcsetEntries[srcsetEntries.length - 1];
              imageUrl = highestRes.split(' ')[0]; // Get URL part before width descriptor
            } else if (img.src) {
              imageUrl = img.src;
            }
          }
          
          // Method 2: Look for nested images if not found
          if (!imageUrl) {
            const nestedImgs = link.querySelectorAll('img');
            for (const nestedImg of Array.from(nestedImgs)) {
              const imgEl = nestedImg as HTMLImageElement;
              if (imgEl.src && imgEl.src.includes('instagram')) {
                const srcset = imgEl.getAttribute('srcset');
                if (srcset) {
                  const srcsetEntries = srcset.split(',').map(s => s.trim());
                  const highestRes = srcsetEntries[srcsetEntries.length - 1];
                  imageUrl = highestRes.split(' ')[0];
                } else {
                  imageUrl = imgEl.src;
                }
                break;
              }
            }
          }
          
          // Method 3: Look for video poster/thumbnail
          if (!imageUrl) {
            const video = link.querySelector('video') as HTMLVideoElement | null;
            if (video) {
              imageUrl = video.poster || video.getAttribute('poster') || undefined;
            }
          }
          
          // Check if it's a video or reel
          const isVideo = link.querySelector('svg[aria-label*="video"]') !== null ||
                         link.querySelector('[aria-label*="Video"]') !== null ||
                         link.querySelector('svg[aria-label*="reel"]') !== null ||
                         link.querySelector('svg[aria-label*="Reel"]') !== null ||
                         link.querySelector('video') !== null ||
                         href.includes('/reel/');
          
          // Extract author username - try multiple methods
          let authorUsername: string | undefined;
          
          // Method 1: Look for username in aria-label
          const ariaLabel = link.getAttribute('aria-label') || '';
          const ariaMatch = ariaLabel.match(/@([a-zA-Z0-9._]+)/);
          if (ariaMatch) {
            authorUsername = ariaMatch[1];
          }
          
          // Method 2: Look for username in the link's parent container and siblings
          if (!authorUsername) {
            // Try multiple parent levels
            let current: Element | null = link;
            for (let i = 0; i < 5 && current; i++) {
              current = current.parentElement;
              if (!current) break;
              
              // Look for links to user profiles in this container
              const userLinks = current.querySelectorAll('a[href^="/"]');
              for (const userLink of Array.from(userLinks)) {
                const userHref = userLink.getAttribute('href');
                if (userHref && userHref.startsWith('/') && 
                    !userHref.includes('/p/') && 
                    !userHref.includes('/reel/') &&
                    !userHref.includes('/explore/') &&
                    !userHref.includes('/accounts/') &&
                    userHref !== '/') {
                  // Extract username from /username/ or /username
                  const userMatch = userHref.match(/\/([a-zA-Z0-9._]+)\/?$/);
                  if (userMatch && 
                      userMatch[1] !== 'p' && 
                      userMatch[1] !== 'reel' && 
                      userMatch[1] !== 'explore' &&
                      userMatch[1] !== 'accounts' &&
                      userMatch[1].length > 1) {
                    authorUsername = userMatch[1];
                    break;
                  }
                }
              }
              if (authorUsername) break;
            }
          }
          
          // Method 3: Look for username in title, alt text, or data attributes
          if (!authorUsername) {
            const title = link.getAttribute('title') || link.getAttribute('alt') || '';
            const titleMatch = title.match(/@([a-zA-Z0-9._]+)/);
            if (titleMatch) {
              authorUsername = titleMatch[1];
            }
          }
          
          // Method 4: Look for username in nearby text content (check multiple levels)
          if (!authorUsername) {
            let current: Element | null = link;
            for (let i = 0; i < 5 && current; i++) {
              current = current.parentElement;
              if (!current) break;
              
              const text = current.textContent || '';
              const textMatch = text.match(/@([a-zA-Z0-9._]+)/);
              if (textMatch) {
                authorUsername = textMatch[1];
                break;
              }
            }
          }
          
          // Method 5: Look for username in data attributes or aria-labels of parent elements
          if (!authorUsername) {
            let current: Element | null = link;
            for (let i = 0; i < 5 && current; i++) {
              current = current.parentElement;
              if (!current) break;
              
              const ariaLabel = current.getAttribute('aria-label') || '';
              const ariaMatch = ariaLabel.match(/@([a-zA-Z0-9._]+)/);
              if (ariaMatch) {
                authorUsername = ariaMatch[1];
                break;
              }
            }
          }
          
          // Try to extract post ID from data attributes
          let postId: string | undefined;
          const dataId = link.getAttribute('data-id') || 
                        link.getAttribute('data-post-id') ||
                        link.closest('[data-id]')?.getAttribute('data-id');
          if (dataId && /^\d+$/.test(dataId)) {
            postId = dataId;
          }
          
          // Use shortcode as fallback ID if no numeric ID found
          const finalId = postId || shortcode;
          
          // Try to extract date from time element
          let postedAt: string | undefined;
          const timeElement = link.querySelector('time');
          if (timeElement) {
            const datetime = timeElement.getAttribute('datetime');
            if (datetime) {
              postedAt = new Date(datetime).toISOString();
            } else {
              const title = timeElement.getAttribute('title');
              if (title) {
                const date = new Date(title);
                if (!isNaN(date.getTime())) {
                  postedAt = date.toISOString();
                }
              }
            }
          }

          // Extract video URL if it's a video
          let videoUrl: string | undefined;
          if (isVideo) {
            const video = link.querySelector('video') as HTMLVideoElement | null;
            if (video) {
              const source = video.querySelector('source');
              if (source && source.src) {
                videoUrl = source.src;
              } else if (video.src) {
                videoUrl = video.src;
              }
            }
          }

          posts.push({
            id: finalId,
            shortcode,
            url: `https://www.instagram.com/p/${shortcode}/`,
            imageUrl: imageUrl || undefined,
            videoUrl,
            isVideo: isVideo || undefined,
            authorUsername: authorUsername,
            postedAt,
          });
        }
        
        return posts;
      }, maxPosts);

      // Merge new posts
      for (const post of posts) {
        if (!allPosts.some(p => p.shortcode === post.shortcode)) {
          allPosts.push(post);
        }
      }

      scrollAttempts++;
      
      // If we got savedPostsData from GraphQL, use that instead
      const graphqlResponse = savedPostsDataRef.data;
      if (graphqlResponse?.data?.user?.saved?.edges) {
        logDebug(`[Instagram] Using GraphQL data: ${graphqlResponse.data.user.saved.edges.length} posts`);
        // Debug: Check for video posts in GraphQL
        const videoCount = graphqlResponse.data.user.saved.edges.filter((e: InstagramPostNode) => e.node.is_video).length;
        logDebug(`[Instagram] GraphQL: Found ${videoCount} video posts in GraphQL data`);
        
        allPosts = graphqlResponse.data.user.saved.edges.map((edge: InstagramPostNode) => {
                const node = edge.node;
                const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text;
                
                // Check if it's a carousel/slideshow
                const isCarousel = !!node.edge_sidecar_to_children?.edges && node.edge_sidecar_to_children.edges.length > 0;
                const mediaItems = isCarousel && node.edge_sidecar_to_children?.edges
                  ? node.edge_sidecar_to_children.edges.map((childEdge) => ({
                      imageUrl: childEdge.node.display_url,
                      videoUrl: childEdge.node.video_url || (childEdge.node.video_versions && childEdge.node.video_versions.length > 0
                        ? childEdge.node.video_versions[0].url
                        : undefined),
                      isVideo: childEdge.node.is_video || false,
                    }))
                  : undefined;
                
                // Extract video URL for single video posts
                let videoUrl: string | undefined;
                if (!isCarousel && node.is_video) {
                  if (node.video_versions && node.video_versions.length > 0) {
                    videoUrl = node.video_versions[0].url;
                    logDebug(`[Instagram] GraphQL: Found video URL from video_versions for ${node.shortcode}`, { 
                      shortcode: node.shortcode,
                      videoUrlPreview: videoUrl.substring(0, 80) 
                    });
                  } else if (node.video_url && !node.video_url.startsWith('blob:')) {
                    videoUrl = node.video_url;
                    logDebug(`[Instagram] GraphQL: Found video URL from video_url for ${node.shortcode}`, { 
                      shortcode: node.shortcode,
                      videoUrlPreview: videoUrl.substring(0, 80) 
                    });
                  } else {
                    logDebug(`[Instagram] GraphQL: Video post ${node.shortcode} but no valid video URL`, {
                      shortcode: node.shortcode,
                      hasVideoUrl: !!node.video_url,
                      videoUrlIsBlob: node.video_url?.startsWith('blob:'),
                      videoVersionsCount: node.video_versions?.length || 0
                    });
                  }
                }

                return {
                  id: node.id || node.shortcode, // Use numeric ID if available, fallback to shortcode
                  shortcode: node.shortcode,
                  url: `https://www.instagram.com/p/${node.shortcode}/`,
                  caption: caption || undefined,
                  imageUrl: node.display_url || undefined,
                  videoUrl,
                  mediaItems,
                  isCarousel,
                  isVideo: node.is_video || false,
                  authorUsername: node.owner?.username,
                  authorFullName: node.owner?.full_name,
                  likesCount: node.edge_liked_by?.count,
                  commentsCount: node.edge_media_to_comment?.count,
                  // Note: Instagram doesn't provide saved date in API, so savedAt is left undefined
                  // The importedAt field (set later) represents the saved order (newest saved first)
                  savedAt: undefined,
                  postedAt: node.taken_at_timestamp 
                    ? new Date(node.taken_at_timestamp * 1000).toISOString()
                    : undefined,
                };
              });
              break; // Got GraphQL data, no need to continue scrolling
      }
    }

    // Limit to maxPosts
    allPosts = allPosts.slice(0, maxPosts);

    // Enrich posts with account names and video URLs by visiting embed pages
    // Using /embed/ URLs bypasses rate limiting that affects direct post URLs
    logDebug(`[Instagram] Enriching posts with video URLs using embed pages...`);
    for (let i = 0; i < allPosts.length; i++) {
      const post = allPosts[i];
      if (post.url) {
        let postPage;
        try {
          postPage = await context.newPage();
          
          // Use embed URL instead of direct post URL to avoid 429 rate limiting
          const embedUrl = post.url.endsWith('/') ? `${post.url}embed/` : `${post.url}/embed/`;
          
          // Process embed page with timeout
          const postProcessPromise = (async () => {
            await postPage.goto(embedUrl, {
              waitUntil: 'networkidle',
              timeout: 20000,
            });
            
            // Wait for video element to load
            await new Promise(resolve => setTimeout(resolve, 3000));
          })();
          
          // Hard timeout after 25 seconds per post
          await Promise.race([
            postProcessPromise,
            new Promise((resolve) => {
              setTimeout(() => {
                logDebug(`[Instagram] Timeout for post ${i + 1}/${allPosts.length} (${post.shortcode}) - continuing`);
                resolve(undefined);
              }, 25000);
            })
          ]).catch(() => {
            // Ignore errors, continue to next post
          });
          
          // Check if embed page loaded properly
          const currentUrl = postPage.url();
          if (currentUrl.includes('/accounts/login')) {
            logDebug(`[Instagram] Post ${i + 1} redirected to login, skipping`);
            await postPage.close();
            continue;
          }

          // Extract media from embed page - handles both single posts and carousels
          try {
            // First, check if this is a carousel by looking for Next button
            const nextButtonLocator = postPage.locator('[aria-label*="Next"], [aria-label*="next"]').first();
            const isCarouselEmbed = await nextButtonLocator.isVisible().catch(() => false);
            
            if (isCarouselEmbed) {
              // It's a carousel - collect all media items by clicking through slides
              const mediaItems: Array<{ imageUrl?: string; videoUrl?: string; isVideo: boolean }> = [];
              let lastMediaUrl = '';
              let noChangeCount = 0;
              
              for (let slideIndex = 0; slideIndex < 20; slideIndex++) {
                // Wait for slide content to load/change
                await new Promise(r => setTimeout(r, 2000));
                
                // Extract current slide's media
                const slideMedia = await postPage.evaluate(() => {
                  const video = document.querySelector('video');
                  if (video) {
                    const vidEl = video as HTMLVideoElement;
                    const videoUrl = vidEl.src && !vidEl.src.startsWith('blob:') ? vidEl.src : 
                                    (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') ? vidEl.currentSrc : null);
                    
                    // Also get image URL as thumbnail
                    const imgs = document.querySelectorAll('img[src*="cdninstagram"]');
                    let imageUrl: string | null = null;
                    for (const img of Array.from(imgs)) {
                      const src = (img as HTMLImageElement).src;
                      if (src && !src.includes('profile') && !src.includes('avatar')) {
                        imageUrl = src;
                        break;
                      }
                    }
                    
                    return { videoUrl, imageUrl, isVideo: true };
                  }
                  
                  // No video, get image
                  const imgs = document.querySelectorAll('img[src*="cdninstagram"]');
                  for (const img of Array.from(imgs)) {
                    const src = (img as HTMLImageElement).src;
                    if (src && !src.includes('profile') && !src.includes('avatar')) {
                      return { imageUrl: src, videoUrl: null, isVideo: false };
                    }
                  }
                  
                  return null;
                });
                
                const currentMediaUrl = slideMedia?.videoUrl || slideMedia?.imageUrl || '';
                
                // Check if content changed
                if (currentMediaUrl === lastMediaUrl) {
                  noChangeCount++;
                  if (noChangeCount >= 2) break; // No change after 2 attempts
                } else {
                  noChangeCount = 0;
                  lastMediaUrl = currentMediaUrl;
                  
                  if (slideMedia && currentMediaUrl) {
                    // Check if we've looped back to first slide
                    if (mediaItems.length > 0) {
                      const firstItem = mediaItems[0];
                      if ((slideMedia.videoUrl && firstItem.videoUrl === slideMedia.videoUrl) ||
                          (!slideMedia.videoUrl && slideMedia.imageUrl && firstItem.imageUrl === slideMedia.imageUrl)) {
                        break; // Looped back to first
                      }
                    }
                    
                    mediaItems.push({
                      imageUrl: slideMedia.imageUrl || undefined,
                      videoUrl: slideMedia.videoUrl || undefined,
                      isVideo: slideMedia.isVideo,
                    });
                  }
                }
                
                // Try to click Next using Playwright locator
                const isNextVisible = await nextButtonLocator.isVisible().catch(() => false);
                if (!isNextVisible) break;
                
                await nextButtonLocator.click().catch(() => {});
              }
              
              if (mediaItems.length > 0) {
                post.isCarousel = true;
                post.mediaItems = mediaItems;
                // Set first video URL as main videoUrl if any
                const firstVideo = mediaItems.find(m => m.isVideo && m.videoUrl);
                if (firstVideo) {
                  post.videoUrl = firstVideo.videoUrl;
                  post.isVideo = true;
                }
                logDebug(`[Instagram] ✅ Found carousel with ${mediaItems.length} items for post ${i + 1}/${allPosts.length} (${post.shortcode})`, {
                  videoCount: mediaItems.filter(m => m.isVideo).length,
                  imageCount: mediaItems.filter(m => !m.isVideo).length,
                });
              }
            } else {
              // Single post - simple extraction
              const videoData = await postPage.evaluate(() => {
                let videoUrl: string | null = null;
                let imageUrl: string | null = null;
                
                // Get video URL from video element
                const video = document.querySelector('video');
                if (video) {
                  const vidEl = video as HTMLVideoElement;
                  videoUrl = vidEl.src && !vidEl.src.startsWith('blob:') ? vidEl.src : 
                            (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') ? vidEl.currentSrc : null);
                }
                
                // Get image URL
                const imgs = document.querySelectorAll('img[src*="cdninstagram"]');
                for (const img of Array.from(imgs)) {
                  const src = (img as HTMLImageElement).src;
                  if (src && !src.includes('profile') && !src.includes('avatar')) {
                    imageUrl = src;
                    break;
                  }
                }
                
                return { videoUrl, imageUrl };
              });
              
              if (videoData.videoUrl) {
                post.videoUrl = videoData.videoUrl;
                post.isVideo = true;
                logDebug(`[Instagram] ✅ Found video URL for post ${i + 1}/${allPosts.length} (${post.shortcode}): ${videoData.videoUrl.substring(0, 80)}...`);
              } else {
                // Check if embed has a "Play" button indicating it's a video that requires Instagram
                const hasPlayButton = await postPage.evaluate(() => {
                  const links = document.querySelectorAll('a');
                  for (const link of Array.from(links)) {
                    const text = link.textContent?.toLowerCase() || '';
                    const ariaLabel = link.getAttribute('aria-label')?.toLowerCase() || '';
                    if (text.includes('play') || text.includes('watch') || 
                        ariaLabel.includes('play') || ariaLabel.includes('watch')) {
                      return true;
                    }
                  }
                  return false;
                }).catch(() => false);
                
                if (hasPlayButton) {
                  logDebug(`[Instagram] Embed has play button but no video element for post ${i + 1}/${allPosts.length} (${post.shortcode}), trying authenticated scrape...`);
                  // Close embed page and try authenticated direct URL
                  await postPage.close().catch(() => {});
                  postPage = await context.newPage();
                  
                  try {
                    // Navigate to direct post URL with authentication
                    await postPage.goto(post.url, {
                      waitUntil: 'domcontentloaded',
                      timeout: 20000,
                    });
                    
                    // Wait for content to load
                    await new Promise(r => setTimeout(r, 3000));
                    
                    // Try to extract video URL from the authenticated page
                    const authVideoData = await postPage.evaluate(() => {
                      let videoUrl: string | null = null;
                      
                      // Method 1: Direct video element
                      const video = document.querySelector('video');
                      if (video) {
                        const vidEl = video as HTMLVideoElement;
                        videoUrl = vidEl.src && !vidEl.src.startsWith('blob:') ? vidEl.src : 
                                  (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') ? vidEl.currentSrc : null);
                        if (videoUrl) return { videoUrl, source: 'video-element' };
                      }
                      
                      // Method 2: Check for video URL in page data/scripts
                      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                      for (const script of Array.from(scripts)) {
                        try {
                          const data = JSON.parse(script.textContent || '');
                          if (data.video?.contentUrl) {
                            return { videoUrl: data.video.contentUrl, source: 'ld-json' };
                          }
                          if (data.contentUrl) {
                            return { videoUrl: data.contentUrl, source: 'ld-json' };
                          }
                        } catch {
                          // Ignore parse errors
                        }
                      }
                      
                      // Method 3: Check og:video meta tag
                      const ogVideo = document.querySelector('meta[property="og:video"]');
                      if (ogVideo) {
                        const content = ogVideo.getAttribute('content');
                        if (content && content.includes('.mp4')) {
                          return { videoUrl: content, source: 'og-video' };
                        }
                      }
                      
                      // Method 4: Search for video URLs in all scripts
                      const allScripts = document.querySelectorAll('script');
                      for (const script of Array.from(allScripts)) {
                        const text = script.textContent || '';
                        // Look for CDN video URLs
                        const videoMatch = text.match(/"video_url":"([^"]+)"/);
                        if (videoMatch) {
                          // Unescape the URL
                          const url = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                          if (url.includes('.mp4') || url.includes('cdninstagram')) {
                            return { videoUrl: url, source: 'script-data' };
                          }
                        }
                        
                        // Also try video_versions pattern
                        const versionsMatch = text.match(/"video_versions":\s*\[([^\]]+)\]/);
                        if (versionsMatch) {
                          const urlMatch = versionsMatch[1].match(/"url":"([^"]+)"/);
                          if (urlMatch) {
                            const url = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                            return { videoUrl: url, source: 'video-versions' };
                          }
                        }
                      }
                      
                      return { videoUrl: null, source: null };
                    }).catch(() => ({ videoUrl: null, source: null }));
                    
                    if (authVideoData.videoUrl) {
                      post.videoUrl = authVideoData.videoUrl;
                      post.isVideo = true;
                      logDebug(`[Instagram] ✅ Found video URL via authenticated scrape (${authVideoData.source}) for post ${i + 1}/${allPosts.length} (${post.shortcode}): ${authVideoData.videoUrl.substring(0, 80)}...`);
                    } else {
                      logDebug(`[Instagram] No video found even with authenticated scrape for post ${i + 1}/${allPosts.length} (${post.shortcode})`);
                    }
                  } catch (authError) {
                    logDebug(`[Instagram] Authenticated scrape failed for post ${i + 1}: ${authError instanceof Error ? authError.message : String(authError)}`);
                  }
                } else {
                  logDebug(`[Instagram] No video in embed page for post ${i + 1}/${allPosts.length} (${post.shortcode})`);
                }
              }
            }
          } catch (error) {
            logDebug(`[Instagram] Error extracting from embed page for post ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          // Always close the page, even on error
          try {
            await postPage.close();
          } catch {
            // Ignore close errors
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logDebug(`[Instagram] Error processing post ${i + 1}/${allPosts.length} (${post.shortcode}): ${error instanceof Error ? error.message : String(error)}`);
          // Try to close page even on error
          if (postPage) {
            try {
              await postPage.close().catch(() => {});
            } catch {
              // Ignore
            }
          }
          // Continue with next post even if this one fails
        }
      }
    }

    logDebug(`[Instagram] Fetched ${allPosts.length} saved posts`);

    return {
      posts: allPosts,
      lastSynced: new Date().toISOString(),
      totalCount: allPosts.length,
    };

  } catch (error) {
    console.error('[Instagram] Error fetching saved posts:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Validates that the session cookie format looks correct
 */
export function validateSessionCookie(cookieString: string): boolean {
  if (!cookieString || cookieString.trim().length === 0) {
    return false;
  }
  
  // Check for common Instagram cookie names
  const hasSessionId = cookieString.includes('sessionid=');
  const hasCsrfToken = cookieString.includes('csrftoken=');
  
  return hasSessionId || hasCsrfToken;
}

