/**
 * ATR-Based Stop Loss System
 * 
 * Implements trailing stop losses based on Average True Range (ATR)
 * to protect profits and limit losses.
 * 
 * Features:
 * - ATR-based stop loss distance (e.g., 2x ATR below entry price)
 * - Trailing stop loss (moves up as price increases, never down)
 * - Configurable ATR multiplier for different risk levels
 */

import type { Trade } from '@/types';
// PriceCandle and getATRValue may be needed for future extensions

export interface StopLossConfig {
  enabled: boolean;
  atrMultiplier: number; // Stop loss distance in ATR units (e.g., 2.0 = 2x ATR)
  trailing: boolean; // If true, stop loss trails upward with price
  useEMA: boolean; // Use EMA for ATR calculation (default: true, smoother)
  atrPeriod: number; // ATR period (default: 14)
}

export interface OpenPosition {
  buyTrade: Trade;
  entryPrice: number;
  stopLossPrice: number;
  highestPrice: number; // For trailing stops
  atrAtEntry: number; // ATR value when position was opened
}

export interface StopLossResult {
  shouldExit: boolean;
  exitReason?: 'stop-loss' | 'trailing-stop';
  stopLossPrice: number;
  currentPrice: number;
  distanceToStop: number; // Percentage distance to stop loss
}

const DEFAULT_CONFIG: StopLossConfig = {
  enabled: true,
  atrMultiplier: 2.0, // 2.0x ATR stop loss (baseline configuration)
  trailing: true,
  useEMA: true,
  atrPeriod: 14,
};

/**
 * Calculate initial stop loss price for a buy trade
 */
export function calculateStopLossPrice(
  entryPrice: number,
  atrValue: number,
  config: StopLossConfig = DEFAULT_CONFIG
): number {
  if (!config.enabled || !atrValue || atrValue <= 0) {
    return 0; // No stop loss
  }

  // Stop loss is ATR multiplier below entry price
  const stopLossDistance = atrValue * config.atrMultiplier;
  return entryPrice - stopLossDistance;
}

/**
 * Update stop loss for an open position (handles trailing stops)
 */
export function updateStopLoss(
  position: OpenPosition,
  currentPrice: number,
  currentATR: number | null,
  config: StopLossConfig = DEFAULT_CONFIG
): StopLossResult {
  if (!config.enabled) {
    return {
      shouldExit: false,
      stopLossPrice: 0,
      currentPrice,
      distanceToStop: 0,
    };
  }

  // Update highest price for trailing stops
  if (currentPrice > position.highestPrice) {
    position.highestPrice = currentPrice;
  }

  let stopLossPrice = position.stopLossPrice;

  // Update trailing stop if enabled
  if (config.trailing && currentATR && currentATR > 0) {
    // Calculate new trailing stop: highest price - (ATR * multiplier)
    const trailingStop = position.highestPrice - (currentATR * config.atrMultiplier);
    
    // Only move stop loss up, never down
    if (trailingStop > stopLossPrice) {
      stopLossPrice = trailingStop;
      position.stopLossPrice = stopLossPrice;
    }
  }

  // Check if stop loss is triggered
  // Only exit if price is below stop loss (not equal, to avoid floating point issues)
  const shouldExit = currentPrice < stopLossPrice;
  const distanceToStop = stopLossPrice > 0 
    ? ((currentPrice - stopLossPrice) / currentPrice) * 100 
    : 0;

  return {
    shouldExit,
    exitReason: shouldExit ? (config.trailing ? 'trailing-stop' : 'stop-loss') : undefined,
    stopLossPrice,
    currentPrice,
    distanceToStop,
  };
}

/**
 * Check if any open positions should be closed due to stop loss
 */
export function checkStopLosses(
  openPositions: OpenPosition[],
  currentPrice: number,
  currentATR: number | null,
  config: StopLossConfig = DEFAULT_CONFIG
): Array<{ position: OpenPosition; result: StopLossResult }> {
  return openPositions.map(position => ({
    position,
    result: updateStopLoss(position, currentPrice, currentATR, config),
  }));
}

/**
 * Create an open position from a buy trade
 */
export function createOpenPosition(
  buyTrade: Trade,
  entryPrice: number,
  atrAtEntry: number | null,
  config: StopLossConfig = DEFAULT_CONFIG
): OpenPosition | null {
  if (!config.enabled || !atrAtEntry || atrAtEntry <= 0) {
    return null; // No stop loss configured
  }

  const stopLossPrice = calculateStopLossPrice(entryPrice, atrAtEntry, config);

  return {
    buyTrade,
    entryPrice,
    stopLossPrice,
    highestPrice: entryPrice,
    atrAtEntry,
  };
}

