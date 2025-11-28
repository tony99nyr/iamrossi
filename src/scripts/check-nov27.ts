import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

async function checkNov27() {
  await redis.connect();
  const data = await redis.get('rehab:entries');
  const entries = JSON.parse(data || '[]');
  
  const nov27 = entries.find((e: any) => e.date === '2025-11-27');
  
  console.log('Nov 27 entry:');
  console.log(JSON.stringify(nov27, null, 2));
  
  await redis.quit();
}

checkNov27();
