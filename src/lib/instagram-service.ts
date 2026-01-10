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

          // Extract video URL from embed page - simple DOM extraction
          // The embed page has video URLs directly in <video> elements (no GraphQL needed)
          try {
            const videoData = await postPage.evaluate(() => {
              let videoUrl: string | null = null;
              const debugInfo: Record<string, unknown> = {};
              
              // Get video URL from video element - embed pages have the CDN URL directly
              const videoElements = document.querySelectorAll('video');
              debugInfo.videoElementsCount = videoElements.length;
              
              for (const videoElement of Array.from(videoElements)) {
                const vidEl = videoElement as HTMLVideoElement;
                
                // Check src first - embed pages have the actual CDN URL here
                if (vidEl.src && !vidEl.src.startsWith('blob:') && 
                    (vidEl.src.includes('.mp4') || vidEl.src.includes('cdninstagram'))) {
                  videoUrl = vidEl.src;
                  debugInfo.videoUrlSource = 'video element src';
                  break;
                }
                
                // Check currentSrc
                if (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') && 
                    (vidEl.currentSrc.includes('.mp4') || vidEl.currentSrc.includes('cdninstagram'))) {
                  videoUrl = vidEl.currentSrc;
                  debugInfo.videoUrlSource = 'video element currentSrc';
                  break;
                }
              }
              
              // Get thumbnail from image if no video
              let thumbnailUrl: string | null = null;
              if (!videoUrl) {
                const imgs = document.querySelectorAll('img[src*="cdninstagram"]');
                for (const img of Array.from(imgs)) {
                  const src = (img as HTMLImageElement).src;
                  if (src && !src.includes('profile') && !src.includes('avatar')) {
                    thumbnailUrl = src;
                    break;
                  }
                }
              }
              
              return { videoUrl, thumbnailUrl, debugInfo };
            });
            
            if (videoData.videoUrl) {
              post.videoUrl = videoData.videoUrl;
              post.isVideo = true;
              logDebug(`[Instagram] ✅ Found video URL for post ${i + 1}/${allPosts.length} (${post.shortcode}): ${videoData.videoUrl.substring(0, 80)}...`);
            } else {
              logDebug(`[Instagram] No video in embed page for post ${i + 1}/${allPosts.length} (${post.shortcode}) - videoElements: ${videoData.debugInfo.videoElementsCount}`);
            }
          } catch (error) {
            logDebug(`[Instagram] Error extracting from embed page for post ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          // Always close the page, even on error
          try {
            await postPage.close();
          } catch (closeError) {
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

