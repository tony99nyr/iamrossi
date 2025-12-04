import * as dotenv from 'dotenv';
import { createClient } from 'redis';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Redis CLI Utility for Agents
 * 
 * Usage:
 * npx tsx scripts/redis-cli.ts <command> [args]
 * 
 * Commands:
 * - list [pattern]   : List keys matching pattern (default: *)
 * - get <key>        : Get value of a specific key
 * - del <key>        : Delete a specific key
 * - flush-test       : Flush all keys in the TEST database (localhost only)
 * - info             : Show connection info
 */

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];

  // Default to local Redis for safety if not specified, unless REDIS_URL is explicitly set
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  console.log(`🔌 Connecting to Redis at ${redisUrl.includes('localhost') ? 'localhost' : 'remote'}...`);
  
  const client = createClient({ url: redisUrl });
  
  client.on('error', (err) => console.error('Redis Client Error', err));

  try {
    await client.connect();

    switch (command) {
      case 'list':
        const pattern = param || '*';
        console.log(`🔍 Searching for keys matching: ${pattern}`);
        const keys = await client.keys(pattern);
        console.log(`Found ${keys.length} keys:`);
        keys.forEach(key => console.log(`  - ${key}`));
        break;

      case 'get':
        if (!param) {
          console.error('❌ Error: Key argument required for "get" command');
          break;
        }
        const value = await client.get(param);
        try {
          // Try to pretty print JSON
          const parsed = JSON.parse(value || '');
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(value);
        }
        break;

      case 'del':
        if (!param) {
          console.error('❌ Error: Key argument required for "del" command');
          break;
        }
        await client.del(param);
        console.log(`✅ Deleted key: ${param}`);
        break;

      case 'flush-test':
        if (!redisUrl.includes('localhost')) {
          console.error('❌ Error: flush-test only allowed on localhost');
          break;
        }
        await client.flushAll();
        console.log('✅ Flushed all keys from localhost Redis');
        break;

      case 'info':
        console.log('Redis Connection Info:');
        console.log(`URL: ${redisUrl}`);
        console.log(`Connected: ${client.isOpen}`);
        break;

      default:
        console.log(`
Usage: npx tsx scripts/redis-cli.ts <command> [args]

Commands:
  list [pattern]   : List keys matching pattern (default: *)
  get <key>        : Get value of a specific key
  del <key>        : Delete a specific key
  flush-test       : Flush all keys (localhost only)
  info             : Show connection info
        `);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.disconnect();
  }
}

main();
