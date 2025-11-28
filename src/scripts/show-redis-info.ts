import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

console.log('=== REDIS CONNECTION INFO ===');
console.log('REDIS_URL:', redisUrl);
console.log('Key being used: rehab:entries');
console.log('');

const redis = createClient({ url: redisUrl });

async function checkRedis() {
  await redis.connect();
  
  console.log('=== CONNECTED TO REDIS ===');
  console.log('');
  
  const data = await redis.get('rehab:entries');
  const entries = JSON.parse(data || '[]');
  
  console.log(`Total entries in Redis: ${entries.length}`);
  console.log('');
  
  // Show Nov 24 entry
  const nov24 = entries.find((e: any) => e.date === '2025-11-24');
  
  if (nov24) {
    console.log('=== NOV 24 ENTRY ===');
    console.log(JSON.stringify(nov24, null, 2));
    console.log('');
    
    const smithSquat = nov24.exercises.find((ex: any) => ex.id === 'ex-smith-squat');
    console.log('=== SMITH SQUAT EXERCISE ===');
    console.log(JSON.stringify(smithSquat, null, 2));
  } else {
    console.log('❌ No Nov 24 entry found!');
  }
  
  await redis.quit();
}

checkRedis().catch(console.error);
