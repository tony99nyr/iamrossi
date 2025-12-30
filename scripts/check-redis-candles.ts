import * as dotenv from 'dotenv';
import { redis, ensureConnected } from '../src/lib/kv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local doesn't exist - that's OK
}

async function checkRedisCandles() {
  await ensureConnected();
  
  const now = Date.now();
  const cutoff48h = now - (48 * 60 * 60 * 1000);
  const cutoff24h = now - (24 * 60 * 60 * 1000);
  
  console.log('📊 Redis Candle Inventory\n');
  console.log(`Current time: ${new Date(now).toISOString()}`);
  console.log(`48h cutoff: ${new Date(cutoff48h).toISOString()}`);
  console.log(`24h cutoff: ${new Date(cutoff24h).toISOString()}\n`);
  
  // Get all 5m keys
  const keys5m = await redis.keys('eth:price:cache:ETHUSDT:5m:*');
  keys5m.sort();
  
  let total5m = 0;
  let total5m48h = 0;
  let total5m24h = 0;
  
  console.log('🔍 5-minute candles:');
  for (const key of keys5m) {
    const data = await redis.get(key);
    if (data) {
      const candles = JSON.parse(data);
      const recent48h = candles.filter((c: any) => c.timestamp >= cutoff48h);
      const recent24h = candles.filter((c: any) => c.timestamp >= cutoff24h);
      total5m += candles.length;
      total5m48h += recent48h.length;
      total5m24h += recent24h.length;
      
      if (candles.length > 0) {
        const first = new Date(candles[0].timestamp).toISOString();
        const last = new Date(candles[candles.length - 1].timestamp).toISOString();
        const keyParts = key.split(':');
        console.log(`  ${keyParts[keyParts.length - 2]}-${keyParts[keyParts.length - 1]}: ${candles.length} total (${recent48h.length} in 48h, ${recent24h.length} in 24h)`);
        console.log(`    Range: ${first} to ${last}`);
      }
    }
  }
  console.log(`  Total: ${total5m} candles (${total5m48h} in last 48h, ${total5m24h} in last 24h)\n`);
  
  // Get all 1h keys
  const keys1h = await redis.keys('eth:price:cache:ETHUSDT:1h:*');
  keys1h.sort();
  
  let total1h = 0;
  let total1h48h = 0;
  let total1h24h = 0;
  
  console.log('🔍 1-hour candles:');
  for (const key of keys1h) {
    const data = await redis.get(key);
    if (data) {
      const candles = JSON.parse(data);
      const recent48h = candles.filter((c: any) => c.timestamp >= cutoff48h);
      const recent24h = candles.filter((c: any) => c.timestamp >= cutoff24h);
      total1h += candles.length;
      total1h48h += recent48h.length;
      total1h24h += recent24h.length;
      
      if (candles.length > 0) {
        const first = new Date(candles[0].timestamp).toISOString();
        const last = new Date(candles[candles.length - 1].timestamp).toISOString();
        const keyParts = key.split(':');
        console.log(`  ${keyParts[keyParts.length - 2]}-${keyParts[keyParts.length - 1]}: ${candles.length} total (${recent48h.length} in 48h, ${recent24h.length} in 24h)`);
        console.log(`    Range: ${first} to ${last}`);
      }
    }
  }
  console.log(`  Total: ${total1h} candles (${total1h48h} in last 48h, ${total1h24h} in last 24h)\n`);
  
  // Summary
  console.log('📈 Summary for 1d chart filter (last 24 hours):');
  if (total5m24h > 0) {
    console.log(`  ✅ 5m candles available: ${total5m24h} data points`);
    console.log(`     Expected: ~288 points (24h × 60min / 5min)`);
    console.log(`     Coverage: ${((total5m24h / 288) * 100).toFixed(1)}%`);
  } else if (total1h24h > 0) {
    console.log(`  ✅ 1h candles available: ${total1h24h} data points`);
    console.log(`     Expected: ~24 points (24h / 1h)`);
    console.log(`     Coverage: ${((total1h24h / 24) * 100).toFixed(1)}%`);
  } else {
    console.log(`  ⚠️  No intraday candles in last 24h - will use daily candles only (~1-2 points)`);
  }
  
  process.exit(0);
}

checkRedisCandles().catch(console.error);

