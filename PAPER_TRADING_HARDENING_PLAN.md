# Paper Trading Hardening Plan

## Overview

This plan focuses on hardening the paper trading system before moving to real exchange integration. All improvements can be implemented and tested with paper trading.

**Phase**: Paper Trading Hardening (Phase 1)  
**Status**: ✅ **Mostly Complete** (13/15 items completed, Priority 1-5 done)  
**Reference**: See `TRADING_HEALTH_SCORECARD.md` for full analysis

## ⚠️ CRITICAL: Testing Requirements for Algorithm Changes

**Any changes to the trading algorithm, strategy logic, or risk management must run backfill tests to compare before and after performance.**

See `TRADING_TESTING.md` for complete testing guidelines.

### Required Steps for Algorithm Changes:

1. **Before Changes**:
   - Run baseline backfill test: `pnpm eth:backfill-test <start-date> <end-date> [--synthetic]`
   - Document baseline metrics (return, Sharpe, drawdown, win rate, trade count)
   - Save baseline results for comparison

2. **After Changes**:
   - Run same backfill test: `pnpm eth:backfill-test <start-date> <end-date> [--synthetic]`
   - Compare metrics to baseline
   - Run full verification: `pnpm eth:verify-backtest` (includes historical + synthetic periods)
   - Generate trade audit: `pnpm eth:audit-report <trades-file>`
   - Analyze differences and ensure no regressions (>5% performance drop)

3. **Documentation**:
   - Document performance impact (improvement or regression)
   - Update baseline if performance improved: `pnpm eth:update-baseline`
   - Update `PROJECT_STATUS.md` with new metrics

### Test Periods to Use:
- **Quick Test**: Single synthetic period (e.g., `2026-01-01 2026-03-31 --synthetic`)
- **Full Test**: Full year synthetic (`2026-01-01 2026-12-31 --synthetic`)
- **Comprehensive**: Run `pnpm eth:verify-backtest` for all periods (historical + synthetic)

### Algorithm Changes Requiring Backfill Tests:
- ✅ Maximum drawdown protection (affects trade execution)
- ✅ Price validation (affects trade execution)
- ✅ Position size limits (affects trade sizing)
- ✅ Any changes to `adaptive-strategy-enhanced.ts`
- ✅ Any changes to `trade-executor.ts` that affect execution logic
- ✅ Any changes to risk management filters
- ✅ Any changes to regime detection logic

### Non-Algorithm Changes (No Backfill Required):
- ❌ UI improvements
- ❌ Monitoring/alerting additions
- ❌ Error tracking integration
- ❌ Audit logging
- ❌ Emergency stop mechanism (doesn't change algorithm)
- ❌ Config validation (doesn't change execution)

---

## Priority 1: Critical Risk Management

### 1.1 Maximum Drawdown Protection
**Status**: ✅ **Completed**  
**Priority**: 🔴 Critical  
**Requires Backfill Test**: ✅ YES

**Implementation**:
- Add maximum drawdown circuit breaker to `adaptive-strategy-enhanced.ts`
- Track peak portfolio value and current drawdown
- Pause trading if drawdown exceeds threshold (default: 20%, configurable)
- Add to config: `maxDrawdownThreshold?: number` (default: 0.20)
- Integrate into trade executor to block new trades when triggered
- Add UI indicator showing drawdown status

**Files to Modify**:
- `src/lib/adaptive-strategy-enhanced.ts` - Add drawdown tracking
- `src/lib/trade-executor.ts` - Check drawdown before executing trades
- `src/app/tools/eth-trading/components/RiskManagementPanel.tsx` - Display drawdown status

**Testing**:
- Unit tests for drawdown calculation (`tests/lib/adaptive-strategy-enhanced.test.ts`)
- Unit tests for drawdown circuit breaker logic
- Integration test: Verify trading stops when drawdown threshold exceeded
- Test recovery: Verify trading resumes when drawdown recovers
- **⚠️ REQUIRED: Validation & Backfill Test Comparison**
  - Run `pnpm validate` after implementation
  - Run baseline: `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic`
  - Implement changes
  - Run comparison: `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic`
  - Compare metrics (should see fewer trades during drawdown periods, similar or better returns)
  - Run full verification: `pnpm eth:verify-backtest`

---

### 1.2 Emergency Stop Mechanism
**Status**: ✅ **Completed**  
**Priority**: 🔴 Critical  
**Requires Backfill Test**: ❌ NO (doesn't change algorithm)

**Implementation**:
- Add `isEmergencyStopped` flag to paper trading session
- Create API endpoint: `POST /api/trading/paper/emergency-stop`
- Add UI button in trading dashboard
- When stopped: Block all new trades, allow manual position closure
- Add resume endpoint: `POST /api/trading/paper/resume`
- Store emergency stop state in Redis session

**Files to Create/Modify**:
- `src/app/api/trading/paper/emergency-stop/route.ts` - New endpoint
- `src/app/api/trading/paper/resume/route.ts` - New endpoint
- `src/lib/paper-trading-enhanced.ts` - Add emergency stop checks
- `src/lib/trade-executor.ts` - Check emergency stop before trades
- `src/app/tools/eth-trading/EthTradingBotClient.tsx` - Add emergency stop button

**Testing**:
- Integration test: Verify trades blocked when emergency stopped
- Test resume functionality
- Test emergency stop persists across session updates

---

### 1.3 Position Size Limits
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ✅ YES

**Implementation**:
- Add minimum trade size validation ($10 minimum)
- Add maximum position concentration limits (95% max in single asset)
- Add to config validation
- Reject trades that violate limits

**Files to Modify**:
- `src/lib/trade-executor.ts` - Add position size validation
- `src/lib/adaptive-strategy-enhanced.ts` - Add config validation

**Testing**:
- Unit tests for position size validation (`tests/lib/trade-executor.test.ts`)
- Unit tests for minimum trade size logic
- Unit tests for maximum position concentration logic
- Integration test: Verify trades rejected when limits exceeded
- **⚠️ REQUIRED: Validation & Backfill Test Comparison**
  - Run `pnpm validate` after implementation
  - Run baseline: `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic`
  - Implement changes
  - Run comparison: `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic`
  - Compare metrics (should see similar returns, possibly fewer very small trades)
  - Run full verification: `pnpm eth:verify-backtest`

---

## Priority 2: Execution Reliability

### 2.1 Price Validation
**Status**: Not Started  
**Priority**: 🔴 Critical  
**Requires Backfill Test**: ✅ YES

**Implementation**:
- Store price at signal generation time
- Before trade execution, fetch fresh price
- Reject trade if price moved >2% since signal (configurable threshold)
- Log price validation failures
- Add to trade executor options

**Files to Modify**:
- `src/lib/trade-executor.ts` - Add price validation
- `src/lib/paper-trading-enhanced.ts` - Pass price validation config

**Testing**:
- Unit tests for price validation logic (`tests/lib/trade-executor.test.ts`)
- Unit tests for price movement calculation
- Unit tests for threshold checking
- Integration test: Verify trades rejected when price moved too much
- **⚠️ REQUIRED: Validation & Backfill Test Comparison**
  - Run `pnpm validate` after implementation
  - Run baseline: `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic`
  - Implement changes
  - Run comparison: `pnpm eth:backfill-test 2026-01-01 2026-12-31 --synthetic`
  - Compare metrics (should see fewer trades, potentially better execution quality)
  - Run full verification: `pnpm eth:verify-backtest`

---

### 2.2 Execution State Tracking
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ❌ NO (doesn't change algorithm, just tracking)

**Implementation**:
- Add execution state to trades: `pending | executing | filled | failed`
- Track execution attempts and failures
- Add retry logic with exponential backoff (max 3 attempts)
- Log all execution state transitions

**Files to Modify**:
- `src/types/index.ts` - Add execution state to Trade type
- `src/lib/trade-executor.ts` - Add state tracking
- `src/lib/paper-trading-enhanced.ts` - Handle execution states

**Testing**:
- Unit tests for state transitions
- Integration test: Verify retry logic works

---

## Priority 3: Monitoring & Alerting

### 3.1 Error Tracking & Alerting
**Status**: Not Started  
**Priority**: 🔴 Critical  
**Requires Backfill Test**: ❌ NO

**Implementation**:
- Use Discord webhooks for error alerting (no Sentry)
- Wrap critical functions in try-catch with Discord error reporting
- Track API failures, execution failures, data quality issues
- Send Discord alerts for:
  - API failures (rate limits, connection errors)
  - Execution failures (trade execution errors)
  - Data quality issues (stale data, anomalies)
  - System errors (unexpected exceptions)
- Add error rate monitoring and alerting

**Files to Create/Modify**:
- `src/lib/notifications.ts` - Add error alert functions
- `src/lib/paper-trading-enhanced.ts` - Add error tracking with Discord alerts
- `src/lib/eth-price-service.ts` - Send Discord alerts on API errors
- `src/lib/trade-executor.ts` - Send Discord alerts on execution errors

**Testing**:
- Unit tests for error alert functions
- Integration test: Verify Discord alerts sent on various error scenarios
- Test error tracking in various failure scenarios
- Verify errors are properly logged and reported to Discord

---

### 3.2 Performance Dashboard
**Status**: Not Started  
**Priority**: 🔴 Critical  
**Requires Backfill Test**: ❌ NO

**Implementation**:
- Add real-time performance metrics to overview trading page (`/tools/trading-overview`)
- Display metrics for both ETH and BTC:
  - Current return, drawdown, win rate, Sharpe ratio
  - Performance attribution (returns by regime, strategy)
  - Trade count, average trade P&L
  - Risk metrics (max drawdown, volatility)
- Update metrics every update cycle
- Create new component: `PerformanceMetricsPanel.tsx` for overview page

**Files to Create/Modify**:
- `src/app/tools/trading-overview/components/PerformanceMetricsPanel.tsx` - New component
- `src/lib/performance-metrics.ts` - New metrics calculation module
- `src/app/tools/trading-overview/page.tsx` - Add metrics panel to overview page

**Testing**:
- Unit tests for metrics calculations (`tests/lib/performance-metrics.test.ts`)
- Integration test: Verify metrics update correctly in UI
- Test metrics calculation for both ETH and BTC

---

### 3.3 Alert Thresholds
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ❌ NO

**Implementation**:
- Add configurable alert thresholds
- Send Discord alerts for:
  - Drawdown >15%
  - Win rate <20% (last 20 trades)
  - No trades in 24 hours (possible system failure)
  - API failures >3 in 1 hour
  - Cron job failures (missed updates)
- Add to notifications module
- Track alert state to avoid spam (rate limit alerts)

**Files to Modify**:
- `src/lib/notifications.ts` - Add threshold alert functions
- `src/lib/paper-trading-enhanced.ts` - Check thresholds on update
- `src/app/api/trading/paper/cron-update/route.ts` - Alert on cron failures

**Testing**:
- Unit tests for threshold checking logic
- Integration test: Verify Discord alerts sent when thresholds exceeded
- Test alert rate limiting (don't spam)
- Verify alerts are sent correctly to Discord

---

## Priority 4: Data Quality

### 4.1 Price Anomaly Detection
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ✅ YES (if it blocks trades)

**Implementation**:
- Detect price moves >10% in single period
- Flag as anomaly and log
- Option to block trading on anomalies
- Add to data quality validator

**Files to Modify**:
- `src/lib/data-quality-validator.ts` - Add anomaly detection
- `src/lib/paper-trading-enhanced.ts` - Check for anomalies

**Testing**:
- Unit test: Anomaly detection logic
- Integration test: Verify anomalies detected correctly
- **⚠️ REQUIRED: Backfill Test Comparison** (if blocking trades)
  - Run baseline and comparison tests
  - Verify no significant performance impact

---

### 4.2 Volume Validation
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ✅ YES (if it blocks trades)

**Implementation**:
- Require minimum volume for reliable price
- Reject trades if volume too low
- Add volume threshold to config
- Check volume before trade execution

**Files to Modify**:
- `src/lib/trade-executor.ts` - Add volume validation
- `src/lib/data-quality-validator.ts` - Add volume checks

**Testing**:
- Unit test: Volume validation logic
- Integration test: Verify trades rejected on low volume
- **⚠️ REQUIRED: Backfill Test Comparison** (if blocking trades)
  - Run baseline and comparison tests
  - Verify no significant performance impact

---

### 4.3 Data Staleness Monitoring
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ✅ YES (if it blocks trades)

**Implementation**:
- Track last price update time
- Alert if no update in 15 minutes (configurable)
- Block trading if data too stale
- Add to data quality checks

**Files to Modify**:
- `src/lib/data-quality-validator.ts` - Add staleness check
- `src/lib/paper-trading-enhanced.ts` - Check staleness

**Testing**:
- Unit test: Staleness detection
- Integration test: Verify trading blocked on stale data
- **⚠️ REQUIRED: Backfill Test Comparison** (if blocking trades)
  - Run baseline and comparison tests
  - Verify no significant performance impact

---

## Priority 5: Operational Improvements

### 5.1 Config Validation
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ❌ NO

**Implementation**:
- Validate config before saving/using
- Check: thresholds in valid ranges, position sizes reasonable, etc.
- Reject invalid configs with clear error messages
- Add validation function

**Files to Create/Modify**:
- `src/lib/config-validator.ts` - New validation module
- `src/lib/adaptive-strategy-enhanced.ts` - Use validator
- `scripts/save-strategy-config.ts` - Validate before saving

**Testing**:
- Unit tests for config validation
- Test various invalid configs

---

### 5.2 Position Reconciliation
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ❌ NO

**Implementation**:
- Add function to verify portfolio state consistency
- Check: balances add up, positions match trades, etc.
- Run reconciliation on session update
- Log any inconsistencies
- Add reconciliation report

**Files to Create/Modify**:
- `src/lib/portfolio-reconciliation.ts` - New reconciliation module
- `src/lib/paper-trading-enhanced.ts` - Run reconciliation

**Testing**:
- Unit test: Reconciliation logic
- Integration test: Verify inconsistencies detected

---

### 5.3 Audit Logging
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ❌ NO

**Implementation**:
- Log all critical actions: trades, config changes, emergency stops
- Store logs in Redis with timestamps
- Add log retrieval API endpoint
- Add log viewer UI component

**Files to Create/Modify**:
- `src/lib/audit-logger.ts` - New logging module
- `src/app/api/trading/audit-logs/route.ts` - New endpoint
- `src/app/tools/eth-trading/components/AuditLogViewer.tsx` - New component

**Testing**:
- Unit test: Logging functionality
- Integration test: Verify logs stored and retrieved correctly

---

## Priority 6: Strategy Robustness

### 6.1 Walk-Forward Optimization
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ✅ YES (optimization process)

**Implementation**:
- Create walk-forward optimization script
- Optimize on rolling windows (e.g., 6-month windows)
- Test out-of-sample performance
- Compare to current optimization approach

**Files to Create**:
- `scripts/walk-forward-optimization.ts` - New script

**Testing**:
- Run walk-forward optimization on historical data
- Compare results to current optimization
- **⚠️ REQUIRED: Backfill Test Comparison**
  - Compare walk-forward results to current optimization
  - Verify improved out-of-sample performance

---

### 6.2 Stress Testing
**Status**: Not Started  
**Priority**: 🟡 High  
**Requires Backfill Test**: ✅ YES (testing process)

**Implementation**:
- Create stress test scenarios:
  - 50% flash crash
  - Exchange outage simulation
  - Extreme volatility periods
- Test strategy behavior under stress
- Document results

**Files to Create**:
- `scripts/stress-test.ts` - New script
- `data/stress-test-scenarios/` - Test scenarios

**Testing**:
- Run stress tests and verify strategy handles extreme conditions
- **⚠️ REQUIRED: Backfill Test Comparison**
  - Run stress tests on current strategy
  - Document performance under stress

---

## Implementation Order

### Week 1: Critical Risk Management
1. Maximum Drawdown Protection ⚠️ (requires backfill test)
2. Emergency Stop Mechanism
3. Price Validation ⚠️ (requires backfill test)

### Week 2: Monitoring & Alerting
4. Error Tracking
5. Performance Dashboard
6. Alert Thresholds

### Week 3: Data Quality & Operational
7. Price Anomaly Detection ⚠️ (requires backfill test if blocking)
8. Config Validation
9. Position Reconciliation

### Week 4: Advanced Features
10. Execution State Tracking
11. Volume Validation ⚠️ (requires backfill test if blocking)
12. Audit Logging

### Future: Strategy Robustness
13. Walk-Forward Optimization ⚠️ (requires backfill test)
14. Stress Testing ⚠️ (requires backfill test)

---

## Success Criteria

- ✅ Maximum drawdown protection prevents excessive losses
- ✅ Emergency stop works reliably
- ✅ All errors are tracked and alerted
- ✅ Performance metrics visible in real-time
- ✅ Data quality issues detected and handled
- ✅ Config validation prevents invalid configurations
- ✅ Portfolio state always consistent
- ✅ All algorithm changes validated with backfill test comparisons
- ✅ No performance regressions (>5% drop) from baseline

## Testing Checklist for Each Algorithm Change

Before implementing any algorithm change:

- [ ] Run baseline backfill test and document metrics
- [ ] Implement the change
- [ ] Write/update unit tests for new functionality
- [ ] Run `pnpm validate` (type check, tests, lint, build)
- [ ] Run comparison backfill test on same periods
- [ ] Compare metrics (return, Sharpe, drawdown, win rate, trade count)
- [ ] Run full verification: `pnpm eth:verify-backtest`
- [ ] Generate trade audit if significant changes
- [ ] Document performance impact in commit message
- [ ] Update `PROJECT_STATUS.md` if metrics changed significantly

## Testing Requirements

### Unit Tests
- **Required for**: All new functions, calculations, validations
- **Location**: `tests/lib/` matching source file structure
- **Coverage**: >85% for critical paths
- **Run**: `pnpm test` (or `pnpm test:watch` during development)

### Integration Tests
- **Required for**: API endpoints, paper trading flows, complex interactions
- **Location**: `tests/integration/`
- **Run**: `pnpm test` (includes integration tests)

### Validation
- **Required after**: All big changes, algorithm changes, before commits
- **Command**: `pnpm validate` (runs type check, tests, lint, build)
- **Must pass**: All checks must pass before proceeding

### Backfill Tests
- **Required for**: Algorithm changes, strategy changes, risk management changes
- **Command**: `pnpm eth:backfill-test <start-date> <end-date> [--synthetic]`
- **Comparison**: Must compare before/after metrics
- **Full Verification**: `pnpm eth:verify-backtest` for comprehensive testing
- **See**: `TRADING_TESTING.md` for complete guidelines

## Notes

- All improvements work with paper trading (no exchange integration needed)
- Real exchange integration deferred to Phase 2
- Focus on hardening existing paper trading system
- Each improvement should be tested thoroughly before moving to next
- **Algorithm changes MUST be validated with backfill test comparisons** - see `TRADING_TESTING.md` for details
- **Always run `pnpm validate` after big changes** - ensures type check, tests, lint, and build all pass
- **Use Discord for all monitoring/alerting** - no external services like Sentry
- **Performance dashboard goes on overview page** (`/tools/trading-overview`) - not individual asset pages
- **Add unit tests for all new functions** - maintain >85% coverage for critical paths

