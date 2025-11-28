import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

async function dumpRedisData() {
  await redis.connect();
  const data = await redis.get('rehab:entries');
  console.log(JSON.stringify(JSON.parse(data || '[]'), null, 2));
  await redis.quit();
}

dumpRedisData();
