import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

async function checkAllEntries() {
  await redis.connect();
  const data = await redis.get('rehab:entries');
  const entries = JSON.parse(data || '[]');
  
  console.log(`Total entries: ${entries.length}\n`);
  
  for (const entry of entries) {
    let hasOldFormat = false;
    const issues: string[] = [];
    
    for (const exercise of entry.exercises) {
      if (exercise.weight && typeof exercise.weight === 'string') {
        if (exercise.weight.match(/\s*lbs?$/i)) {
          issues.push(`  - ${exercise.id}: weight="${exercise.weight}"`);
          hasOldFormat = true;
        }
      }
      if (exercise.timeElapsed && typeof exercise.timeElapsed === 'string') {
        if (exercise.timeElapsed.match(/\s*(min|minutes?|hrs?|hours?|sec|seconds?)$/i)) {
          issues.push(`  - ${exercise.id}: timeElapsed="${exercise.timeElapsed}"`);
          hasOldFormat = true;
        }
      }
    }
    
    if (hasOldFormat) {
      console.log(`${entry.date}:`);
      issues.forEach(issue => console.log(issue));
      console.log('');
    }
  }
  
  await redis.quit();
}

checkAllEntries();
