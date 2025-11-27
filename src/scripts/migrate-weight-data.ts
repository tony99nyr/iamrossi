/**
 * Migration script to split the "weight" field into separate fields:
 * - timeElapsed: e.g., "45 min"
 * - weight: e.g., "135lbs" or "135"
 * - reps: e.g., 12 (from "12x4")
 * - sets: e.g., 4 (from "12x4")
 */

import fs from 'fs';
import path from 'path';

interface OldExerciseEntry {
  id: string;
  weight?: string;
}

interface NewExerciseEntry {
  id: string;
  timeElapsed?: string;
  weight?: string;
  reps?: number;
  sets?: number;
}

interface RehabEntry {
  id: string;
  date: string;
  exercises: OldExerciseEntry[] | NewExerciseEntry[];
  isRestDay: boolean;
  vitaminsTaken: boolean;
  proteinShake: boolean;
}

function parseWeightField(weightStr: string): Partial<NewExerciseEntry> {
  if (!weightStr || weightStr.trim() === '') {
    return {};
  }

  const trimmed = weightStr.trim();

  // Pattern 1: Time elapsed (must have time unit like "min", "minutes", "hrs")
  const timePattern = /^(\d+(?::\d+)?(?::\d+)?)\s*(min|minutes?|hrs?|hours?)$/i;
  const timeMatch = trimmed.match(timePattern);
  if (timeMatch) {
    return { timeElapsed: trimmed };
  }

  // Pattern 2: Complex format like "BFR 35lb 15x4" or "67lb 2x10"
  const complexPattern = /^(?:BFR\s+)?(\d+)\s*(?:lbs?|pounds?)\s+(\d+)\s*x\s*(\d+)$/i;
  const complexMatch = trimmed.match(complexPattern);
  if (complexMatch) {
    return {
      weight: complexMatch[1] + 'lb',
      reps: parseInt(complexMatch[2], 10),
      sets: parseInt(complexMatch[3], 10),
    };
  }

  // Pattern 3: Just reps x sets (e.g., "12x4", "15 x 3", "35x2")
  const repsPattern = /^(\d+)\s*x\s*(\d+)$/i;
  const repsMatch = trimmed.match(repsPattern);
  if (repsMatch) {
    return {
      reps: parseInt(repsMatch[1], 10),
      sets: parseInt(repsMatch[2], 10),
    };
  }

  // Pattern 4: Weight with unit (e.g., "135lbs", "135 lbs", "30lb")
  const weightWithUnitPattern = /^(\d+)\s*(lbs?|pounds?)$/i;
  const weightWithUnitMatch = trimmed.match(weightWithUnitPattern);
  if (weightWithUnitMatch) {
    return { weight: weightWithUnitMatch[1] + 'lb' };
  }

  // Pattern 5: Plain number (assume it's weight in lbs)
  const numberPattern = /^\d+$/;
  if (numberPattern.test(trimmed)) {
    return { weight: trimmed + 'lb' };
  }

  // If we can't parse it, keep it as-is and log warning
  console.warn(`Unable to parse weight field: "${trimmed}"`);
  return { weight: trimmed };
}

function migrateEntries(entries: RehabEntry[]): RehabEntry[] {
  return entries.map(entry => {
    const migratedExercises = entry.exercises.map((exercise: OldExerciseEntry) => {
      const { id, weight } = exercise;
      
      if (!weight) {
        return { id };
      }

      const parsed = parseWeightField(weight);
      return {
        id,
        ...parsed,
      };
    });

    return {
      ...entry,
      exercises: migratedExercises,
    };
  });
}

async function main() {
  const dataPath = path.join(process.cwd(), 'src/data/rehab-entries.json');
  const backupPath = path.join(process.cwd(), 'src/data/rehab-entries.backup.json');

  console.log('Starting migration...');
  console.log(`Reading from: ${dataPath}`);

  // Read the current data
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const entries: RehabEntry[] = JSON.parse(rawData);

  console.log(`Found ${entries.length} entries to migrate`);

  // Create backup
  fs.writeFileSync(backupPath, rawData, 'utf-8');
  console.log(`Backup created at: ${backupPath}`);

  // Migrate the data
  const migratedEntries = migrateEntries(entries);

  // Write the migrated data
  fs.writeFileSync(dataPath, JSON.stringify(migratedEntries, null, 2), 'utf-8');
  console.log('Migration complete!');
  console.log(`Migrated data written to: ${dataPath}`);

  // Log some examples
  console.log('\nExample migrations:');
  migratedEntries.slice(0, 3).forEach((entry, idx) => {
    console.log(`\nEntry ${idx + 1} (${entry.date}):`);
    entry.exercises.forEach((ex: NewExerciseEntry) => {
      console.log(`  - Exercise ${ex.id}:`, ex);
    });
  });
}

main().catch(console.error);
