#!/usr/bin/env node
/**
 * Test script to verify Redis connection and data
 * This helps debug if backfill script and API are using the same Redis instance
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from 'redis';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const redisUrl = process.env.REDIS_URL;
  
  console.log('=== Redis Connection Test ===');
  console.log(`REDIS_URL from .env.local: ${redisUrl ? redisUrl.substring(0, 50) + '...' : 'undefined'}`);
  console.log('');
  
  if (!redisUrl) {
    console.error('ERROR: REDIS_URL is not set in .env.local');
    process.exit(1);
  }
  
  const client = createClient({ url: redisUrl });
  
  try {
    await client.connect();
    console.log('✅ Connected to Redis');
    console.log('');
    
    // Check snapshots
    const snapshotsData = await client.get('pokemon:index:card-prices');
    if (!snapshotsData) {
      console.log('❌ No snapshots found in Redis');
    } else {
      const snapshots = JSON.parse(snapshotsData);
      console.log(`✅ Found ${snapshots.length} snapshots in Redis`);
      
      // Count unique dates
      const dates = new Set(snapshots.map((s: any) => s.date));
      console.log(`   Unique dates: ${dates.size}`);
      console.log(`   Date range: ${Array.from(dates).sort()[0]} to ${Array.from(dates).sort().reverse()[0]}`);
      
      // Count by card
      const byCard = new Map<string, number>();
      for (const snap of snapshots) {
        byCard.set(snap.cardId, (byCard.get(snap.cardId) || 0) + 1);
      }
      console.log(`   Cards: ${byCard.size} unique cards`);
      console.log(`   Snapshots per card: ${Array.from(byCard.values()).join(', ')}`);
    }
    
    console.log('');
    
    // Check index series
    const seriesData = await client.get('pokemon:index:series');
    if (!seriesData) {
      console.log('❌ No index series found in Redis');
    } else {
      const series = JSON.parse(seriesData);
      console.log(`✅ Found ${series.length} index points in Redis`);
      if (series.length > 0) {
        console.log(`   Latest date: ${series[series.length - 1].date}`);
        console.log(`   Latest value: ${series[series.length - 1].indexValue}`);
      }
    }
    
    console.log('');
    console.log('=== Test Complete ===');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.quit();
  }
}

main().catch(console.error);









