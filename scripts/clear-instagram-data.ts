/**
 * Script to clear all Instagram data from Redis
 * Run with: npx tsx scripts/clear-instagram-data.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from 'redis';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function main() {
  console.log('🧹 Clearing Instagram data from Redis...\n');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log(`🔌 Connecting to Redis...`);
  
  const client = createClient({ url: redisUrl });
  client.on('error', (err) => console.error('Redis Client Error', err));

  try {
    await client.connect();

    // Get all Instagram keys
    const keys = await client.keys('instagram:*');
    console.log(`Found ${keys.length} Instagram keys to delete\n`);

    if (keys.length === 0) {
      console.log('✅ No Instagram data found in Redis');
      await client.quit();
      return;
    }

    // Delete all keys
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`✅ Deleted ${keys.length} keys`);
    }

    console.log('\n✅ All Instagram data cleared from Redis!');
    await client.quit();
  } catch (error) {
    console.error('❌ Error:', error);
    await client.quit();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

