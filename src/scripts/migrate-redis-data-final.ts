/**
 * Final migration script to parse existing Redis data
 * and split weight field into separate fields
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
  painLevel?: number;
  difficultyLevel?: number;
}

interface RehabEntry {
  id: string;
  date: string;
  exercises: ExerciseEntry[];
  isRestDay: boolean;
  vitaminsTaken: boolean;
  proteinShake: boolean;
}

function parseWeightField(weight: string): Partial<ExerciseEntry> {
  if (!weight || weight.trim() === '') {
    return {};
  }

  const result: Partial<ExerciseEntry> = {};

  // Pattern 1: Time (e.g., "45 min", "10 minutes", "1:30:00")
  const timeMatch = weight.match(/^(\d+(?::\d+)?(?::\d+)?)\s*(min|minutes?|hrs?|hours?|sec|seconds?)$/i);
  if (timeMatch) {
    result.timeElapsed = weight;
    return result;
  }

  // Pattern 2: Complex format like "BFR 35lb 15x4"
  const complexMatch = weight.match(/^(?:BFR\s+)?(\d+)\s*lbs?\s+(\d+)x(\d+)$/i);
  if (complexMatch) {
    result.weight = `${complexMatch[1]}lb`;
    result.reps = parseInt(complexMatch[2]);
    result.sets = parseInt(complexMatch[3]);
    return result;
  }

  // Pattern 3: Weight with reps x sets (e.g., "135lb 12x4", "67lb 2x10")
  const weightRepsMatch = weight.match(/^(\d+)\s*lbs?\s+(\d+)x(\d+)$/i);
  if (weightRepsMatch) {
    result.weight = `${weightRepsMatch[1]}lb`;
    result.reps = parseInt(weightRepsMatch[2]);
    result.sets = parseInt(weightRepsMatch[3]);
    return result;
  }

  // Pattern 4: Just reps x sets (e.g., "12x4", "35x2", "5x")
  const repsMatch = weight.match(/^(\d+)x(\d*)$/);
  if (repsMatch) {
    result.reps = parseInt(repsMatch[1]);
    if (repsMatch[2]) {
      result.sets = parseInt(repsMatch[2]);
    }
    return result;
  }

  // Pattern 5: Weight with unit (e.g., "135lb", "30lbs")
  const weightWithUnitMatch = weight.match(/^(\d+)\s*lbs?$/i);
  if (weightWithUnitMatch) {
    result.weight = `${weightWithUnitMatch[1]}lb`;
    return result;
  }

  // Pattern 6: Plain number (assume it's weight in lbs)
  const plainNumberMatch = weight.match(/^\d+$/);
  if (plainNumberMatch) {
    result.weight = `${weight}lb`;
    return result;
  }

  // If we can't parse it, keep it as weight
  result.weight = weight;
  return result;
}

async function migrateRedisData() {
  try {
    console.log('Connecting to Redis...');
    await redis.connect();
    console.log('✓ Connected to Redis\n');

    // Fetch all entries
    const entriesData = await redis.get('rehab:entries');
    if (!entriesData) {
      console.log('No entries found in Redis');
      await redis.quit();
      return;
    }

    const entries: RehabEntry[] = JSON.parse(entriesData);
    console.log(`Found ${entries.length} entries in Redis\n`);

    let migratedCount = 0;
    let exerciseCount = 0;

    // Process each entry
    for (const entry of entries) {
      let entryModified = false;

      for (const exercise of entry.exercises) {
        if (exercise.weight && typeof exercise.weight === 'string') {
          // Only migrate if we don't already have the new fields
          if (!exercise.timeElapsed && !exercise.reps && !exercise.sets) {
            const parsed = parseWeightField(exercise.weight);
            
            console.log(`Migrating: "${exercise.weight}" →`, parsed);
            
            // Apply parsed fields
            if (parsed.timeElapsed) {
              exercise.timeElapsed = parsed.timeElapsed;
              delete exercise.weight; // Remove old weight field if it was time
              entryModified = true;
              exerciseCount++;
            } else {
              if (parsed.weight && parsed.weight !== exercise.weight) {
                exercise.weight = parsed.weight;
                entryModified = true;
              }
              if (parsed.reps !== undefined) {
                exercise.reps = parsed.reps;
                entryModified = true;
              }
              if (parsed.sets !== undefined) {
                exercise.sets = parsed.sets;
                entryModified = true;
              }
              if (entryModified) {
                exerciseCount++;
              }
            }
          }
        }
      }

      if (entryModified) {
        migratedCount++;
      }
    }

    // Save back to Redis
    if (migratedCount > 0) {
      await redis.set('rehab:entries', JSON.stringify(entries));
      console.log(`\n✅ Migration complete!`);
      console.log(`   - Migrated ${migratedCount} entries`);
      console.log(`   - Updated ${exerciseCount} exercises`);
    } else {
      console.log('\n✅ No migration needed - data already in new format');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await redis.quit();
  }
}

// Run the migration
migrateRedisData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
