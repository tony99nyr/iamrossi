/**
 * Configuration Validation
 * Validates trading strategy configurations before saving/using
 */

import type { EnhancedAdaptiveStrategyConfig } from './adaptive-strategy-enhanced';
import type { TradingConfig } from '@/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate enhanced adaptive strategy config
 */
export function validateStrategyConfig(config: EnhancedAdaptiveStrategyConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate bullish strategy
  if (!config.bullishStrategy) {
    errors.push('Bullish strategy is required');
  } else {
    const bullishErrors = validateTradingConfig(config.bullishStrategy, 'bullish');
    errors.push(...bullishErrors);
  }

  // Validate bearish strategy
  if (!config.bearishStrategy) {
    errors.push('Bearish strategy is required');
  } else {
    const bearishErrors = validateTradingConfig(config.bearishStrategy, 'bearish');
    errors.push(...bearishErrors);
  }

  // Validate thresholds
  if (config.regimeConfidenceThreshold !== undefined) {
    if (config.regimeConfidenceThreshold < 0 || config.regimeConfidenceThreshold > 1) {
      errors.push('Regime confidence threshold must be between 0 and 1');
    }
  }

  if (config.momentumConfirmationThreshold !== undefined) {
    if (config.momentumConfirmationThreshold < 0 || config.momentumConfirmationThreshold > 1) {
      errors.push('Momentum confirmation threshold must be between 0 and 1');
    }
  }

  // Validate position sizing
  if (config.maxBullishPosition !== undefined) {
    if (config.maxBullishPosition < 0 || config.maxBullishPosition > 1) {
      errors.push('Max bullish position must be between 0 and 1');
    }
    if (config.maxBullishPosition > 0.95) {
      warnings.push('Max bullish position > 95% is very aggressive');
    }
  }

  // Validate risk management
  if (config.maxVolatility !== undefined) {
    if (config.maxVolatility < 0 || config.maxVolatility > 1) {
      errors.push('Max volatility must be between 0 and 1');
    }
  }

  if (config.circuitBreakerWinRate !== undefined) {
    if (config.circuitBreakerWinRate < 0 || config.circuitBreakerWinRate > 1) {
      errors.push('Circuit breaker win rate must be between 0 and 1');
    }
  }

  // Validate drawdown threshold
  if (config.maxDrawdownThreshold !== undefined) {
    if (config.maxDrawdownThreshold < 0 || config.maxDrawdownThreshold > 1) {
      errors.push('Max drawdown threshold must be between 0 and 1');
    }
    if (config.maxDrawdownThreshold > 0.5) {
      warnings.push('Max drawdown threshold > 50% is very high');
    }
  }

  // Validate position size limits
  if (config.minPositionSize !== undefined) {
    if (config.minPositionSize < 0) {
      errors.push('Min position size must be >= 0');
    }
    if (config.minPositionSize > 100) {
      warnings.push('Min position size > $100 may be too high');
    }
  }

  if (config.maxPositionConcentration !== undefined) {
    if (config.maxPositionConcentration < 0 || config.maxPositionConcentration > 1) {
      errors.push('Max position concentration must be between 0 and 1');
    }
  }

  // Validate price validation threshold
  if (config.priceValidationThreshold !== undefined) {
    if (config.priceValidationThreshold < 0 || config.priceValidationThreshold > 1) {
      errors.push('Price validation threshold must be between 0 and 1');
    }
    if (config.priceValidationThreshold > 0.1) {
      warnings.push('Price validation threshold > 10% is very high');
    }
  }

  // Validate Kelly Criterion
  if (config.kellyCriterion) {
    if (config.kellyCriterion.fractionalMultiplier < 0 || config.kellyCriterion.fractionalMultiplier > 1) {
      errors.push('Kelly fractional multiplier must be between 0 and 1');
    }
    if (config.kellyCriterion.fractionalMultiplier > 0.5) {
      warnings.push('Kelly fractional multiplier > 50% is aggressive');
    }
    if (config.kellyCriterion.minTrades < 0) {
      errors.push('Kelly min trades must be >= 0');
    }
    if (config.kellyCriterion.lookbackPeriod < 0) {
      errors.push('Kelly lookback period must be >= 0');
    }
  }

  // Validate stop loss
  if (config.stopLoss) {
    if (config.stopLoss.atrMultiplier < 0) {
      errors.push('Stop loss ATR multiplier must be >= 0');
    }
    if (config.stopLoss.atrMultiplier > 5) {
      warnings.push('Stop loss ATR multiplier > 5 is very wide');
    }
    if (config.stopLoss.atrPeriod < 1) {
      errors.push('Stop loss ATR period must be >= 1');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate individual trading config
 */
function validateTradingConfig(config: TradingConfig, strategyName: string): string[] {
  const errors: string[] = [];

  if (!config.name) {
    errors.push(`${strategyName} strategy name is required`);
  }

  if (!config.timeframe) {
    errors.push(`${strategyName} strategy timeframe is required`);
  }

  if (config.buyThreshold !== undefined) {
    if (config.buyThreshold < -1 || config.buyThreshold > 1) {
      errors.push(`${strategyName} buy threshold must be between -1 and 1`);
    }
  }

  if (config.sellThreshold !== undefined) {
    if (config.sellThreshold < -1 || config.sellThreshold > 1) {
      errors.push(`${strategyName} sell threshold must be between -1 and 1`);
    }
  }

  if (config.maxPositionPct !== undefined) {
    if (config.maxPositionPct < 0 || config.maxPositionPct > 1) {
      errors.push(`${strategyName} max position % must be between 0 and 1`);
    }
  }

  if (config.initialCapital !== undefined) {
    if (config.initialCapital <= 0) {
      errors.push(`${strategyName} initial capital must be > 0`);
    }
  }

  return errors;
}

