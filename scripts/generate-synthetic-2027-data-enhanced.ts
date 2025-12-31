#!/usr/bin/env npx tsx
/**
 * Generate Enhanced Synthetic ETH Price Data for 2027
 * Creates realistic price movements with proper intraday volatility for 8h candles
 * Includes challenging market conditions to harden the algorithm:
 * - Extended bear markets
 * - Slow grind downs
 * - False breakouts (bull/bear traps)
 * - Extended consolidation
 * - Volatility squeezes
 * - Multiple regime switches
 * - Extended bull runs
 * - Recovery scenarios
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
  // Special flags for edge cases
  keepFlatBehavior?: boolean;
  slowGrind?: boolean; // Gradual decline/increase over time
  falseBreakout?: 'bull' | 'bear'; // False breakout pattern
  volatilitySqueeze?: boolean; // Low vol followed by explosion
}

const REGIMES: MarketRegime[] = [
  {
    name: 'January False Bull Breakout',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    trend: 'bullish',
    volatility: 'medium',
    description: 'Starts strong but fails - bull trap to test false signals',
    falseBreakout: 'bull',
  },
  {
    name: 'February Extended Consolidation',
    startDate: '2027-02-01',
    endDate: '2027-02-28',
    trend: 'neutral',
    volatility: 'low',
    description: 'Extended sideways movement - tests patience and avoids overtrading',
    keepFlatBehavior: true,
  },
  {
    name: 'March-April Extended Bull Run',
    startDate: '2027-03-01',
    endDate: '2027-04-30',
    trend: 'bullish',
    volatility: 'medium',
    description: 'Sustained bull run over 2 months - tests trend following',
  },
  {
    name: 'May Volatility Squeeze',
    startDate: '2027-05-01',
    endDate: '2027-05-31',
    trend: 'neutral',
    volatility: 'low',
    description: 'Low volatility consolidation followed by explosive move - tests breakout detection',
    volatilitySqueeze: true,
  },
  {
    name: 'June Explosive Breakout',
    startDate: '2027-06-01',
    endDate: '2027-06-30',
    trend: 'bullish',
    volatility: 'extreme',
    description: 'Explosive move after squeeze - high volatility breakout',
  },
  {
    name: 'July-August-September Extended Bear Market',
    startDate: '2027-07-01',
    endDate: '2027-09-30',
    trend: 'bearish',
    volatility: 'medium',
    description: '3-month extended bear market - tests sustained downtrend handling',
    slowGrind: true,
  },
  {
    name: 'October Slow Grind Down',
    startDate: '2027-10-01',
    endDate: '2027-10-31',
    trend: 'bearish',
    volatility: 'low',
    description: 'Gradual decline with low volatility - tests slow trend detection',
    slowGrind: true,
  },
  {
    name: 'November False Bear Breakout',
    startDate: '2027-11-01',
    endDate: '2027-11-15',
    trend: 'bearish',
    volatility: 'high',
    description: 'Looks like crash but reverses - bear trap to test false signals',
    falseBreakout: 'bear',
  },
  {
    name: 'November-December Recovery Rally',
    startDate: '2027-11-16',
    endDate: '2027-12-31',
    trend: 'bullish',
    volatility: 'high',
    description: 'Strong recovery after extended bear - tests recovery detection',
  },
];

function getVolatilityMultiplier(volatility: string): number {
  switch (volatility) {
    case 'low': return 0.5;
    case 'medium': return 1.0;
    case 'high': return 1.8;
    case 'extreme': return 3.0;
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
      return 1.0;
  }
}

function generate8hCandlesForRegime(
  regime: MarketRegime,
  startPrice: number
): PriceCandle[] {
  const startDate = new Date(regime.startDate);
  const endDate = new Date(regime.endDate);
  
  // Calculate number of 8h periods
  const totalMs = endDate.getTime() - startDate.getTime();
  const total8hPeriods = Math.floor(totalMs / (8 * 60 * 60 * 1000));
  
  const candles: PriceCandle[] = [];
  let currentPrice = startPrice;
  const volatility = getVolatilityMultiplier(regime.volatility);

  // Special handling for false bull breakout
  if (regime.falseBreakout === 'bull') {
    for (let period = 0; period < total8hPeriods; period++) {
      const timestamp = startDate.getTime() + period * 8 * 60 * 60 * 1000;
      const progress = period / total8hPeriods;
      
      // Start strong, then fail
      let trendMultiplier: number;
      if (progress < 0.3) {
        // Strong start
        trendMultiplier = 1 + (0.003 + Math.random() * 0.002);
      } else if (progress < 0.6) {
        // Weakening
        trendMultiplier = 1 + (0.001 - (progress - 0.3) * 0.01);
      } else {
        // Reversal
        trendMultiplier = 1 - (0.002 + (progress - 0.6) * 0.005);
      }
      
      const change = (Math.random() - 0.5) * 0.02 * volatility;
      const periodChange = trendMultiplier - 1 + change;
      currentPrice *= (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(change) * 0.5 + Math.random() * 0.01);
      const low = currentPrice * (1 - Math.abs(change) * 0.5 - Math.random() * 0.01);
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: 1000000 + Math.random() * 500000,
      });
    }
    return candles;
  }

  // Special handling for false bear breakout
  if (regime.falseBreakout === 'bear') {
    for (let period = 0; period < total8hPeriods; period++) {
      const timestamp = startDate.getTime() + period * 8 * 60 * 60 * 1000;
      const progress = period / total8hPeriods;
      
      // Start with crash, then reverse
      let trendMultiplier: number;
      if (progress < 0.4) {
        // Sharp decline
        trendMultiplier = 1 - (0.008 + Math.random() * 0.004);
      } else {
        // Strong reversal
        trendMultiplier = 1 + (0.004 + (progress - 0.4) * 0.01);
      }
      
      const change = (Math.random() - 0.5) * 0.03 * volatility;
      const periodChange = trendMultiplier - 1 + change;
      currentPrice *= (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(change) * 0.5 + Math.random() * 0.01);
      const low = currentPrice * (1 - Math.abs(change) * 0.5 - Math.random() * 0.01);
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: 1200000 + Math.random() * 600000,
      });
    }
    return candles;
  }

  // Special handling for volatility squeeze
  if (regime.volatilitySqueeze) {
    for (let period = 0; period < total8hPeriods; period++) {
      const timestamp = startDate.getTime() + period * 8 * 60 * 60 * 1000;
      const progress = period / total8hPeriods;
      
      // Low volatility for first 70%, then explosion
      let volMultiplier: number;
      if (progress < 0.7) {
        volMultiplier = 0.3; // Very low volatility
      } else {
        volMultiplier = 2.5; // High volatility explosion
      }
      
      const trendMultiplier = getTrendMultiplier(regime.trend, period, total8hPeriods);
      const change = (Math.random() - 0.5) * 0.02 * volatility * volMultiplier;
      const periodChange = trendMultiplier - 1 + change;
      currentPrice *= (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(change) * 0.5 + Math.random() * 0.01);
      const low = currentPrice * (1 - Math.abs(change) * 0.5 - Math.random() * 0.01);
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: progress < 0.7 ? 800000 : 2000000 + Math.random() * 1000000,
      });
    }
    return candles;
  }

  // Special handling for slow grind
  if (regime.slowGrind) {
    for (let period = 0; period < total8hPeriods; period++) {
      const timestamp = startDate.getTime() + period * 8 * 60 * 60 * 1000;
      
      // Very gradual trend with low volatility
      const trendMultiplier = regime.trend === 'bearish' 
        ? 1 - 0.0008 // Very slow decline
        : 1 + 0.0008; // Very slow rise
      
      const change = (Math.random() - 0.5) * 0.01 * volatility * 0.5; // Low volatility
      const periodChange = trendMultiplier - 1 + change;
      currentPrice *= (1 + periodChange);
      
      const high = currentPrice * (1 + Math.abs(change) * 0.3 + Math.random() * 0.005);
      const low = currentPrice * (1 - Math.abs(change) * 0.3 - Math.random() * 0.005);
      const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
      const close = currentPrice;
      
      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: 900000 + Math.random() * 300000,
      });
    }
    return candles;
  }

  // Standard regime generation with realistic 8h candles
  for (let period = 0; period < total8hPeriods; period++) {
    const timestamp = startDate.getTime() + period * 8 * 60 * 60 * 1000;
    
    const trendMultiplier = getTrendMultiplier(regime.trend, period, total8hPeriods);
    
    // For flat behavior periods, use minimal movement
    let periodChange: number;
    if (regime.keepFlatBehavior) {
      // Minimal movement for flat periods
      periodChange = (Math.random() - 0.5) * 0.001; // ±0.05% max
    } else {
      const change = (Math.random() - 0.5) * 0.02 * volatility;
      periodChange = trendMultiplier - 1 + change;
    }
    
    currentPrice *= (1 + periodChange);
    
    // Realistic intraday range for 8h candles
    const intradayRange = regime.keepFlatBehavior 
      ? 0.002 // 0.2% range for flat
      : 0.01 + Math.random() * 0.02; // 1-3% range
    
    const high = currentPrice * (1 + intradayRange * 0.5 + Math.random() * 0.005);
    const low = currentPrice * (1 - intradayRange * 0.5 - Math.random() * 0.005);
    const open = period === 0 ? startPrice : candles[candles.length - 1]!.close;
    const close = currentPrice;
    
    // Ensure high >= low and price is within range
    const actualHigh = Math.max(high, low, open, close);
    const actualLow = Math.min(high, low, open, close);
    
    const baseVolume = regime.keepFlatBehavior ? 800000 : 1200000;
    const volume = baseVolume + Math.random() * (regime.volatility === 'extreme' ? 1000000 : 500000);
    
    candles.push({
      timestamp,
      open,
      high: actualHigh,
      low: actualLow,
      close,
      volume,
    });
  }
  
  return candles;
}

async function main() {
  console.log('🎲 Generating Enhanced Synthetic ETH Price Data for 2027 (8h candles)\n');
  
  // Start price - continue from end of 2026 (around $3000-3500 range)
  let currentPrice = 3200; // Start from reasonable level
  
  const allCandles: PriceCandle[] = [];
  
  // Generate 8h candles for each regime
  for (const regime of REGIMES) {
    console.log(`📊 Generating: ${regime.name} (${regime.startDate} to ${regime.endDate})`);
    console.log(`   Trend: ${regime.trend}, Volatility: ${regime.volatility}`);
    if (regime.falseBreakout) {
      console.log(`   ⚠️  FALSE BREAKOUT: ${regime.falseBreakout} trap`);
    }
    if (regime.slowGrind) {
      console.log(`   🐌 SLOW GRIND: Gradual ${regime.trend} trend`);
    }
    if (regime.volatilitySqueeze) {
      console.log(`   💥 VOLATILITY SQUEEZE: Low vol → explosion`);
    }
    if (regime.keepFlatBehavior) {
      console.log(`   📊 KEEPING FLAT BEHAVIOR for testing`);
    }
    
    const candles = generate8hCandlesForRegime(regime, currentPrice);
    allCandles.push(...candles);
    
    // Update current price for next regime
    currentPrice = candles[candles.length - 1]!.close;
    console.log(`   ✅ Generated ${candles.length} candles, ending price: $${currentPrice.toFixed(2)}\n`);
  }
  
  // Sort by timestamp (should already be sorted, but just in case)
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Remove duplicates
  const uniqueCandles = allCandles.filter((candle, index, self) =>
    index === self.findIndex(c => c.timestamp === candle.timestamp)
  );
  
  console.log(`\n📈 Total candles generated: ${uniqueCandles.length}`);
  console.log(`   Date range: ${new Date(uniqueCandles[0]!.timestamp).toISOString().split('T')[0]} to ${new Date(uniqueCandles[uniqueCandles.length - 1]!.timestamp).toISOString().split('T')[0]}`);
  console.log(`   Price range: $${Math.min(...uniqueCandles.map(c => c.low)).toFixed(2)} to $${Math.max(...uniqueCandles.map(c => c.high)).toFixed(2)}`);
  
  // Save to file
  const dataDir = path.join(process.cwd(), 'data', 'historical-prices', 'synthetic');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const filename = `ethusdt_8h_2027-01-01_2027-12-31.json.gz`;
  const filepath = path.join(dataDir, filename);
  
  const jsonData = JSON.stringify(uniqueCandles, null, 2);
  const compressed = zlib.gzipSync(jsonData);
  fs.writeFileSync(filepath, compressed);
  
  console.log(`\n✅ Saved to: ${filepath}`);
  console.log(`   Size: ${(compressed.length / 1024).toFixed(2)} KB (compressed)`);
  console.log(`   Original: ${(jsonData.length / 1024).toFixed(2)} KB (uncompressed)`);
  
  // Summary of regimes
  console.log(`\n📋 Market Regimes Generated:`);
  for (const regime of REGIMES) {
    const candlesInRegime = uniqueCandles.filter(c => {
      const ts = c.timestamp;
      const start = new Date(regime.startDate).getTime();
      const end = new Date(regime.endDate).getTime();
      return ts >= start && ts <= end;
    });
    const startPrice = candlesInRegime[0]?.close || 0;
    const endPrice = candlesInRegime[candlesInRegime.length - 1]?.close || 0;
    const change = endPrice > 0 ? ((endPrice - startPrice) / startPrice * 100) : 0;
    console.log(`   • ${regime.name}: ${candlesInRegime.length} candles, ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`);
  }
}

main().catch(console.error);

