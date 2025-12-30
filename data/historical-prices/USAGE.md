# Historical Price Data Usage Documentation

This document explains how historical price data is organized, used, and updated in the trading system.

## Directory Structure

```
data/historical-prices/
├── ethusdt/
│   ├── 1d/          # Daily candles (used for strategy/regime detection)
│   │   ├── ethusdt_1d_2025-01-01_2025-12-27.json.gz  # Historical (pre-cutoff)
│   │   └── ethusdt_1d_rolling.json.gz               # Rolling (post-cutoff, updated)
│   ├── 1h/          # Hourly candles (used for intraday data)
│   │   ├── 2025-12-22_2025-12-27.json.gz            # Historical (pre-cutoff)
│   │   └── ethusdt_1h_rolling.json.gz               # Rolling (post-cutoff, updated)
│   └── 5m/          # 5-minute candles (used for intraday data, preferred)
│       └── ethusdt_5m_rolling.json.gz               # Rolling (post-cutoff, updated)
└── synthetic/       # Synthetic/test data (NOT used for trading)
    └── ethusdt_1d_2026-01-01_2026-12-30.json.gz      # Fake 2026 data for testing
```

## Intervals and Usage

### 1d (Daily) - **PRIMARY**
- **Purpose**: Strategy/regime detection, backtesting, chart display
- **Usage**: 
  - Paper trading session loads 200+ days for regime detection
  - Chart displays all available daily candles
  - Strategy calculations use daily candles
- **When Updated**: 
  - "Refresh Historical Data" fills gaps from last file date to now
  - GitHub Actions workflow migrates Redis → files
- **Rolling File**: `ethusdt_1d_rolling.json.gz` (dates after 2025-12-27)

### 1h (Hourly) - **SECONDARY**
- **Purpose**: Intraday granularity for recent periods (last 48 hours)
- **Usage**: 
  - Paper trading session merges hourly candles for last 48 hours
  - Provides more granular price movements than daily candles
  - Fallback if 5m candles not available
- **When Updated**: 
  - "Refresh Historical Data" fills hourly gaps
  - GitHub Actions workflow migrates Redis → files
- **Rolling File**: `ethusdt_1h_rolling.json.gz` (dates after 2025-12-27)

### 5m (5-minute) - **PREFERRED INTRADAY**
- **Purpose**: Most granular intraday data for recent periods (last 48 hours)
- **Usage**: 
  - Paper trading session prefers 5m over 1h for last 48 hours
  - Provides highest granularity for recent price movements
  - NOT fetched by "Refresh Historical Data" (only used during session start/update)
- **When Updated**: 
  - Created during paper trading session start/update
  - GitHub Actions workflow migrates Redis → files
- **Rolling File**: `ethusdt_5m_rolling.json.gz` (dates after 2025-12-27)

### 1m (1-minute) - **REMOVED**
- **Status**: ❌ Removed - Not used anywhere in the codebase
- **Reason**: No code references 1m intervals, so files were removed to reduce clutter

## File Organization

### Historical Files (Pre-Cutoff: 2025-12-27)
- **Format**: `{symbol}_{interval}_{startDate}_{endDate}.json.gz`
- **Example**: `ethusdt_1d_2025-01-01_2025-12-27.json.gz`
- **Purpose**: Static historical data up to cutoff date
- **Updates**: Never updated (static historical data)

### Rolling Files (Post-Cutoff: After 2025-12-27)
- **Format**: `{symbol}_{interval}_rolling.json.gz`
- **Example**: `ethusdt_1d_rolling.json.gz`
- **Purpose**: Continuously updated data after cutoff date
- **Updates**: 
  - Updated by GitHub Actions workflow (migrates from Redis)
  - Contains all candles from 2025-12-28 to current date

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

## "Refresh Historical Data" Button

### What It Does:
1. **Finds last daily candle** in historical files (checks both historical and rolling)
2. **Fetches missing daily candles** from that date to now (uses API fallback chain)
3. **Finds last hourly candle** and fills hourly gaps
4. **Fetches latest price** (updates today's candle)

### What It Updates:
- ✅ **1d (Daily)**: Fetches all missing daily candles
- ✅ **1h (Hourly)**: Fetches missing hourly candles
- ❌ **5m (5-minute)**: NOT fetched (only created during session start/update)
- ❌ **1m (1-minute)**: Removed (unused)

### Data Storage:
- Saves to **Redis** (not files directly)
- Files are written by **GitHub Actions workflow** (migrates Redis → files)

## Synthetic/Test Data

### Location: `data/historical-prices/synthetic/`
- **Purpose**: Testing strategies against various market scenarios
- **Files**: `ethusdt_1d_2026-01-01_2026-12-30.json.gz` (fake 2026 data)
- **Usage**: Only used by test scripts (`test-strategies-2026.ts`)
- **NOT Used For**: Real trading, paper trading, or chart display
- **Why Separated**: Clear distinction between real and synthetic data

## Chart and Calculations

### Paper Trading Session:
- **Loads ALL available data** from historical + rolling files (not limited to 200 days)
- **Merges intraday data** (5m/1h) for last 48 hours
- **Chart displays** all data in `portfolioHistory`
- **Calculations use** all available candles for accurate regime detection

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

✅ **All available data is loaded** - Paper trading session loads ALL candles from files, not just a fixed range.

✅ **Rolling files are continuously updated** - GitHub Actions workflow keeps rolling files current.

