#!/usr/bin/env npx tsx
/**
 * Compare trading performance with and without ETH-BTC correlation integration
 * 
 * Runs backfill tests for both ETH and BTC with correlation enabled and disabled,
 * then generates a comparison report.
 * 
 * Usage:
 *   pnpm tsx scripts/compare-correlation-impact.ts [startDate] [endDate]
 * 
 * Examples:
 *   pnpm tsx scripts/compare-correlation-impact.ts 2026-01-01 2026-12-31
 *   pnpm tsx scripts/compare-correlation-impact.ts 2025-01-01 2027-12-31
 */

import { runBacktest } from './backfill-test';
import { getAssetConfig } from '@/lib/asset-config';
import { analyzeCorrelation, getCorrelationContext } from '@/lib/correlation-analysis';
import { fetchPriceCandles } from '../src/lib/eth-price-service';
import { fetchAlignedCandles } from '@/lib/btc-price-service';
import { disconnectRedis } from '@/lib/kv';
import type { PriceCandle } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

interface CorrelationTestResult {
  asset: 'eth' | 'btc';
  withCorrelation: boolean;
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  totalTrades: number;
  winTrades: number;
  sellTrades: number;
}

async function runBacktestWithCorrelation(
  startDate: string,
  endDate: string,
  asset: 'eth' | 'btc',
  withCorrelation: boolean,
  isSynthetic: boolean
): Promise<CorrelationTestResult> {
  const assetConfig = getAssetConfig(asset);
  const symbol = assetConfig.symbol;
  const timeframe = '8h'; // Use 8h for both assets
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${assetConfig.displayName} ${timeframe} ${withCorrelation ? 'WITH' : 'WITHOUT'} correlation`);
  console.log('='.repeat(80));
  
  // Load candles for the asset being tested
  let candles: PriceCandle[];
  if (isSynthetic) {
    // For synthetic data, we need to load from synthetic directory
    const { loadSyntheticData } = await import('./backfill-test');
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    
    // Load all years in the range
    candles = [];
    for (let year = startYear; year <= endYear; year++) {
      try {
        const yearCandles = loadSyntheticData(year, asset, timeframe);
        candles.push(...yearCandles);
      } catch (error) {
        console.warn(`⚠️  Could not load ${asset} synthetic data for ${year}: ${error}`);
      }
    }
    candles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Filter to date range
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();
    candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
  } else {
    candles = await fetchPriceCandles(symbol, timeframe, startDate, endDate, undefined, true, true);
  }
  
  if (candles.length < 50) {
    throw new Error(`Not enough candles: ${candles.length}`);
  }
  
  // If correlation is enabled, we need to calculate correlation context
  // For ETH: use BTC correlation
  // For BTC: use ETH correlation (reverse)
  let correlationContext: { signal: number; riskLevel: 'low' | 'medium' | 'high'; context: string } | undefined;
  
  if (withCorrelation) {
    try {
      // Load the other asset's candles for correlation analysis
      const otherAsset = asset === 'eth' ? 'btc' : 'eth';
      const otherAssetConfig = getAssetConfig(otherAsset);
      const otherSymbol = otherAssetConfig.symbol;
      
      let otherCandles: PriceCandle[];
      if (isSynthetic) {
        const { loadSyntheticData } = await import('./backfill-test');
        const startYear = new Date(startDate).getFullYear();
        const endYear = new Date(endDate).getFullYear();
        
        // Load all years in the range
        otherCandles = [];
        for (let year = startYear; year <= endYear; year++) {
          try {
            const yearCandles = loadSyntheticData(year, otherAsset, timeframe);
            otherCandles.push(...yearCandles);
          } catch (error) {
            console.warn(`⚠️  Could not load ${otherAsset} synthetic data for ${year}: ${error}`);
          }
        }
        otherCandles.sort((a, b) => a.timestamp - b.timestamp);
        
        // Filter to date range
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        otherCandles = otherCandles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
      } else {
        // For real data, try to fetch aligned candles
        const aligned = await fetchAlignedCandles(candles, timeframe);
        otherCandles = asset === 'eth' ? aligned.btc : aligned.eth;
      }
      
      // Align candles by timestamp
      const alignedCandles: { eth: PriceCandle[]; btc: PriceCandle[] } = { eth: [], btc: [] };
      const candleMap = new Map<number, PriceCandle>();
      
      candles.forEach(c => candleMap.set(c.timestamp, c));
      
      for (const otherCandle of otherCandles) {
        const matchingCandle = candleMap.get(otherCandle.timestamp);
        if (matchingCandle) {
          if (asset === 'eth') {
            alignedCandles.eth.push(matchingCandle);
            alignedCandles.btc.push(otherCandle);
          } else {
            alignedCandles.eth.push(otherCandle);
            alignedCandles.btc.push(matchingCandle);
          }
        }
      }
      
      if (alignedCandles.eth.length >= 30 && alignedCandles.btc.length >= 30) {
        // Calculate correlation
        const correlationAnalysis = await analyzeCorrelation(alignedCandles.eth, alignedCandles.btc, 30);
        const context = getCorrelationContext(correlationAnalysis);
        
        // For BTC, we reverse the signal (BTC correlation with ETH)
        if (asset === 'btc') {
          correlationContext = {
            signal: -context.signal, // Reverse signal for BTC perspective
            riskLevel: context.riskLevel,
            context: context.context,
          };
        } else {
          correlationContext = {
            signal: context.signal,
            riskLevel: context.riskLevel,
            context: context.context,
          };
        }
        
        console.log(`   Correlation: ${(correlationAnalysis.currentCorrelation * 100).toFixed(1)}%`);
        console.log(`   Risk Level: ${correlationContext.riskLevel}`);
      } else {
        console.warn(`   ⚠️  Not enough aligned candles for correlation (${alignedCandles.eth.length})`);
      }
    } catch (error) {
      console.warn(`   ⚠️  Could not calculate correlation: ${error}`);
    }
  }
  
  // Run backtest with correlation flag
  const result = await runBacktest(startDate, endDate, isSynthetic, undefined, undefined, undefined, asset, timeframe, withCorrelation);
  
  const winRate = result.winTrades > 0 ? (result.winTrades / result.sellTrades) * 100 : 0;
  console.log(`   Return: ${result.totalReturnPct.toFixed(2)}%`);
  console.log(`   Sharpe: ${result.sharpeRatio.toFixed(2)}`);
  console.log(`   Max DD: ${result.maxDrawdownPct.toFixed(2)}%`);
  console.log(`   Trades: ${result.totalTrades} (${winRate.toFixed(1)}% win rate)`);
  
  return {
    asset,
    withCorrelation,
    totalReturnPct: result.totalReturnPct,
    sharpeRatio: result.sharpeRatio,
    maxDrawdownPct: result.maxDrawdownPct,
    totalTrades: result.totalTrades,
    winTrades: result.winTrades,
    sellTrades: result.sellTrades,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2026-01-01';
  const endDate = args[1] || '2026-12-31';
  const isSynthetic = startDate >= '2026-01-01';
  
  console.log('🔄 Correlation Impact Comparison Test\n');
  console.log(`   Period: ${startDate} to ${endDate}`);
  console.log(`   Type: ${isSynthetic ? 'Synthetic' : 'Historical'}\n`);
  
  const results: CorrelationTestResult[] = [];
  
  // Test ETH with and without correlation
  try {
    const ethNoCorr = await runBacktestWithCorrelation(startDate, endDate, 'eth', false, isSynthetic);
    results.push(ethNoCorr);
  } catch (error) {
    console.error(`❌ ETH without correlation failed:`, error);
  }
  
  try {
    const ethWithCorr = await runBacktestWithCorrelation(startDate, endDate, 'eth', true, isSynthetic);
    results.push(ethWithCorr);
  } catch (error) {
    console.error(`❌ ETH with correlation failed:`, error);
  }
  
  // Test BTC with and without correlation
  try {
    const btcNoCorr = await runBacktestWithCorrelation(startDate, endDate, 'btc', false, isSynthetic);
    results.push(btcNoCorr);
  } catch (error) {
    console.error(`❌ BTC without correlation failed:`, error);
  }
  
  try {
    const btcWithCorr = await runBacktestWithCorrelation(startDate, endDate, 'btc', true, isSynthetic);
    results.push(btcWithCorr);
  } catch (error) {
    console.error(`❌ BTC with correlation failed:`, error);
  }
  
  // Generate report
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 CORRELATION IMPACT SUMMARY');
  console.log('='.repeat(80));
  
  const ethNoCorr = results.find(r => r.asset === 'eth' && !r.withCorrelation);
  const ethWithCorr = results.find(r => r.asset === 'eth' && r.withCorrelation);
  const btcNoCorr = results.find(r => r.asset === 'btc' && !r.withCorrelation);
  const btcWithCorr = results.find(r => r.asset === 'btc' && r.withCorrelation);
  
  if (ethNoCorr && ethWithCorr) {
    const returnDiff = ethWithCorr.totalReturnPct - ethNoCorr.totalReturnPct;
    console.log(`\n📈 ETHEREUM:`);
    console.log(`   Without Correlation: ${ethNoCorr.totalReturnPct.toFixed(2)}% return, ${ethNoCorr.totalTrades} trades`);
    console.log(`   With Correlation:    ${ethWithCorr.totalReturnPct.toFixed(2)}% return, ${ethWithCorr.totalTrades} trades`);
    console.log(`   Impact: ${returnDiff >= 0 ? '+' : ''}${returnDiff.toFixed(2)}% (${((returnDiff / ethNoCorr.totalReturnPct) * 100).toFixed(1)}% change)`);
  }
  
  if (btcNoCorr && btcWithCorr) {
    const returnDiff = btcWithCorr.totalReturnPct - btcNoCorr.totalReturnPct;
    console.log(`\n📈 BITCOIN:`);
    console.log(`   Without Correlation: ${btcNoCorr.totalReturnPct.toFixed(2)}% return, ${btcNoCorr.totalTrades} trades`);
    console.log(`   With Correlation:    ${btcWithCorr.totalReturnPct.toFixed(2)}% return, ${btcWithCorr.totalTrades} trades`);
    console.log(`   Impact: ${returnDiff >= 0 ? '+' : ''}${returnDiff.toFixed(2)}% (${((returnDiff / btcNoCorr.totalReturnPct) * 100).toFixed(1)}% change)`);
  }
  
  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const reportFile = path.join(reportDir, `correlation-impact-${startDate}-${endDate}.md`);
  let report = `# Correlation Impact Analysis Report\n\n`;
  report += `**Period**: ${startDate} to ${endDate}\n`;
  report += `**Generated**: ${new Date().toISOString()}\n\n`;
  report += `## Results\n\n`;
  
  if (ethNoCorr && ethWithCorr) {
    const returnDiff = ethWithCorr.totalReturnPct - ethNoCorr.totalReturnPct;
    report += `### Ethereum\n\n`;
    report += `| Metric | Without Correlation | With Correlation | Difference |\n`;
    report += `|--------|---------------------|------------------|------------|\n`;
    report += `| Return % | ${ethNoCorr.totalReturnPct.toFixed(2)} | ${ethWithCorr.totalReturnPct.toFixed(2)} | ${returnDiff >= 0 ? '+' : ''}${returnDiff.toFixed(2)} |\n`;
    report += `| Sharpe | ${ethNoCorr.sharpeRatio.toFixed(2)} | ${ethWithCorr.sharpeRatio.toFixed(2)} | ${(ethWithCorr.sharpeRatio - ethNoCorr.sharpeRatio).toFixed(2)} |\n`;
    report += `| Max DD % | ${ethNoCorr.maxDrawdownPct.toFixed(2)} | ${ethWithCorr.maxDrawdownPct.toFixed(2)} | ${(ethWithCorr.maxDrawdownPct - ethNoCorr.maxDrawdownPct).toFixed(2)} |\n`;
    report += `| Trades | ${ethNoCorr.totalTrades} | ${ethWithCorr.totalTrades} | ${ethWithCorr.totalTrades - ethNoCorr.totalTrades} |\n\n`;
  }
  
  if (btcNoCorr && btcWithCorr) {
    const returnDiff = btcWithCorr.totalReturnPct - btcNoCorr.totalReturnPct;
    report += `### Bitcoin\n\n`;
    report += `| Metric | Without Correlation | With Correlation | Difference |\n`;
    report += `|--------|---------------------|------------------|------------|\n`;
    report += `| Return % | ${btcNoCorr.totalReturnPct.toFixed(2)} | ${btcWithCorr.totalReturnPct.toFixed(2)} | ${returnDiff >= 0 ? '+' : ''}${returnDiff.toFixed(2)} |\n`;
    report += `| Sharpe | ${btcNoCorr.sharpeRatio.toFixed(2)} | ${btcWithCorr.sharpeRatio.toFixed(2)} | ${(btcWithCorr.sharpeRatio - btcNoCorr.sharpeRatio).toFixed(2)} |\n`;
    report += `| Max DD % | ${btcNoCorr.maxDrawdownPct.toFixed(2)} | ${btcWithCorr.maxDrawdownPct.toFixed(2)} | ${(btcWithCorr.maxDrawdownPct - btcNoCorr.maxDrawdownPct).toFixed(2)} |\n`;
    report += `| Trades | ${btcNoCorr.totalTrades} | ${btcWithCorr.totalTrades} | ${btcWithCorr.totalTrades - btcNoCorr.totalTrades} |\n\n`;
  }
  
  fs.writeFileSync(reportFile, report);
  console.log(`\n📄 Report saved to: ${reportFile}`);
  
  await disconnectRedis();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('Error:', error);
  await disconnectRedis();
  process.exit(1);
});

