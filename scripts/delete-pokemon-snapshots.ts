#!/usr/bin/env tsx
/**
 * Delete Pokemon snapshots for specific dates
 * 
 * Usage:
 *   pnpm tsx scripts/delete-pokemon-snapshots.ts <date1> [date2] ...
 * 
 * Example:
 *   pnpm tsx scripts/delete-pokemon-snapshots.ts 2025-12-27 2025-12-28
 */

import { getPokemonCardPriceSnapshots, setPokemonCardPriceSnapshots, getPokemonIndexSettings } from '../src/lib/kv';
import { ensurePokemonIndexUpToDate } from '../src/lib/pokemon-index-service';

async function main() {
  const datesToDelete = process.argv.slice(2);
  
  if (datesToDelete.length === 0) {
    console.error('❌ No dates provided');
    console.error('Usage: pnpm tsx scripts/delete-pokemon-snapshots.ts <date1> [date2] ...');
    console.error('Example: pnpm tsx scripts/delete-pokemon-snapshots.ts 2025-12-27 2025-12-28');
    process.exit(1);
  }

  console.log('🗑️  Deleting snapshots for dates:', datesToDelete.join(', '));
  console.log();

  const snapshots = await getPokemonCardPriceSnapshots();
  const beforeCount = snapshots.length;
  
  const filteredSnapshots = snapshots.filter((snap) => !datesToDelete.includes(snap.date));
  const deletedCount = beforeCount - filteredSnapshots.length;

  if (deletedCount === 0) {
    console.log('⚠️  No snapshots found for the specified dates');
    process.exit(0);
  }

  console.log(`📊 Before: ${beforeCount} snapshots`);
  console.log(`📊 After: ${filteredSnapshots.length} snapshots`);
  console.log(`🗑️  Deleted: ${deletedCount} snapshots`);
  console.log();

  await setPokemonCardPriceSnapshots(filteredSnapshots);
  console.log('✅ Snapshots deleted');

  // Rebuild index
  const settings = await getPokemonIndexSettings();
  if (settings) {
    console.log('📊 Rebuilding index series...');
    await ensurePokemonIndexUpToDate(settings);
    console.log('✅ Index rebuilt');
  }

  console.log();
  console.log('✅ Done!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});




