## Pokemon Card Price Index – Progress & Remaining Tasks

### Summary

A tool for tracking Pokemon card prices and building a weighted price index with moving averages. Features include:
- Daily price scraping from PriceCharting.com
- Historical data backfill via CLI script
- Automatic anomaly detection (statistical outliers and conversion errors)
- Weighted index calculation with 30-day and 120-day moving averages
- Per-card price table view
- PIN-protected settings for card configuration

### Current Status

- **Tool & Routing**
  - New tool tile on the home page pointing to `/tools/pokemon-price-index`.
  - Server page + client component wired up with Panda CSS and existing auth/PIN patterns.

- **Data Model & Storage**
  - Types in `src/types/index.ts`:
    - `PokemonCardConfig`, `PokemonIndexSettings`
    - `PokemonCardPriceSnapshot`, `PokemonIndexPoint`
  - KV helpers in `src/lib/kv.ts`:
    - `get/setPokemonIndexSettings`
    - `get/setPokemonCardPriceSnapshots`
    - `get/setPokemonIndexSeries`

- **Scraping & Index Logic**
  - `src/lib/pokemon-index-service.ts`:
    - Scrapes PriceCharting using Playwright + Sparticuz Chromium.
    - Stores one `PokemonCardPriceSnapshot` per card per day.
    - Builds an index normalized to 100 on the first day with:
      - Weighted sum of prices.
      - 30-day and 120-day moving averages (uses available history until 30/120 days are present).

- **APIs**
  - `GET /api/pokemon-index/settings`
    - Returns current `PokemonIndexSettings` or defaults (empty cards, 24h refresh).
  - `POST /api/pokemon-index/settings`
    - Auth-required via existing rehab token (cookie/header).
    - Validates payload with `pokemonIndexSettingsSchema`.
  - `GET /api/pokemon-index/prices`
    - Loads settings, ensures series is up to date (scrape when needed).
    - Returns `settings`, `series`, and a summary of latest values.
  - `GET /api/pokemon-index/snapshots`
    - Returns raw `PokemonCardPriceSnapshot[]` plus settings.
    - Supports optional `cardId` and `days` query params.

- **UI**
  - `PokemonPriceIndexClient`:
    - Fetches `/api/pokemon-index/prices` and `/api/pokemon-index/snapshots`.
    - Renders:
      - Index chart with 30/120-day MAs (SVG polyline chart).
      - View toggle: **Index Chart** vs **Per-Card Prices**.
      - Per-card table: dates × cards, showing ungraded/PSA10 values.
    - Settings:
      - Protected by existing `PinEntryModal` flow.
      - Modal editor for:
        - Card list (PriceCharting ID, label, condition type, weight).
        - `refreshIntervalHours`.
      - On save:
        - POSTs to `/api/pokemon-index/settings`.
        - Triggers a refresh via `/api/pokemon-index/prices?refresh=1`.

- **Automation**
  - `vercel.json` includes a cron:
    - `path`: `/api/pokemon-index/prices?refresh=1`
    - `schedule`: `0 3 * * *` (03:00 UTC daily)
  - Ensures index and snapshots update daily without manual page visits.

- **Testing**
  - Unit:
    - `tests/lib/pokemon-index-service.test.ts` covers:
      - Base=100 normalization.
      - Moving average fields present.
  - API:
    - `tests/api/pokemon-index.test.ts`:
      - Settings GET/POST (auth + validation).
      - Prices GET with/without configuration.
    - `tests/api/pokemon-index-snapshots.test.ts`:
      - Snapshots GET basic shape.
  - `pnpm validate` passes (types, tests, lint, build).

### Completed Features

- **Price Scraping & Data Collection** ✅
  - Robust three-tier extraction strategy:
    1. **Primary**: Extract from `VGPC.chart_data` JavaScript object (most reliable)
    2. **Fallback**: Use specific table cell IDs (`#used_price` for ungraded, `#manual_only_price` for PSA 10)
    3. **Last resort**: Generic table row matching
  - Handles price conversion (cents to dollars) correctly
  - Daily scraping via Vercel cron job (03:00 UTC)

- **Historical Backfill** ✅
  - Manual CLI script: `pnpm pokemon:backfill [card-id-1] [card-id-2] ...`
  - Extracts historical data from `VGPC.chart_data` JavaScript object
  - Merges with existing snapshots (idempotent, doesn't overwrite)
  - Automatically rebuilds index series after backfill
  - See `POKEMON_BACKFILL_RESEARCH.md` for details

- **Anomaly Detection** ✅
  - Automatic detection during backfill process
  - Uses statistical methods (IQR + median-based outliers)
  - Detects conversion errors (cents vs dollars confusion)
  - Marks anomalies with `ignored: true` flag
  - **Protection**: Today's prices are never marked as anomalies (trust current day data)
  - Anomalies are excluded from index calculations
  - Anomalies display in red with strikethrough in UI

- **Index Calculation Improvements** ✅
  - Fixed base normalization (earliest date = 100)
  - Prevents skew from cards with limited historical data
  - Cards without data use their base price until actual data arrives
  - Smooth transitions when new cards get their first data point
  - No jumps in index when cards are added

- **Data Management** ✅
  - Delete script: `pnpm tsx scripts/delete-pokemon-snapshots.ts <date1> [date2] ...`
  - Anomaly detection script: `pnpm tsx scripts/detect-price-anomalies.ts`
  - All scripts use cloud Redis (via `.env.local` REDIS_URL)

### Known Issues / Remaining Work

- **Price Data Quality**
  - Some historical prices may still have conversion errors (cents vs dollars)
  - Run backfill script to detect and mark anomalies: `pnpm pokemon:backfill`
  - Anomalies are automatically detected and marked during backfill
  - Check UI for red/strikethrough prices indicating ignored anomalies

- **Index Normalization**
  - Index should start at 100 for earliest date - verify this is working correctly
  - Monitor for smooth transitions when new cards are added

### Next Tasks (Short Term)

1. **Testing & Validation**
   - Verify anomaly detection is working correctly with real data
   - Test index calculation with cards that have limited historical data
   - Ensure today's prices are never marked as anomalies

2. **UI Enhancements**
   - Add filter by card in Per-Card Prices table
   - Show mini sparklines per card
   - Display count of ignored anomalies in summary

3. **Data Quality Monitoring**
   - Add logging for anomaly detection results
   - Track which cards have the most anomalies
   - Consider manual review process for marked anomalies

### Future Enhancements (Nice to Have)

- **Multi-source pricing**
  - Add TCGplayer as an optional additional source:
    - Abstract a `PriceProvider` interface.
    - Implement `PriceChartingScraper` + `TCGplayerScraper`.
    - Allow per-card or global selection of source and blending rules.

- **Alerting & Analytics**
  - Simple rules:
    - Notify when the index drops X% below the 120-day MA.
    - Highlight cards whose price deviates strongly from their own 30-day MA.

- **Admin tooling**
  - Debug page listing:
    - Raw snapshots per card.
    - Last successful scrape time per card.
    - Any scrape errors recorded for the last N days.


