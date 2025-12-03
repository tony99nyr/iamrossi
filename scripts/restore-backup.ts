import { createClient } from 'redis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Restore Redis data from a backup file
 * Usage: tsx scripts/restore-backup.ts <path-to-backup-file>
 */

async function restoreBackup(backupFilePath: string) {
  console.log(`📦 Loading backup from: ${backupFilePath}`);
  
  // Read backup file
  const backupContent = fs.readFileSync(backupFilePath, 'utf-8');
  const backup = JSON.parse(backupContent);
  
  console.log(`📅 Backup timestamp: ${backup.timestamp}`);
  console.log(`📊 Total keys in backup: ${Object.keys(backup.data).length}`);
  
  // Connect to Redis
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable not set');
  }
  
  console.log(`🔌 Connecting to Redis...`);
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  
  console.log(`✅ Connected to Redis`);
  
  // Confirm before proceeding
  console.log(`\n⚠️  WARNING: This will overwrite existing data in Redis!`);
  console.log(`Press Ctrl+C to cancel, or wait 5 seconds to continue...\n`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  let restored = 0;
  let errors = 0;
  
  // Restore each key
  for (const [key, value] of Object.entries(backup.data)) {
    try {
      // Determine the type of data
      if (Array.isArray(value)) {
        // Check if it's a sorted set (array of {value, score} objects)
        if (value.length > 0 && typeof value[0] === 'object' && 'value' in value[0] && 'score' in value[0]) {
          // Sorted set
          await redis.del(key);
          for (const item of value as any[]) {
            await redis.zAdd(key, { score: item.score, value: item.value });
          }
          console.log(`✓ Restored sorted set: ${key} (${value.length} items)`);
        } else if (value.length > 0 && typeof value[0] === 'object') {
          // Array of objects - store as JSON string (like roster, exercises, entries, etc)
          await redis.set(key, JSON.stringify(value));
          console.log(`✓ Restored array of objects as JSON string: ${key} (${value.length} items)`);
        } else {
          // Regular list of primitives - stringify if needed
          await redis.del(key);
          for (const item of value) {
            const stringItem = typeof item === 'string' ? item : JSON.stringify(item);
            await redis.rPush(key, stringItem);
          }
          console.log(`✓ Restored list: ${key} (${value.length} items)`);
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Object - stringify and store as string (this is how KV stores JSON)
        await redis.set(key, JSON.stringify(value));
        console.log(`✓ Restored object as string: ${key}`);
      } else {
        // Primitive value (string, number, etc)
        const stringValue = typeof value === 'string' ? value : String(value);
        await redis.set(key, stringValue);
        console.log(`✓ Restored string: ${key}`);
      }
      restored++;
    } catch (error) {
      console.error(`✗ Failed to restore ${key}:`, error);
      errors++;
    }
  }
  
  await redis.disconnect();
  
  console.log(`\n✅ Restore complete!`);
  console.log(`   Restored: ${restored} keys`);
  console.log(`   Errors: ${errors} keys`);
}

// Main execution
const backupFilePath = process.argv[2];

if (!backupFilePath) {
  console.error('Usage: tsx scripts/restore-backup.ts <path-to-backup-file>');
  process.exit(1);
}

if (!fs.existsSync(backupFilePath)) {
  console.error(`Error: Backup file not found: ${backupFilePath}`);
  process.exit(1);
}

restoreBackup(backupFilePath)
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Restore failed:', error);
    process.exit(1);
  });
