#!/usr/bin/env tsx
/**
 * Manual backfill script for Pokemon card price history.
 * 
 * Usage:
 *   # Backfill all configured cards from settings
 *   pnpm pokemon:backfill
 * 
 *   # Backfill specific card IDs
 *   pnpm pokemon:backfill <card-id-1> [card-id-2] ...
 * 
 * Examples:
 *   pnpm pokemon:backfill                    # Backfill all configured cards
 *   pnpm pokemon:backfill 11069001            # Backfill one card
 *   pnpm pokemon:backfill 11069001 10669966  # Backfill multiple cards
 * 
 * This script:
 * 1. Loads Pokemon index settings (or uses provided card IDs)
 * 2. Scrapes historical price data from PriceCharting for each card
 * 3. Merges the data with existing snapshots (doesn't overwrite existing data)
 * 4. Detects and marks price anomalies (huge deviations) as ignored
 * 5. Saves the updated snapshots to Redis
 * 6. Rebuilds the index series (if settings exist)
 */

// Note: kv.ts now loads .env.local automatically, so we don't need to do it here
// However, we still use dynamic imports to ensure proper load order
import type { PokemonCardConfig, PokemonCardPriceSnapshot, PokemonIndexSettings } from '../src/types';

async function main() {
  // Dynamically import modules that use kv.ts
  // kv.ts will automatically load .env.local when it's imported
  const { scrapeHistoricalPricesForCard, buildIndexSeriesFromSnapshots } = await import('../src/lib/pokemon-index-service');
  const { getPokemonIndexSettings, getPokemonCardPriceSnapshots, setPokemonCardPriceSnapshots, setPokemonIndexSeries, kvKeys } = await import('../src/lib/kv');
  const { markAnomalies } = await import('../src/lib/pokemon-anomaly-detector');
  
  const cardIdsFromArgs = process.argv.slice(2);

  console.log('🔌 Connecting to Redis...\n');
  
  // Debug: Check Redis URL
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('❌ REDIS_URL not found in environment variables');
    console.error('Make sure .env.local exists and contains REDIS_URL');
    process.exit(1);
  }
  console.log(`   Using Redis URL: ${redisUrl.includes('localhost') ? 'localhost' : 'remote'}\n`);
  
  // Load current settings
  let settings: PokemonIndexSettings | null = null;
  try {
    // Try to list keys first to test connection
    const keys = await kvKeys('pokemon:index:*');
    console.log(`   Found ${keys.length} Pokemon index keys in Redis:`);
    keys.forEach(key => console.log(`     - ${key}`));
    console.log();
    
    settings = await getPokemonIndexSettings();
    
    // If still null, try reading directly
    if (!settings) {
      console.log('   Attempting direct read...');
      const { createClient } = await import('redis');
      const directClient = createClient({ url: redisUrl });
      await directClient.connect();
      const rawData = await directClient.get('pokemon:index:settings');
      await directClient.quit();
      
      if (rawData) {
        console.log('   ✅ Direct read successful, parsing...');
        settings = JSON.parse(rawData) as PokemonIndexSettings;
      } else {
        console.log('   ⚠️  Direct read also returned null/empty');
      }
    }
  } catch (error) {
    console.error('❌ Failed to load settings from Redis:', error);
    if (error instanceof Error) {
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
  
  // Debug: log what we got
  if (settings) {
    console.log(`📋 Found settings with ${settings.cards.length} card(s) configured\n`);
  } else {
    console.log('⚠️  No settings found in Redis (returned null)\n');
    console.log('   This might mean:');
    console.log('   - The key "pokemon:index:settings" doesn\'t exist');
    console.log('   - Or there\'s a connection issue');
    console.log('   - Try: npx tsx scripts/redis-cli.ts get pokemon:index:settings\n');
  }
  
  // Determine which cards to backfill
  let cardsToBackfill: PokemonCardConfig[] = [];
  let cardIds: string[] = [];

  if (cardIdsFromArgs.length > 0) {
    // Use card IDs from command line arguments
    cardIds = cardIdsFromArgs;
    console.log(`\n🔍 Starting backfill for ${cardIds.length} specified card(s)...\n`);
    
    // Try to find card configs from settings, or create temporary ones
    for (const cardId of cardIds) {
      const cardConfig = settings?.cards.find((c) => c.id === cardId);
      if (cardConfig) {
        cardsToBackfill.push(cardConfig);
      } else {
        console.warn(`⚠️  Card ID ${cardId} not found in settings. Creating temporary config...`);
        cardsToBackfill.push({
          id: cardId,
          name: cardId,
          conditionType: 'both',
          weight: 1,
          source: 'pricecharting',
        });
      }
    }
  } else {
    // No arguments - use all configured cards from settings
    if (!settings || settings.cards.length === 0) {
      console.error('❌ No card IDs provided and no cards configured in settings.');
      console.error('\nUsage options:');
      console.error('  1. Backfill all configured cards: pnpm pokemon:backfill');
      console.error('  2. Backfill specific cards: pnpm pokemon:backfill <card-id-1> [card-id-2] ...');
      console.error('\nExample: pnpm pokemon:backfill 11069001 10669966');
      process.exit(1);
    }
    
    // Deduplicate cards by ID (same card may appear multiple times with different condition types)
    // We only need to scrape once per card ID since historical data includes both ungraded and PSA 10
    const uniqueCards = new Map<string, PokemonCardConfig>();
    for (const card of settings.cards) {
      if (!uniqueCards.has(card.id)) {
        uniqueCards.set(card.id, card);
      }
    }
    
    cardsToBackfill = Array.from(uniqueCards.values());
    cardIds = cardsToBackfill.map((c) => c.id);
    
    const duplicateCount = settings.cards.length - cardsToBackfill.length;
    if (duplicateCount > 0) {
      console.log(`\n⚠️  Found ${duplicateCount} duplicate card entries (same ID, different condition types)`);
      console.log(`   Deduplicating to ${cardsToBackfill.length} unique cards for backfill\n`);
    }
    
    console.log(`\n🔍 Starting backfill for ${cardsToBackfill.length} unique card(s)...\n`);
    console.log(`   Cards: ${cardsToBackfill.map((c) => `${c.name} (${c.id})`).join(', ')}\n`);
  }

  // Helper function defined inside main() to access dynamically imported functions
  // Must be defined before it's used
  async function processCard(
    card: PokemonCardConfig,
    byCardAndDate: Map<string, PokemonCardPriceSnapshot>,
    updatedSnapshots: PokemonCardPriceSnapshot[],
  ): Promise<{ added: number; skipped: number; failed?: boolean; error?: string }> {
    console.log(`\n📦 Processing: ${card.name} (${card.id})`);

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    // Retry logic for failed scrapes
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`   🔄 Retry attempt ${attempt}/${MAX_RETRIES}...`);
          // Exponential backoff: 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt - 2)));
        }

        const historicalSnapshots = await scrapeHistoricalPricesForCard(card);
        
        if (historicalSnapshots.length === 0) {
          console.log(`   ⚠️  No historical data found for this card`);
          console.log(`   💡 This could mean:`);
          console.log(`      - The card has no historical price data on PriceCharting`);
          console.log(`      - The page failed to load (check for timeout errors above)`);
          console.log(`      - The VGPC object was not found on the page`);
          return { added: 0, skipped: 0 };
        }

        let added = 0;
        let skipped = 0;
        let merged = 0;

        for (const snapshot of historicalSnapshots) {
          const key = `${snapshot.cardId}:${snapshot.date}`;
          
          if (byCardAndDate.has(key)) {
            // Merge with existing snapshot (preserve existing data, add missing fields)
            const existing = byCardAndDate.get(key)!;
            
            // Check if we need to update (only if new data has values that existing doesn't)
            const needsUpdate = 
              (snapshot.ungradedPrice !== undefined && existing.ungradedPrice === undefined) ||
              (snapshot.psa10Price !== undefined && existing.psa10Price === undefined);
            
            if (needsUpdate) {
              const mergedSnapshot: typeof snapshot = {
                ...existing,
                // Only update if the new data has values and existing doesn't
                ungradedPrice: existing.ungradedPrice ?? snapshot.ungradedPrice,
                psa10Price: existing.psa10Price ?? snapshot.psa10Price,
              };
              
              // Update in array
              const index = updatedSnapshots.findIndex(
                (s) => s.cardId === snapshot.cardId && s.date === snapshot.date,
              );
              if (index >= 0) {
                updatedSnapshots[index] = mergedSnapshot;
                byCardAndDate.set(key, mergedSnapshot);
                merged++;
              }
            }
            skipped++;
          } else {
            // New snapshot - verify data integrity
            if (!snapshot.cardId || !snapshot.date) {
              console.warn(`   ⚠️  Skipping invalid snapshot: missing cardId or date`);
              continue;
            }
            
            // Ensure required fields
            const validSnapshot: PokemonCardPriceSnapshot = {
              cardId: snapshot.cardId,
              date: snapshot.date,
              source: snapshot.source || 'pricecharting',
              currency: snapshot.currency || 'USD',
              ungradedPrice: snapshot.ungradedPrice,
              psa10Price: snapshot.psa10Price,
            };
            
            updatedSnapshots.push(validSnapshot);
            byCardAndDate.set(key, validSnapshot);
            added++;
          }
        }

        const dateRange = historicalSnapshots.length > 0
          ? `${historicalSnapshots[0]!.date} to ${historicalSnapshots[historicalSnapshots.length - 1]!.date}`
          : 'N/A';

        console.log(`   ✅ Found ${historicalSnapshots.length} historical snapshots (${dateRange})`);
        console.log(`      Added: ${added}, Merged: ${merged}, Skipped: ${skipped}`);

        return { added, skipped: skipped - merged };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;
        
        // Check if it's a timeout error (retryable)
        const isTimeout = errorMsg.includes('Timeout') || errorMsg.includes('timeout') || errorMsg.includes('Page load timeout') || errorMsg.includes('VGPC object timeout');
        const isNetworkError = errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND');
        
        if (attempt < MAX_RETRIES && (isTimeout || isNetworkError)) {
          console.warn(`   ⚠️  Attempt ${attempt} failed (${errorMsg}), will retry...`);
          console.warn(`   💡 Timeout errors are retryable - the page may just be slow to load`);
          continue;
        }
        
        // Final attempt failed or non-retryable error
        console.error(`   ❌ Error processing card ${card.id} (attempt ${attempt}/${MAX_RETRIES}):`, errorMsg);
        if (isTimeout) {
          console.error(`   💡 This was a timeout error. The page may have taken too long to load.`);
          console.error(`   💡 You can try running the backfill again for just this card:`);
          console.error(`      pnpm pokemon:backfill ${card.id}`);
        }
        return { added: 0, skipped: 0, failed: true, error: errorMsg };
      }
    }

    // Should never reach here, but TypeScript needs it
    return { added: 0, skipped: 0, failed: true, error: lastError?.message || 'Max retries exceeded' };
  }

  // Load existing snapshots
  const existingSnapshots = await getPokemonCardPriceSnapshots();
  const byCardAndDate = new Map<string, PokemonCardPriceSnapshot>();
  for (const snap of existingSnapshots) {
    byCardAndDate.set(`${snap.cardId}:${snap.date}`, snap);
  }

  let totalAdded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const failedCards: Array<{ card: PokemonCardConfig; error: string }> = [];
  const updatedSnapshots: PokemonCardPriceSnapshot[] = [...existingSnapshots];

  // Process each card with delays to avoid rate limiting
  for (let i = 0; i < cardsToBackfill.length; i++) {
    const cardConfig = cardsToBackfill[i]!;
    
    // Add delay between requests (except for the first one)
    if (i > 0) {
      const delay = 2000; // 2 seconds between requests
      console.log(`   ⏳ Waiting ${delay / 1000}s before next request...\n`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    const result = await processCard(cardConfig, byCardAndDate, updatedSnapshots);
    totalAdded += result.added;
    totalSkipped += result.skipped;
    
    if (result.failed) {
      totalFailed++;
      failedCards.push({ card: cardConfig, error: result.error || 'Unknown error' });
    }
  }

  // Detect and mark anomalies before saving
  console.log(`\n🔍 Detecting price anomalies...`);
  const beforeAnomalyCount = updatedSnapshots.filter(s => s.ignored).length;
  const snapshotsWithAnomaliesMarked = markAnomalies(updatedSnapshots);
  const afterAnomalyCount = snapshotsWithAnomaliesMarked.filter(s => s.ignored).length;
  const newlyMarkedAnomalies = afterAnomalyCount - beforeAnomalyCount;
  
  if (newlyMarkedAnomalies > 0) {
    console.log(`   ⚠️  Marked ${newlyMarkedAnomalies} snapshots as ignored due to price anomalies`);
    console.log(`   📊 Total ignored snapshots: ${afterAnomalyCount}`);
  } else {
    console.log(`   ✅ No new anomalies detected`);
  }

  // Save updated snapshots
  // CRITICAL: Save directly to cloud Redis, not through kv.ts
  // kv.ts's Redis client might be connected to localhost if it was created before REDIS_URL was loaded
  const backfillRedisUrl = process.env.REDIS_URL;
  if (!backfillRedisUrl) {
    throw new Error('REDIS_URL is not set in .env.local - cannot save to cloud Redis');
  }
  
  console.log(`\n💾 Saving ${snapshotsWithAnomaliesMarked.length} total snapshots directly to cloud Redis...`);
  console.log(`   Cloud Redis URL: ${backfillRedisUrl.substring(0, 50)}...`);
  
  // Save directly to cloud Redis using a fresh client
  const { createClient } = await import('redis');
  const cloudRedisClient = createClient({ url: backfillRedisUrl });
  await cloudRedisClient.connect();
  
  try {
    await cloudRedisClient.set('pokemon:index:card-prices', JSON.stringify(snapshotsWithAnomaliesMarked));
    console.log(`   ✅ Saved ${snapshotsWithAnomaliesMarked.length} snapshots to cloud Redis`);
    
    // Verify the save worked
    const verifyData = await cloudRedisClient.get('pokemon:index:card-prices');
    const verifyCount = verifyData ? JSON.parse(verifyData).length : 0;
    
    if (verifyCount !== snapshotsWithAnomaliesMarked.length) {
      throw new Error(`Save verification failed: Expected ${snapshotsWithAnomaliesMarked.length} snapshots, but cloud Redis has ${verifyCount}`);
    }
    console.log(`   ✅ Verified: ${verifyCount} snapshots confirmed in cloud Redis\n`);
  } finally {
    await cloudRedisClient.quit();
  }
  
  // Also update through kv.ts for consistency (but the direct save above is what matters)
  // This ensures kv.ts's internal state is updated
  try {
    await setPokemonCardPriceSnapshots(snapshotsWithAnomaliesMarked);
  } catch (error) {
    console.warn(`   ⚠️  Warning: Failed to update through kv.ts (this is OK, direct save succeeded):`, error);
  }

  // Rebuild index series (only if settings exist and we used configured cards)
  // IMPORTANT: Don't call ensurePokemonIndexUpToDate here because it might trigger refreshTodaySnapshots
  // which could overwrite the historical data we just backfilled. Instead, build the series directly.
  if (settings && (cardIdsFromArgs.length === 0 || cardsToBackfill.every(c => settings.cards.some(sc => sc.id === c.id)))) {
    console.log('📊 Rebuilding index series...');
    // Build series directly from the snapshots we just saved, without triggering a refresh
    const finalSnapshots = await getPokemonCardPriceSnapshots();
    const series = buildIndexSeriesFromSnapshots(finalSnapshots, settings);
    await setPokemonIndexSeries(series);
    console.log(`   ✅ Built index series with ${series.length} points`);
  } else {
    console.log('⚠️  Skipping index rebuild (no settings configured or backfilled cards not in settings)');
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Added: ${totalAdded} new snapshots`);
  console.log(`   Skipped: ${totalSkipped} existing snapshots`);
  console.log(`   Failed: ${totalFailed} cards`);
  console.log(`   Anomalies marked: ${newlyMarkedAnomalies} (${afterAnomalyCount} total ignored)`);
  console.log(`   Total snapshots: ${snapshotsWithAnomaliesMarked.length}`);
  
  if (failedCards.length > 0) {
    console.log(`\n⚠️  Failed cards (can be retried):`);
    for (const { card, error } of failedCards) {
      console.log(`   - ${card.name} (${card.id}): ${error}`);
    }
    console.log(`\n   To retry failed cards, run:`);
    console.log(`   pnpm pokemon:backfill ${failedCards.map(f => f.card.id).join(' ')}\n`);
  } else {
    console.log();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

