#!/usr/bin/env npx tsx
/**
 * Generate Synthetic ETH Price Data for 2026
 * Creates realistic price movements with various market regimes:
 * - Bull runs
 * - Bear markets
 * - Crashes
 * - Consolidation periods
 * - Volatile periods that could trip up strategies
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
    description: 'Sideways movement with low volatility',
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
    case 'high': return 2.0;
    case 'extreme': return 4.0;
    default: return 1.0;
  }
}

function getTrendMultiplier(trend: string, dayInRegime: number, totalDays: number): number {
  const progress = dayInRegime / totalDays;
  
  switch (trend) {
    case 'bullish':
      // Gradual upward trend with some noise
      return 1 + (0.001 * (1 + Math.sin(progress * Math.PI * 2) * 0.3));
    case 'bearish':
      // Gradual downward trend with some noise
      return 1 - (0.001 * (1 + Math.sin(progress * Math.PI * 2) * 0.3));
    case 'neutral':
      // Sideways with small oscillations
      return 1 + (Math.sin(progress * Math.PI * 4) * 0.0005);
    default:
      return 1;
  }
}

function generateCandlesForRegime(
  regime: MarketRegime,
  startPrice: number
): PriceCandle[] {
  const candles: PriceCandle[] = [];
  const startDate = new Date(regime.startDate);
  const endDate = new Date(regime.endDate);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  let currentPrice = startPrice;
  const volatility = getVolatilityMultiplier(regime.volatility);
  
  // Special handling for flash crash
  if (regime.name === 'May Flash Crash') {
    // Rapid decline over 15 days
    for (let day = 0; day < totalDays; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      
      // Crash: lose 5-10% per day initially, then stabilize
      const crashIntensity = day < 5 ? 0.08 : (day < 10 ? 0.04 : 0.02);
      const dailyChange = -crashIntensity + (Math.random() - 0.5) * 0.04;
      currentPrice = currentPrice * (1 + dailyChange);
      
      const high = currentPrice * (1 + Math.abs(Math.random() * 0.03));
      const low = currentPrice * (1 - Math.abs(Math.random() * 0.03));
      const open = day === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp: date.getTime(),
        open,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        volume: Math.random() * 1000000 + 500000,
      });
    }
    return candles;
  }
  
  // Special handling for mega bull run
  if (regime.name === 'March-April Mega Bull Run') {
    for (let day = 0; day < totalDays; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      
      // Strong upward trend with high volatility
      const trendMultiplier = getTrendMultiplier(regime.trend, day, totalDays);
      const dailyChange = (trendMultiplier - 1) + (Math.random() - 0.5) * 0.06 * volatility;
      currentPrice = currentPrice * (1 + dailyChange);
      
      const high = currentPrice * (1 + Math.abs(Math.random() * 0.05 * volatility));
      const low = currentPrice * (1 - Math.abs(Math.random() * 0.05 * volatility));
      const open = day === 0 ? startPrice : candles[candles.length - 1]!.close;
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
  
  // Special handling for whipsaw period
  if (regime.name === 'September Whipsaw') {
    for (let day = 0; day < totalDays; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      
      // Rapid direction changes every few days
      const direction = Math.sin(day * 0.5) > 0 ? 1 : -1;
      const dailyChange = direction * (0.03 + Math.random() * 0.05) * volatility;
      currentPrice = currentPrice * (1 + dailyChange);
      
      const high = currentPrice * (1 + Math.abs(Math.random() * 0.08 * volatility));
      const low = currentPrice * (1 - Math.abs(Math.random() * 0.08 * volatility));
      const open = day === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp: date.getTime(),
        open,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        volume: Math.random() * 1500000 + 800000,
      });
    }
    return candles;
  }
  
  // Standard regime generation
  for (let day = 0; day < totalDays; day++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    
    const trendMultiplier = getTrendMultiplier(regime.trend, day, totalDays);
    const dailyChange = (trendMultiplier - 1) + (Math.random() - 0.5) * 0.03 * volatility;
    currentPrice = currentPrice * (1 + dailyChange);
    
    const high = currentPrice * (1 + Math.abs(Math.random() * 0.02 * volatility));
    const low = currentPrice * (1 - Math.abs(Math.random() * 0.02 * volatility));
    const open = day === 0 ? startPrice : candles[candles.length - 1]!.close;
    const close = currentPrice;
    
    candles.push({
      timestamp: date.getTime(),
      open,
      high: Math.max(open, high, close),
      low: Math.min(open, low, close),
      close,
      volume: Math.random() * 1000000 + 500000,
    });
  }
  
  return candles;
}

async function main() {
  console.log('🎲 Generating Synthetic ETH Price Data for 2026\n');
  
  // Start with a realistic price (around $3000 based on 2025 data)
  let currentPrice = 3000;
  const allCandles: PriceCandle[] = [];
  
  // Generate candles for each regime
  for (const regime of REGIMES) {
    console.log(`📊 Generating: ${regime.name} (${regime.startDate} to ${regime.endDate})`);
    console.log(`   Trend: ${regime.trend}, Volatility: ${regime.volatility}`);
    
    const candles = generateCandlesForRegime(regime, currentPrice);
    allCandles.push(...candles);
    
    // Update current price for next regime
    currentPrice = candles[candles.length - 1]!.close;
    console.log(`   Generated ${candles.length} candles, ending price: $${currentPrice.toFixed(2)}\n`);
  }
  
  // Sort by timestamp
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Save to synthetic data folder (separate from real historical data)
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const startDate = allCandles[0]!.timestamp;
  const endDate = allCandles[allCandles.length - 1]!.timestamp;
  const startDateStr = new Date(startDate).toISOString().split('T')[0];
  const endDateStr = new Date(endDate).toISOString().split('T')[0];
  
  const filename = `ethusdt_1d_${startDateStr}_${endDateStr}.json.gz`;
  const filepath = path.join(dataDir, filename);
  
  const jsonData = JSON.stringify(allCandles, null, 2);
  const compressed = zlib.gzipSync(jsonData);
  
  fs.writeFileSync(filepath, compressed);
  
  console.log(`✅ Generated ${allCandles.length} candles for 2026`);
  console.log(`📁 Saved to: ${filepath}`);
  console.log(`💰 Price range: $${Math.min(...allCandles.map(c => c.low)).toFixed(2)} - $${Math.max(...allCandles.map(c => c.high)).toFixed(2)}`);
  console.log(`📈 Starting price: $${allCandles[0]!.close.toFixed(2)}`);
  console.log(`📉 Ending price: $${allCandles[allCandles.length - 1]!.close.toFixed(2)}`);
  console.log(`📊 Total return: ${((allCandles[allCandles.length - 1]!.close / allCandles[0]!.close - 1) * 100).toFixed(2)}%`);
  
  // Print regime summary
  console.log(`\n📋 Regime Summary:`);
  for (const regime of REGIMES) {
    const regimeCandles = allCandles.filter(c => {
      const candleDate = new Date(c.timestamp).toISOString().split('T')[0];
      return candleDate >= regime.startDate && candleDate <= regime.endDate;
    });
    if (regimeCandles.length > 0) {
      const startPrice = regimeCandles[0]!.close;
      const endPrice = regimeCandles[regimeCandles.length - 1]!.close;
      const returnPct = ((endPrice / startPrice - 1) * 100).toFixed(2);
      console.log(`   ${regime.name}: ${returnPct}% (${regimeCandles.length} days)`);
    }
  }
}

main().catch(console.error);

