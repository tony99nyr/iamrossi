#!/usr/bin/env npx tsx
/**
 * Switch Strategy Config
 * 
 * Switches to a new strategy config and saves the current one to history.
 * Can load from optimized config file or restore from history.
 * 
 * Usage:
 *   pnpm tsx scripts/switch-strategy-config.ts [config-file-path] [asset]
 *   pnpm tsx scripts/switch-strategy-config.ts --restore [index] [asset]
 *   pnpm tsx scripts/switch-strategy-config.ts --list [asset]
 * 
 * Examples:
 *   pnpm tsx scripts/switch-strategy-config.ts data/optimized-configs/ml-optimized-eth-2026-01-01.json eth
 *     → Switch to optimized config, save current to history
 *   
 *   pnpm tsx scripts/switch-strategy-config.ts --restore 0 eth
 *     → Restore config from history index 0
 *   
 *   pnpm tsx scripts/switch-strategy-config.ts --list eth
 *     → List all configs in history
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  getAdaptiveStrategyConfig, 
  saveAdaptiveStrategyConfig, 
  getStrategyHistory,
  restoreStrategyFromHistory,
  type StrategyHistoryEntry 
} from '@/lib/kv';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';
import type { TradingAsset } from '@/lib/asset-config';
import { disconnectRedis } from '@/lib/kv';

/**
 * Load config from file
 */
function loadConfigFromFile(filePath: string): EnhancedAdaptiveStrategyConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const config = JSON.parse(content) as EnhancedAdaptiveStrategyConfig;
  
  if (!config.bullishStrategy || !config.bearishStrategy) {
    throw new Error('Invalid config: missing bullish or bearish strategy');
  }
  
  return config;
}

/**
 * Find latest optimized config
 */
function findLatestOptimizedConfig(asset: TradingAsset): string | null {
  const configDir = path.join(process.cwd(), 'data', 'optimized-configs');
  
  if (!fs.existsSync(configDir)) {
    return null;
  }
  
  const files = fs.readdirSync(configDir)
    .filter(f => f.startsWith(`ml-optimized-${asset}-`) && f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(configDir, f),
      mtime: fs.statSync(path.join(configDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return files.length > 0 ? files[0]!.path : null;
}

/**
 * Get config short name for display
 */
function getConfigShortName(config: EnhancedAdaptiveStrategyConfig): string {
  const bullBuy = config.bullishStrategy.buyThreshold.toFixed(2);
  const bullSell = Math.abs(config.bullishStrategy.sellThreshold).toFixed(2);
  const bearBuy = config.bearishStrategy.buyThreshold.toFixed(2);
  const bearSell = Math.abs(config.bearishStrategy.sellThreshold).toFixed(2);
  const regime = (config.regimeConfidenceThreshold ?? 0.22).toFixed(2);
  const kelly = config.kellyCriterion?.fractionalMultiplier?.toFixed(2) ?? '0.25';
  const atr = config.stopLoss?.atrMultiplier?.toFixed(1) ?? '2.0';
  return `B${bullBuy}-S${bullSell}|Be${bearBuy}-S${bearSell}|R${regime}|K${kelly}|A${atr}`;
}

/**
 * List strategy history
 */
async function listHistory(asset: TradingAsset) {
  const history = await getStrategyHistory(asset);
  const current = await getAdaptiveStrategyConfig(asset);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 Strategy History for ${asset.toUpperCase()}`);
  console.log(`${'='.repeat(80)}\n`);
  
  if (current) {
    console.log(`✅ Current Active Config:`);
    console.log(`   Name: ${getConfigShortName(current)}`);
    console.log(`   Active: Now`);
    console.log(`   Source: Active config\n`);
  }
  
  if (history.length === 0) {
    console.log('   No history entries found.\n');
    return;
  }
  
  console.log(`📜 History (${history.length} entries, most recent first):\n`);
  
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]!;
    const isCurrent = current && JSON.stringify(entry.config) === JSON.stringify(current);
    const status = isCurrent ? '✅ CURRENT' : '';
    
    console.log(`[${history.length - 1 - i}] ${status}`);
    console.log(`   Name: ${entry.name || 'Unnamed'}`);
    console.log(`   Config: ${getConfigShortName(entry.config)}`);
    console.log(`   Active From: ${entry.activeFrom}`);
    console.log(`   Active To: ${entry.activeTo || 'Now'}`);
    console.log(`   Source: ${entry.source || 'unknown'}`);
    console.log('');
  }
}

/**
 * Switch to new config
 */
async function switchConfig(configPath: string, asset: TradingAsset) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 Switching Strategy Config for ${asset.toUpperCase()}`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Load new config
  console.log(`📁 Loading config from: ${configPath}`);
  const newConfig = loadConfigFromFile(configPath);
  const newConfigName = getConfigShortName(newConfig);
  console.log(`   Config: ${newConfigName}\n`);
  
  // Get current config
  const currentConfig = await getAdaptiveStrategyConfig(asset);
  if (currentConfig) {
    const currentConfigName = getConfigShortName(currentConfig);
    console.log(`📋 Current config: ${currentConfigName}`);
    console.log(`   Will be saved to history\n`);
  } else {
    console.log(`📋 No current config found (this will be the first config)\n`);
  }
  
  // Generate name from filename
  const fileName = path.basename(configPath, '.json');
  const configName = fileName.replace(`ml-optimized-${asset}-`, 'ML Optimized ').replace(/-/g, '/');
  
  // Save new config (this will archive the current one)
  await saveAdaptiveStrategyConfig(newConfig, asset, {
    name: configName,
    source: 'ml-optimizer',
  });
  
  console.log(`✅ Successfully switched to new config!`);
  console.log(`   New config: ${newConfigName}`);
  console.log(`   Previous config saved to history\n`);
}

/**
 * Restore from history
 */
async function restoreConfig(entryIndex: number, asset: TradingAsset) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 Restoring Strategy Config from History for ${asset.toUpperCase()}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const history = await getStrategyHistory(asset);
  
  if (entryIndex < 0 || entryIndex >= history.length) {
    console.error(`❌ Invalid history entry index: ${entryIndex}`);
    console.error(`   Available entries: 0-${history.length - 1}`);
    process.exit(1);
  }
  
  const entry = history[entryIndex]!;
  const configName = getConfigShortName(entry.config);
  
  console.log(`📋 Restoring config from history:`);
  console.log(`   Index: ${entryIndex}`);
  console.log(`   Name: ${entry.name || 'Unnamed'}`);
  console.log(`   Config: ${configName}`);
  console.log(`   Previously active: ${entry.activeFrom} to ${entry.activeTo || 'Now'}\n`);
  
  // History is stored with oldest first, but we display with newest first
  // So entryIndex 0 is the most recent (last in array)
  const actualIndex = history.length - 1 - entryIndex;
  await restoreStrategyFromHistory(actualIndex, asset);
  
  console.log(`✅ Successfully restored config!`);
  console.log(`   Restored config: ${configName}`);
  console.log(`   Previous config saved to history\n`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  pnpm tsx scripts/switch-strategy-config.ts [config-file-path] [asset]');
    console.error('  pnpm tsx scripts/switch-strategy-config.ts --restore [index] [asset]');
    console.error('  pnpm tsx scripts/switch-strategy-config.ts --list [asset]');
    console.error('  pnpm tsx scripts/switch-strategy-config.ts --latest [asset]');
    process.exit(1);
  }
  
  const command = args[0];
  const asset = (args[args.length - 1] as TradingAsset) || 'eth';
  
  try {
    if (command === '--list') {
      await listHistory(asset);
    } else if (command === '--restore') {
      const index = parseInt(args[1]!, 10);
      if (isNaN(index)) {
        console.error('❌ Invalid index. Must be a number.');
        process.exit(1);
      }
      await restoreConfig(index, asset);
    } else if (command === '--latest') {
      const latest = findLatestOptimizedConfig(asset);
      if (!latest) {
        console.error(`❌ No optimized config found for ${asset}. Run ML optimizer first:`);
        console.error(`   pnpm eth:ml-optimize ${asset}`);
        process.exit(1);
      }
      await switchConfig(latest, asset);
    } else {
      // Assume it's a config file path
      const configPath = args[0]!;
      await switchConfig(configPath, asset);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main()
  .then(async () => {
    try {
      await disconnectRedis();
    } catch (error) {
      // Ignore disconnect errors
    }
    setImmediate(() => process.exit(0));
  })
  .catch(async (error) => {
    console.error('Error:', error);
    try {
      await disconnectRedis();
    } catch {
      // Ignore disconnect errors
    }
    setImmediate(() => process.exit(1));
  });

