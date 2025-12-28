# Historical Price Data Cache

This directory stores historical cryptocurrency price data in compressed JSON format (gzip) to avoid API rate limits and reduce storage usage.

## Directory Structure

```
data/historical-prices/
├── {symbol}/          # e.g., ethusdt
│   └── {timeframe}/   # e.g., 1d, 1h, 4h
│       ├── {symbol}_{timeframe}_{startDate}_{endDate}.json.gz  # Organized compressed file
│       └── archive/   # Original individual files (archived after organization)
│           └── {startDate}_{endDate}.json
```

Example: `data/historical-prices/ethusdt/1d/ethusdt_1d_2025-01-01_2025-12-27.json.gz`

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

## Organization & Compression

Run the organization script to merge, deduplicate, sort, and compress all data:

```bash
pnpm eth:organize-data ETHUSDT 1d
```

This will:
- Read all JSON files for the symbol/timeframe
- Deduplicate by timestamp (keeps highest volume entry)
- Sort chronologically
- Compress to `.json.gz` (typically 80%+ compression)
- Archive original files to `archive/` directory

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
const candles = await loadCompressed('data/historical-prices/ethusdt/1d/ethusdt_1d_2025-01-01_2025-12-27.json.gz');
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

