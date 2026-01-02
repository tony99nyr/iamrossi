/**
 * Unit tests for maximum drawdown protection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDrawdown,
  updatePeakPortfolioValue,
  getPeakPortfolioValue,
  checkDrawdownCircuitBreaker,
  resetDrawdownTracking,
  clearRegimeHistoryForSession,
} from '@/lib/adaptive-strategy-enhanced';

describe('Drawdown Protection', () => {
  const sessionId = 'test-session-123';

  beforeEach(() => {
    // Clear any existing tracking data
    clearRegimeHistoryForSession(sessionId);
    resetDrawdownTracking(sessionId, 1000);
  });

  describe('calculateDrawdown', () => {
    it('should return 0 when current value equals peak value', () => {
      const drawdown = calculateDrawdown(1000, 1000);
      expect(drawdown).toBe(0);
    });

    it('should return 0 when current value exceeds peak value', () => {
      const drawdown = calculateDrawdown(1100, 1000);
      expect(drawdown).toBe(0);
    });

    it('should calculate drawdown correctly', () => {
      const drawdown = calculateDrawdown(800, 1000);
      expect(drawdown).toBe(0.2); // 20% drawdown
    });

    it('should handle zero peak value', () => {
      const drawdown = calculateDrawdown(100, 0);
      expect(drawdown).toBe(0);
    });

    it('should handle negative peak value', () => {
      const drawdown = calculateDrawdown(100, -100);
      expect(drawdown).toBe(0);
    });

    it('should calculate 50% drawdown', () => {
      const drawdown = calculateDrawdown(500, 1000);
      expect(drawdown).toBe(0.5);
    });

    it('should calculate small drawdown', () => {
      const drawdown = calculateDrawdown(990, 1000);
      expect(drawdown).toBe(0.01); // 1% drawdown
    });
  });

  describe('updatePeakPortfolioValue', () => {
    it('should set initial peak value', () => {
      updatePeakPortfolioValue(sessionId, 1000);
      expect(getPeakPortfolioValue(sessionId)).toBe(1000);
    });

    it('should update peak when value increases', () => {
      updatePeakPortfolioValue(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1100);
      expect(getPeakPortfolioValue(sessionId)).toBe(1100);
    });

    it('should not update peak when value decreases', () => {
      updatePeakPortfolioValue(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 900);
      expect(getPeakPortfolioValue(sessionId)).toBe(1000);
    });

    it('should not update peak when value stays same', () => {
      updatePeakPortfolioValue(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      expect(getPeakPortfolioValue(sessionId)).toBe(1000);
    });

    it('should handle multiple sessions independently', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      updatePeakPortfolioValue(session1, 1000);
      updatePeakPortfolioValue(session2, 2000);
      
      expect(getPeakPortfolioValue(session1)).toBe(1000);
      expect(getPeakPortfolioValue(session2)).toBe(2000);
    });
  });

  describe('checkDrawdownCircuitBreaker', () => {
    it('should not pause when drawdown is below threshold', () => {
      resetDrawdownTracking(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      
      const result = checkDrawdownCircuitBreaker(sessionId, 850, 0.20); // 15% drawdown, 20% threshold
      expect(result.shouldPause).toBe(false);
      expect(result.drawdown).toBe(0.15);
      expect(result.peakValue).toBe(1000);
    });

    it('should pause when drawdown equals threshold', () => {
      resetDrawdownTracking(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      
      const result = checkDrawdownCircuitBreaker(sessionId, 800, 0.20); // 20% drawdown, 20% threshold
      expect(result.shouldPause).toBe(true);
      expect(result.drawdown).toBe(0.20);
    });

    it('should pause when drawdown exceeds threshold', () => {
      resetDrawdownTracking(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      
      const result = checkDrawdownCircuitBreaker(sessionId, 750, 0.20); // 25% drawdown, 20% threshold
      expect(result.shouldPause).toBe(true);
      expect(result.drawdown).toBe(0.25);
    });

    it('should update peak value when current value exceeds peak', () => {
      resetDrawdownTracking(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      
      const result = checkDrawdownCircuitBreaker(sessionId, 1100, 0.20);
      expect(result.shouldPause).toBe(false);
      expect(result.drawdown).toBe(0);
      expect(result.peakValue).toBe(1100);
    });

    it('should use default threshold of 20% when not specified', () => {
      resetDrawdownTracking(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      
      const result = checkDrawdownCircuitBreaker(sessionId, 800); // 20% drawdown, default threshold
      expect(result.shouldPause).toBe(true);
      expect(result.drawdown).toBe(0.20);
    });

    it('should handle custom threshold', () => {
      resetDrawdownTracking(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1000);
      
      const result = checkDrawdownCircuitBreaker(sessionId, 900, 0.10); // 10% drawdown, 10% threshold
      expect(result.shouldPause).toBe(true);
      expect(result.drawdown).toBe(0.10);
    });

    it('should track peak across multiple checks', () => {
      resetDrawdownTracking(sessionId, 1000);
      
      // First check: value increases
      let result = checkDrawdownCircuitBreaker(sessionId, 1100, 0.20);
      expect(result.peakValue).toBe(1100);
      expect(result.shouldPause).toBe(false);
      
      // Second check: value decreases but below threshold
      result = checkDrawdownCircuitBreaker(sessionId, 1050, 0.20);
      expect(result.peakValue).toBe(1100); // Peak should remain
      expect(result.drawdown).toBeCloseTo(0.045, 3); // ~4.5% drawdown
      expect(result.shouldPause).toBe(false);
      
      // Third check: value decreases below threshold
      result = checkDrawdownCircuitBreaker(sessionId, 850, 0.20);
      expect(result.peakValue).toBe(1100); // Peak should remain
      expect(result.drawdown).toBeCloseTo(0.227, 3); // ~22.7% drawdown
      expect(result.shouldPause).toBe(true);
    });
  });

  describe('resetDrawdownTracking', () => {
    it('should reset peak value to initial value', () => {
      updatePeakPortfolioValue(sessionId, 1000);
      updatePeakPortfolioValue(sessionId, 1100);
      expect(getPeakPortfolioValue(sessionId)).toBe(1100);
      
      resetDrawdownTracking(sessionId, 1000);
      expect(getPeakPortfolioValue(sessionId)).toBe(1000);
    });

    it('should allow setting new initial value', () => {
      resetDrawdownTracking(sessionId, 500);
      expect(getPeakPortfolioValue(sessionId)).toBe(500);
    });
  });

  describe('Integration: Full drawdown scenario', () => {
    it('should track drawdown through a complete trading scenario', () => {
      // Start with $1000
      resetDrawdownTracking(sessionId, 1000);
      
      // Portfolio grows to $1200
      let result = checkDrawdownCircuitBreaker(sessionId, 1200, 0.20);
      expect(result.peakValue).toBe(1200);
      expect(result.shouldPause).toBe(false);
      
      // Portfolio drops to $1100 (8.3% drawdown)
      result = checkDrawdownCircuitBreaker(sessionId, 1100, 0.20);
      expect(result.drawdown).toBeCloseTo(0.083, 3);
      expect(result.shouldPause).toBe(false);
      
      // Portfolio drops to $1000 (16.7% drawdown)
      result = checkDrawdownCircuitBreaker(sessionId, 1000, 0.20);
      expect(result.drawdown).toBeCloseTo(0.167, 3);
      expect(result.shouldPause).toBe(false);
      
      // Portfolio drops to $950 (20.8% drawdown - should pause)
      result = checkDrawdownCircuitBreaker(sessionId, 950, 0.20);
      expect(result.drawdown).toBeCloseTo(0.208, 3);
      expect(result.shouldPause).toBe(true);
      
      // Portfolio recovers to $1100 (still below peak, but drawdown reduced)
      result = checkDrawdownCircuitBreaker(sessionId, 1100, 0.20);
      expect(result.drawdown).toBeCloseTo(0.083, 3);
      expect(result.shouldPause).toBe(false); // Should resume trading
      
      // Portfolio reaches new peak
      result = checkDrawdownCircuitBreaker(sessionId, 1300, 0.20);
      expect(result.peakValue).toBe(1300);
      expect(result.drawdown).toBe(0);
      expect(result.shouldPause).toBe(false);
    });
  });
});

