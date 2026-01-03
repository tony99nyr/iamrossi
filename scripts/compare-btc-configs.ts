#!/usr/bin/env npx tsx
/**
 * Compare BTC Strategy Configs
 * 
 * Compares the previous and current BTC strategy configurations
 * to show what changed.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EnhancedAdaptiveStrategyConfig } from '@/lib/adaptive-strategy-enhanced';

function deepCompare(obj1: any, obj2: any, path: string = '', differences: string[] = []): void {
  const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
  
  for (const key of keys) {
    const currentPath = path ? `${path}.${key}` : key;
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];
    
    if (val1 === undefined && val2 !== undefined) {
      differences.push(`➕ ADDED: ${currentPath} = ${formatValue(val2)}`);
    } else if (val1 !== undefined && val2 === undefined) {
      differences.push(`➖ REMOVED: ${currentPath} = ${formatValue(val1)}`);
    } else if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null && !Array.isArray(val1) && !Array.isArray(val2)) {
      deepCompare(val1, val2, currentPath, differences);
    } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      differences.push(`🔄 CHANGED: ${currentPath}`);
      differences.push(`   Previous: ${formatValue(val1)}`);
      differences.push(`   Current:  ${formatValue(val2)}`);
    }
  }
}

function formatValue(value: any): string {
  if (typeof value === 'number') {
    return value.toFixed(6);
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value);
}

function main() {
  const configDir = path.join(process.cwd(), 'data', 'optimized-configs');
  
  // Find latest two BTC configs
  const files = fs.readdirSync(configDir)
    .filter(f => f.startsWith('ml-optimized-btc-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length < 2) {
    console.error('❌ Need at least 2 BTC config files to compare');
    process.exit(1);
  }
  
  const currentFile = path.join(configDir, files[0]!);
  const previousFile = path.join(configDir, files[1]!);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 BTC Strategy Config Comparison`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`Previous: ${files[1]}`);
  console.log(`Current:  ${files[0]}\n`);
  
  const previousConfig = JSON.parse(fs.readFileSync(previousFile, 'utf-8')) as EnhancedAdaptiveStrategyConfig;
  const currentConfig = JSON.parse(fs.readFileSync(currentFile, 'utf-8')) as EnhancedAdaptiveStrategyConfig;
  
  const differences: string[] = [];
  deepCompare(previousConfig, currentConfig, '', differences);
  
  if (differences.length === 0) {
    console.log('✅ No differences found - configs are identical');
  } else {
    console.log(`📋 Found ${differences.length} differences:\n`);
    differences.forEach(diff => console.log(diff));
    
    // Summary by category
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Summary by Category`);
    console.log(`${'='.repeat(80)}\n`);
    
    const added = differences.filter(d => d.startsWith('➕')).length;
    const removed = differences.filter(d => d.startsWith('➖')).length;
    const changed = differences.filter(d => d.startsWith('🔄')).length;
    
    console.log(`➕ Added: ${added} new parameters`);
    console.log(`➖ Removed: ${removed} parameters`);
    console.log(`🔄 Changed: ${changed} parameters`);
    
    // Key changes summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔑 Key Changes Summary`);
    console.log(`${'='.repeat(80)}\n`);
    
    // Bullish strategy changes
    const bullishChanges = differences.filter(d => d.includes('bullishStrategy'));
    if (bullishChanges.length > 0) {
      console.log('📈 Bullish Strategy:');
      bullishChanges.forEach(change => {
        if (change.includes('buyThreshold') || change.includes('sellThreshold') || change.includes('maxPositionPct')) {
          console.log(`   ${change.split('\n')[0]}`);
          if (change.includes('\n')) {
            change.split('\n').slice(1).forEach(line => console.log(`   ${line}`));
          }
        }
      });
      console.log();
    }
    
    // Bearish strategy changes
    const bearishChanges = differences.filter(d => d.includes('bearishStrategy'));
    if (bearishChanges.length > 0) {
      console.log('📉 Bearish Strategy:');
      bearishChanges.forEach(change => {
        if (change.includes('buyThreshold') || change.includes('sellThreshold') || change.includes('maxPositionPct')) {
          console.log(`   ${change.split('\n')[0]}`);
          if (change.includes('\n')) {
            change.split('\n').slice(1).forEach(line => console.log(`   ${line}`));
          }
        }
      });
      console.log();
    }
    
    // New features
    const newFeatures = differences.filter(d => 
      d.includes('bullMarketParticipation') || 
      d.includes('regimeTransitionFilter') || 
      d.includes('correlationAdjustments') ||
      d.includes('dynamicPositionSizingConfig') ||
      d.includes('volatilityConfig') ||
      d.includes('circuitBreakerConfig')
    );
    if (newFeatures.length > 0) {
      console.log('✨ New Features Enabled:');
      const featureNames = new Set<string>();
      newFeatures.forEach(f => {
        const match = f.match(/ADDED: ([\w.]+)/);
        if (match) {
          const feature = match[1]!.split('.')[0];
          if (feature) featureNames.add(feature);
        }
      });
      featureNames.forEach(f => console.log(`   • ${f}`));
      console.log();
    }
  }
}

if (require.main === module) {
  main();
}

