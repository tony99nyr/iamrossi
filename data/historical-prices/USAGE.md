# Historical Price Data Usage Documentation

This document explains how historical price data is organized, used, and updated in the trading system.

## Directory Structure

```
data/historical-prices/
├── ethusdt/
│   ├── 8h/          # 8-hour candles (PRIMARY - used for strategy calculations)
│   │   └── ethusdt_8h.json.gz                      # Single file (all historical data)
│   ├── 1h/          # Hourly candles (AUXILIARY - intraday merging only)
│   │   └── ethusdt_1h.json.gz                      # Single file (all historical data)
│   └── 5m/          # 5-minute candles (AUXILIARY - intraday merging only)
│       └── ethusdt_5m.json.gz                     # Single file (all historical data)
├── btcusdt/
│   └── 8h/          # 8-hour candles (PRIMARY - used for strategy calculations)
│       └── btcusdt_8h.json.gz
└── synthetic/       # Synthetic/test data (NOT used for trading)
    └── ethusdt_1d_2026-01-01_2026-12-30.json.gz      # Fake 2026 data for testing
```

**File Naming**: Files use simple naming `{symbol}_{interval}.json.gz` with no dates. This avoids dates becoming misleading when workflows add new data. Files are continuously updated by merging/updating candles.

## Intervals and Usage

### 8h (8-hour) - **PRIMARY** ⭐
- **Purpose**: **Strategy calculations, regime detection, backtesting, chart display**
- **Usage**: 
  - **Paper trading session loads ALL available 8h candles** (from 2020-01-01 to now)
  - **Strategy calculations use 8h candles** (default timeframe for both ETH and BTC)
  - Chart displays all available 8h candles
  - This is the **actual timeframe used for trading signals**
- **When Updated**: 
  - Automatically updated by cron workflow every 5 minutes (via `fetchLatestPrice` → `updateTodayCandle`)
  - GitHub Actions workflow migrates Redis → files daily
- **File**: `ethusdt_8h.json.gz` (single file, continuously updated)
- **Why 8h?**: Comprehensive backfill analysis showed 8h significantly outperforms 4h for both ETH and BTC

### 1h (Hourly) - **FALLBACK ONLY** (Rarely Used)
- **Purpose**: Fallback for intraday data if 5m candles are unavailable
- **Usage**: 
  - Paper trading session uses 1h as fallback if 5m candles not available
  - **NOT used for strategy calculations** (only for intraday data merging fallback)
  - Cron workflow updates 5m candles every 5 minutes, so 1h is rarely needed
- **When Updated**: 
  - Automatically updated by cron workflow (via `fetchLatestPrice` → `updateTodayCandle`)
  - GitHub Actions workflow migrates Redis → files
- **File**: `ethusdt_1h.json.gz` (single file, continuously updated)
- **Note**: Only needed as fallback - cron workflow handles 5m candles every 5 minutes

### 1d (Daily) - **REMOVED** ❌
- **Status**: Removed - not used for strategy calculations
- **Reason**: Strategy uses 8h directly, and 1d data was only maintained for "completeness" which is unnecessary

### 5m (5-minute) - **AUXILIARY** (Intraday Merging Only)
- **Purpose**: Most granular intraday data for recent periods (last 48 hours only)
- **Usage**: 
  - Paper trading session prefers 5m over 1h for last 48 hours
  - Provides highest granularity for recent price movements
  - **NOT used for strategy calculations** (only for intraday data merging)
  - Automatically updated by cron workflow every 5 minutes (only created during session start/update)
- **When Updated**: 
  - Created during paper trading session start/update
  - GitHub Actions workflow migrates Redis → files
- **File**: `ethusdt_5m.json.gz` (single file, continuously updated)
- **Note**: Only needed for last 48 hours - older data not required

### 1m (1-minute) - **REMOVED**
- **Status**: ❌ Removed - Not used anywhere in the codebase
- **Reason**: No code references 1m intervals, so files were removed to reduce clutter

## File Organization

### Simplified File Naming
- **Format**: `{symbol}_{interval}.json.gz` (no dates in filename)
- **Example**: `ethusdt_8h.json.gz`
- **Purpose**: Single file per symbol/interval containing all historical data
- **Updates**: 
  - Continuously updated by GitHub Actions workflow (migrates from Redis)
  - Files are updated by merging/updating candles (no cutoff dates)
  - Dates in filenames were removed to avoid becoming misleading when workflows add new data

### Backward Compatibility
- Legacy files with date-based names (e.g., `ethusdt_8h_2025-01-01_2025-12-27.json.gz`) are still loaded for backward compatibility during migration
- These legacy files can be merged into the new single-file format

## Data Flow

### 1. Data Fetching
```
fetchPriceCandles() → Priority:
1. Load from historical files (if date range matches)
2. Load from rolling files (if date range includes post-cutoff)
3. Check Redis cache (for recent data)
4. Fetch from API (Binance → CoinGecko OHLC → CoinGecko market_chart)
5. Save to Redis (24h TTL)
```

### 2. Data Persistence
```
Redis (temporary) → GitHub Actions Workflow → Files (permanent)
- Recent data (last 48h) stays in Redis for quick access
- Older data migrates to files via GitHub Actions
- Files are committed to repo (compressed, small size)
```

### 3. Paper Trading Session Start
```
startSession() → Loads:
1. Daily candles: ALL available from historical + rolling files (not just 200 days)
2. Intraday candles: 5m (preferred) or 1h (fallback) for last 48 hours from Redis
3. Merges intraday into daily for recent period
4. Creates portfolioHistory with all available data
```

## Automatic Updates

All historical data is automatically updated:
- **Cron workflow** (every 5 minutes): Updates latest prices and 8h/5m candles in Redis
- **Migration workflow** (daily): Saves Redis candles to files
- **No manual refresh needed** - the system keeps data current automatically

## Synthetic/Test Data

### Location: `data/historical-prices/synthetic/`
- **Purpose**: Testing strategies against various market scenarios
- **Files**: `ethusdt_1d_2026-01-01_2026-12-30.json.gz` (fake 2026 data)
- **Usage**: Only used by test scripts (`test-strategies-2026.ts`)
- **NOT Used For**: Real trading, paper trading, or chart display
- **Why Separated**: Clear distinction between real and synthetic data

## Chart and Calculations

### Paper Trading Session:
- **Loads ALL available 8h candles** from historical + rolling files (from 2020-01-01 to now)
- **Merges intraday data** (5m/1h) for last 48 hours only
- **Chart displays** all 8h candles in `portfolioHistory`
- **Strategy calculations use 8h candles** (default timeframe from config)

### Data Loading Priority:
1. Historical files (pre-cutoff)
2. Rolling files (post-cutoff)
3. Redis cache (recent data)
4. API fetch (if gaps exist)

## Maintenance

### Adding New Data:
- **Automatic**: Data fetched from APIs is saved to Redis
- **Manual**: Use `pnpm eth:populate-data` to fetch missing historical data
- **Migration**: GitHub Actions workflow migrates Redis → files

### Removing Old Data:
- **1m interval**: Removed (unused)
- **Synthetic data**: Moved to `synthetic/` folder (not used for trading)

### File Updates:
- **Historical files**: Never updated (static)
- **Rolling files**: Updated by GitHub Actions workflow
- **Redis**: Temporary cache (24h TTL, migrates to files)

## Important Notes

⚠️ **Never use synthetic data for trading** - Only real API data is used for paper trading and strategy calculations.

⚠️ **Files are read-only in Vercel** - File writes only work locally or in GitHub Actions.

✅ **8h is the primary timeframe** - Strategy calculations use 8h candles (default for both ETH and BTC).

✅ **All available 8h data is loaded** - Paper trading session loads ALL 8h candles from files (from 2020-01-01 to now).

✅ **Rolling files are continuously updated** - GitHub Actions workflow keeps rolling files current.

## Optimization Summary

### Current Storage Priority:
- **8h**: ✅ **REQUIRED** - Keep all historical data (strategy uses this)
- **1h**: ⚠️ **FALLBACK ONLY** - Only needed as fallback if 5m unavailable (cron handles 5m every 5 minutes)
- **5m**: ⚠️ **LIMITED** - Only need last 48 hours (older data can be removed)
- **1d**: ❌ **REMOVED** - Not used for strategy, removed to reduce storage

### Summary:
- **Primary data**: 8h candles (used for strategy) - **keep all historical data**
- **Auxiliary data**: 5m/1h candles (intraday only) - **keep last 48h only, older data can be removed**
- **Removed**: 1d candles - not needed since strategy uses 8h directly

