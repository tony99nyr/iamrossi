# Trading System Testing Guide

## Overview

This document provides a comprehensive testing checklist and guidelines for the ETH trading system. All trading-related changes must be validated before deployment.

## Testing Checklist

### Before Making Changes
- [ ] Understand the current system behavior
- [ ] Review related test files
- [ ] Check baseline performance metrics

### During Development
- [ ] Write unit tests for new functions
- [ ] Update existing tests if interfaces change
- [ ] Run `pnpm type:check` frequently
- [ ] Run `pnpm test` to ensure existing tests pass

### After Making Changes

#### Code Quality
- [ ] `pnpm type:check` passes (no TypeScript errors)
- [ ] `pnpm lint` passes (no linting errors)
- [ ] `pnpm build` succeeds (code compiles)

#### Unit Tests
- [ ] All unit tests pass: `pnpm test`
- [ ] New functionality has test coverage
- [ ] Test coverage >85% for critical paths

#### Integration Tests
- [ ] Integration tests pass
- [ ] Backtest integration test passes
- [ ] Paper trading integration test passes

#### Historical Backtest Verification
- [ ] Run `pnpm eth:verify-backtest` after big changes
- [ ] Review verification report
- [ ] Ensure no regressions (>5% performance drop)
- [ ] Update baseline metrics if performance improved: `pnpm eth:update-baseline`

#### Trade Audit
- [ ] Trade audit generation works: `pnpm eth:audit-report <trades-file>`
- [ ] Audit reports are comprehensive and readable
- [ ] All trades have audit information

### For Big Changes (Timeframe Switch, New Calculations, etc.)

1. **Run Full Validation**: `pnpm validate`
2. **Run Historical Verification**: `pnpm eth:verify-backtest`
3. **Review Verification Report**: Check for regressions
4. **Generate Trade Audit**: Analyze trade decisions
5. **Update Baseline**: If performance is acceptable
6. **Document Changes**: Update documentation with new metrics

## Test Files

### Unit Tests
- `tests/lib/indicators.test.ts` - Technical indicator calculations
- `tests/lib/trading-signals.test.ts` - Signal generation
- `tests/lib/market-regime-detector.test.ts` - Regime detection (to be created)
- `tests/lib/adaptive-strategy.test.ts` - Strategy logic (to be created)
- `tests/lib/risk-metrics.test.ts` - Risk metric calculations
- `tests/lib/trade-audit.test.ts` - Audit generation (to be created)

### Integration Tests
- `tests/integration/trading-backtest.test.ts` - Backtest end-to-end
- `tests/integration/paper-trading.test.ts` - Paper trading (to be created)

### Mock Data
- `tests/mocks/trading-data.mock.ts` - Synthetic test data

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/lib/indicators.test.ts

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run with UI
pnpm test:ui
```

## Validation Commands

```bash
# Full validation (type check, tests, lint, build)
pnpm validate

# Full validation + historical backtest verification
pnpm validate:full

# Type check only
pnpm type:check

# Lint only
pnpm lint

# Build only
pnpm build
```

## Historical Backtest Verification

### When to Run
- After switching timeframes (1d → 8h)
- After implementing new calculations
- After major strategy changes
- Before deploying to production

### How to Run
```bash
# Run verification (includes both historical 2025 and synthetic 2026 data)
pnpm eth:verify-backtest

# Update baseline after verification passes
pnpm eth:update-baseline
```

### What It Checks
- **Historical 2025 Data**:
  - Full year performance
  - Bullish period performance
  - Bearish period performance
- **Synthetic 2026 Data** (various market conditions):
  - Full year 2026
  - Quarterly periods (Q1-Q4)
  - Bull run periods
  - Crash periods
  - Bear market periods
  - Whipsaw periods
  - Stress test periods (Bull→Crash, Bear→Whipsaw, etc.)
- Compares against baseline metrics
- Detects regressions (>5% drop)

## Trade Audit

### Generating Audit Reports
```bash
# Generate audit report from trades file
pnpm eth:audit-report <trades-file.json>
```

### What's Included
- When: Date, time, timeframe
- Why: Full signal breakdown, regime, indicators, thresholds, risk filters
- How Successful: P&L, ROI, holding period, MFE, MAE, outcome

## Test Coverage Targets

- **Critical Paths**: >85% coverage
- **Indicators**: 100% coverage
- **Signal Generation**: >90% coverage
- **Risk Metrics**: >90% coverage
- **Trade Audit**: >85% coverage

## Common Issues

### Type Errors
- Run `pnpm type:check` to identify issues
- Check import paths
- Verify type definitions match usage

### Test Failures
- Check mock data setup
- Verify test environment (NODE_ENV=test)
- Ensure Redis mocks are used

### Verification Failures
- Review verification report
- Check if baseline metrics are outdated
- Verify timeframe matches baseline

## Best Practices

1. **Always run `pnpm validate` before committing**
2. **Write tests before implementing new features** (TDD)
3. **Update tests when changing interfaces**
4. **Run historical verification after big changes**
5. **Document performance changes**
6. **Keep baseline metrics up to date**

## Examples

### Testing a New Indicator
1. Write unit test in `tests/lib/indicators.test.ts`
2. Implement indicator in `src/lib/indicators.ts`
3. Run `pnpm test tests/lib/indicators.test.ts`
4. Integrate into signal generation
5. Run `pnpm validate`
6. Run `pnpm eth:verify-backtest`
7. Update documentation

### Testing Strategy Changes
1. Update strategy config
2. Run `pnpm eth:backfill-test` on test period (or `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic` for synthetic data)
3. Review results
4. Run `pnpm eth:verify-backtest` on full periods (includes both historical and synthetic)
5. Generate trade audit: `pnpm eth:audit-report`
6. Analyze audit report
7. Update baseline if improved

### Using Synthetic 2026 Data

Synthetic 2026 data includes various market conditions (bull runs, crashes, bear markets, whipsaw) to test strategy robustness.

```bash
# Generate synthetic 2026 data (if not already generated)
pnpm eth:generate-2026

# Run backfill test on synthetic data
pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic

# Or test specific synthetic periods
pnpm eth:backfill-test 2026-03-01 2026-05-31 --synthetic  # Bull→Crash stress test
pnpm eth:backfill-test 2026-07-01 2026-09-30 --synthetic  # Bear→Whipsaw worst case
```

The verification script (`pnpm eth:verify-backtest`) automatically includes synthetic 2026 periods in its test suite.

