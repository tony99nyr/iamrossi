/**
 * Test script to verify video URL extraction from Instagram posts
 * Run with: npx tsx scripts/test-video-extraction.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fetchInstagramSavedPosts, validateSessionCookie } from '../src/lib/instagram-service';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function main() {
  console.log('🧪 Testing Video URL Extraction\n');

  // Check if cookie is set
  const sessionCookie = process.env.INSTAGRAM_SESSION_COOKIE;
  
  if (!sessionCookie) {
    console.error('❌ ERROR: INSTAGRAM_SESSION_COOKIE environment variable is not set');
    process.exit(1);
  }

  if (!validateSessionCookie(sessionCookie)) {
    console.error('❌ ERROR: Session cookie format appears invalid');
    process.exit(1);
  }

  console.log('✅ Session cookie is valid\n');
  console.log('📥 Fetching a small sample of posts (max 10) to test video extraction...\n');

  try {
    const result = await fetchInstagramSavedPosts(sessionCookie, 10);
    
    console.log(`\n📊 Results:\n`);
    console.log(`   Total posts fetched: ${result.posts.length}\n`);
    
    const videoPosts = result.posts.filter(p => p.isVideo);
    const postsWithVideoUrl = result.posts.filter(p => p.videoUrl);
    const carouselPosts = result.posts.filter(p => p.isCarousel);
    
    console.log(`   Video posts: ${videoPosts.length}`);
    console.log(`   Posts with videoUrl: ${postsWithVideoUrl.length}`);
    console.log(`   Carousel posts: ${carouselPosts.length}\n`);
    
    if (videoPosts.length > 0) {
      console.log('🎥 Video Posts Details:\n');
      videoPosts.forEach((post, i) => {
        console.log(`   ${i + 1}. ${post.shortcode}`);
        console.log(`      URL: ${post.url}`);
        console.log(`      Has videoUrl: ${!!post.videoUrl}`);
        if (post.videoUrl) {
          console.log(`      videoUrl: ${post.videoUrl.substring(0, 100)}...`);
          console.log(`      Is blob URL: ${post.videoUrl.startsWith('blob:')}`);
        } else {
          console.log(`      ⚠️  Missing videoUrl!`);
        }
        console.log(`      Author: ${post.authorUsername || 'unknown'}`);
        console.log('');
      });
    } else {
      console.log('   ℹ️  No video posts found in sample\n');
    }
    
    if (carouselPosts.length > 0) {
      console.log('🖼️  Carousel Posts Details:\n');
      carouselPosts.slice(0, 3).forEach((post, i) => {
        console.log(`   ${i + 1}. ${post.shortcode}`);
        console.log(`      URL: ${post.url}`);
        console.log(`      Media items: ${post.mediaItems?.length || 0}`);
        if (post.mediaItems) {
          const videoItems = post.mediaItems.filter(m => m.isVideo);
          console.log(`      Video items: ${videoItems.length}`);
          videoItems.forEach((item, j) => {
            console.log(`         Item ${j + 1}: ${item.videoUrl ? item.videoUrl.substring(0, 80) + '...' : 'NO VIDEO URL'}`);
          });
        }
        console.log('');
      });
    }
    
    console.log('\n✅ Test complete!');
    console.log('\n💡 Check the debug logs above for detailed extraction information.');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

