#!/usr/bin/env tsx
/**
 * Migration script to transfer data from JSON files to Redis
 * 
 * Run this script once after setting up Redis to migrate existing data.
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-kv.ts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Validate REDIS_URL is set
if (!process.env.REDIS_URL) {
  console.error('❌ Error: REDIS_URL environment variable is not set');
  console.error('   Please ensure .env.local contains REDIS_URL');
  process.exit(1);
}

// Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL
});

// KV Keys (must match those in src/lib/kv.ts)
const KV_KEYS = {
  EXERCISES: 'rehab:exercises',
  ENTRIES: 'rehab:entries',
  SETTINGS: 'admin:settings',
  SCHEDULE: 'admin:schedule',
  MHR_SCHEDULE: 'admin:mhr-schedule',
} as const;

async function migrateData() {
  console.log('🚀 Starting migration to Redis...\n');

  // Connect to Redis
  await redis.connect();

  const dataDir = path.join(process.cwd(), 'src/data');
  let migratedCount = 0;
  let skippedCount = 0;

  // Migrate exercises.json
  try {
    const exercisesPath = path.join(dataDir, 'exercises.json');
    if (fs.existsSync(exercisesPath)) {
      const exercises = JSON.parse(fs.readFileSync(exercisesPath, 'utf8'));
      await redis.set(KV_KEYS.EXERCISES, JSON.stringify(exercises));
      console.log(`✅ Migrated exercises.json (${exercises.length} exercises)`);
      migratedCount++;
    } else {
      console.log('⚠️  exercises.json not found, skipping');
      skippedCount++;
    }
  } catch (error) {
    console.error('❌ Error migrating exercises.json:', error);
  }

  // Migrate rehab-entries.json
  try {
    const entriesPath = path.join(dataDir, 'rehab-entries.json');
    if (fs.existsSync(entriesPath)) {
      const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
      await redis.set(KV_KEYS.ENTRIES, JSON.stringify(entries));
      console.log(`✅ Migrated rehab-entries.json (${entries.length} entries)`);
      migratedCount++;
    } else {
      console.log('⚠️  rehab-entries.json not found, skipping');
      skippedCount++;
    }
  } catch (error) {
    console.error('❌ Error migrating rehab-entries.json:', error);
  }

  // Migrate settings.json
  try {
    const settingsPath = path.join(dataDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      await redis.set(KV_KEYS.SETTINGS, JSON.stringify(settings));
      console.log(`✅ Migrated settings.json`);
      migratedCount++;
    } else {
      console.log('⚠️  settings.json not found, skipping');
      skippedCount++;
    }
  } catch (error) {
    console.error('❌ Error migrating settings.json:', error);
  }

  // Migrate schedule.json
  try {
    const schedulePath = path.join(dataDir, 'schedule.json');
    if (fs.existsSync(schedulePath)) {
      const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
      await redis.set(KV_KEYS.SCHEDULE, JSON.stringify(schedule));
      console.log(`✅ Migrated schedule.json (${schedule.length} games)`);
      migratedCount++;
    } else {
      console.log('⚠️  schedule.json not found, skipping');
      skippedCount++;
    }
  } catch (error) {
    console.error('❌ Error migrating schedule.json:', error);
  }

  // Migrate mhr-schedule.json
  try {
    const mhrSchedulePath = path.join(dataDir, 'mhr-schedule.json');
    if (fs.existsSync(mhrSchedulePath)) {
      const mhrSchedule = JSON.parse(fs.readFileSync(mhrSchedulePath, 'utf8'));
      await redis.set(KV_KEYS.MHR_SCHEDULE, JSON.stringify(mhrSchedule));
      console.log(`✅ Migrated mhr-schedule.json (${mhrSchedule.length} games)`);
      migratedCount++;
    } else {
      console.log('⚠️  mhr-schedule.json not found, skipping');
      skippedCount++;
    }
  } catch (error) {
    console.error('❌ Error migrating mhr-schedule.json:', error);
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Migrated: ${migratedCount} files`);
  console.log(`   Skipped: ${skippedCount} files`);
  console.log(`\n💡 Tip: You can now safely delete the migrated JSON files if desired.`);
  console.log(`   Keep team-map.json and youtube-videos.json as they are read-only.`);
}

// Run migration
migrateData()
  .then(async () => {
    console.log('\n🎉 Done!');
    await redis.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n💥 Migration failed:', error);
    await redis.disconnect();
    process.exit(1);
  });
