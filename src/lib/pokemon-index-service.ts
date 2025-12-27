import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { debugLog } from '@/lib/logger';
import type {
  PokemonCardConfig,
  PokemonCardPriceSnapshot,
  PokemonIndexPoint,
  PokemonIndexSettings,
} from '@/types';
import {
  getPokemonCardPriceSnapshots,
  setPokemonCardPriceSnapshots,
  getPokemonIndexSeries,
  setPokemonIndexSeries,
} from '@/lib/kv';

function todayIsoDate(): string {
  // Use local timezone, not UTC, to get the actual current date
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


export async function scrapePriceChartingForCard(
  card: PokemonCardConfig,
): Promise<Omit<PokemonCardPriceSnapshot, 'cardId' | 'date'>> {
  // For now we assume the card.id is the full path segment for a PriceCharting product page,
  // e.g. "pokemon-base-set-charizard-4" and we hit /game/{id}.
  const url = `https://www.pricecharting.com/game/${encodeURIComponent(card.id)}`;

  debugLog(`[Pokemon] Scraping PriceCharting for card ${card.name} (${card.id}) -> ${url}`);

  const browser = await chromium.launch({
    args: chromiumPkg.args,
    executablePath: await chromiumPkg.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar',
    ),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Increased timeout for API routes - Playwright can be slow in serverless environments
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); // 60 seconds
    
    // Wait for the price table to be visible
    try {
      await page.waitForSelector('#price_data', { timeout: 10000 });
    } catch {
      // Continue even if selector doesn't appear - might be a different page structure
    }
    
    // Wait for VGPC object to be available (it's set by inline script)
    try {
      await page.waitForFunction(() => {
        // VGPC is a dynamic property added by the page's JavaScript
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vgpc = (globalThis as any).VGPC;
        return typeof vgpc !== 'undefined' && vgpc?.chart_data !== undefined;
      }, { timeout: 5000 });
    } catch {
      // VGPC might not be available, continue with DOM-based extraction
      debugLog('[Pokemon] VGPC object not found, using DOM-based extraction');
    }
    
    // Give a moment for any remaining JavaScript to finish executing
    await page.waitForTimeout(1000);

    const { ungraded, psa10, debugInfo } = await page.evaluate(() => {
      let ungradedPrice: number | undefined;
      let psa10Price: number | undefined;

      const parse = (text: string | null | undefined): number | undefined => {
        if (!text) return undefined;
        const cleaned = text.replace(/[^0-9.]/g, '');
        const value = Number.parseFloat(cleaned);
        return Number.isFinite(value) ? value : undefined;
      };

      // Method 1: Extract from DOM table cells (most reliable - shows current displayed price)
      const usedPriceCell = document.querySelector('#used_price .price.js-price');
      if (usedPriceCell) {
        ungradedPrice = parse(usedPriceCell.textContent);
      }

      const manualOnlyPriceCell = document.querySelector('#manual_only_price .price.js-price');
      if (manualOnlyPriceCell) {
        psa10Price = parse(manualOnlyPriceCell.textContent);
      }
      
      // Store these for debug info later
      const usedPriceText = usedPriceCell?.textContent || null;
      const manualOnlyPriceText = manualOnlyPriceCell?.textContent || null;

      // Method 2: Fall back to VGPC.chart_data JavaScript object if DOM extraction failed
      // Note: Prices in chart_data can be in cents (large integers) or dollars (decimals > 100)
      if (ungradedPrice === undefined || psa10Price === undefined) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const VGPC = (globalThis as any).VGPC;
          if (VGPC && VGPC.chart_data) {
            const chartData = VGPC.chart_data;
            
            // Helper function to convert price (same logic as historical scraper)
            const convertPrice = (rawPrice: number): number => {
              const isInteger = Number.isInteger(rawPrice);
              const hasDecimals = rawPrice % 1 !== 0;
              
              if (isInteger && rawPrice > 1000) {
                // Large integer (e.g., 55001) = cents
                return rawPrice / 100;
              } else if (hasDecimals && rawPrice > 100) {
                // Decimal > 100 (e.g., 550.01) = already in dollars
                return rawPrice;
              } else if (hasDecimals && rawPrice < 100) {
                // Small decimal - check if reasonable
                return rawPrice > 1 ? rawPrice : rawPrice / 100;
              } else {
                // Integer < 1000 - check magnitude
                return rawPrice > 100 ? rawPrice / 100 : rawPrice;
              }
            };
            
            // Extract latest "used" price (ungraded)
            if (ungradedPrice === undefined && chartData.used && Array.isArray(chartData.used) && chartData.used.length > 0) {
              const latestUsed = chartData.used[chartData.used.length - 1];
              if (Array.isArray(latestUsed) && latestUsed.length >= 2) {
                const rawPrice = latestUsed[1];
                if (typeof rawPrice === 'number' && rawPrice > 0) {
                  ungradedPrice = convertPrice(rawPrice);
                }
              }
            }
            
            // Extract latest "manual-only" price (PSA 10)
            if (psa10Price === undefined && chartData['manual-only'] && Array.isArray(chartData['manual-only']) && chartData['manual-only'].length > 0) {
              const latestManualOnly = chartData['manual-only'][chartData['manual-only'].length - 1];
              if (Array.isArray(latestManualOnly) && latestManualOnly.length >= 2) {
                const rawPrice = latestManualOnly[1];
                if (typeof rawPrice === 'number' && rawPrice > 0) {
                  psa10Price = convertPrice(rawPrice);
                }
              }
            }
          }
        } catch {
          // Fall through to generic table matching
        }
      }

      // Method 3: Last resort - try generic table row matching (original approach)
      if (ungradedPrice === undefined || psa10Price === undefined) {
        const rows = Array.from(document.querySelectorAll('table tr'));
        for (const row of rows) {
          const cells = row.querySelectorAll('th,td');
          if (cells.length < 2) continue;

          const label = cells[0]?.textContent?.toLowerCase().trim() || '';
          const priceText = cells[1]?.textContent || '';

          if (ungradedPrice === undefined && (label.includes('ungraded') || label.includes('loose'))) {
            ungradedPrice = parse(priceText);
          }
          if (
            psa10Price === undefined &&
            (label.includes('psa 10') ||
              label.includes('psa10') ||
              label.includes('graded 10') ||
              label.includes('bgs 10'))
          ) {
            psa10Price = parse(priceText);
          }
        }
      }

      const debug: Record<string, unknown> = {};
      
      // Collect debug info
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const VGPC = (globalThis as any).VGPC;
        debug.hasVGPC = !!VGPC;
        debug.hasChartData = !!(VGPC && VGPC.chart_data);
        if (VGPC && VGPC.chart_data) {
          debug.chartDataKeys = Object.keys(VGPC.chart_data);
          debug.usedData = VGPC.chart_data.used;
          debug.manualOnlyData = VGPC.chart_data['manual-only'];
        }
      } catch {
        debug.vgpcError = true;
      }
      
      debug.usedPriceCellExists = !!usedPriceCell;
      debug.manualOnlyPriceCellExists = !!manualOnlyPriceCell;
      debug.priceTableExists = !!document.querySelector('#price_data');
      debug.usedPriceText = usedPriceText;
      debug.manualOnlyPriceText = manualOnlyPriceText;

      return { ungraded: ungradedPrice, psa10: psa10Price, debugInfo: debug };
    });

    debugLog('[Pokemon] Scraped prices', { card: card.id, ungraded, psa10, debugInfo });

    return {
      ungradedPrice: ungraded,
      psa10Price: psa10,
      source: 'pricecharting',
      currency: 'USD',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Pokemon] Error scraping PriceCharting card ${card.id} (${card.name}):`, errorMsg);
    debugLog(`[Pokemon] Scraping error details: ${errorMsg}`);
    
    // Re-throw the error so refreshTodaySnapshots can handle it
    // This allows us to see which cards are failing and why
    throw new Error(`Failed to scrape card ${card.id}: ${errorMsg}`);
  } finally {
    await browser.close();
  }
}

/**
 * Scrapes historical price data from PriceCharting's VGPC.chart_data object.
 * Returns all available historical snapshots for a card.
 * 
 * Note: PriceCharting's chart_data typically only contains monthly snapshots (first of each month).
 * For daily data, you may need to use alternative data sources or scrape the price history table
 * if available on the page.
 */
export async function scrapeHistoricalPricesForCard(
  card: PokemonCardConfig,
): Promise<PokemonCardPriceSnapshot[]> {
  const url = `https://www.pricecharting.com/game/${encodeURIComponent(card.id)}`;

  debugLog(`[Pokemon] Scraping historical prices for card ${card.name} (${card.id}) -> ${url}`);

  const browser = await chromium.launch({
    args: chromiumPkg.args,
    executablePath: await chromiumPkg.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar',
    ),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Use longer timeout for historical scraping (some pages load slowly)
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }); // Increased to 90s
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        debugLog(`[Pokemon] Page load timeout for card ${card.id}`);
        throw new Error(`Page load timeout: ${errorMsg}`);
      }
      throw error;
    }

    // Wait for VGPC object to be available
    try {
      await page.waitForFunction(() => {
        // VGPC is a dynamic property added by the page's JavaScript
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vgpc = (globalThis as any).VGPC;
        return typeof vgpc !== 'undefined' && vgpc?.chart_data !== undefined;
      }, { timeout: 20000 }); // Increased to 20s
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        debugLog(`[Pokemon] VGPC object timeout for card ${card.id}`);
        throw new Error(`VGPC object timeout: ${errorMsg}`);
      }
      debugLog('[Pokemon] VGPC object not found, cannot extract historical data');
      // If it's not a timeout, it might just not be available (some cards have no data)
      // Return empty array in this case
      return [];
    }

    await page.waitForTimeout(1000);

    const historicalData = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const VGPC = (globalThis as any).VGPC;
      
      const result: {
        used: Array<[number, number]>;
        'manual-only': Array<[number, number]>;
        dailySales?: Array<{ date: string; price: number; condition: string }>;
        debug?: Record<string, unknown>;
      } = {
        used: [],
        'manual-only': [],
      };

      // First, get monthly data from VGPC.chart_data (as fallback)
      if (VGPC && VGPC.chart_data) {
        const chartData = VGPC.chart_data;
        result.used = chartData.used || [];
        result['manual-only'] = chartData['manual-only'] || [];
      }

      // Try to extract daily sales data from "Sale Date" tables
      // These tables contain individual sales with dates and prices
      const dailySales: Array<{ date: string; price: number; condition: string }> = [];
      
      // Find all tables with "Sale Date" headers
      const allTables = document.querySelectorAll('table');
      for (const table of allTables) {
        const headerRow = table.querySelector('tr');
        if (!headerRow) continue;
        
        const headerText = headerRow.textContent?.toLowerCase() || '';
        if (!headerText.includes('sale date') && !headerText.includes('date')) {
          continue;
        }

        // Extract data from this table
        const rows = table.querySelectorAll('tr');
        let dateColIndex = -1;
        let priceColIndex = -1;
        let conditionColIndex = -1;

        // Find column indices from header row
        const headerCells = headerRow.querySelectorAll('th, td');
        for (let i = 0; i < headerCells.length; i++) {
          const cellText = headerCells[i]?.textContent?.toLowerCase() || '';
          if (cellText.includes('date') || cellText.includes('sale date')) {
            dateColIndex = i;
          }
          if (cellText.includes('price') || cellText.includes('sold')) {
            priceColIndex = i;
          }
          if (cellText.includes('condition') || cellText.includes('grade')) {
            conditionColIndex = i;
          }
        }

        // Extract data rows
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          
          const cells = row.querySelectorAll('td');
          if (cells.length === 0) continue;

          let dateStr: string | null = null;
          let price: number | null = null;
          let condition = 'ungraded';

          // Extract date
          if (dateColIndex >= 0 && cells[dateColIndex]) {
            dateStr = cells[dateColIndex]?.textContent?.trim() || null;
          } else {
            // Try to find date in any cell
            for (let j = 0; j < cells.length; j++) {
              const cellText = cells[j]?.textContent?.trim() || '';
              if (cellText.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/)) {
                dateStr = cellText;
                break;
              }
            }
          }

          // Extract price
          if (priceColIndex >= 0 && cells[priceColIndex]) {
            const priceText = cells[priceColIndex]?.textContent?.trim() || '';
            const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
            if (priceMatch) {
              price = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
          } else {
            // Try to find price in any cell
            for (let j = 0; j < cells.length; j++) {
              const cellText = cells[j]?.textContent?.trim() || '';
              const priceMatch = cellText.match(/\$?([\d,]+\.?\d*)/);
              if (priceMatch) {
                price = parseFloat(priceMatch[1].replace(/,/g, ''));
                break;
              }
            }
          }

          // Extract condition - be more aggressive in detecting PSA 10
          // PSA 10 sales might be labeled as "PSA 10", "Grade 10", "10", "PSA10", etc.
          let conditionDetected = false;
          
          if (conditionColIndex >= 0 && cells[conditionColIndex]) {
            const conditionText = cells[conditionColIndex]?.textContent?.toLowerCase() || '';
            // Check for PSA 10 first (most specific)
            if (conditionText.includes('psa 10') || conditionText.includes('psa10') || 
                conditionText.includes('grade 10') || conditionText.match(/\b10\b/)) {
              condition = 'psa10';
              conditionDetected = true;
            } else if (conditionText.includes('psa') || conditionText.includes('grade')) {
              condition = 'graded';
              conditionDetected = true;
            } else if (conditionText.includes('loose') || conditionText.includes('ungraded')) {
              condition = 'ungraded';
              conditionDetected = true;
            }
          }
          
          // Also check all cells in the row for condition indicators
          if (!conditionDetected) {
            const rowText = row.textContent?.toLowerCase() || '';
            // Check for PSA 10 patterns in the entire row
            if (rowText.includes('psa 10') || rowText.includes('psa10') || 
                rowText.includes('grade 10') || rowText.match(/\bpsa.*10\b/) ||
                rowText.match(/\bgrade.*10\b/)) {
              condition = 'psa10';
              conditionDetected = true;
            } else if (rowText.includes('psa') || rowText.includes('grade')) {
              // Check if it's a specific grade that's not 10
              const gradeMatch = rowText.match(/grade\s*(\d+)/);
              if (gradeMatch && gradeMatch[1] === '10') {
                condition = 'psa10';
                conditionDetected = true;
              } else {
                condition = 'graded';
                conditionDetected = true;
              }
            }
          }
          
          // Check table headers/context - PSA 10 sales might be in separate tables
          // Look for table headers that indicate PSA 10
          if (!conditionDetected) {
            const table = row.closest('table');
            if (table) {
              const tableHeaders = table.querySelectorAll('th');
              for (const header of tableHeaders) {
                const headerText = header.textContent?.toLowerCase() || '';
                if (headerText.includes('psa 10') || headerText.includes('psa10') || 
                    headerText.includes('grade 10') || headerText.includes('manual-only')) {
                  condition = 'psa10';
                  conditionDetected = true;
                  break;
                }
              }
            }
          }

          // Only add if we have both date and price
          if (dateStr && price && price > 0) {
            // Convert date to YYYY-MM-DD format
            let normalizedDate: string;
            if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
              normalizedDate = dateStr;
            } else if (dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              // MM/DD/YYYY format
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                const month = parts[0]!.padStart(2, '0');
                const day = parts[1]!.padStart(2, '0');
                const year = parts[2];
                normalizedDate = `${year}-${month}-${day}`;
              } else {
                continue;
              }
            } else {
              continue;
            }

            dailySales.push({
              date: normalizedDate,
              price,
              condition,
            });
          }
        }
      }

      if (dailySales.length > 0) {
        result.dailySales = dailySales;
      }

      // Debug info
      if (VGPC && VGPC.chart_data) {
        const chartData = VGPC.chart_data;
        result.debug = {
          vgpcKeys: Object.keys(VGPC),
          chartDataKeys: Object.keys(chartData),
          dailySalesCount: dailySales.length,
          tablesFound: allTables.length,
        };
      }

      return result;
    });

    // Debug: Log what data we're getting
    debugLog(`[Pokemon] Raw data points - used: ${historicalData.used?.length || 0}, manual-only: ${historicalData['manual-only']?.length || 0}`);
    if (historicalData.dailySales) {
      debugLog(`[Pokemon] Found ${historicalData.dailySales.length} daily sales from price history tables!`);
    }
    
    // Log debug info about available data structures
    if (historicalData.debug) {
      debugLog(`[Pokemon] VGPC debug info:`, historicalData.debug);
    }
    
    if (historicalData.used && historicalData.used.length > 0) {
      const firstEntry = historicalData.used[0];
      const lastEntry = historicalData.used[historicalData.used.length - 1];
      if (Array.isArray(firstEntry) && Array.isArray(lastEntry)) {
        const firstDate = new Date(firstEntry[0]);
        const lastDate = new Date(lastEntry[0]);
        debugLog(`[Pokemon] Date range in raw data: ${firstDate.toISOString().slice(0, 10)} to ${lastDate.toISOString().slice(0, 10)}`);
        debugLog(`[Pokemon] Sample entries: first=${JSON.stringify(firstEntry)}, last=${JSON.stringify(lastEntry)}`);
        
        // Check date granularity - are these daily or monthly?
        const dates = historicalData.used.slice(0, 10).map((e: [number, number]) => new Date(e[0]).toISOString().slice(0, 10));
        const uniqueDays = new Set(dates);
        const firstOfMonthCount = dates.filter((d: string) => d.endsWith('-01')).length;
        debugLog(`[Pokemon] Sample date granularity: ${dates.length} entries, ${uniqueDays.size} unique days, ${firstOfMonthCount} first-of-month dates`);
        if (firstOfMonthCount === dates.length) {
          debugLog(`[Pokemon] ⚠️  All sample dates are first-of-month - PriceCharting only provides monthly snapshots, not daily data`);
        }
        
        // Check if prices appear to be in dollars or cents
        const firstPrice = firstEntry[1];
        const lastPrice = lastEntry[1];
        const hasDecimals = (firstPrice % 1 !== 0) || (lastPrice % 1 !== 0);
        const isLargeNumber = firstPrice > 100 || lastPrice > 100;
        debugLog(`[Pokemon] Price analysis: hasDecimals=${hasDecimals}, isLargeNumber=${isLargeNumber}, firstPrice=${firstPrice}, lastPrice=${lastPrice}`);
        
        // If prices have decimals and are > 100, they're likely already in dollars
        // If prices are large integers (e.g., 55001), they're likely in cents
        if (hasDecimals && isLargeNumber) {
          debugLog(`[Pokemon] WARNING: Prices appear to be in DOLLARS (not cents) - will not divide by 100`);
        } else if (!hasDecimals && isLargeNumber) {
          debugLog(`[Pokemon] Prices appear to be in CENTS (large integers) - will divide by 100`);
        }
      }
    }

    const snapshots: PokemonCardPriceSnapshot[] = [];
    const byDate = new Map<string, PokemonCardPriceSnapshot>();

    // Process ungraded prices
    if (Array.isArray(historicalData.used)) {
      for (const entry of historicalData.used) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        
        const timestampMs = entry[0];
        const rawPrice = entry[1];
        
        if (typeof timestampMs !== 'number' || typeof rawPrice !== 'number' || rawPrice <= 0) {
          continue;
        }

        // Convert timestamp to YYYY-MM-DD
        const date = new Date(timestampMs);
        const dateStr = date.toISOString().slice(0, 10);
        
        // PriceCharting's chart_data stores prices in CENTS as integers
        // However, we need to check if the value is already in dollars (decimal > 100)
        // Examples: 
        // - 55001 (integer) = cents → $550.01
        // - 550.01 (decimal) = already dollars → $550.01 (don't divide)
        // - 550 (integer < 1000) = ambiguous, but likely cents if > 100
        let price: number;
        const isInteger = Number.isInteger(rawPrice);
        const hasDecimals = rawPrice % 1 !== 0;
        
        if (isInteger && rawPrice > 1000) {
          // Large integer (e.g., 55001) = definitely cents
          price = rawPrice / 100;
        } else if (hasDecimals && rawPrice > 100) {
          // Decimal > 100 (e.g., 550.01) = already in dollars
          price = rawPrice;
        } else if (isInteger && rawPrice > 100 && rawPrice <= 1000) {
          // Medium integer (e.g., 550) = likely cents for card prices
          price = rawPrice / 100;
        } else if (hasDecimals && rawPrice < 100) {
          // Small decimal (e.g., 5.50) = could be dollars or cents
          // For card prices, if > 1, likely dollars; if < 1, might be cents
          price = rawPrice > 1 ? rawPrice : rawPrice / 100;
        } else {
          // Integer < 100 = likely cents
          price = rawPrice / 100;
        }
        
        // Debug: Log first few prices to verify conversion
        if (historicalData.used.indexOf(entry) < 3) {
          debugLog(`[Pokemon] Raw price (cents): ${rawPrice}, Converted (dollars): ${price}, Date: ${dateStr}`);
        }

        // Get or create snapshot for this date
        let snapshot = byDate.get(dateStr);
        if (!snapshot) {
          snapshot = {
            cardId: card.id,
            date: dateStr,
            source: 'pricecharting',
            currency: 'USD',
          };
          byDate.set(dateStr, snapshot);
        }
        snapshot.ungradedPrice = price;
      }
    }

    // Process PSA 10 prices from VGPC monthly data
    // IMPORTANT: We'll use monthly prices to fill ALL days in the month, not just the first
    // This helps when daily PSA 10 sales are sparse
    const monthlyPsa10Prices = new Map<string, number>(); // month (YYYY-MM) -> price
    
    if (Array.isArray(historicalData['manual-only'])) {
      for (const entry of historicalData['manual-only']) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        
        const timestampMs = entry[0];
        const rawPrice = entry[1];
        
        if (typeof timestampMs !== 'number' || typeof rawPrice !== 'number' || rawPrice <= 0) {
          continue;
        }

        // Convert timestamp to YYYY-MM-DD
        const date = new Date(timestampMs);
        const dateStr = date.toISOString().slice(0, 10);
        const monthStr = dateStr.slice(0, 7); // YYYY-MM
        
        // PriceCharting's chart_data stores prices in CENTS as integers
        // However, we need to check if the value is already in dollars (decimal > 100)
        // Same logic as ungraded prices above
        let price: number;
        const isInteger = Number.isInteger(rawPrice);
        const hasDecimals = rawPrice % 1 !== 0;
        
        if (isInteger && rawPrice > 1000) {
          // Large integer (e.g., 179850) = definitely cents
          price = rawPrice / 100;
        } else if (hasDecimals && rawPrice > 100) {
          // Decimal > 100 (e.g., 1798.50) = already in dollars
          price = rawPrice;
        } else if (isInteger && rawPrice > 100 && rawPrice <= 1000) {
          // Medium integer (e.g., 375) = likely cents for card prices
          price = rawPrice / 100;
        } else if (hasDecimals && rawPrice < 100) {
          // Small decimal (e.g., 3.75) = could be dollars or cents
          // For card prices, if > 1, likely dollars; if < 1, might be cents
          price = rawPrice > 1 ? rawPrice : rawPrice / 100;
        } else {
          // Integer < 100 = likely cents
          price = rawPrice / 100;
        }
        
        // Store monthly price (will use for all days in the month)
        monthlyPsa10Prices.set(monthStr, price);
        
        // Debug: Log first few prices to verify conversion
        if (historicalData['manual-only'].indexOf(entry) < 3) {
          debugLog(`[Pokemon] PSA10 Raw price (cents): ${rawPrice}, Converted (dollars): ${price}, Date: ${dateStr}, Month: ${monthStr}`);
        }

        // Also set for the first of the month (for backward compatibility)
        const firstOfMonth = `${monthStr}-01`;
        let snapshot = byDate.get(firstOfMonth);
        if (!snapshot) {
          snapshot = {
            cardId: card.id,
            date: firstOfMonth,
            source: 'pricecharting',
            currency: 'USD',
          };
          byDate.set(firstOfMonth, snapshot);
        }
        snapshot.psa10Price = price;
      }
    }
    
    // After processing daily sales, fill in PSA 10 prices for all days in months where we have monthly data
    // This helps when PSA 10 daily sales are sparse
    if (monthlyPsa10Prices.size > 0) {
      debugLog(`[Pokemon] Found ${monthlyPsa10Prices.size} months with PSA 10 monthly data - will use to fill gaps`);
    }

    // Process daily sales data from price history tables (if available)
    // This gives us REAL daily data instead of just monthly snapshots
    if (historicalData.dailySales && historicalData.dailySales.length > 0) {
      debugLog(`[Pokemon] Processing ${historicalData.dailySales.length} daily sales records...`);
      
      // Debug: Count conditions to see what we're detecting
      const conditionCounts = { psa10: 0, graded: 0, ungraded: 0, unknown: 0 };
      for (const sale of historicalData.dailySales) {
        conditionCounts[sale.condition as keyof typeof conditionCounts] = 
          (conditionCounts[sale.condition as keyof typeof conditionCounts] || 0) + 1;
      }
      debugLog(`[Pokemon] Condition breakdown: PSA 10: ${conditionCounts.psa10}, Graded: ${conditionCounts.graded}, Ungraded: ${conditionCounts.ungraded}, Unknown: ${conditionCounts.unknown}`);
      
      // Group sales by date and condition, then calculate average prices per day
      const salesByDate = new Map<string, { ungraded: number[]; psa10: number[] }>();
      
      for (const sale of historicalData.dailySales) {
        if (!salesByDate.has(sale.date)) {
          salesByDate.set(sale.date, { ungraded: [], psa10: [] });
        }
        const dayData = salesByDate.get(sale.date)!;
        
        if (sale.condition === 'psa10') {
          dayData.psa10.push(sale.price);
        } else {
          // Treat ungraded, graded (non-PSA10), and unknown as ungraded
          dayData.ungraded.push(sale.price);
        }
      }
      
      // Create snapshots from daily sales (average prices per day)
      let dailySnapshotsCreated = 0;
      let dailySnapshotsUpdated = 0;
      let ungradedDays = 0;
      let psa10Days = 0;
      
      for (const [date, prices] of salesByDate.entries()) {
        let snapshot = byDate.get(date);
        const isNew = !snapshot;
        
        if (!snapshot) {
          snapshot = {
            cardId: card.id,
            date,
            source: 'pricecharting',
            currency: 'USD',
          };
          byDate.set(date, snapshot);
          dailySnapshotsCreated++;
        }
        
        // Use average price for the day (more accurate than single sale)
        // Daily sales data takes precedence over monthly VGPC data
        if (prices.ungraded.length > 0) {
          const avgUngraded = prices.ungraded.reduce((a, b) => a + b, 0) / prices.ungraded.length;
          // Daily sales data is more accurate, so always use it (even if VGPC data exists)
          snapshot.ungradedPrice = avgUngraded;
          ungradedDays++;
          if (!isNew) dailySnapshotsUpdated++;
        }
        
        if (prices.psa10.length > 0) {
          const avgPsa10 = prices.psa10.reduce((a, b) => a + b, 0) / prices.psa10.length;
          // Daily sales data is more accurate, so always use it (even if VGPC data exists)
          snapshot.psa10Price = avgPsa10;
          psa10Days++;
          if (!isNew && snapshot.ungradedPrice === undefined) dailySnapshotsUpdated++;
        } else if (snapshot.psa10Price === undefined) {
          // If no daily PSA 10 sales for this date, keep VGPC monthly data if available
          // This helps fill gaps when PSA 10 sales are sparse
          // (VGPC data was already set above if it exists for this date)
        }
      }
      
      debugLog(`[Pokemon] ✅ Daily sales processing complete:`);
      debugLog(`[Pokemon]    - ${salesByDate.size} unique days with sales data`);
      debugLog(`[Pokemon]    - ${dailySnapshotsCreated} new daily snapshots created`);
      debugLog(`[Pokemon]    - ${dailySnapshotsUpdated} existing snapshots updated with daily data`);
      debugLog(`[Pokemon]    - ${ungradedDays} days with ungraded prices`);
      debugLog(`[Pokemon]    - ${psa10Days} days with PSA 10 prices`);
      
      // Show date range of daily data
      if (salesByDate.size > 0) {
        const sortedDates = Array.from(salesByDate.keys()).sort();
        const firstDate = sortedDates[0]!;
        const lastDate = sortedDates[sortedDates.length - 1]!;
        debugLog(`[Pokemon]    - Date range: ${firstDate} to ${lastDate}`);
      }
    }
    
    // Fill in PSA 10 prices for all days in months where we have monthly VGPC data
    // This helps when daily PSA 10 sales are sparse - use monthly average for all days in that month
    // This prevents the index from being skewed toward recent data when PSA 10 sales are rare
    if (monthlyPsa10Prices.size > 0) {
      const allDates = Array.from(byDate.keys());
      let filledDays = 0;
      
      for (const [monthStr, monthlyPrice] of monthlyPsa10Prices.entries()) {
        // Get all dates in this month that we have snapshots for
        const monthDates = allDates.filter(d => d.startsWith(monthStr));
        
        for (const dateStr of monthDates) {
          const snapshot = byDate.get(dateStr);
          if (snapshot && snapshot.psa10Price === undefined) {
            // Only fill if we don't already have daily sales data for this date
            // Daily sales data takes precedence (was set above)
            snapshot.psa10Price = monthlyPrice;
            filledDays++;
          }
        }
      }
      
      if (filledDays > 0) {
        debugLog(`[Pokemon] Filled ${filledDays} days with PSA 10 monthly prices (to reduce skew from sparse daily data)`);
        debugLog(`[Pokemon]    - This helps balance the index when PSA 10 sales are rare`);
      }
    }

    // Convert map to array and sort by date
    snapshots.push(...Array.from(byDate.values()));
    snapshots.sort((a, b) => a.date.localeCompare(b.date));

    // Debug: Log date distribution to see if we're only getting monthly data
    if (snapshots.length > 0) {
      const dates = snapshots.map(s => s.date);
      const firstDate = dates[0]!;
      const lastDate = dates[dates.length - 1]!;
      const uniqueMonths = new Set(dates.map(d => d.slice(0, 7))); // YYYY-MM
      const uniqueDays = new Set(dates);
      
      debugLog(`[Pokemon] Extracted ${snapshots.length} historical snapshots for card ${card.id}`);
      debugLog(`[Pokemon] Date range: ${firstDate} to ${lastDate}`);
      debugLog(`[Pokemon] Unique months: ${uniqueMonths.size}, Unique days: ${uniqueDays.size}`);
      debugLog(`[Pokemon] Sample dates: ${dates.slice(0, 5).join(', ')}...${dates.slice(-5).join(', ')}`);
      
      // Check if we're only getting first-of-month data
      const firstOfMonthCount = dates.filter(d => d.endsWith('-01')).length;
      if (firstOfMonthCount === dates.length) {
        debugLog(`[Pokemon] WARNING: All dates are first-of-month - PriceCharting's chart_data only provides monthly snapshots`);
        debugLog(`[Pokemon] To get daily data, you may need to use alternative data sources or scrape price history tables if available`);
      } else if (firstOfMonthCount > dates.length * 0.5) {
        debugLog(`[Pokemon] NOTE: ${firstOfMonthCount}/${dates.length} dates are first-of-month - PriceCharting may primarily provide monthly snapshots`);
      }
    }

    return snapshots;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Pokemon] Error scraping historical prices for card ${card.id}:`, errorMsg);
    
    // Re-throw timeout errors so they can be retried
    if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      throw error;
    }
    
    // For other errors, return empty array (might be no data available)
    return [];
  } finally {
    await browser.close();
  }
}

export async function refreshTodaySnapshots(settings: PokemonIndexSettings): Promise<PokemonCardPriceSnapshot[]> {
  const today = todayIsoDate();
  const existing = await getPokemonCardPriceSnapshots();
  
  debugLog(`[Pokemon] refreshTodaySnapshots: Starting for ${settings.cards.length} cards, today=${today}`);
  debugLog(`[Pokemon] refreshTodaySnapshots: Existing snapshots: ${existing.length}`);
  
  // Safety check: Warn if we have very few snapshots, but don't block daily updates
  // This is just a warning - we still want to add today's data even if the dataset is small
  if (existing.length > 0 && existing.length < 20) {
    debugLog(`[Pokemon] Warning: Only ${existing.length} snapshots found. This might indicate data loss, but proceeding with today's update.`);
  }
  
  // Filter out test/placeholder snapshots that don't match configured cards BEFORE building the map
  // This ensures we don't accidentally think cards have data when they don't
  const configuredCardIds = new Set(settings.cards.map(c => c.id));
  const validSnapshots = existing.filter(snap => 
    configuredCardIds.has(snap.cardId) || snap.date !== today
  );
  
  console.log(`[Pokemon] refreshTodaySnapshots: Filtered ${existing.length} snapshots to ${validSnapshots.length} valid snapshots (removed ${existing.length - validSnapshots.length} test/placeholder snapshots)`);
  
  const byCardAndDate = new Map<string, PokemonCardPriceSnapshot>();
  for (const snap of validSnapshots) {
    byCardAndDate.set(`${snap.cardId}:${snap.date}`, snap);
  }

  // Start with filtered snapshots, not all existing ones
  const updated: PokemonCardPriceSnapshot[] = [...validSnapshots];

  let addedToday = false;
  let scrapedCount = 0;
  let errorCount = 0;

  for (const card of settings.cards) {
    const key = `${card.id}:${today}`;
    if (byCardAndDate.has(key)) {
      debugLog(`[Pokemon] Card ${card.id} (${card.name}) already has today's (${today}) data, skipping`);
      continue; // Already have today's data for this card
    }

    debugLog(`[Pokemon] Scraping today's (${today}) price for card ${card.id} (${card.name})`);
    try {
      scrapedCount++;
      const scraped = await scrapePriceChartingForCard(card);
      
      // Check if we got any prices
      if (!scraped.ungradedPrice && !scraped.psa10Price) {
        debugLog(`[Pokemon] Warning: No prices scraped for card ${card.id} (${card.name}) - both ungraded and psa10 are undefined`);
        errorCount++;
        // Still add the snapshot with undefined prices - this allows us to track that we tried
        // The index calculation will handle missing prices gracefully
        const snapshot: PokemonCardPriceSnapshot = {
          cardId: card.id,
          date: today,
          ...scraped,
        };
        updated.push(snapshot);
        byCardAndDate.set(key, snapshot);
        addedToday = true; // Mark as added even if prices are undefined
        continue;
      }
      
      const snapshot: PokemonCardPriceSnapshot = {
        cardId: card.id,
        date: today,
        ...scraped,
      };
      updated.push(snapshot);
      byCardAndDate.set(key, snapshot);
      addedToday = true;
      debugLog(`[Pokemon] Successfully scraped ${card.id}: ungraded=$${scraped.ungradedPrice || 'N/A'}, psa10=$${scraped.psa10Price || 'N/A'}`);
    } catch (error) {
      errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Pokemon] Failed to scrape card ${card.id} (${card.name}):`, errorMsg);
      debugLog(`[Pokemon] Error details: ${errorMsg}`);
      
      // Add a snapshot with undefined prices to track that we tried
      // This ensures we don't keep retrying the same card repeatedly
      const snapshot: PokemonCardPriceSnapshot = {
        cardId: card.id,
        date: today,
        ungradedPrice: undefined,
        psa10Price: undefined,
        source: 'pricecharting',
        currency: 'USD',
      };
      updated.push(snapshot);
      byCardAndDate.set(key, snapshot);
      addedToday = true; // Mark as added so we save the attempt
      // Continue with other cards even if one fails
    }
  }

  debugLog(`[Pokemon] refreshTodaySnapshots: Scraped ${scrapedCount} cards, errors: ${errorCount}, addedToday: ${addedToday}`);
  
  // Always save if we attempted to scrape (even if all failed)
  // This ensures we track attempts and don't keep retrying the same cards
  const newCount = updated.length - validSnapshots.length;
  console.log(`[Pokemon] refreshTodaySnapshots summary: existing=${existing.length}, valid=${validSnapshots.length}, updated=${updated.length}, new=${newCount}, addedToday=${addedToday}, scrapedCount=${scrapedCount}, errorCount=${errorCount}`);
  
  if (addedToday || newCount > 0) {
    debugLog(`[Pokemon] Saving ${updated.length} total snapshots (${newCount} new for today)`);
    console.log(`[Pokemon] About to save: existing=${existing.length}, valid=${validSnapshots.length}, updated=${updated.length}, new=${newCount}, addedToday=${addedToday}`);
    try {
      await setPokemonCardPriceSnapshots(updated);
      debugLog(`[Pokemon] Successfully saved today's (${today}) price data`);
      console.log(`[Pokemon] ✅ Successfully saved ${updated.length} snapshots to Redis`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Pokemon] ❌ Failed to save today's snapshots:`, errorMsg);
      console.error(`[Pokemon] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  } else {
    debugLog(`[Pokemon] All cards already have today's (${today}) price data, skipping save`);
    console.log(`[Pokemon] ⚠️  No new data to save: addedToday=${addedToday}, scrapedCount=${scrapedCount}, errorCount=${errorCount}`);
  }
  
  return updated;
}

export function buildIndexSeriesFromSnapshots(
  snapshots: PokemonCardPriceSnapshot[],
  settings: PokemonIndexSettings,
): PokemonIndexPoint[] {
  if (!settings.cards.length || !snapshots.length) return [];

  // Filter out ignored snapshots - they should not be used in index calculations
  const validSnapshots = snapshots.filter(snap => !snap.ignored);

  const byCard = new Map<string, PokemonCardPriceSnapshot[]>();
  for (const snap of validSnapshots) {
    if (!byCard.has(snap.cardId)) {
      byCard.set(snap.cardId, []);
    }
    byCard.get(snap.cardId)!.push(snap);
  }
  for (const list of byCard.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const dates = Array.from(
    new Set(snapshots.map((s) => s.date)),
  ).sort((a, b) => a.localeCompare(b));

  // Find the earliest date where we have data for at least one card
  const earliestDate = dates.length > 0 ? dates[0]! : null;
  if (!earliestDate) {
    return [];
  }

  // Calculate base prices using the earliest date where each card has data
  // This ensures we have a consistent base for normalization
  const basePrices = new Map<string, number>();
  const cardsInBase = new Set<string>();
  
  for (const card of settings.cards) {
    const list = byCard.get(card.id);
    if (!list || !list.length) continue;

    // Find the first snapshot with a valid price for this card's condition
    for (const snap of list) {
      if (snap.ignored) continue;
      const price = pickPriceForCondition(snap, card.conditionType);
      if (price !== undefined) {
        basePrices.set(card.id, price);
        cardsInBase.add(card.id);
        break; // Use the first available price as base
      }
    }
  }

  // Calculate base sum using only cards that have data
  // This is our normalization factor
  let baseSum = 0;
  for (const card of settings.cards) {
    if (!cardsInBase.has(card.id)) continue; // Only include cards with data
    const basePrice = basePrices.get(card.id);
    if (basePrice !== undefined && card.weight > 0) {
      baseSum += card.weight * basePrice;
    }
  }
  if (baseSum <= 0) {
    return [];
  }

  // Calculate the actual sum for the earliest date to normalize to 100
  // This ensures the index starts at 100 for the first date
  let earliestDateSum = 0;
  for (const card of settings.cards) {
    if (!cardsInBase.has(card.id)) continue;
    const list = byCard.get(card.id);
    if (!list) continue;
    
    let priceForEarliestDate: number | undefined;
    for (const snap of list) {
      if (snap.date > earliestDate) break;
      if (snap.ignored) continue;
      const price = pickPriceForCondition(snap, card.conditionType);
      if (price !== undefined) {
        priceForEarliestDate = price;
      }
    }
    
    // If no data for earliest date, use base price
    if (priceForEarliestDate === undefined) {
      priceForEarliestDate = basePrices.get(card.id);
    }
    
    if (priceForEarliestDate !== undefined && card.weight > 0) {
      earliestDateSum += card.weight * priceForEarliestDate;
    }
  }
  
  // Normalize base sum so the earliest date equals 100
  // This ensures continuity and proper normalization
  if (earliestDateSum > 0) {
    baseSum = earliestDateSum; // Use the actual earliest date sum as the base
  }

  const lastKnown = new Map<string, number>();
  const series: PokemonIndexPoint[] = [];

  for (const date of dates) {
    let dailySum = 0;

    for (const card of settings.cards) {
      // Only include cards that are in the base (have data at some point)
      if (!cardsInBase.has(card.id)) continue;
      
      const list = byCard.get(card.id);
      if (!list) continue;

      let priceForDate: number | undefined;
      for (const snap of list) {
        if (snap.date > date) break;
        if (snap.ignored) continue; // Skip ignored snapshots
        const price = pickPriceForCondition(snap, card.conditionType);
        if (price !== undefined) {
          priceForDate = price;
        }
      }

      // If no data for this date, use base price (not last known)
      // This keeps the index smooth - cards without data yet use their base price
      // Once they have data, we use actual prices
      if (priceForDate === undefined) {
        priceForDate = basePrices.get(card.id);
      }

      if (priceForDate !== undefined && card.weight > 0) {
        dailySum += card.weight * priceForDate;
        // Track last known actual price (not base price) for reference
        if (priceForDate !== basePrices.get(card.id)) {
          lastKnown.set(card.id, priceForDate);
        }
      }
    }

    // Use the fixed base sum for normalization
    // This ensures continuity - the index won't jump when new cards get data
    if (dailySum <= 0) continue;

    const indexValue = (100 * dailySum) / baseSum;
    series.push({ date, indexValue: round2(indexValue) });
  }

  // Add moving averages
  addMovingAverages(series, 7, 'ma7');
  addMovingAverages(series, 30, 'ma30');
  addMovingAverages(series, 120, 'ma120');
  
  // Add MACD (Moving Average Convergence Divergence)
  addMACD(series);
  
  // Add Rate of Change
  addRateOfChange(series, 7, 'roc7');
  addRateOfChange(series, 30, 'roc30');

  return series;
}

function pickPriceForCondition(
  snap: PokemonCardPriceSnapshot,
  condition: PokemonCardConfig['conditionType'],
): number | undefined {
  if (condition === 'ungraded') return snap.ungradedPrice;
  if (condition === 'psa10') return snap.psa10Price;

  const prices: number[] = [];
  if (typeof snap.ungradedPrice === 'number') prices.push(snap.ungradedPrice);
  if (typeof snap.psa10Price === 'number') prices.push(snap.psa10Price);
  if (!prices.length) return undefined;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function addMovingAverages(
  series: PokemonIndexPoint[],
  window: number,
  field: 'ma7' | 'ma30' | 'ma120',
): void {
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    const sum = slice.reduce((acc, p) => acc + p.indexValue, 0);
    const avg = sum / slice.length;
    series[i]![field] = round2(avg);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  
  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < Math.min(period, values.length); i++) {
    sum += values[i]!;
  }
  ema.push(sum / Math.min(period, values.length));
  
  // Calculate EMA for remaining values
  for (let i = 1; i < values.length; i++) {
    const currentEMA = (values[i]! - ema[i - 1]!) * multiplier + ema[i - 1]!;
    ema.push(currentEMA);
  }
  
  return ema;
}

/**
 * Add MACD (Moving Average Convergence Divergence) indicators
 * MACD = 12-day EMA - 26-day EMA
 * Signal = 9-day EMA of MACD
 * Histogram = MACD - Signal
 */
function addMACD(series: PokemonIndexPoint[]): void {
  if (series.length < 26) return; // Need at least 26 points for MACD
  
  const values = series.map(p => p.indexValue);
  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);
  
  // Calculate MACD line
  const macd: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i >= 25) { // MACD starts after 26-day EMA is available
      macd.push(round2(ema12[i]! - ema26[i]!));
    } else {
      macd.push(NaN);
    }
  }
  
  // Calculate Signal line (9-day EMA of MACD)
  const validMacd = macd.filter(v => !isNaN(v));
  const signalEMA = calculateEMA(validMacd, 9);
  
  // Assign MACD and Signal to series
  let signalIndex = 0;
  for (let i = 0; i < series.length; i++) {
    if (!isNaN(macd[i]!)) {
      series[i]!.macd = macd[i];
      if (signalIndex < signalEMA.length && i >= 33) { // Signal starts after 26 + 9 - 1 = 34 points
        series[i]!.macdSignal = round2(signalEMA[signalIndex]!);
        series[i]!.macdHistogram = round2(macd[i]! - signalEMA[signalIndex]!);
        signalIndex++;
      }
    }
  }
}

/**
 * Add Rate of Change (ROC) - percentage change over N periods
 */
function addRateOfChange(series: PokemonIndexPoint[], period: number, field: 'roc7' | 'roc30'): void {
  for (let i = period; i < series.length; i++) {
    const currentValue = series[i]!.indexValue;
    const pastValue = series[i - period]!.indexValue;
    if (pastValue > 0) {
      const roc = ((currentValue - pastValue) / pastValue) * 100;
      series[i]![field] = round2(roc);
    }
  }
}

export async function ensurePokemonIndexUpToDate(
  settings: PokemonIndexSettings,
): Promise<PokemonIndexPoint[]> {
  const today = todayIsoDate();
  const snapshots = await getPokemonCardPriceSnapshots();
  
  debugLog(`[Pokemon] ensurePokemonIndexUpToDate: Checking ${snapshots.length} existing snapshots for today (${today})`);
  
  // Filter out test/placeholder snapshots that don't match configured cards
  const configuredCardIds = new Set(settings.cards.map(c => c.id));
  const validSnapshots = snapshots.filter(snap => 
    configuredCardIds.has(snap.cardId) || snap.date !== today
  );
  
  console.log(`[Pokemon] ensurePokemonIndexUpToDate: Filtered ${snapshots.length} snapshots to ${validSnapshots.length} valid snapshots (removed test/placeholder snapshots)`);
  
  // Check if all configured cards have snapshots for today
  // If any card is missing today's snapshot, we need to refresh
  const byCardAndDate = new Map<string, PokemonCardPriceSnapshot>();
  for (const snap of validSnapshots) {
    byCardAndDate.set(`${snap.cardId}:${snap.date}`, snap);
  }
  
  const missingCards = settings.cards.filter((card) => {
    const key = `${card.id}:${today}`;
    const snapshot = byCardAndDate.get(key);
    if (!snapshot) {
      return true; // No snapshot for this card+date
    }
    // Check if the snapshot has the required price for this card's condition
    const hasRequiredPrice = 
      (card.conditionType === 'ungraded' && snapshot.ungradedPrice !== undefined) ||
      (card.conditionType === 'psa10' && snapshot.psa10Price !== undefined) ||
      (card.conditionType === 'both' && (snapshot.ungradedPrice !== undefined || snapshot.psa10Price !== undefined));
    return !hasRequiredPrice; // Missing if snapshot doesn't have the required price
  });

  console.log(`[Pokemon] ensurePokemonIndexUpToDate: ${missingCards.length} cards missing today's data out of ${settings.cards.length} configured cards`);
  if (missingCards.length > 0) {
    console.log(`[Pokemon] Missing cards: ${missingCards.map(c => `${c.id} (${c.name})`).join(', ')}`);
  }

  let updatedSnapshots = validSnapshots;
  if (missingCards.length > 0) {
    console.log(`[Pokemon] ensurePokemonIndexUpToDate: Calling refreshTodaySnapshots for ${missingCards.length} missing cards`);
    debugLog(`[Pokemon] ensurePokemonIndexUpToDate: Calling refreshTodaySnapshots for ${missingCards.length} missing cards`);
    // Refresh snapshots - this will only scrape cards that don't have today's data
    updatedSnapshots = await refreshTodaySnapshots(settings);
    console.log(`[Pokemon] ensurePokemonIndexUpToDate: refreshTodaySnapshots returned ${updatedSnapshots.length} snapshots`);
    debugLog(`[Pokemon] ensurePokemonIndexUpToDate: refreshTodaySnapshots returned ${updatedSnapshots.length} snapshots`);
  } else {
    console.log(`[Pokemon] ensurePokemonIndexUpToDate: All cards have today's data, skipping refresh`);
    debugLog(`[Pokemon] ensurePokemonIndexUpToDate: All cards have today's data, skipping refresh`);
  }

  const series = buildIndexSeriesFromSnapshots(updatedSnapshots, settings);
  await setPokemonIndexSeries(series);
  return series;
}

export async function getOrBuildPokemonIndexSeries(
  settings: PokemonIndexSettings,
): Promise<PokemonIndexPoint[]> {
  const existing = await getPokemonIndexSeries();
  
  // Check if existing series has the new indicators (ma7, macd, roc7)
  // If not, rebuild it to include them
  const needsRebuild = existing.length > 0 && existing.some(point => 
    point.ma7 === undefined && point.macd === undefined && point.roc7 === undefined
  );
  
  if (existing.length > 0 && !needsRebuild) {
    return existing;
  }
  
  // Rebuild from snapshots to ensure we have all indicators
  const snapshots = await getPokemonCardPriceSnapshots();
  const rebuilt = buildIndexSeriesFromSnapshots(snapshots, settings);
  await setPokemonIndexSeries(rebuilt);
  return rebuilt;
}


