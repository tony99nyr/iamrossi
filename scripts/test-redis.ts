import { createClient } from 'redis';

async function testRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  console.log('REDIS_URL from env:', redisUrl ? 'SET (hidden for security)' : 'NOT SET');
  
  if (!redisUrl) {
    console.error('❌ REDIS_URL is not set in environment');
    process.exit(1);
  }
  
  const redis = createClient({ url: redisUrl });
  
  try {
    console.log('Connecting to Redis...');
    await redis.connect();
    console.log('✅ Connected successfully!');
    
    console.log('\nTesting Redis operations...');
    await redis.set('test:key', 'test-value');
    const value = await redis.get('test:key');
    console.log('Test write/read:', value === 'test-value' ? '✅ SUCCESS' : '❌ FAILED');
    await redis.del('test:key');
    
    console.log('\nSearching for all keys...');
    const allKeys = await redis.keys('*');
    console.log(`Total keys: ${allKeys.length}`);
    
    if (allKeys.length > 0) {
      console.log('\nSample keys (first 20):');
      allKeys.slice(0, 20).forEach(key => console.log(`  - ${key}`));
    }
    
    console.log('\nSearching for Oura keys...');
    const ouraKeys = await redis.keys('oura:*');
    console.log(`Oura keys found: ${ouraKeys.length}`);
    if (ouraKeys.length > 0) {
      ouraKeys.forEach(key => console.log(`  - ${key}`));
      
      console.log('\nDeleting Oura keys...');
      if (ouraKeys.length > 0) {
        await redis.del(ouraKeys);
        console.log(`✅ Deleted ${ouraKeys.length} Oura cache keys`);
      }
    }
    
    await redis.quit();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testRedisConnection();
