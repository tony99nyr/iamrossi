/**
 * Script to load migrated data from local JSON file into Redis
 * Run with: npx tsx src/scripts/load-migrated-data-to-redis.ts
 */

import { createClient } from 'redis';
import { readFileSync } from 'fs';
import { join } from 'path';

const redis = createClient({
  url: process.env.REDIS_URL
});

async function loadDataToRedis() {
  try {
    console.log('Connecting to Redis...');
    await redis.connect();
    console.log('Connected to Redis');

    // Read the migrated local data
    const entriesPath = join(process.cwd(), 'src/data/rehab-entries.json');
    const exercisesPath = join(process.cwd(), 'src/data/exercises.json');
    
    const entriesData = JSON.parse(readFileSync(entriesPath, 'utf-8'));
    const exercisesData = JSON.parse(readFileSync(exercisesPath, 'utf-8'));

    console.log(`\nLoaded ${entriesData.length} entries and ${exercisesData.length} exercises from local files`);

    // Save to Redis
    await redis.set('rehab:entries', JSON.stringify(entriesData));
    await redis.set('rehab:exercises', JSON.stringify(exercisesData));

    console.log('\n✅ Successfully loaded data to Redis!');
    console.log(`   - ${entriesData.length} entries`);
    console.log(`   - ${exercisesData.length} exercises`);

  } catch (error) {
    console.error('❌ Failed to load data:', error);
    throw error;
  } finally {
    await redis.quit();
  }
}

// Run the script
loadDataToRedis()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
