/**
 * Migrate existing data IN Vercel Redis (not from file)
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

  // Pattern 1: Time (e.g., "45 min", "10 minutes", "30min", "10min")
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

  // Pattern 3: Weight with reps x sets (e.g., "135lb 12x4", "67lb 2x10", "30lbs 20x4")
  const weightRepsMatch = weight.match(/^(\d+)\s*lbs?\s+(\d+)x(\d+)$/i);
  if (weightRepsMatch) {
    result.weight = `${weightRepsMatch[1]}lb`;
    result.reps = parseInt(weightRepsMatch[2]);
    result.sets = parseInt(weightRepsMatch[3]);
    return result;
  }

  // Pattern 4: Just reps x sets with optional time (e.g., "12x4", "35x2", "2x 45s", "20x3", "2x")
  const repsMatch = weight.match(/^(\d+)x(\d*)\s*(.*)$/);
  if (repsMatch) {
    result.reps = parseInt(repsMatch[1]);
    if (repsMatch[2]) {
      result.sets = parseInt(repsMatch[2]);
    }
    // If there's extra text like "45s", keep it as timeElapsed
    if (repsMatch[3]) {
      result.timeElapsed = repsMatch[3].trim();
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
  console.warn(`⚠️  Could not parse: "${weight}"`);
  result.weight = weight;
  return result;
}

async function migrateVercelRedis() {
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

    let migratedCount = 0;
    let exerciseCount = 0;

    // Migrate each entry
    for (const entry of entries) {
      let entryModified = false;

      for (const exercise of entry.exercises) {
        if (exercise.weight && typeof exercise.weight === 'string') {
          // Only migrate if we don't already have the new fields
          if (!exercise.timeElapsed && !exercise.reps && !exercise.sets) {
            const parsed = parseWeightField(exercise.weight);
            
            if (Object.keys(parsed).length > 0) {
              console.log(`  "${exercise.weight}" → `, JSON.stringify(parsed));
              
              // Apply parsed fields
              if (parsed.timeElapsed && !parsed.weight) {
                // It was pure time, remove weight field
                exercise.timeElapsed = parsed.timeElapsed;
                delete exercise.weight;
              } else {
                // Apply all parsed fields
                if (parsed.weight) exercise.weight = parsed.weight;
                if (parsed.timeElapsed) exercise.timeElapsed = parsed.timeElapsed;
                if (parsed.reps !== undefined) exercise.reps = parsed.reps;
                if (parsed.sets !== undefined) exercise.sets = parsed.sets;
              }
              
              entryModified = true;
              exerciseCount++;
            }
          }
        }
      }

      if (entryModified) {
        migratedCount++;
      }
    }

    console.log(`\n✓ Migrated ${migratedCount} entries with ${exerciseCount} exercises\n`);

    // Save back to Redis
    await redis.set('rehab:entries', JSON.stringify(entries));
    
    console.log('✅ Successfully migrated Vercel Redis data!');
    console.log(`   - ${entries.length} total entries`);
    console.log(`   - ${migratedCount} entries with migrated data`);
    console.log(`   - ${exerciseCount} exercises updated`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await redis.quit();
  }
}

migrateVercelRedis()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
