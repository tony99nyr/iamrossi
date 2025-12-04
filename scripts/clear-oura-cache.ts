import { kvKeys, kvDel } from '@/lib/kv';

async function clearOuraCache() {
  try {
    console.log('Checking all keys in Redis...');
    const allKeys = await kvKeys('*');
    console.log(`Total keys in Redis: ${allKeys.length}`);
    if (allKeys.length > 0) {
      console.log('Sample keys:', allKeys.slice(0, 10));
    }
    
    console.log('\nSearching for Oura cache keys...');
    const keys = await kvKeys('oura:scores:*');
    
    if (keys.length === 0) {
      console.log('No Oura cache keys found.');
      console.log('This might mean:');
      console.log('  1. Cache was never written (check for errors)');
      console.log('  2. Cache already expired');
      console.log('  3. Keys use a different pattern');
      return;
    }
    
    console.log(`Found ${keys.length} Oura cache keys:`);
    keys.forEach(key => console.log(`  - ${key}`));
    
    console.log('\nDeleting keys...');
    await kvDel(...keys);
    
    console.log('✅ Successfully cleared Oura cache!');
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

clearOuraCache();
