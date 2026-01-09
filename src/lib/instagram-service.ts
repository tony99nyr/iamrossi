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
      edges?: Array<{
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
      }>;
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
    await page.waitForTimeout(5000);

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
          const response = await route.fetch();
          const json = await response.json() as InstagramGraphQLResponse;
          
          if (json && json.data && json.data.user && json.data.user.saved) {
            savedPostsDataRef.data = json;
          }
        } catch (error) {
          console.error('[Instagram] Error intercepting GraphQL response:', error);
        }
      }
      
      await route.continue();
    });

    // Wait a bit more for content to fully render
    await page.waitForTimeout(3000);
    
    // Scroll to trigger loading more posts
    let scrollAttempts = 0;
    const maxScrollAttempts = 5;
    
    while (scrollAttempts < maxScrollAttempts && allPosts.length < maxPosts) {
      // Scroll down to load more content
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await page.waitForTimeout(2000);
      
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
                  savedAt: node.taken_at_timestamp 
                    ? new Date(node.taken_at_timestamp * 1000).toISOString()
                    : undefined,
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

    // Enrich posts with account names and video URLs by visiting each post page
    logDebug(`[Instagram] Enriching posts with account names and video URLs...`);
    for (let i = 0; i < allPosts.length; i++) {
      const post = allPosts[i];
      // Visit ALL post pages to extract video URLs (even if account name is already known)
      // This ensures we get video URLs for all video posts
      if (post.url) {
        try {
          // Visit the post page to get account name
          const postPage = await context.newPage();
          await postPage.goto(post.url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          });
          
          // Wait for content to load (videos need more time to load)
          await postPage.waitForTimeout(3000);
          
          // Wait for video elements to potentially load
          try {
            await postPage.waitForSelector('video', { timeout: 2000 }).catch(() => {
              // Video element might not exist (for image posts), that's OK
            });
            
            // Wait for video to load and get actual CDN URL (not blob URL)
            // Instagram initially loads videos as blob URLs, then replaces them with CDN URLs
            // We need to wait and poll until we get the actual CDN URL
            try {
              await postPage.evaluate(() => {
                return new Promise<void>((resolve) => {
                  const video = document.querySelector('video');
                  if (!video) {
                    resolve();
                    return;
                  }
                  
                  const vidEl = video as HTMLVideoElement;
                  
                  // Check if we already have a non-blob URL
                  const checkUrl = () => {
                    // Check currentSrc first (most reliable)
                    if (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') && 
                        (vidEl.currentSrc.includes('.mp4') || vidEl.currentSrc.includes('cdninstagram'))) {
                      return true;
                    }
                    // Check src
                    if (vidEl.src && !vidEl.src.startsWith('blob:') && 
                        (vidEl.src.includes('.mp4') || vidEl.src.includes('cdninstagram'))) {
                      return true;
                    }
                    // Check source element
                    const source = video.querySelector('source');
                    if (source) {
                      const sourceEl = source as HTMLSourceElement;
                      if (sourceEl.src && !sourceEl.src.startsWith('blob:') && 
                          (sourceEl.src.includes('.mp4') || sourceEl.src.includes('cdninstagram'))) {
                        return true;
                      }
                    }
                    return false;
                  };
                  
                  if (checkUrl()) {
                    resolve();
                    return;
                  }
                  
                  // Poll for non-blob URL (check every 500ms, up to 15 seconds)
                  let attempts = 0;
                  const maxAttempts = 30;
                  const poll = setInterval(() => {
                    attempts++;
                    if (checkUrl() || attempts >= maxAttempts) {
                      clearInterval(poll);
                      resolve();
                    }
                  }, 500);
                  
                  // Also listen for loadedmetadata event
                  const onLoadedMetadata = () => {
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    // Give it a moment for URL to update
                    setTimeout(() => {
                      if (checkUrl()) {
                        clearInterval(poll);
                        resolve();
                      }
                    }, 1000);
                  };
                  
                  video.addEventListener('loadedmetadata', onLoadedMetadata);
                  
                  // Timeout after 15 seconds
                  setTimeout(() => {
                    clearInterval(poll);
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    resolve();
                  }, 15000);
                });
              });
            } catch {
              // Ignore errors
            }
          } catch {
            // Ignore - not all posts have videos
          }
          
          // Check if we're still on the post page (not redirected)
          const currentUrl = postPage.url();
          if (!currentUrl.includes('/p/') && !currentUrl.includes('/reel/')) {
            logDebug(`[Instagram] Post ${i + 1} redirected to ${currentUrl}, skipping account name extraction`);
            await postPage.close();
            continue;
          }
          
          // Extract account name and post ID from the post page
          const pageData = await postPage.evaluate(() => {
            let username: string | null = null;
            let postId: string | null = null;
            
            // Method 1: Look for username in meta tags (og:url) - most reliable
            const ogUrlTags = document.querySelectorAll('meta[property="og:url"]');
            for (const meta of Array.from(ogUrlTags)) {
              const content = meta.getAttribute('content');
              if (content) {
                // Match pattern: instagram.com/username/p/...
                const match = content.match(/instagram\.com\/([a-zA-Z0-9._]+)\/p\//);
                if (match && match[1]) {
                  const foundUsername = match[1];
                  // Filter out common non-username paths
                  if (foundUsername !== 'reels' && 
                      foundUsername !== 'saved' && 
                      foundUsername !== 'explore' &&
                      foundUsername !== 'accounts' &&
                      foundUsername.length > 1) {
                    username = foundUsername;
                    break;
                  }
                }
              }
            }
            
            // Method 2: Look for username in page title
            if (!username) {
              const title = document.title;
              const titleMatch = title.match(/([a-zA-Z0-9._]+) on Instagram/);
              if (titleMatch && titleMatch[1]) {
                const foundUsername = titleMatch[1];
                if (foundUsername !== 'reels' && foundUsername !== 'saved' && foundUsername.length > 1) {
                  username = foundUsername;
                }
              }
            }
            
            // Method 3: Look for username in article header
            if (!username) {
              const article = document.querySelector('article');
              if (article) {
                const headerLinks = article.querySelectorAll('header a[href^="/"]');
                for (const link of Array.from(headerLinks)) {
                  const href = link.getAttribute('href');
                  if (href && href.startsWith('/') && 
                      !href.includes('/p/') && 
                      !href.includes('/reel/') &&
                      !href.includes('/explore/') &&
                      !href.includes('/accounts/') &&
                      href !== '/') {
                    const userMatch = href.match(/\/([a-zA-Z0-9._]+)\/?$/);
                    if (userMatch && userMatch[1]) {
                      const foundUsername = userMatch[1];
                      if (foundUsername !== 'p' && 
                          foundUsername !== 'reel' && 
                          foundUsername !== 'explore' &&
                          foundUsername !== 'accounts' &&
                          foundUsername !== 'reels' &&
                          foundUsername !== 'saved' &&
                          foundUsername.length > 1) {
                        username = foundUsername;
                        break;
                      }
                    }
                  }
                }
              }
            }
            
            // Extract post ID - Method 1: Look for post ID in window._sharedData (most reliable)
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sharedData = (window as any)._sharedData;
              // Try to get the actual media ID from the post page data
              if (sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media) {
                const media = sharedData.entry_data.PostPage[0].graphql.shortcode_media;
                // The ID should be the media ID, not the owner ID
                if (media.id && String(media.id).length > 10) {
                  postId = String(media.id);
                }
              }
            } catch {
              // Ignore errors
            }
            
            // Method 2: Look for post ID in script tags (JSON-LD)
            if (!postId) {
              const scripts = document.querySelectorAll('script[type="application/ld+json"]');
              for (const script of Array.from(scripts)) {
                try {
                  const data = JSON.parse(script.textContent || '');
                  if (data.mainEntityOfPage && data.mainEntityOfPage['@id']) {
                    const idMatch = data.mainEntityOfPage['@id'].match(/\/(\d+)\//);
                    if (idMatch) {
                      postId = idMatch[1];
                      break;
                    }
                  }
                } catch {
                  // Ignore JSON parse errors
                }
              }
            }
            
            // Method 3: Look for post ID in meta tags
            if (!postId) {
              const idMetaTags = document.querySelectorAll('meta[property*="id"]');
              for (const meta of Array.from(idMetaTags)) {
                const content = meta.getAttribute('content');
                if (content && /^\d+$/.test(content)) {
                  postId = content;
                  break;
                }
              }
            }
            
            return { username, postId };
          });
          
          if (pageData.username) {
            post.authorUsername = pageData.username;
            logDebug(`[Instagram] Found account name for post ${i + 1}/${allPosts.length}: @${pageData.username}`);
          }
          
          if (pageData.postId && pageData.postId !== post.id) {
            post.id = pageData.postId;
            logDebug(`[Instagram] Found post ID for post ${i + 1}/${allPosts.length}: ${pageData.postId}`);
          }

          // Extract video URL, carousel media, and postedAt from the post page
          // NOTE: This extraction is wrapped in try-catch to handle serialization errors
          try {
            let pageData: { videoUrl: string | null; postedAt: string | null; mediaItems: Array<{ imageUrl?: string; videoUrl?: string; isVideo?: boolean }> | null; isCarousel: boolean; debugInfo: Record<string, unknown> } | null = null;
            try {
              pageData = await postPage.evaluate(() => {
              let videoUrl: string | null = null;
              let postedAt: string | null = null;
              let mediaItems: Array<{ imageUrl?: string; videoUrl?: string; isVideo?: boolean }> | null = null;
              let isCarousel = false;
              const debugInfo: Record<string, unknown> = {};
              
              // Method 1: Extract from _sharedData (GraphQL data) - most reliable
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const sharedData = (window as any)._sharedData;
                debugInfo.hasSharedData = !!sharedData;
                debugInfo.hasEntryData = !!sharedData?.entry_data;
                debugInfo.hasPostPage = !!sharedData?.entry_data?.PostPage?.[0];
                debugInfo.hasGraphQL = !!sharedData?.entry_data?.PostPage?.[0]?.graphql;
                
                if (sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media) {
                  const media = sharedData.entry_data.PostPage[0].graphql.shortcode_media;
                  debugInfo.isVideo = media.is_video;
                  debugInfo.hasVideoUrl = !!media.video_url;
                  debugInfo.hasVideoVersions = !!(media.video_versions && media.video_versions.length > 0);
                  debugInfo.videoUrlValue = media.video_url;
                  debugInfo.videoVersionsCount = media.video_versions?.length || 0;
                  debugInfo.videoVersionsFirstUrl = media.video_versions?.[0]?.url;
                  
                  // Check if it's a carousel
                  if (media.edge_sidecar_to_children?.edges && media.edge_sidecar_to_children.edges.length > 0) {
                    isCarousel = true;
                    debugInfo.isCarousel = true;
                    debugInfo.carouselItemsCount = media.edge_sidecar_to_children.edges.length;
                    mediaItems = media.edge_sidecar_to_children.edges.map((edge: any) => {
                      const itemVideoUrl = edge.node.video_url || (edge.node.video_versions && edge.node.video_versions.length > 0
                        ? edge.node.video_versions[0].url
                        : undefined);
                      return {
                        imageUrl: edge.node.display_url,
                        videoUrl: itemVideoUrl,
                        isVideo: edge.node.is_video || false,
                      };
                    });
                    debugInfo.carouselVideoUrls = mediaItems ? mediaItems.map(item => item.videoUrl).filter(Boolean) : [];
                  } else {
                    // Single media post
                    // Get video URL - prioritize video_versions (higher quality)
                    if (media.is_video) {
                      if (media.video_versions && media.video_versions.length > 0) {
                        // Get the highest quality video (first in array is usually highest)
                        videoUrl = media.video_versions[0].url;
                        debugInfo.videoUrlSource = 'video_versions[0]';
                      } else if (media.video_url && !media.video_url.startsWith('blob:')) {
                        // Fallback to video_url if available and not a blob URL
                        videoUrl = media.video_url;
                        debugInfo.videoUrlSource = 'video_url';
                      } else {
                        debugInfo.videoUrlSource = 'none (blob URL or missing)';
                      }
                    }
                  }
                  
                  // Get postedAt timestamp
                  if (media.taken_at_timestamp) {
                    postedAt = new Date(media.taken_at_timestamp * 1000).toISOString();
                  }
                } else {
                  debugInfo.reason = 'No shortcode_media in GraphQL';
                }
              } catch (error) {
                debugInfo.graphqlError = error instanceof Error ? error.message : String(error);
              }
              
              // Method 2: Extract video URL from video element (fallback)
              // NOTE: Skip blob URLs - they're temporary and won't work after page closes
              // IMPORTANT: If GraphQL didn't work, check DOM video element - it often has the actual CDN URL
              // We need to wait for the blob URL to be replaced with the actual CDN URL
              if (!videoUrl && !isCarousel) {
                const videoElement = document.querySelector('video');
                debugInfo.hasVideoElement = !!videoElement;
                if (videoElement) {
                  const vidEl = videoElement as HTMLVideoElement;
                  
                  // Check all possible sources for a non-blob URL
                  const checkForUrl = () => {
                    // Check currentSrc first (most reliable)
                    if (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') && 
                        (vidEl.currentSrc.includes('.mp4') || vidEl.currentSrc.includes('cdninstagram'))) {
                      return vidEl.currentSrc;
                    }
                    // Check src
                    if (vidEl.src && !vidEl.src.startsWith('blob:') && 
                        (vidEl.src.includes('.mp4') || vidEl.src.includes('cdninstagram'))) {
                      return vidEl.src;
                    }
                    // Check source element
                    const source = videoElement.querySelector('source');
                    if (source) {
                      const sourceEl = source as HTMLSourceElement;
                      if (sourceEl.src && !sourceEl.src.startsWith('blob:') && 
                          (sourceEl.src.includes('.mp4') || sourceEl.src.includes('cdninstagram'))) {
                        return sourceEl.src;
                      }
                    }
                    return null;
                  };
                  
                  // Try to get URL immediately
                  const foundUrl = checkForUrl();
                  if (foundUrl) {
                    videoUrl = foundUrl;
                    debugInfo.videoUrlSource = 'video element (immediate)';
                    if (!debugInfo.isVideo) {
                      debugInfo.isVideo = true;
                    }
                  } else {
                    // Store initial state for debugging
                    debugInfo.videoElementSrc = vidEl.src;
                    debugInfo.videoElementCurrentSrc = vidEl.currentSrc;
                    const source = videoElement.querySelector('source');
                    debugInfo.videoSourceSrc = source ? (source as HTMLSourceElement).src : null;
                    debugInfo.videoSrcIsBlob = vidEl.src.startsWith('blob:');
                    debugInfo.currentSrcIsBlob = vidEl.currentSrc.startsWith('blob:');
                  }
                  
                  // Also check for video in nested containers (skip blob URLs)
                  if (!videoUrl) {
                    const allVideos = document.querySelectorAll('video');
                    debugInfo.allVideosCount = allVideos.length;
                    for (const vid of Array.from(allVideos)) {
                      const vidSrc = (vid as HTMLVideoElement).src;
                      const vidSource = vid.querySelector('source');
                      const sourceSrc = vidSource ? (vidSource as HTMLSourceElement).src : null;
                      if (sourceSrc && !sourceSrc.startsWith('blob:') && (sourceSrc.includes('.mp4') || sourceSrc.includes('cdninstagram'))) {
                        videoUrl = sourceSrc;
                        debugInfo.videoUrlSource = 'nested video source';
                        break;
                      } else if (vidSrc && !vidSrc.startsWith('blob:') && (vidSrc.includes('.mp4') || vidSrc.includes('cdninstagram'))) {
                        videoUrl = vidSrc;
                        debugInfo.videoUrlSource = 'nested video src';
                        break;
                      }
                    }
                  }
                  
                  // If we found a video URL from DOM but GraphQL didn't mark it as video, mark it now
                  if (videoUrl && !debugInfo.isVideo) {
                    debugInfo.isVideo = true;
                  }
                }
              }
              
              // Method 3: Extract carousel from DOM (fallback)
              if (!isCarousel) {
                // Look for carousel indicators
                const carouselIndicators = document.querySelectorAll('[role="button"][aria-label*="carousel"], [role="button"][aria-label*="slide"]');
                if (carouselIndicators.length > 1) {
                  isCarousel = true;
                  // Try to extract all media items from the carousel
                  const carouselItems: Array<{ imageUrl?: string; videoUrl?: string; isVideo?: boolean }> = [];
                  const carouselContainer = document.querySelector('article');
                  if (carouselContainer) {
                    const images = carouselContainer.querySelectorAll('img[src*="instagram"]');
                    const videos = carouselContainer.querySelectorAll('video');
                    
                    // Collect unique image URLs
                    const imageUrls = new Set<string>();
                    images.forEach((img) => {
                      const src = (img as HTMLImageElement).src;
                      if (src && src.includes('instagram') && !src.includes('profile')) {
                        imageUrls.add(src);
                      }
                    });
                    
                    // Collect video URLs
                    videos.forEach((video) => {
                      const src = (video as HTMLVideoElement).src;
                      const source = video.querySelector('source');
                      const videoSrc = source ? (source as HTMLSourceElement).src : src;
                      if (videoSrc) {
                        carouselItems.push({
                          videoUrl: videoSrc,
                          isVideo: true,
                        });
                      }
                    });
                    
                    // Add images that aren't videos
                    imageUrls.forEach((url) => {
                      if (!carouselItems.some(item => item.imageUrl === url)) {
                        carouselItems.push({ imageUrl: url });
                      }
                    });
                    
                    if (carouselItems.length > 0) {
                      mediaItems = carouselItems;
                    }
                  }
                }
              }
              
              // Method 4: Look for time element with datetime attribute
              if (!postedAt) {
                const timeElement = document.querySelector('time[datetime]');
                if (timeElement) {
                  const datetime = timeElement.getAttribute('datetime');
                  if (datetime) {
                    postedAt = new Date(datetime).toISOString();
                  }
                }
              }
              
              return { videoUrl, postedAt, mediaItems, isCarousel, debugInfo };
            });
          } catch (evalError) {
            // Handle serialization errors (e.g., __name is not defined)
            logDebug(`[Instagram] Error in page.evaluate for post ${i + 1}/${allPosts.length} (${post.shortcode}): ${evalError instanceof Error ? evalError.message : String(evalError)}`);
            pageData = { videoUrl: null, postedAt: null, mediaItems: null, isCarousel: false, debugInfo: { error: evalError instanceof Error ? evalError.message : String(evalError) } };
          }
          
          if (pageData) {
            // Always log video extraction results for debugging
            logDebug(`[Instagram] Video extraction for post ${i + 1}/${allPosts.length} (${post.shortcode})`, {
              foundVideoUrl: !!pageData.videoUrl,
              isVideo: pageData.debugInfo?.isVideo,
              isCarousel: pageData.isCarousel,
              videoUrlSource: pageData.debugInfo?.videoUrlSource,
              videoUrlPreview: pageData.videoUrl ? pageData.videoUrl.substring(0, 80) : null,
              hasSharedData: pageData.debugInfo?.hasSharedData,
              hasGraphQL: pageData.debugInfo?.hasGraphQL,
              hasVideoVersions: pageData.debugInfo?.hasVideoVersions,
              videoVersionsCount: pageData.debugInfo?.videoVersionsCount,
              hasVideoElement: pageData.debugInfo?.hasVideoElement,
              videoElementSrc: pageData.debugInfo?.videoElementSrc ? (pageData.debugInfo.videoElementSrc as string).substring(0, 80) : null,
              videoSrcIsBlob: pageData.debugInfo?.videoSrcIsBlob,
            });
            
            if (pageData.isCarousel && pageData.mediaItems) {
              post.isCarousel = true;
              post.mediaItems = pageData.mediaItems;
              logDebug(`[Instagram] Found carousel with ${pageData.mediaItems.length} items for post ${i + 1}/${allPosts.length}`);
            } else if (pageData.videoUrl && !pageData.videoUrl.startsWith('blob:')) {
              // Found a video URL - mark as video and set URL (skip blob URLs)
              post.videoUrl = pageData.videoUrl;
              post.isVideo = true;
              logDebug(`[Instagram] Found video URL for post ${i + 1}/${allPosts.length}: ${pageData.videoUrl.substring(0, 50)}...`);
            } else if (pageData.debugInfo?.isVideo && !pageData.videoUrl) {
              // Detected as video from DOM but no URL extracted
              logDebug(`[Instagram] Warning: Post ${i + 1} detected as video from DOM but no video URL extracted`);
            } else if (post.isVideo && !post.videoUrl) {
              // If marked as video but no URL found, try one more time to extract
              logDebug(`[Instagram] Warning: Post ${i + 1} marked as video but no video URL extracted (or only blob URL found)`);
            } else if (pageData.videoUrl && pageData.videoUrl.startsWith('blob:')) {
              // Found blob URL - skip it, it won't work
              logDebug(`[Instagram] Skipping blob URL for post ${i + 1}/${allPosts.length} - need actual CDN URL`);
            }
            
            // If debugInfo shows isVideo but we didn't set it, check if we should
            if (pageData.debugInfo?.isVideo && !post.isVideo && pageData.videoUrl) {
              post.isVideo = true;
              logDebug(`[Instagram] Marking post ${i + 1} as video based on DOM detection`);
            }
            
            if (pageData.postedAt && !post.postedAt) {
              post.postedAt = pageData.postedAt;
            }
            } else {
              // pageData is null due to error - log it
              logDebug(`[Instagram] Skipping video extraction for post ${i + 1}/${allPosts.length} (${post.shortcode}) due to evaluation error`);
            }
          } catch (error) {
            // Ignore errors extracting video URL and date
            logDebug(`[Instagram] Error extracting video URL/date/carousel for post ${i + 1}: ${error}`);
          }
          
          await postPage.close();
          
          // Small delay to avoid rate limiting
          await page.waitForTimeout(500);
        } catch (error) {
          console.error(`[Instagram] Error fetching account name for post ${post.url}:`, error);
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

