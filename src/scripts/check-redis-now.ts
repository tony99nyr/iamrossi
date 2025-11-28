import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

async function checkRedis() {
  await redis.connect();
  const data = await redis.get('rehab:entries');
  const entries = JSON.parse(data || '[]');
  
  // Find Nov 24 entry
  const nov24 = entries.find((e: any) => e.date === '2025-11-24');
  
  console.log('Nov 24 entry:');
  console.log(JSON.stringify(nov24, null, 2));
  
  console.log('\nSmith Squat exercise:');
  const smithSquat = nov24?.exercises.find((ex: any) => ex.id === 'ex-smith-squat');
  console.log(JSON.stringify(smithSquat, null, 2));
  
  await redis.quit();
}

checkRedis();
