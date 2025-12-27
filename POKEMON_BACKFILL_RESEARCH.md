# Pokemon Price Index - Historical Backfill Research

## Research Summary

### PriceCharting Data Availability

**VGPC.chart_data Structure:**
- Available on every PriceCharting product page via JavaScript global object `VGPC.chart_data`
- Contains historical price data in the format: `{ "used": [[timestamp, price_in_cents]], "manual-only": [[timestamp, price_in_cents]] }`
- `used` = ungraded/loose prices
- `manual-only` = PSA 10 graded prices
- Each entry is `[timestamp_milliseconds, price_in_cents]`

**Key Findings:**
1. ✅ Historical data is accessible without API subscription
2. ✅ Data includes timestamps (can be converted to dates)
3. ✅ Both ungraded and PSA 10 prices are available
4. ⚠️ Data availability varies by card (newer cards have less history)
5. ⚠️ Timestamps are in milliseconds since epoch

### Implementation Strategy

**Backfill Function Design:**
1. Scrape the card's PriceCharting page
2. Extract `VGPC.chart_data` object
3. Parse all historical entries from `used` and `manual-only` arrays
4. Convert timestamps to YYYY-MM-DD dates
5. Create `PokemonCardPriceSnapshot` entries for each date
6. Merge with existing snapshots (don't overwrite existing data)
7. Only add snapshots that don't already exist

**Limitations:**
- Historical data depth varies by card (older cards have more history)
- Some cards may only have recent data (last 30-90 days)
- Data quality depends on PriceCharting's data collection
- Rate limiting: Need to be respectful with scraping frequency

### Manual Backfill Process

**CLI Script Approach:**
- Create a script: `scripts/backfill-pokemon-prices.ts`
- Accept card ID(s) as arguments
- Scrape historical data for specified cards
- Write snapshots to Redis
- Provide progress feedback

**API Endpoint Approach:**
- Create: `POST /api/pokemon-index/backfill`
- Accept card IDs in request body
- PIN-protected (requires authentication)
- Returns summary of backfilled dates

**Recommended Approach:**
- Start with CLI script for manual, controlled backfills
- Add API endpoint later if needed for UI integration
- CLI gives more control and better for debugging

## Implementation Status

1. ✅ Research complete - VGPC.chart_data contains historical data
2. ✅ Implemented `scrapeHistoricalPricesForCard()` function
3. ✅ Created CLI script: `scripts/backfill-pokemon-prices.ts`
4. ✅ Added npm script: `pnpm pokemon:backfill`
5. ✅ Integrated anomaly detection into backfill process
6. ✅ Tested with real card IDs
7. ✅ Documented in POKEMON_INDEX_PROGRESS.md

## Usage

**Backfill all configured cards:**
```bash
pnpm pokemon:backfill
```

**Backfill specific cards:**
```bash
pnpm pokemon:backfill 11069001 10669966
```

**Features:**
- Automatically detects and marks price anomalies during backfill
- Merges with existing data (idempotent - safe to run multiple times)
- Rebuilds index series after backfill
- Provides detailed progress and summary

**Anomaly Detection:**
- Uses statistical methods (IQR + median-based outliers)
- Detects conversion errors (cents vs dollars)
- Today's prices are never marked as anomalies
- Anomalies are excluded from index calculations

