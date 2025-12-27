#!/usr/bin/env tsx
/**
 * Debug script to check if snapshots exist for a specific card
 * 
 * Usage:
 *   pnpm tsx scripts/check-pokemon-snapshots.ts <card-id>
 * 
 * Example:
 *   pnpm tsx scripts/check-pokemon-snapshots.ts 8244590
 */

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getPokemonCardPriceSnapshots } from '../src/lib/kv';

async function main() {
  const cardId = process.argv[2];
  
  if (!cardId) {
    console.error('❌ Card ID required');
    console.error('Usage: pnpm tsx scripts/check-pokemon-snapshots.ts <card-id>');
    process.exit(1);
  }

  console.log(`🔍 Checking snapshots for card ID: ${cardId}\n`);

  try {
    const allSnapshots = await getPokemonCardPriceSnapshots();
    const cardSnapshots = allSnapshots.filter(s => s.cardId === cardId);
    
    console.log(`📊 Total snapshots in database: ${allSnapshots.length}`);
    console.log(`📊 Snapshots for card ${cardId}: ${cardSnapshots.length}\n`);
    
    if (cardSnapshots.length === 0) {
      console.log('❌ No snapshots found for this card');
      console.log('\nPossible reasons:');
      console.log('  1. Backfill timed out and data was not saved');
      console.log('  2. Card ID mismatch');
      console.log('  3. Data was never successfully scraped');
      console.log('\nTry running backfill again:');
      console.log(`  pnpm pokemon:backfill ${cardId}`);
    } else {
      console.log('✅ Found snapshots:');
      const sorted = cardSnapshots.sort((a, b) => a.date.localeCompare(b.date));
      
      // Show first 10 and last 10
      const showCount = Math.min(10, sorted.length);
      console.log(`\n   First ${showCount} snapshots:`);
      for (let i = 0; i < showCount; i++) {
        const snap = sorted[i]!;
        console.log(`   ${snap.date}: ungraded=${snap.ungradedPrice ?? 'N/A'}, psa10=${snap.psa10Price ?? 'N/A'}`);
      }
      
      if (sorted.length > 20) {
        console.log(`   ... (${sorted.length - 20} more) ...`);
      }
      
      if (sorted.length > 10) {
        console.log(`\n   Last ${Math.min(10, sorted.length - 10)} snapshots:`);
        for (let i = sorted.length - Math.min(10, sorted.length - 10); i < sorted.length; i++) {
          const snap = sorted[i]!;
          console.log(`   ${snap.date}: ungraded=${snap.ungradedPrice ?? 'N/A'}, psa10=${snap.psa10Price ?? 'N/A'}`);
        }
      }
      
      console.log(`\n📅 Date range: ${sorted[0]!.date} to ${sorted[sorted.length - 1]!.date}`);
      console.log(`\n💡 If you don't see these in the UI, check:`);
      console.log(`   1. UI might be filtering by date range (check days parameter)`);
      console.log(`   2. Card must be in settings to appear in UI`);
      console.log(`   3. Browser console for any errors`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

