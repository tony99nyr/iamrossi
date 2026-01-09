/**
 * Test script for Instagram saved posts scraper
 * Run with: pnpm tsx scripts/test-instagram-scraper.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fetchInstagramSavedPosts, validateSessionCookie } from '../src/lib/instagram-service';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function main() {
  console.log('🧪 Testing Instagram Saved Posts Scraper\n');

  // Check if cookie is set
  const sessionCookie = process.env.INSTAGRAM_SESSION_COOKIE;
  
  if (!sessionCookie) {
    console.error('❌ ERROR: INSTAGRAM_SESSION_COOKIE environment variable is not set');
    console.error('   Please add it to your .env.local file');
    process.exit(1);
  }

  console.log('✅ INSTAGRAM_SESSION_COOKIE is set');
  console.log(`   Cookie length: ${sessionCookie.length} characters`);
  console.log(`   Cookie preview: ${sessionCookie.substring(0, 50)}...\n`);

  // Validate cookie format
  const isValid = validateSessionCookie(sessionCookie);
  if (!isValid) {
    console.error('❌ ERROR: Session cookie format appears invalid');
    console.error('   Expected format: "sessionid=value; csrftoken=value"');
    process.exit(1);
  }

  console.log('✅ Session cookie format is valid\n');

  // Test fetching saved posts
  console.log('📥 Fetching saved posts from Instagram...');
  console.log('   This may take 30-60 seconds...\n');

  try {
    const startTime = Date.now();
    const result = await fetchInstagramSavedPosts(sessionCookie, 20); // Fetch first 20 posts
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Successfully fetched ${result.posts.length} saved posts in ${duration}s\n`);

    if (result.posts.length === 0) {
      console.warn('⚠️  WARNING: No posts were found. This could mean:');
      console.warn('   - You have no saved posts');
      console.warn('   - The cookie is invalid/expired');
      console.warn('   - Instagram changed their page structure\n');
    } else {
      console.log('📋 Sample posts:\n');
      result.posts.slice(0, 5).forEach((post, index) => {
        console.log(`   ${index + 1}. ${post.url}`);
        console.log(`      🆔 Post ID: ${post.id}${post.id === post.shortcode ? ' (using shortcode)' : ''}`);
        if (post.authorUsername) {
          console.log(`      👤 Account: @${post.authorUsername}`);
        } else {
          console.log(`      👤 Account: (not found)`);
        }
        if (post.imageUrl) {
          console.log(`      🖼️  Media: ${post.imageUrl.substring(0, 70)}...`);
        } else {
          console.log(`      🖼️  Media: (not found)`);
        }
        if (post.isVideo) {
          console.log(`      📹 Type: Video/Reel`);
        }
        console.log('');
      });

      if (result.posts.length > 5) {
        console.log(`   ... and ${result.posts.length - 5} more posts\n`);
      }
    }

    console.log('📊 Summary:');
    console.log(`   Total posts: ${result.totalCount || result.posts.length}`);
    console.log(`   Last synced: ${result.lastSynced || 'N/A'}`);
    console.log(`   Posts with media URLs: ${result.posts.filter(p => p.imageUrl).length}`);
    console.log(`   Posts with account names: ${result.posts.filter(p => p.authorUsername).length}`);
    console.log(`   Video posts: ${result.posts.filter(p => p.isVideo).length}\n`);

    console.log('✅ Test completed successfully!\n');
  } catch (error) {
    console.error('\n❌ ERROR: Failed to fetch saved posts\n');
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error) {
      if (error.message.includes('Invalid session cookie')) {
        console.error('\n💡 Tip: Your session cookie may be expired.');
        console.error('   Try logging into Instagram in your browser and copying a fresh cookie.');
      } else if (error.message.includes('timeout')) {
        console.error('\n💡 Tip: The request timed out. Instagram may be slow or blocking requests.');
      }
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

