/**
 * Test script to verify video URL extraction from a specific Instagram post
 * Run with: npx tsx scripts/test-specific-post.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { validateSessionCookie } from '../src/lib/instagram-service';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function main() {
  console.log('🧪 Testing Specific Video Post Extraction\n');

  const sessionCookie = process.env.INSTAGRAM_SESSION_COOKIE;
  if (!sessionCookie || !validateSessionCookie(sessionCookie)) {
    console.error('❌ ERROR: INSTAGRAM_SESSION_COOKIE is not set or invalid');
    process.exit(1);
  }

  const testUrl = process.argv[2] || 'https://www.instagram.com/p/DTFjQWuEv_x/';
  console.log(`📥 Testing post: ${testUrl}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: chromiumPkg.args,
    executablePath: await chromiumPkg.executablePath(),
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Parse and inject session cookie
    const [sessionId, csrfToken] = sessionCookie.split(';').map(s => s.trim());
    const sessionIdValue = sessionId.split('=')[1];
    const csrfTokenValue = csrfToken?.split('=')[1] || '';

    await context.addCookies([
      {
        name: 'sessionid',
        value: sessionIdValue,
        domain: '.instagram.com',
        path: '/',
      },
      {
        name: 'csrftoken',
        value: csrfTokenValue,
        domain: '.instagram.com',
        path: '/',
      },
    ]);

    console.log('🔍 Navigating to post page...\n');
    
    // Capture network requests to find video URLs
    const videoUrls: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('.mp4') || (url.includes('cdninstagram') && url.includes('video'))) {
        videoUrls.push(url);
      }
    });
    
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Check if we're on the right page or redirected
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}\n`);
    
    if (currentUrl.includes('/accounts/login') || currentUrl.includes('/accounts/')) {
      console.error('❌ ERROR: Redirected to login page. Session cookie may be invalid.\n');
      await browser.close();
      process.exit(1);
    }
    
    // Wait for page content to load
    try {
      // Wait for article or main content
      await page.waitForSelector('article', { timeout: 10000 }).catch(() => {});
    } catch {
      // Ignore
    }
    
    await page.waitForTimeout(3000);

    // Try to find and click play button if video exists
    try {
      const playButton = await page.$('button[aria-label*="Play"], button[aria-label*="play"], [role="button"][aria-label*="video"]');
      if (playButton) {
        console.log('▶️  Found play button, clicking...\n');
        await playButton.click();
        await page.waitForTimeout(3000);
      }
    } catch {
      // Ignore
    }

    // Wait for video to potentially load
    try {
      await page.waitForSelector('video', { timeout: 10000 }).catch(() => {
        // Video might not exist, that's OK
      });
    } catch {
      // Ignore
    }

    // Wait a bit more for video URLs to resolve from blob to CDN
    await page.waitForTimeout(5000);
    
    // Check page HTML structure
    const pageHtml = await page.content();
    const hasVideoTag = pageHtml.includes('<video');
    const hasSharedData = pageHtml.includes('_sharedData');
    console.log(`📄 Page HTML check: hasVideoTag=${hasVideoTag}, hasSharedData=${hasSharedData}\n`);
    
    console.log(`📡 Found ${videoUrls.length} video URLs in network requests:\n`);
    videoUrls.forEach((url, i) => {
      console.log(`   ${i + 1}. ${url.substring(0, 100)}...`);
    });
    console.log('');

    console.log('📊 Extracting data from page...\n');
    const pageData = await page.evaluate(() => {
      const debugInfo: Record<string, unknown> = {};
      let videoUrl: string | null = null;
      let isVideo = false;
      
      // Method 1: Check all possible window data structures
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        debugInfo.hasSharedData = !!win._sharedData;
        debugInfo.hasAdditionalData = !!win.__additionalDataLoaded;
        debugInfo.hasXDT = !!win.xdt;
        debugInfo.windowKeys = Object.keys(win).filter(k => k.includes('shared') || k.includes('data') || k.includes('graphql'));
        
        // Try to find data in script tags
        const scripts = document.querySelectorAll('script');
        debugInfo.scriptTagsCount = scripts.length;
        const scriptContents: string[] = [];
        scripts.forEach((script, i) => {
          const text = script.textContent || '';
          if (text.includes('shortcode_media') || text.includes('video_url') || text.includes('video_versions')) {
            scriptContents.push(`Script ${i}: ${text.substring(0, 200)}...`);
          }
        });
        debugInfo.relevantScripts = scriptContents;
        
        // Try _sharedData first
        if (win._sharedData) {
          const sharedData = win._sharedData;
          debugInfo.hasEntryData = !!sharedData.entry_data;
          debugInfo.hasPostPage = !!sharedData.entry_data?.PostPage?.[0];
          debugInfo.hasGraphQL = !!sharedData.entry_data?.PostPage?.[0]?.graphql;
          
          if (sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media) {
            const media = sharedData.entry_data.PostPage[0].graphql.shortcode_media;
            debugInfo.isVideo = media.is_video;
            debugInfo.hasVideoUrl = !!media.video_url;
            debugInfo.hasVideoVersions = !!(media.video_versions && media.video_versions.length > 0);
            debugInfo.videoUrlValue = media.video_url;
            debugInfo.videoVersionsCount = media.video_versions?.length || 0;
            debugInfo.videoVersionsFirstUrl = media.video_versions?.[0]?.url;
            debugInfo.shortcode = media.shortcode;
            
            if (media.is_video) {
              isVideo = true;
              if (media.video_versions && media.video_versions.length > 0) {
                videoUrl = media.video_versions[0].url;
                debugInfo.videoUrlSource = 'video_versions[0]';
              } else if (media.video_url && !media.video_url.startsWith('blob:')) {
                videoUrl = media.video_url;
                debugInfo.videoUrlSource = 'video_url';
              } else {
                debugInfo.videoUrlSource = 'none (blob URL or missing)';
              }
            }
          } else {
            debugInfo.reason = 'No shortcode_media in GraphQL';
            // Try to see what's actually in entry_data
            if (sharedData.entry_data) {
              debugInfo.entryDataKeys = Object.keys(sharedData.entry_data);
            }
          }
        }
      } catch (error) {
        debugInfo.graphqlError = error instanceof Error ? error.message : String(error);
      }
      
      // Method 2: Check DOM for video element (if GraphQL didn't work)
      if (!videoUrl) {
        const videoElements = document.querySelectorAll('video');
        debugInfo.videoElementsCount = videoElements.length;
        debugInfo.hasVideoElement = videoElements.length > 0;
        
        for (const videoElement of Array.from(videoElements)) {
          const vidEl = videoElement as HTMLVideoElement;
          debugInfo.videoElementSrc = vidEl.src;
          debugInfo.videoElementCurrentSrc = vidEl.currentSrc;
          const source = videoElement.querySelector('source');
          debugInfo.videoSourceSrc = source ? (source as HTMLSourceElement).src : null;
          debugInfo.videoSrcIsBlob = vidEl.src.startsWith('blob:');
          debugInfo.currentSrcIsBlob = vidEl.currentSrc.startsWith('blob:');
          
          // Check currentSrc first (most reliable)
          if (vidEl.currentSrc && !vidEl.currentSrc.startsWith('blob:') && 
              (vidEl.currentSrc.includes('.mp4') || vidEl.currentSrc.includes('cdninstagram'))) {
            videoUrl = vidEl.currentSrc;
            isVideo = true;
            debugInfo.videoUrlSource = 'video element currentSrc';
            break;
          }
          
          // Check source element
          if (source) {
            const sourceEl = source as HTMLSourceElement;
            if (sourceEl.src && !sourceEl.src.startsWith('blob:') && 
                (sourceEl.src.includes('.mp4') || sourceEl.src.includes('cdninstagram'))) {
              videoUrl = sourceEl.src;
              isVideo = true;
              debugInfo.videoUrlSource = 'video element source';
              break;
            }
          }
          
          // Check src as last resort
          if (vidEl.src && !vidEl.src.startsWith('blob:') && 
              (vidEl.src.includes('.mp4') || vidEl.src.includes('cdninstagram'))) {
            videoUrl = vidEl.src;
            isVideo = true;
            debugInfo.videoUrlSource = 'video element src';
            break;
          }
        }
      }
      
      // Method 3: Look for video URLs in script tags (JSON-LD or other embedded data)
      if (!videoUrl) {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        debugInfo.jsonLdScriptsCount = scripts.length;
        for (const script of Array.from(scripts)) {
          try {
            const data = JSON.parse(script.textContent || '');
            if (data.contentUrl && data.contentUrl.includes('.mp4')) {
              videoUrl = data.contentUrl;
              isVideo = true;
              debugInfo.videoUrlSource = 'JSON-LD script';
              break;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
      
      return { videoUrl, isVideo, debugInfo };
    });

    // Use network request video URL if found
    if (!pageData.videoUrl && videoUrls.length > 0) {
      // Filter out blob URLs and get the first valid CDN URL
      const validUrl = videoUrls.find(url => !url.startsWith('blob:') && (url.includes('.mp4') || url.includes('cdninstagram')));
      if (validUrl) {
        pageData.videoUrl = validUrl;
        pageData.isVideo = true;
        pageData.debugInfo.videoUrlSource = 'network request';
      }
    }

    console.log('📋 Results:\n');
    console.log(JSON.stringify(pageData, null, 2));
    console.log('\n');
    
    if (pageData.isVideo) {
      console.log('✅ Post is detected as a video');
    } else {
      console.log('❌ Post is NOT detected as a video');
    }
    
    if (pageData.videoUrl) {
      console.log(`✅ Video URL extracted: ${pageData.videoUrl.substring(0, 100)}...`);
      console.log(`   Is blob URL: ${pageData.videoUrl.startsWith('blob:')}`);
      console.log(`   Source: ${pageData.debugInfo.videoUrlSource || 'unknown'}`);
    } else {
      console.log('❌ No video URL extracted');
      if (videoUrls.length > 0) {
        console.log(`   But found ${videoUrls.length} video URLs in network requests (may be blob URLs)`);
      }
    }
    
    console.log('\n✅ Test complete!');

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

