#!/usr/bin/env npx tsx
/**
 * Generate Enhanced Synthetic ETH Price Data for 2026
 * Creates realistic price movements with proper intraday volatility for 8h candles
 * Includes various market regimes to harden the algorithm
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { PriceCandle } from '@/types';

interface MarketRegime {
  name: string;
  startDate: string;
  endDate: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: 'low' | 'medium' | 'high' | 'extreme';
  description: string;
  // Special flag to keep flat/choppy behavior for testing
  keepFlatBehavior?: boolean;
}

const REGIMES: MarketRegime[] = [
  {
    name: 'January Bull Run',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    trend: 'bullish',
    volatility: 'medium',
    description: 'Strong upward trend to start the year',
  },
  {
    name: 'February Consolidation',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    trend: 'neutral',
    volatility: 'low',
    description: 'Sideways movement with low volatility - KEEP FLAT for testing',
    keepFlatBehavior: true, // Keep this flat to test algorithm edge cases
  },
  {
    name: 'March-April Mega Bull Run',
    startDate: '2026-03-01',
    endDate: '2026-04-30',
    trend: 'bullish',
    volatility: 'high',
    description: 'Massive bull run with high volatility - could trip up strategies',
  },
  {
    name: 'May Flash Crash',
    startDate: '2026-05-01',
    endDate: '2026-05-15',
    trend: 'bearish',
    volatility: 'extreme',
    description: 'Sudden crash - tests strategy resilience',
  },
  {
    name: 'May-June Recovery',
    startDate: '2026-05-16',
    endDate: '2026-06-30',
    trend: 'bullish',
    volatility: 'high',
    description: 'Recovery from crash with high volatility',
  },
  {
    name: 'July-August Bear Market',
    startDate: '2026-07-01',
    endDate: '2026-08-31',
    trend: 'bearish',
    volatility: 'medium',
    description: 'Sustained bear market - tests bearish strategy',
  },
  {
    name: 'September Whipsaw',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    trend: 'neutral',
    volatility: 'extreme',
    description: 'Extreme volatility with rapid direction changes - strategy killer',
  },
  {
    name: 'October-November Bull Run',
    startDate: '2026-10-01',
    endDate: '2026-11-30',
    trend: 'bullish',
    volatility: 'medium',
    description: 'Steady bull run',
  },
  {
    name: 'December Correction',
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    trend: 'bearish',
    volatility: 'high',
    description: 'Year-end correction',
  },
];

function getVolatilityMultiplier(volatility: string): number {
  switch (volatility) {
    case 'low': return 0.5;
    case 'medium': return 1.0;
    case 'high': return 1.5;
    case 'extreme': return 2.5;
    default: return 1.0;
  }
}

function getTrendMultiplier(trend: string, periodInRegime: number, totalPeriods: number): number {
  switch (trend) {
    case 'bullish':
      // Realistic 8h bullish movement: 0.2-0.5% per 8h period
      const progress = periodInRegime / totalPeriods;
      return 1 + (0.002 + Math.sin(progress * Math.PI) * 0.001); // 0.1% to 0.3% per period
    case 'bearish':
      // Realistic 8h bearish movement: -0.15 to -0.4% per 8h period
      const bearProgress = periodInRegime / totalPeriods;
      return 1 - (0.0015 + Math.sin(bearProgress * Math.PI) * 0.001); // -0.05% to -0.25% per period
    case 'neutral':
      return 1.0; // No trend
    default:
      return 1;
  }
}

/**
 * Generate realistic 8h candles directly (not from daily)
 * Each day has 3 8h periods with realistic intraday movement
 */
function generate8hCandlesForRegime(
  regime: MarketRegime,
  startPrice: number
): PriceCandle[] {
  const candles: PriceCandle[] = [];
  const startDate = new Date(regime.startDate);
  const endDate = new Date(regime.endDate);
  
  // Calculate total 8h periods (3 per day)
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const total8hPeriods = totalDays * 3;
  
  let currentPrice = startPrice;
  const volatility = getVolatilityMultiplier(regime.volatility);
  
  // Special handling for flash crash
  if (regime.name === 'May Flash Crash') {
    for (let period = 0; period < total8hPeriods; period++) {
      const date = new Date(startDate);
      date.setUTCHours(Math.floor(period / 3) * 24 + (period % 3) * 8, 0, 0, 0);
      
      // Crash: lose 1-2% per 8h period initially, then stabilize
      const crashIntensity = period < 5 ? 0.015 : (period < 10 ? 0.008 : 0.004);
      const periodChange = -crashIntensity + (Math.random() - 0.5) * 0.02 * volatility;
      currentPrice = currentPrice * (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(Math.random() * 0.015 * volatility));
      const low = currentPrice * (1 - Math.abs(Math.random() * 0.015 * volatility));
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp: date.getTime(),
        open,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        volume: Math.random() * 2000000 + 1000000,
      });
    }
    return candles;
  }
  
  // Special handling for mega bull run
  if (regime.name === 'March-April Mega Bull Run') {
    for (let period = 0; period < total8hPeriods; period++) {
      const date = new Date(startDate);
      date.setUTCHours(Math.floor(period / 3) * 24 + (period % 3) * 8, 0, 0, 0);
      
      const trendMultiplier = getTrendMultiplier(regime.trend, period, total8hPeriods);
      const periodChange = (trendMultiplier - 1) + (Math.random() - 0.5) * 0.025 * volatility;
      currentPrice = currentPrice * (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(Math.random() * 0.02 * volatility));
      const low = currentPrice * (1 - Math.abs(Math.random() * 0.02 * volatility));
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp: date.getTime(),
        open,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        volume: Math.random() * 3000000 + 1500000,
      });
    }
    return candles;
  }
  
  // Special handling for whipsaw period
  if (regime.name === 'September Whipsaw') {
    for (let period = 0; period < total8hPeriods; period++) {
      const date = new Date(startDate);
      date.setUTCHours(Math.floor(period / 3) * 24 + (period % 3) * 8, 0, 0, 0);
      
      // Rapid direction changes every few periods
      const direction = Math.sin(period * 0.8) > 0 ? 1 : -1;
      const periodChange = direction * (0.02 + Math.random() * 0.03) * volatility;
      currentPrice = currentPrice * (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(Math.random() * 0.04 * volatility));
      const low = currentPrice * (1 - Math.abs(Math.random() * 0.04 * volatility));
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp: date.getTime(),
        open,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        volume: Math.random() * 2500000 + 1200000,
      });
    }
    return candles;
  }
  
  // Standard regime generation with realistic 8h candles
  for (let period = 0; period < total8hPeriods; period++) {
    const date = new Date(startDate);
    date.setUTCHours(Math.floor(period / 3) * 24 + (period % 3) * 8, 0, 0, 0);
    
    const trendMultiplier = getTrendMultiplier(regime.trend, period, total8hPeriods);
    
    // For flat behavior periods (like February Consolidation), use minimal movement
    let periodChange: number;
    if (regime.keepFlatBehavior) {
      // Keep flat behavior: very small random movements
      periodChange = (Math.random() - 0.5) * 0.003 * volatility; // Max 0.15% movement
    } else {
      // Realistic 8h movement: trend + volatility
      periodChange = (trendMultiplier - 1) + (Math.random() - 0.5) * 0.008 * volatility;
    }
    
    currentPrice = currentPrice * (1 + periodChange);
    
    // Realistic intraday range for 8h period
    const intradayRange = regime.keepFlatBehavior 
      ? 0.005 * volatility  // Small range for flat periods
      : 0.015 * volatility; // Normal range
    
    const high = currentPrice * (1 + Math.abs(Math.random() * intradayRange));
    const low = currentPrice * (1 - Math.abs(Math.random() * intradayRange));
    const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
    const close = currentPrice;
    
    // Ensure high/low are realistic
    const finalHigh = Math.max(open, high, close);
    const finalLow = Math.min(open, low, close);
    
    // Volume varies with volatility
    const baseVolume = regime.keepFlatBehavior ? 800000 : 1200000;
    const volume = baseVolume + Math.random() * (baseVolume * 0.5) * volatility;
    
    candles.push({
      timestamp: date.getTime(),
      open,
      high: finalHigh,
      low: finalLow,
      close,
      volume,
    });
  }
  
  return candles;
}

async function main() {
  console.log('🎲 Generating Enhanced Synthetic ETH Price Data for 2026 (8h candles)\n');
  
  // Start with a realistic price (around $3000 based on 2025 data)
  let currentPrice = 3000;
  const allCandles: PriceCandle[] = [];
  
  // Generate 8h candles for each regime
  for (const regime of REGIMES) {
    console.log(`📊 Generating: ${regime.name} (${regime.startDate} to ${regime.endDate})`);
    console.log(`   Trend: ${regime.trend}, Volatility: ${regime.volatility}${regime.keepFlatBehavior ? ' (KEEPING FLAT BEHAVIOR)' : ''}`);
    
    const candles = generate8hCandlesForRegime(regime, currentPrice);
    allCandles.push(...candles);
    
    // Update current price for next regime
    currentPrice = candles[candles.length - 1]!.close;
    console.log(`   Generated ${candles.length} 8h candles, ending price: $${currentPrice.toFixed(2)}\n`);
  }
  
  // Sort by timestamp
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Save to synthetic data folder
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const startDate = allCandles[0]!.timestamp;
  const endDate = allCandles[allCandles.length - 1]!.timestamp;
  const startDateStr = new Date(startDate).toISOString().split('T')[0];
  const endDateStr = new Date(endDate).toISOString().split('T')[0];
  
  const filename = `ethusdt_8h_${startDateStr}_${endDateStr}.json.gz`;
  const filepath = path.join(dataDir, filename);
  
  const jsonData = JSON.stringify(allCandles, null, 2);
  const compressed = zlib.gzipSync(jsonData);
  
  fs.writeFileSync(filepath, compressed);
  
  console.log(`✅ Generated ${allCandles.length} 8h candles for 2026`);
  console.log(`📁 Saved to: ${filepath}`);
  console.log(`💰 Price range: $${Math.min(...allCandles.map(c => c.low)).toFixed(2)} - $${Math.max(...allCandles.map(c => c.high)).toFixed(2)}`);
  console.log(`📈 Starting price: $${allCandles[0]!.close.toFixed(2)}`);
  console.log(`📉 Ending price: $${allCandles[allCandles.length - 1]!.close.toFixed(2)}`);
  
  // Analyze data quality
  const changes = allCandles.slice(1).map((c, i) => Math.abs((c.close - allCandles[i]!.close) / allCandles[i]!.close * 100));
  const zeroChanges = changes.filter(c => c < 0.01).length;
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  
  console.log(`\n📊 Data Quality:`);
  console.log(`   Zero/near-zero changes: ${zeroChanges} (${(zeroChanges / changes.length * 100).toFixed(1)}%)`);
  console.log(`   Average change: ${avgChange.toFixed(4)}%`);
  console.log(`   Changes > 1%: ${changes.filter(c => c > 1).length}`);
  console.log(`   Changes > 5%: ${changes.filter(c => c > 5).length}`);
}

main().catch(console.error);

