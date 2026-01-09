/**
 * Script to import all Instagram saved posts to Redis
 * Run with: npx tsx scripts/import-instagram-posts.ts
 * 
 * This script:
 * 1. Scrapes ALL saved posts from Instagram (not just the first batch)
 * 2. Saves them all to Redis
 * 3. Can be run multiple times safely (won't duplicate posts)
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fetchInstagramSavedPosts, validateSessionCookie } from '../src/lib/instagram-service';
import { getAllInstagramPosts, setInstagramPosts, disconnectRedis } from '../src/lib/kv';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function main() {
  console.log('📥 Instagram Posts Import Script\n');

  // Check if cookie is set
  const sessionCookie = process.env.INSTAGRAM_SESSION_COOKIE;
  
  if (!sessionCookie) {
    console.error('❌ ERROR: INSTAGRAM_SESSION_COOKIE environment variable is not set');
    console.error('   Please add it to your .env.local file');
    process.exit(1);
  }

  console.log('✅ INSTAGRAM_SESSION_COOKIE is set');

  // Validate cookie format
  if (!validateSessionCookie(sessionCookie)) {
    console.error('❌ ERROR: Session cookie format appears invalid');
    console.error('   Expected format: "sessionid=value; csrftoken=value"');
    process.exit(1);
  }

  console.log('✅ Session cookie format is valid\n');

  // Get existing posts from Redis
  console.log('📊 Checking existing posts in Redis...');
  const existingPosts = await getAllInstagramPosts();
  const existingShortcodes = new Set(existingPosts.map(p => p.shortcode));
  console.log(`   Found ${existingPosts.length} existing posts\n`);

  // Scrape posts - try to get as many as possible in one go
  // The scraper will scroll and try to load more posts
  console.log('📥 Scraping saved posts from Instagram...');
  console.log('   This may take several minutes depending on how many posts you have...');
  console.log('   The scraper will scroll to load more posts...\n');

  try {
    const startTime = Date.now();
    
    // Request a large number - the scraper will scroll to try to get as many as possible
    // Instagram's saved posts page uses infinite scroll, so we'll get what we can
    const result = await fetchInstagramSavedPosts(sessionCookie, 1000);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`   ✅ Fetched ${result.posts.length} posts in ${duration}s\n`);

    if (result.posts.length === 0) {
      console.log('⚠️  No posts were scraped. This could mean:');
      console.log('   - You have no saved posts');
      console.log('   - The cookie is invalid/expired');
      console.log('   - Instagram changed their page structure\n');
      process.exit(1);
    }

    const allScrapedPosts = result.posts;

    console.log(`\n📊 Scraping complete!`);
    console.log(`   Total posts scraped: ${allScrapedPosts.length}\n`);

    // IMPORTANT: Instagram's saved posts are already in the correct order (newest saved first)
    // We need to assign importedAt to ALL posts (new and existing) based on their position
    // This preserves the correct order when sorted by importedAt
    
    // Create a map of existing posts to preserve their data (labels, archived, etc.)
    const existingPostsMap = new Map(existingPosts.map(p => [p.shortcode, p]));
    
    // Assign importedAt to ALL scraped posts based on their position in the list
    // First post (index 0) is most recently saved, gets current time
    // Each subsequent post gets a slightly earlier time to preserve order
    const baseTime = Date.now();
    const allPostsToSave = allScrapedPosts.map((post, index) => {
      const importedAt = new Date(baseTime - (index * 1000)).toISOString();
      const existing = existingPostsMap.get(post.shortcode);
      
      // For existing posts, preserve labels and archived status
      // For new posts, set defaults
      return {
        ...post,
        importedAt, // Update importedAt for ALL posts to reflect current order
        archived: existing?.archived ?? false,
        labels: existing?.labels ?? [],
      };
    });
    
    const newPosts = allPostsToSave.filter(post => !existingShortcodes.has(post.shortcode));
    
    console.log(`📦 Preparing posts for import...`);
    console.log(`   New posts to import: ${newPosts.length}`);
    console.log(`   Updating importedAt for all ${allScrapedPosts.length} posts to preserve order\n`);

    if (newPosts.length === 0 && existingPosts.length === allScrapedPosts.length) {
      console.log('✅ All posts are already in Redis. Updating importedAt timestamps to preserve order...\n');
    }
    
    const postsToSave = allPostsToSave;

    // Save new posts to Redis
    console.log(`💾 Saving ${postsToSave.length} posts to Redis...`);
    
    // Save in batches to avoid overwhelming Redis
    const saveBatchSize = 50;
    for (let i = 0; i < postsToSave.length; i += saveBatchSize) {
      const batch = postsToSave.slice(i, i + saveBatchSize);
      await setInstagramPosts(batch);
      console.log(`   Saved batch ${Math.floor(i / saveBatchSize) + 1}/${Math.ceil(postsToSave.length / saveBatchSize)} (${batch.length} posts)`);
    }

    console.log(`\n✅ Successfully imported ${postsToSave.length} posts to Redis!`);
    console.log(`   Total posts in Redis: ${existingPosts.length + postsToSave.length}\n`);
  } catch (error) {
    console.error(`\n❌ ERROR:`, error instanceof Error ? error.message : String(error));
    console.error('   Failed to scrape posts from Instagram\n');
  } finally {
    // Always close Redis connection
    await disconnectRedis();
  }
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await disconnectRedis();
  process.exit(1);
});

