# Historical Price Data Cache

This directory stores historical cryptocurrency price data in compressed JSON format (gzip) to avoid API rate limits and reduce storage usage.

## Directory Structure

```
data/historical-prices/
├── {symbol}/          # e.g., ethusdt, btcusdt
│   ├── 8h/            # 8-hour candles (PRIMARY - used for strategy calculations)
│   │   └── {symbol}_8h.json.gz                      # Single file (all historical data)
│   ├── 1h/            # Hourly candles (AUXILIARY - intraday merging only, last 48h)
│   │   └── {symbol}_1h.json.gz                      # Single file (all historical data)
│   └── 5m/            # 5-minute candles (AUXILIARY - intraday merging only, last 48h)
│       └── {symbol}_5m.json.gz                     # Single file (all historical data)
└── synthetic/         # Synthetic/test data (NOT used for trading)
    └── {symbol}_{timeframe}_{startDate}_{endDate}.json.gz
```

Example: `data/historical-prices/ethusdt/8h/ethusdt_8h.json.gz`

**Note**: Files are named simply `{symbol}_{interval}.json.gz` with no dates. This avoids dates becoming misleading when workflows add new data. Files are updated by merging/updating candles.

## Timeframe Usage

### Primary: 8h (8-hour candles) ⭐
- **Used for**: Strategy calculations, regime detection, backtesting, chart display
- **Default timeframe** for both ETH and BTC trading strategies
- **Keep all historical data** - this is what the strategy actually uses
- Updated by cron workflow every 5 minutes (via `fetchLatestPrice`)

### Auxiliary: 5m (5-minute candles)
- **Used for**: Intraday data merging in the last 48 hours only
- **NOT used for strategy calculations** (only for recent data granularity)
- **Automatically updated** by cron workflow every 5 minutes
- **Only need last 48 hours** - older data can be removed to reduce size

### Fallback: 1h (Hourly candles)
- **Used for**: Fallback if 5m candles unavailable (rarely needed)
- **NOT used for strategy calculations** (only for intraday data merging fallback)
- Cron workflow handles 5m every 5 minutes, so 1h is rarely needed
- **Only need last 48 hours** - older data can be removed

### Removed: 1d (Daily candles) ❌
- **Status**: Removed - not used for strategy calculations
- Strategy uses 8h directly, so 1d data was unnecessary

## File Format

Compressed files contain gzipped JSON with an array of `PriceCandle` objects:

```json
[
  {
    "timestamp": 1704067200000,
    "open": 2500.50,
    "high": 2550.75,
    "low": 2490.25,
    "close": 2540.00,
    "volume": 1234567.89
  },
  ...
]
```

## Usage

The `fetchPriceCandles()` function in `src/lib/eth-price-service.ts` automatically:
1. Checks for organized compressed files first (`.json.gz`)
2. Falls back to individual JSON files
3. Falls back to Redis cache
4. Fetches from API if needed
5. Saves fetched data to both local files and Redis

**Note**: The trading strategy uses **8h candles** by default (configured in `src/lib/asset-config.ts`). Paper trading sessions load all available 8h candles from historical files for strategy calculations.

## Organization & Compression

Run the organization script to merge, deduplicate, sort, and compress all data:

```bash
pnpm eth:organize-data ETHUSDT 8h  # For 8h candles (primary)
pnpm eth:organize-data ETHUSDT 1d  # For 1d candles (secondary)
```

This will:
- Read all JSON files for the symbol/timeframe
- Deduplicate by timestamp (keeps highest volume entry)
- Sort chronologically
- Compress to `.json.gz` (typically 80%+ compression)
- Archive original files to `archive/` directory

**Recommended**: Focus on organizing 8h candles first (this is what the strategy uses).

## Benefits

- ✅ **81%+ compression** - Reduces storage by ~5x
- ✅ **Organized** - Single file per symbol/timeframe instead of many overlapping files
- ✅ **Deduplicated** - No duplicate candles
- ✅ **Sorted** - Chronological order for efficient access
- ✅ **Fast loading** - Gzip decompression is very fast
- ✅ **Avoids API rate limits** - Historical data cached locally
- ✅ **Reduces Redis usage** - No need to cache in Redis
- ✅ **Can be committed to repo** - Compressed files are small enough for git

## Loading Compressed Data

The price service automatically handles compressed files. To manually load:

```typescript
import { loadCompressed } from '@/scripts/organize-historical-data';
const candles = await loadCompressed('data/historical-prices/ethusdt/8h/ethusdt_8h.json.gz');
```

Or use Node.js directly:

```javascript
const { gunzipSync } = require('zlib');
const fs = require('fs');
const data = gunzipSync(fs.readFileSync('path/to/file.json.gz'));
const candles = JSON.parse(data.toString());
```

## Adding Data

1. **Automatic**: Data is automatically saved when fetched from APIs
2. **Manual**: Add JSON files following the directory structure, then run `pnpm eth:organize-data` to compress them
3. **Population**: Use `pnpm eth:populate-data` to fetch missing historical data

