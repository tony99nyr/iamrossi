#!/usr/bin/env npx tsx
/**
 * Verify backfill test works correctly on synthetic 2026/2027 periods
 * This will help identify why trades aren't executing
 */

import { disconnectRedis } from '@/lib/kv';
import * as fs from 'fs';
import * as path from 'path';

// Import the backfill test function
async function runBackfillTest() {
  // Use the actual backfill-test script
  const { execSync } = require('child_process');
  
  console.log('🧪 Testing Synthetic 2026/2027 Backfill\n');
  
  const testPeriods = [
    { name: '2026 Full Year', start: '2026-01-01', end: '2026-12-31', synthetic: true },
    { name: '2027 Full Year', start: '2027-01-01', end: '2027-12-31', synthetic: true },
    { name: '2026 Bull Run', start: '2026-03-01', end: '2026-04-30', synthetic: true },
    { name: '2027 Q4', start: '2027-10-01', end: '2027-12-31', synthetic: true },
  ];

  for (const period of testPeriods) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${period.name}`);
    console.log('='.repeat(60));
    
    try {
      // Run backfill test for this period
      const result = execSync(
        `npx tsx -e "
        const { runBacktest } = require('./scripts/backfill-test.ts');
        runBacktest('${period.start}', '${period.end}', ${period.synthetic})
          .then(r => {
            console.log('Trades:', r.totalTrades);
            console.log('Return:', r.totalReturnPct.toFixed(2) + '%');
            console.log('Win Rate:', r.winTrades > 0 ? ((r.winTrades / r.sellTrades) * 100).toFixed(1) + '%' : 'N/A');
          });
        "`,
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 60000 }
      );
      console.log(result);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

// Actually, let's just run the backfill-test script directly with specific periods
async function main() {
  console.log('🧪 Running Backfill Test on Synthetic Periods\n');
  console.log('This will verify the backfill test works correctly...\n');
  
  // We'll modify backfill-test.ts to accept command line args, or just run it
  // For now, let's create a simpler test that imports the backfill logic
  
  await disconnectRedis();
}

main().catch(console.error);

