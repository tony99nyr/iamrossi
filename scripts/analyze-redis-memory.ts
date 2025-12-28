import * as dotenv from 'dotenv';
import { createClient } from 'redis';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface KeyPatternStats {
  pattern: string;
  count: number;
  totalSize: number;
  avgSize: number;
  sampleKeys: string[];
}

/**
 * Analyze Redis memory usage by key patterns
 */
async function analyzeRedisMemory() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  console.log(`🔌 Connecting to Redis at ${redisUrl.includes('localhost') ? 'localhost' : 'remote'}...`);
  
  const client = createClient({ url: redisUrl });
  
  client.on('error', (err) => console.error('Redis Client Error', err));

  try {
    await client.connect();

    // Get all keys
    console.log('🔍 Fetching all keys...');
    const allKeys = await client.keys('*');
    console.log(`Found ${allKeys.length} total keys\n`);

    // Group keys by pattern (extract prefix before first colon or use full key)
    const patternMap = new Map<string, string[]>();
    
    for (const key of allKeys) {
      // Extract pattern: everything before the last colon, or use full key if no colon
      const colonIndex = key.indexOf(':');
      const pattern = colonIndex > 0 ? key.substring(0, key.lastIndexOf(':')) + ':*' : key;
      
      if (!patternMap.has(pattern)) {
        patternMap.set(pattern, []);
      }
      patternMap.get(pattern)!.push(key);
    }

    // Calculate memory usage for each pattern
    console.log('📊 Analyzing memory usage...\n');
    const stats: KeyPatternStats[] = [];

    for (const [pattern, keys] of patternMap.entries()) {
      let totalSize = 0;
      const sampleKeys: string[] = [];
      
      // Sample up to 10 keys for memory analysis
      const sampleSize = Math.min(10, keys.length);
      const keysToAnalyze = keys.slice(0, sampleSize);
      
      for (const key of keysToAnalyze) {
        try {
          // Try MEMORY USAGE command first (Redis 4.0+)
          let size: number;
          try {
            size = await client.sendCommand(['MEMORY', 'USAGE', key]) as number;
          } catch {
            // Fallback: get value and calculate size
            const value = await client.get(key);
            // Estimate size: key name + value + Redis overhead (~96 bytes per key)
            size = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value || '', 'utf8') + 96;
          }
          totalSize += size;
          if (sampleKeys.length < 3) {
            sampleKeys.push(key);
          }
        } catch (error) {
          // Skip keys that can't be read
          console.warn(`⚠️  Could not analyze ${key}: ${error}`);
        }
      }
      
      // Estimate total size based on sample
      const avgSize = sampleSize > 0 ? totalSize / sampleSize : 0;
      const estimatedTotalSize = avgSize * keys.length;
      
      stats.push({
        pattern,
        count: keys.length,
        totalSize: estimatedTotalSize,
        avgSize,
        sampleKeys,
      });
    }

    // Sort by total size (descending)
    stats.sort((a, b) => b.totalSize - a.totalSize);

    // Display results
    console.log('📈 Memory Usage by Key Pattern:\n');
    console.log('Pattern'.padEnd(50) + 'Count'.padStart(10) + 'Est. Total Size'.padStart(20) + 'Avg Size'.padStart(15));
    console.log('-'.repeat(95));
    
    let grandTotal = 0;
    for (const stat of stats) {
      grandTotal += stat.totalSize;
      const sizeMB = (stat.totalSize / 1024 / 1024).toFixed(2);
      const avgKB = (stat.avgSize / 1024).toFixed(2);
      const patternDisplay = stat.pattern.length > 48 ? stat.pattern.substring(0, 45) + '...' : stat.pattern;
      
      console.log(
        patternDisplay.padEnd(50) +
        stat.count.toString().padStart(10) +
        `${sizeMB} MB`.padStart(20) +
        `${avgKB} KB`.padStart(15)
      );
    }
    
    console.log('-'.repeat(95));
    const grandTotalMB = (grandTotal / 1024 / 1024).toFixed(2);
    console.log('Total'.padEnd(50) + allKeys.length.toString().padStart(10) + `${grandTotalMB} MB`.padStart(20));
    
    // Show top 5 patterns with sample keys
    console.log('\n🔝 Top 5 Patterns by Memory Usage:\n');
    for (let i = 0; i < Math.min(5, stats.length); i++) {
      const stat = stats[i];
      const sizeMB = (stat.totalSize / 1024 / 1024).toFixed(2);
      console.log(`${i + 1}. ${stat.pattern}`);
      console.log(`   Count: ${stat.count} keys`);
      console.log(`   Estimated Size: ${sizeMB} MB`);
      console.log(`   Avg Size: ${(stat.avgSize / 1024).toFixed(2)} KB per key`);
      if (stat.sampleKeys.length > 0) {
        console.log(`   Sample keys:`);
        stat.sampleKeys.forEach(key => console.log(`     - ${key}`));
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

analyzeRedisMemory();

