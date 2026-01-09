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

  const testUrl = 'https://www.instagram.com/p/DTBLIe6ETg8/';
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
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log('📊 Extracting data from page...\n');
    const pageData = await page.evaluate(() => {
      const debugInfo: Record<string, unknown> = {};
      let videoUrl: string | null = null;
      let isVideo = false;
      
      // Method 1: Extract from _sharedData (GraphQL data)
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
        }
      } catch (error) {
        debugInfo.graphqlError = error instanceof Error ? error.message : String(error);
      }
      
      // Method 2: Check DOM for video element (if GraphQL didn't work)
      if (!videoUrl) {
        const videoElement = document.querySelector('video');
        debugInfo.hasVideoElement = !!videoElement;
        if (videoElement) {
          debugInfo.videoElementSrc = videoElement.src;
          const source = videoElement.querySelector('source');
          debugInfo.videoSourceSrc = source ? source.src : null;
          debugInfo.videoSrcIsBlob = videoElement.src.startsWith('blob:');
          
          // Extract video URL from video element
          if (source && source.src && !source.src.startsWith('blob:')) {
            videoUrl = source.src;
            isVideo = true;
            debugInfo.videoUrlSource = 'video element source';
          } else if (videoElement.src && !videoElement.src.startsWith('blob:')) {
            videoUrl = videoElement.src;
            isVideo = true;
            debugInfo.videoUrlSource = 'video element src';
          }
        }
      }
      
      return { videoUrl, isVideo, debugInfo };
    });

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
    } else {
      console.log('❌ No video URL extracted');
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

