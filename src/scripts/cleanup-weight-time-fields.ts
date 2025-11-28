/**
 * Clean up weight and time fields - remove "lb"/"lbs" and "min" suffixes
 */

import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL
});

interface ExerciseEntry {
  id: string;
  weight?: string;
  timeElapsed?: string;
  reps?: number;
  sets?: number;
  painLevel?: number | null;
  difficultyLevel?: number | null;
  bfr?: boolean;
}

interface RehabEntry {
  id: string;
  date: string;
  exercises: ExerciseEntry[];
  isRestDay: boolean;
  vitaminsTaken: boolean;
  proteinShake: boolean;
}

async function cleanupData() {
  try {
    console.log('Connecting to Vercel Redis...');
    console.log(`URL: ${process.env.REDIS_URL?.substring(0, 50)}...`);
    await redis.connect();
    console.log('✓ Connected\n');

    // Fetch current data
    const data = await redis.get('rehab:entries');
    if (!data) {
      console.log('❌ No data found in Redis');
      await redis.quit();
      return;
    }

    const entries: RehabEntry[] = JSON.parse(data);
    console.log(`Found ${entries.length} entries in Vercel Redis\n`);

    let cleanedCount = 0;
    let exerciseCount = 0;

    // Clean each entry
    for (const entry of entries) {
      let entryModified = false;

      for (const exercise of entry.exercises) {
        let exerciseModified = false;

        // Clean weight field - remove "lb" or "lbs"
        if (exercise.weight && typeof exercise.weight === 'string') {
          const cleaned = exercise.weight.replace(/\s*lbs?$/i, '').trim();
          if (cleaned !== exercise.weight) {
            console.log(`  Weight: "${exercise.weight}" → "${cleaned}"`);
            exercise.weight = cleaned;
            exerciseModified = true;
          }
        }

        // Clean timeElapsed field - remove "min", " min", "minutes", etc.
        if (exercise.timeElapsed && typeof exercise.timeElapsed === 'string') {
          const cleaned = exercise.timeElapsed
            .replace(/\s*(min|minutes?|hrs?|hours?|sec|seconds?)$/i, '')
            .trim();
          if (cleaned !== exercise.timeElapsed) {
            console.log(`  Time: "${exercise.timeElapsed}" → "${cleaned}"`);
            exercise.timeElapsed = cleaned;
            exerciseModified = true;
          }
        }

        if (exerciseModified) {
          entryModified = true;
          exerciseCount++;
        }
      }

      if (entryModified) {
        cleanedCount++;
      }
    }

    console.log(`\n✓ Cleaned ${cleanedCount} entries with ${exerciseCount} exercises\n`);

    // Save back to Redis
    await redis.set('rehab:entries', JSON.stringify(entries));
    
    console.log('✅ Successfully cleaned Vercel Redis data!');
    console.log(`   - ${entries.length} total entries`);
    console.log(`   - ${cleanedCount} entries with cleaned data`);
    console.log(`   - ${exerciseCount} exercises updated`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    await redis.quit();
  }
}

cleanupData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
