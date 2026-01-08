/**
 * Detects and marks price anomalies in Pokemon card snapshots
 */

import { EASTERN_TIME_ZONE } from '@/lib/timezone';
import type { PokemonCardPriceSnapshot } from '@/types';

/**
 * Detects anomalies in a snapshot based on price ranges
 * Returns true if the snapshot should be marked as ignored
 */
export function isPriceAnomaly(snapshot: PokemonCardPriceSnapshot, allSnapshots: PokemonCardPriceSnapshot[]): boolean {
  // Get all snapshots for this card (excluding already ignored ones for statistics)
  const cardSnapshots = allSnapshots.filter(s => s.cardId === snapshot.cardId && !s.ignored);
  
  if (cardSnapshots.length < 3) return false; // Need at least 3 data points for meaningful statistics
  
  // Check ungraded price
  if (typeof snapshot.ungradedPrice === 'number') {
    const ungradedPrices = cardSnapshots
      .filter(s => typeof s.ungradedPrice === 'number')
      .map(s => s.ungradedPrice!);
    
    if (ungradedPrices.length >= 3) {
      const prices = ungradedPrices.sort((a, b) => a - b);
      const q1 = prices[Math.floor(prices.length * 0.25)]!;
      const median = prices[Math.floor(prices.length / 2)]!;
      const q3 = prices[Math.floor(prices.length * 0.75)]!;
      const iqr = q3 - q1;
      
      // Use IQR method: outliers are beyond Q1 - 1.5*IQR or Q3 + 1.5*IQR
      const lowerBound = Math.max(0, q1 - 1.5 * iqr);
      const upperBound = q3 + 1.5 * iqr;
      
      // Check for conversion errors first (prices that suggest cents/dollars confusion)
      if (snapshot.ungradedPrice < 10 && snapshot.ungradedPrice > 0.01) {
        const multiplied = snapshot.ungradedPrice * 100;
        if (multiplied >= lowerBound && multiplied <= upperBound && Math.abs(multiplied - median) < Math.abs(snapshot.ungradedPrice - median)) {
          return true; // Likely was incorrectly divided
        }
      } else if (snapshot.ungradedPrice > 2000) {
        const divided = snapshot.ungradedPrice / 100;
        if (divided >= lowerBound && divided <= upperBound && Math.abs(divided - median) < Math.abs(snapshot.ungradedPrice - median)) {
          return true; // Likely wasn't divided when it should have been
        }
      }
      
      // Check if price is a statistical outlier (far from median)
      // Use both IQR method and median-based check (2x/0.5x threshold)
      const isIqrOutlier = snapshot.ungradedPrice < lowerBound || snapshot.ungradedPrice > upperBound;
      const isMedianOutlier = snapshot.ungradedPrice > median * 2 || snapshot.ungradedPrice < median * 0.5;
      
      // Mark as anomaly if it's an outlier by either method
      if (isIqrOutlier || isMedianOutlier) {
        return true;
      }
    }
  }
  
  // Check PSA 10 price
  if (typeof snapshot.psa10Price === 'number') {
    const psa10Prices = cardSnapshots
      .filter(s => typeof s.psa10Price === 'number')
      .map(s => s.psa10Price!);
    
    if (psa10Prices.length >= 3) {
      const prices = psa10Prices.sort((a, b) => a - b);
      const q1 = prices[Math.floor(prices.length * 0.25)]!;
      const median = prices[Math.floor(prices.length / 2)]!;
      const q3 = prices[Math.floor(prices.length * 0.75)]!;
      const iqr = q3 - q1;
      
      const lowerBound = Math.max(0, q1 - 1.5 * iqr);
      const upperBound = q3 + 1.5 * iqr;
      
      // Check for conversion errors first
      if (snapshot.psa10Price < 20 && snapshot.psa10Price > 0.01) {
        const multiplied = snapshot.psa10Price * 100;
        if (multiplied >= lowerBound && multiplied <= upperBound && Math.abs(multiplied - median) < Math.abs(snapshot.psa10Price - median)) {
          return true;
        }
      } else if (snapshot.psa10Price > 5000) {
        const divided = snapshot.psa10Price / 100;
        if (divided >= lowerBound && divided <= upperBound && Math.abs(divided - median) < Math.abs(snapshot.psa10Price - median)) {
          return true;
        }
      }
      
      // Check if price is a statistical outlier (far from median)
      const isIqrOutlier = snapshot.psa10Price < lowerBound || snapshot.psa10Price > upperBound;
      const isMedianOutlier = snapshot.psa10Price > median * 2 || snapshot.psa10Price < median * 0.5;
      
      // Mark as anomaly if it's an outlier by either method
      if (isIqrOutlier || isMedianOutlier) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get today's date in YYYY-MM-DD format (Eastern Time)
 * Uses Eastern Time to ensure consistent date handling regardless of server timezone
 */
function todayIsoDate(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

/**
 * Marks anomalies in snapshots by setting the ignored flag
 * Never marks today's prices as anomalies - we trust current day data
 */
export function markAnomalies(snapshots: PokemonCardPriceSnapshot[]): PokemonCardPriceSnapshot[] {
  const today = todayIsoDate();
  
  return snapshots.map(snapshot => {
    if (snapshot.ignored) {
      return snapshot; // Already marked as ignored
    }
    
    // Never mark today's prices as anomalies - trust current day data
    if (snapshot.date === today) {
      return snapshot;
    }
    
    const isAnomaly = isPriceAnomaly(snapshot, snapshots);
    if (isAnomaly) {
      return { ...snapshot, ignored: true };
    }
    
    return snapshot;
  });
}

