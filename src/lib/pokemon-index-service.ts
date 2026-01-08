import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { logDebug } from '@/lib/logger';
import { EASTERN_TIME_ZONE } from '@/lib/timezone';
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
  // Use Eastern Time to get the actual current date
  // This ensures consistent date handling regardless of server timezone (Vercel runs in UTC)
  // When cronjob runs at 3 AM UTC, it's still the previous day in Eastern Time
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}


/**
 * Check if an error is retryable (timeout, network, rate limit, browser closure, resource exhaustion)
 */
function isRetryableError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const lowerMsg = errorMsg.toLowerCase();
  
  return (
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('network') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('429') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('too many requests') ||
    lowerMsg.includes('page load timeout') ||
    lowerMsg.includes('vgpc object timeout') ||
    lowerMsg.includes('browser has been closed') ||
    lowerMsg.includes('target page, context or browser has been closed') ||
    lowerMsg.includes('target closed') ||
    lowerMsg.includes('browser closed') ||
    lowerMsg.includes('page closed') ||
    lowerMsg.includes('err_insufficient_resources') ||
    lowerMsg.includes('insufficient resources') ||
    lowerMsg.includes('err_insufficient') ||
    lowerMsg.includes('out of memory') ||
    lowerMsg.includes('memory') ||
    lowerMsg.includes('resource')
  );
}

export async function scrapePriceChartingForCard(
  card: PokemonCardConfig,
): Promise<Omit<PokemonCardPriceSnapshot, 'cardId' | 'date'>> {
  // For now we assume the card.id is the full path segment for a PriceCharting product page,
  // e.g. "pokemon-base-set-charizard-4" and we hit /game/{id}.
  const url = `https://www.pricecharting.com/game/${encodeURIComponent(card.id)}`;

  logDebug(`[Pokemon] Scraping PriceCharting for card ${card.name} (${card.id}) -> ${url}`);

  // Increased retries for better reliability with network issues
  const MAX_RETRIES = 5;
  let lastError: Error | null = null;

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    
      try {
        if (attempt > 1) {
          // Check if previous error was resource-related - use longer backoff
          const isResourceError = lastError && (
            lastError.message.includes('ERR_INSUFFICIENT_RESOURCES') ||
            lastError.message.includes('insufficient resources') ||
            lastError.message.includes('out of memory') ||
            lastError.message.includes('memory')
          );
          
          let backoffMs: number;
          if (isResourceError) {
            // Longer backoff for resource errors to allow system to recover
            backoffMs = Math.pow(2, attempt - 2) * 5000; // 5s, 10s, 20s
            logDebug(`[Pokemon] Resource error detected - using longer backoff: ${backoffMs}ms`);
          } else {
            // Normal backoff for other errors
            backoffMs = Math.pow(2, attempt - 2) * 2000; // 2s, 4s, 8s
          }
          
          logDebug(`[Pokemon] Retry attempt ${attempt}/${MAX_RETRIES} for card ${card.id} after ${backoffMs}ms backoff`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }

        // Add a small delay before launching browser to allow resources to free up
        // This is especially important after resource errors
        if (attempt > 1 && lastError && (
          lastError.message.includes('ERR_INSUFFICIENT_RESOURCES') ||
          lastError.message.includes('insufficient resources')
        )) {
          logDebug(`[Pokemon] Waiting additional 2s before browser launch to allow resource recovery`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Optimize browser launch for serverless environments with limited resources
        // Add memory-efficient flags to reduce resource usage
        const browserArgs = [
          ...chromiumPkg.args,
          '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm (limited in serverless)
          '--disable-gpu', // Disable GPU (not available in serverless)
          '--disable-software-rasterizer', // Reduce memory usage
          '--disable-extensions', // Disable extensions to save memory
          '--disable-background-networking', // Reduce background activity
          '--disable-background-timer-throttling', // Reduce background activity
          '--disable-renderer-backgrounding', // Reduce background activity
          '--disable-backgrounding-occluded-windows', // Reduce background activity
          '--disable-features=TranslateUI', // Disable translation features
          '--disable-ipc-flooding-protection', // Reduce IPC overhead
          '--memory-pressure-off', // Disable memory pressure handling
          '--max_old_space_size=512', // Limit memory usage (MB)
        ];
        
        browser = await chromium.launch({
          args: browserArgs,
          executablePath: await chromiumPkg.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar',
          ),
          headless: true,
        });

      // Reduce viewport size to save memory in serverless environment
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }, // Reduced from 1920x1080 to save memory
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });
      const page = await context.newPage();

      // Set up response listener to detect 429 rate limit errors
      let rateLimited = false;
      const responseHandler = (response: { status?: () => number }) => {
        if (response && response.status?.() === 429) {
          rateLimited = true;
        }
      };
      page.on('response', responseHandler);

      try {
        // Check if browser is still open before navigation
        if (!browser || !browser.isConnected()) {
          throw new Error('Browser closed before navigation');
        }
        
        // Increased timeout for API routes - Playwright can be slow in serverless environments
        // Use 'domcontentloaded' instead of 'networkidle' for faster, more reliable loading
        // 'networkidle' can timeout if the page has continuous network activity
        let response;
        try {
          response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); // 90 seconds
        } catch (gotoError) {
          const errorMsg = gotoError instanceof Error ? gotoError.message : String(gotoError);
          // Check if browser/page was closed during navigation
          if (errorMsg.includes('Target page, context or browser has been closed') || 
              errorMsg.includes('browser has been closed') ||
              errorMsg.includes('Target closed')) {
            logDebug(`[Pokemon] Browser closed during navigation for card ${card.id}, will retry`);
            throw new Error(`Browser closed during navigation: ${errorMsg}`);
          }
          throw gotoError;
        }
        
        // Check if browser is still open after navigation
        if (!browser || !browser.isConnected()) {
          throw new Error('Browser closed after navigation');
        }
        
        // Check for 429 rate limit response
        if (response && response.status() === 429) {
          rateLimited = true;
          const retryAfter = response.headers()['retry-after'];
          if (retryAfter) {
            const waitTime = parseInt(retryAfter, 10) * 1000;
            logDebug(`[Pokemon] Rate limited (429) for card ${card.id}, Retry-After: ${retryAfter}s`);
            if (attempt < MAX_RETRIES) {
              try {
                await page.waitForTimeout(waitTime);
              } catch {
                // Page might be closed, ignore
              }
              page.off('response', responseHandler);
              try {
                await browser.close();
              } catch {
                // Browser might already be closed, ignore
              }
              continue; // Retry after waiting
            }
          }
        }
        
        if (rateLimited && attempt < MAX_RETRIES) {
          const waitTime = Math.pow(2, attempt) * 5000; // 10s, 20s, 40s for rate limits
          logDebug(`[Pokemon] Rate limited for card ${card.id}, waiting ${waitTime}ms before retry`);
          try {
            await page.waitForTimeout(waitTime);
          } catch {
            // Page might be closed, ignore
          }
          page.off('response', responseHandler);
          try {
            await browser.close();
          } catch {
            // Browser might already be closed, ignore
          }
          continue;
        }
        
        // Check if browser is still open before waiting for elements
        if (!browser || !browser.isConnected()) {
          throw new Error('Browser closed before element wait');
        }
        
        // Wait for the price table to be visible
        try {
          await page.waitForSelector('#price_data', { timeout: 20000 }); // Increased to 20s
        } catch (selectorError) {
          // Check if browser closed during wait
          if (!browser || !browser.isConnected()) {
            throw new Error('Browser closed during selector wait');
          }
          // Check if error is due to page/browser closure
          const errorMsg = selectorError instanceof Error ? selectorError.message : String(selectorError);
          if (errorMsg.includes('Target page, context or browser has been closed') || 
              errorMsg.includes('browser has been closed') ||
              errorMsg.includes('Target closed')) {
            throw new Error(`Browser closed during selector wait: ${errorMsg}`);
          }
          // Continue even if selector doesn't appear - might be a different page structure
          logDebug(`[Pokemon] Price table selector not found for card ${card.id}, continuing with extraction`);
        }
        
        // Wait for VGPC object to be available (it's set by inline script)
        try {
          await page.waitForFunction(() => {
            // VGPC is a dynamic property added by the page's JavaScript
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vgpc = (globalThis as any).VGPC;
            return typeof vgpc !== 'undefined' && vgpc?.chart_data !== undefined;
          }, { timeout: 15000 }); // Increased to 15s
        } catch (vgpcError) {
          // Check if browser closed during wait
          if (!browser || !browser.isConnected()) {
            throw new Error('Browser closed during VGPC wait');
          }
          // Check if error is due to page/browser closure
          const errorMsg = vgpcError instanceof Error ? vgpcError.message : String(vgpcError);
          if (errorMsg.includes('Target page, context or browser has been closed') || 
              errorMsg.includes('browser has been closed') ||
              errorMsg.includes('Target closed')) {
            throw new Error(`Browser closed during VGPC wait: ${errorMsg}`);
          }
          // VGPC might not be available, continue with DOM-based extraction
          logDebug(`[Pokemon] VGPC object not found for card ${card.id}, using DOM-based extraction`);
        }
        
        // Check again before evaluate
        if (!browser || !browser.isConnected()) {
          throw new Error('Browser closed before evaluate');
        }
        
        // Give a moment for any remaining JavaScript to finish executing
        await page.waitForTimeout(1000);
        
        // Final check before evaluate
        if (!browser || !browser.isConnected()) {
          throw new Error('Browser closed after timeout');
        }

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

        // Clean up response handler
        try {
          page.off('response', responseHandler);
        } catch {
          // Page might be closed, ignore
        }
        
        // Clean up browser
        if (browser) {
          try {
            if (browser.isConnected()) {
              await browser.close();
            }
          } catch (closeError) {
            // Browser might already be closed, ignore
            logDebug(`[Pokemon] Browser already closed during success cleanup: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
          }
          browser = null;
        }

        logDebug(`[Pokemon] Successfully scraped prices for card ${card.id} (attempt ${attempt}/${MAX_RETRIES})`, { 
          card: card.id, 
          ungraded, 
          psa10, 
          debugInfo 
        });

        return {
          ungradedPrice: ungraded,
          psa10Price: psa10,
          source: 'pricecharting',
          currency: 'USD',
        };
      } catch (error) {
        // Clean up response handler
        try {
          page.off('response', responseHandler);
        } catch {
          // Page might be closed, ignore
        }
        
        // Clean up browser - handle case where it might already be closed
        if (browser) {
          try {
            if (browser.isConnected()) {
              await browser.close();
            }
          } catch (closeError) {
            // Browser might already be closed, ignore
            logDebug(`[Pokemon] Browser already closed during cleanup: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
          }
          browser = null;
        }
        
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;
        const isRetryable = isRetryableError(lastError);
        
        logDebug(`[Pokemon] Scraping attempt ${attempt}/${MAX_RETRIES} failed for card ${card.id}: ${errorMsg}`, {
          isRetryable,
          rateLimited,
        });
        
        if (attempt < MAX_RETRIES && (isRetryable || rateLimited)) {
          // Will retry on next iteration
          continue;
        }
        
        // Final attempt failed or non-retryable error
        throw lastError;
      }
    } catch (error) {
      // Outer catch - handle browser launch/context creation errors
      if (browser) {
        try {
          if (browser.isConnected()) {
            await browser.close();
          }
        } catch (closeError) {
          // Browser might already be closed, ignore
          logDebug(`[Pokemon] Browser already closed during outer cleanup: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
        }
      }
      
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message;
      const isRetryable = isRetryableError(lastError);
      
      if (attempt < MAX_RETRIES && isRetryable) {
        // Will retry on next iteration
        continue;
      }
      
      // Final attempt failed or non-retryable error
      console.error(`[Pokemon] Error scraping PriceCharting card ${card.id} (${card.name}) after ${attempt} attempts:`, errorMsg);
      logDebug(`[Pokemon] Scraping error details (final attempt): ${errorMsg}`, {
        isRetryable,
        attempt,
        maxRetries: MAX_RETRIES,
      });
      
      throw new Error(`Failed to scrape card ${card.id} after ${attempt} attempts: ${errorMsg}`);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error(`Failed to scrape card ${card.id}: Max retries exceeded`);
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

  logDebug(`[Pokemon] Scraping historical prices for card ${card.name} (${card.id}) -> ${url}`);

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
        logDebug(`[Pokemon] Page load timeout for card ${card.id}`);
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
        logDebug(`[Pokemon] VGPC object timeout for card ${card.id}`);
        throw new Error(`VGPC object timeout: ${errorMsg}`);
      }
      logDebug('[Pokemon] VGPC object not found, cannot extract historical data');
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
    logDebug(`[Pokemon] Raw data points - used: ${historicalData.used?.length || 0}, manual-only: ${historicalData['manual-only']?.length || 0}`);
    if (historicalData.dailySales) {
      logDebug(`[Pokemon] Found ${historicalData.dailySales.length} daily sales from price history tables!`);
    }
    
    // Log debug info about available data structures
    if (historicalData.debug) {
      logDebug(`[Pokemon] VGPC debug info:`, historicalData.debug);
    }
    
    if (historicalData.used && historicalData.used.length > 0) {
      const firstEntry = historicalData.used[0];
      const lastEntry = historicalData.used[historicalData.used.length - 1];
      if (Array.isArray(firstEntry) && Array.isArray(lastEntry)) {
        const firstDate = new Date(firstEntry[0]);
        const lastDate = new Date(lastEntry[0]);
        logDebug(`[Pokemon] Date range in raw data: ${firstDate.toISOString().slice(0, 10)} to ${lastDate.toISOString().slice(0, 10)}`);
        logDebug(`[Pokemon] Sample entries: first=${JSON.stringify(firstEntry)}, last=${JSON.stringify(lastEntry)}`);
        
        // Check date granularity - are these daily or monthly?
        const dates = historicalData.used.slice(0, 10).map((e: [number, number]) => new Date(e[0]).toISOString().slice(0, 10));
        const uniqueDays = new Set(dates);
        const firstOfMonthCount = dates.filter((d: string) => d.endsWith('-01')).length;
        logDebug(`[Pokemon] Sample date granularity: ${dates.length} entries, ${uniqueDays.size} unique days, ${firstOfMonthCount} first-of-month dates`);
        if (firstOfMonthCount === dates.length) {
          logDebug(`[Pokemon] ⚠️  All sample dates are first-of-month - PriceCharting only provides monthly snapshots, not daily data`);
        }
        
        // Check if prices appear to be in dollars or cents
        const firstPrice = firstEntry[1];
        const lastPrice = lastEntry[1];
        const hasDecimals = (firstPrice % 1 !== 0) || (lastPrice % 1 !== 0);
        const isLargeNumber = firstPrice > 100 || lastPrice > 100;
        logDebug(`[Pokemon] Price analysis: hasDecimals=${hasDecimals}, isLargeNumber=${isLargeNumber}, firstPrice=${firstPrice}, lastPrice=${lastPrice}`);
        
        // If prices have decimals and are > 100, they're likely already in dollars
        // If prices are large integers (e.g., 55001), they're likely in cents
        if (hasDecimals && isLargeNumber) {
          logDebug(`[Pokemon] WARNING: Prices appear to be in DOLLARS (not cents) - will not divide by 100`);
        } else if (!hasDecimals && isLargeNumber) {
          logDebug(`[Pokemon] Prices appear to be in CENTS (large integers) - will divide by 100`);
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
          logDebug(`[Pokemon] Raw price (cents): ${rawPrice}, Converted (dollars): ${price}, Date: ${dateStr}`);
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
          logDebug(`[Pokemon] PSA10 Raw price (cents): ${rawPrice}, Converted (dollars): ${price}, Date: ${dateStr}, Month: ${monthStr}`);
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
      logDebug(`[Pokemon] Found ${monthlyPsa10Prices.size} months with PSA 10 monthly data - will use to fill gaps`);
    }

    // Process daily sales data from price history tables (if available)
    // This gives us REAL daily data instead of just monthly snapshots
    if (historicalData.dailySales && historicalData.dailySales.length > 0) {
      logDebug(`[Pokemon] Processing ${historicalData.dailySales.length} daily sales records...`);
      
      // Debug: Count conditions to see what we're detecting
      const conditionCounts = { psa10: 0, graded: 0, ungraded: 0, unknown: 0 };
      for (const sale of historicalData.dailySales) {
        conditionCounts[sale.condition as keyof typeof conditionCounts] = 
          (conditionCounts[sale.condition as keyof typeof conditionCounts] || 0) + 1;
      }
      logDebug(`[Pokemon] Condition breakdown: PSA 10: ${conditionCounts.psa10}, Graded: ${conditionCounts.graded}, Ungraded: ${conditionCounts.ungraded}, Unknown: ${conditionCounts.unknown}`);
      
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
      
      logDebug(`[Pokemon] ✅ Daily sales processing complete:`);
      logDebug(`[Pokemon]    - ${salesByDate.size} unique days with sales data`);
      logDebug(`[Pokemon]    - ${dailySnapshotsCreated} new daily snapshots created`);
      logDebug(`[Pokemon]    - ${dailySnapshotsUpdated} existing snapshots updated with daily data`);
      logDebug(`[Pokemon]    - ${ungradedDays} days with ungraded prices`);
      logDebug(`[Pokemon]    - ${psa10Days} days with PSA 10 prices`);
      
      // Show date range of daily data
      if (salesByDate.size > 0) {
        const sortedDates = Array.from(salesByDate.keys()).sort();
        const firstDate = sortedDates[0]!;
        const lastDate = sortedDates[sortedDates.length - 1]!;
        logDebug(`[Pokemon]    - Date range: ${firstDate} to ${lastDate}`);
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
        logDebug(`[Pokemon] Filled ${filledDays} days with PSA 10 monthly prices (to reduce skew from sparse daily data)`);
        logDebug(`[Pokemon]    - This helps balance the index when PSA 10 sales are rare`);
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
      
      logDebug(`[Pokemon] Extracted ${snapshots.length} historical snapshots for card ${card.id}`);
      logDebug(`[Pokemon] Date range: ${firstDate} to ${lastDate}`);
      logDebug(`[Pokemon] Unique months: ${uniqueMonths.size}, Unique days: ${uniqueDays.size}`);
      logDebug(`[Pokemon] Sample dates: ${dates.slice(0, 5).join(', ')}...${dates.slice(-5).join(', ')}`);
      
      // Check if we're only getting first-of-month data
      const firstOfMonthCount = dates.filter(d => d.endsWith('-01')).length;
      if (firstOfMonthCount === dates.length) {
        logDebug(`[Pokemon] WARNING: All dates are first-of-month - PriceCharting's chart_data only provides monthly snapshots`);
        logDebug(`[Pokemon] To get daily data, you may need to use alternative data sources or scrape price history tables if available`);
      } else if (firstOfMonthCount > dates.length * 0.5) {
        logDebug(`[Pokemon] NOTE: ${firstOfMonthCount}/${dates.length} dates are first-of-month - PriceCharting may primarily provide monthly snapshots`);
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

export async function refreshTodaySnapshots(
  settings: PokemonIndexSettings,
  options?: { startTime?: number; maxDuration?: number }
): Promise<PokemonCardPriceSnapshot[]> {
  const today = todayIsoDate();
  const existing = await getPokemonCardPriceSnapshots();
  const startTime = options?.startTime ?? Date.now();
  const maxDuration = options?.maxDuration ?? Infinity; // Default: no timeout
  
  logDebug(`[Pokemon] refreshTodaySnapshots: Starting for ${settings.cards.length} cards, today=${today}`);
  logDebug(`[Pokemon] refreshTodaySnapshots: Existing snapshots: ${existing.length}`);
  if (maxDuration !== Infinity) {
    logDebug(`[Pokemon] refreshTodaySnapshots: Max duration: ${maxDuration}ms (${Math.round(maxDuration / 1000)}s)`);
  }
  
  // Safety check: Warn if we have very few snapshots, but don't block daily updates
  // This is just a warning - we still want to add today's data even if the dataset is small
  if (existing.length > 0 && existing.length < 20) {
    logDebug(`[Pokemon] Warning: Only ${existing.length} snapshots found. This might indicate data loss, but proceeding with today's update.`);
  }
  
  // Filter out test/placeholder snapshots that don't match configured cards BEFORE building the map
  // This ensures we don't accidentally think cards have data when they don't
  const configuredCardIds = new Set(settings.cards.map(c => c.id));
  const validSnapshots = existing.filter(snap => 
    configuredCardIds.has(snap.cardId) || snap.date !== today
  );
  
  logDebug(`[Pokemon] refreshTodaySnapshots: Filtered ${existing.length} snapshots to ${validSnapshots.length} valid snapshots`);
  
  const byCardAndDate = new Map<string, PokemonCardPriceSnapshot>();
  for (const snap of validSnapshots) {
    byCardAndDate.set(`${snap.cardId}:${snap.date}`, snap);
  }

  // Start with filtered snapshots, not all existing ones
  const updated: PokemonCardPriceSnapshot[] = [...validSnapshots];

  let addedToday = false;
  let scrapedCount = 0;
  let errorCount = 0;
  let skippedDueToTimeout = 0;
  const failedCards: Array<{ cardId: string; cardName: string; error: string }> = [];
  const successfulCards: string[] = [];

  // Helper function to check remaining time
  const getRemainingTime = (): number => {
    if (maxDuration === Infinity) return Infinity;
    const elapsed = Date.now() - startTime;
    return maxDuration - elapsed;
  };

  // Helper function to check if we should continue (enough time remaining)
  const shouldContinue = (): boolean => {
    const remaining = getRemainingTime();
    // Exit if less than 30 seconds remaining (need time to save)
    if (remaining < 30000) {
      return false;
    }
    return true;
  };

  // Helper function to save incrementally
  const saveIncremental = async (): Promise<void> => {
    try {
      await setPokemonCardPriceSnapshots(updated);
      logDebug(`[Pokemon] Incrementally saved ${updated.length} snapshots`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Pokemon] Failed to incrementally save snapshots:`, errorMsg);
      // Don't throw - we'll try to save at the end
    }
  };

  // Helper function to find the most recent available price for a card (fallback mechanism)
  const findMostRecentPrice = (cardId: string, conditionType: 'ungraded' | 'psa10' | 'both'): Omit<PokemonCardPriceSnapshot, 'cardId' | 'date'> | null => {
    // Find all snapshots for this card, sorted by date (most recent first)
    const cardSnapshots = validSnapshots
      .filter(snap => snap.cardId === cardId && snap.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));
    
    // Look for the most recent snapshot with the required price(s)
    for (const snap of cardSnapshots) {
      if (conditionType === 'ungraded' && snap.ungradedPrice !== undefined) {
        return { ungradedPrice: snap.ungradedPrice, psa10Price: snap.psa10Price, source: snap.source, currency: snap.currency };
      } else if (conditionType === 'psa10' && snap.psa10Price !== undefined) {
        return { ungradedPrice: snap.ungradedPrice, psa10Price: snap.psa10Price, source: snap.source, currency: snap.currency };
      } else if (conditionType === 'both' && (snap.ungradedPrice !== undefined || snap.psa10Price !== undefined)) {
        return { ungradedPrice: snap.ungradedPrice, psa10Price: snap.psa10Price, source: snap.source, currency: snap.currency };
      }
    }
    
    return null;
  };

  // Wrap the entire loop in try-catch to ensure we save partial results even if there's an unexpected error
  try {
    for (let i = 0; i < settings.cards.length; i++) {
      // Check remaining time before processing each card
      const remaining = getRemainingTime();
      if (!shouldContinue()) {
        const elapsed = Date.now() - startTime;
        logDebug(`[Pokemon] ⏰ Timeout approaching: ${Math.round(elapsed / 1000)}s elapsed, ${Math.round(remaining / 1000)}s remaining`);
        logDebug(`[Pokemon] Stopping early to save partial results. Processed ${i}/${settings.cards.length} cards`);
        skippedDueToTimeout = settings.cards.length - i;
        
        // Save what we have so far
        if (addedToday) {
          await saveIncremental();
        }
        break;
      }

      const card = settings.cards[i]!;
      const key = `${card.id}:${today}`;
      const existingSnapshot = byCardAndDate.get(key);
      
      // Add delay between card scrapes (except for the first one) to avoid bot detection
      // Reduce delay when time is running out
      if (i > 0) {
        let delayMs: number;
        if (remaining < 60000) {
          // Less than 1 minute remaining - use minimal delay (0.5-1s)
          delayMs = 500 + Math.random() * 500;
          logDebug(`[Pokemon] ⚡ Time running out - using reduced delay: ${Math.round(delayMs)}ms`);
        } else if (remaining < 120000) {
          // Less than 2 minutes remaining - use shorter delay (1-2s)
          delayMs = 1000 + Math.random() * 1000;
          logDebug(`[Pokemon] ⚡ Time limited - using shorter delay: ${Math.round(delayMs)}ms`);
        } else {
          // Normal delay between 2-5 seconds
          delayMs = 2000 + Math.random() * 3000;
        }
        
        logDebug(`[Pokemon] Waiting ${Math.round(delayMs)}ms before scraping next card (${i + 1}/${settings.cards.length}), ${Math.round(remaining / 1000)}s remaining`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Check again after delay
        if (!shouldContinue()) {
          const elapsed = Date.now() - startTime;
          logDebug(`[Pokemon] ⏰ Timeout after delay: ${Math.round(elapsed / 1000)}s elapsed`);
          logDebug(`[Pokemon] Stopping early to save partial results. Processed ${i}/${settings.cards.length} cards`);
          skippedDueToTimeout = settings.cards.length - i;
          
          // Save what we have so far
          if (addedToday) {
            await saveIncremental();
          }
          break;
        }
      }
      
      // Check if we have a snapshot AND it has the required price field for this card's condition type
      if (existingSnapshot) {
        // For 'both' condition type, we want at least one price, but ideally both
        // For specific condition types, we need that specific price
        let hasRequiredPrice = false;
        let shouldRetryForBetterData = false;
        
        if (card.conditionType === 'ungraded') {
          hasRequiredPrice = existingSnapshot.ungradedPrice !== undefined;
        } else if (card.conditionType === 'psa10') {
          hasRequiredPrice = existingSnapshot.psa10Price !== undefined;
        } else if (card.conditionType === 'both') {
          const hasUngraded = existingSnapshot.ungradedPrice !== undefined;
          const hasPsa10 = existingSnapshot.psa10Price !== undefined;
          hasRequiredPrice = hasUngraded || hasPsa10;
          // If we only have one price but want both, consider retrying (but not critical)
          shouldRetryForBetterData = (hasUngraded && !hasPsa10) || (!hasUngraded && hasPsa10);
        }
        
        if (hasRequiredPrice && !shouldRetryForBetterData) {
          logDebug(`[Pokemon] Card ${card.id} (${card.name}) already has today's (${today}) data with required price, skipping`);
          continue; // Already have today's data with the required price for this card
        } else if (hasRequiredPrice && shouldRetryForBetterData) {
          // We have partial data but want both prices - retry to get the missing one
          logDebug(`[Pokemon] Card ${card.id} (${card.name}) has partial data (ungraded=${existingSnapshot.ungradedPrice !== undefined}, psa10=${existingSnapshot.psa10Price !== undefined}), will retry for complete data`);
          // Remove the incomplete snapshot so we can replace it
          const index = updated.findIndex(s => s.cardId === card.id && s.date === today);
          if (index !== -1) {
            updated.splice(index, 1);
          }
          byCardAndDate.delete(key);
        } else {
          // Snapshot exists but doesn't have the required price - need to scrape
          logDebug(`[Pokemon] Card ${card.id} (${card.name}) has snapshot but missing required price (conditionType: ${card.conditionType}), will scrape`);
          // Remove the incomplete snapshot so we can replace it
          const index = updated.findIndex(s => s.cardId === card.id && s.date === today);
          if (index !== -1) {
            updated.splice(index, 1);
          }
          byCardAndDate.delete(key);
        }
      }

      const remainingBeforeScrape = getRemainingTime();
      logDebug(`[Pokemon] Scraping today's (${today}) price for card ${card.id} (${card.name}) [${i + 1}/${settings.cards.length}], ${Math.round(remainingBeforeScrape / 1000)}s remaining`);
      try {
        scrapedCount++;
        const scraped = await scrapePriceChartingForCard(card);
        
        // Validate scraped prices (must be positive numbers if present)
        const isValidPrice = (price: number | undefined): boolean => {
          if (price === undefined) return true; // undefined is valid (missing price)
          return Number.isFinite(price) && price > 0 && price < 1000000; // Reasonable upper bound ($1M)
        };
        
        const hasValidUngraded = scraped.ungradedPrice === undefined || isValidPrice(scraped.ungradedPrice);
        const hasValidPsa10 = scraped.psa10Price === undefined || isValidPrice(scraped.psa10Price);
        
        if (!hasValidUngraded || !hasValidPsa10) {
          const invalidPrices = [];
          if (!hasValidUngraded) invalidPrices.push(`ungraded=${scraped.ungradedPrice}`);
          if (!hasValidPsa10) invalidPrices.push(`psa10=${scraped.psa10Price}`);
          logDebug(`[Pokemon] Warning: Invalid prices scraped for card ${card.id} (${card.name}): ${invalidPrices.join(', ')}`);
          errorCount++;
          failedCards.push({ cardId: card.id, cardName: card.name, error: `Invalid prices: ${invalidPrices.join(', ')}` });
          
          // Try fallback
          const fallbackPrice = findMostRecentPrice(card.id, card.conditionType);
          if (fallbackPrice) {
            const hasRequiredPrice = 
              (card.conditionType === 'ungraded' && fallbackPrice.ungradedPrice !== undefined) ||
              (card.conditionType === 'psa10' && fallbackPrice.psa10Price !== undefined) ||
              (card.conditionType === 'both' && (fallbackPrice.ungradedPrice !== undefined || fallbackPrice.psa10Price !== undefined));
            
            if (hasRequiredPrice) {
              logDebug(`[Pokemon] Using fallback price for ${card.id} (${card.name}) - invalid prices scraped`);
              const snapshot: PokemonCardPriceSnapshot = {
                cardId: card.id,
                date: today,
                ...fallbackPrice,
                source: 'fallback',
              };
              updated.push(snapshot);
              byCardAndDate.set(key, snapshot);
              addedToday = true;
              await saveIncremental();
              continue;
            }
          }
          
          logDebug(`[Pokemon] Not creating snapshot for ${card.id} - invalid prices, will retry on next run`);
          continue;
        }
        
        // Check if we got any prices
        if (!scraped.ungradedPrice && !scraped.psa10Price) {
          logDebug(`[Pokemon] Warning: No prices scraped for card ${card.id} (${card.name}) - both ungraded and psa10 are undefined`);
          errorCount++;
          failedCards.push({ cardId: card.id, cardName: card.name, error: 'No prices found on page' });
          
          // Try to use fallback price from most recent available snapshot
          const fallbackPrice = findMostRecentPrice(card.id, card.conditionType);
          
          if (fallbackPrice) {
            const hasRequiredPrice = 
              (card.conditionType === 'ungraded' && fallbackPrice.ungradedPrice !== undefined) ||
              (card.conditionType === 'psa10' && fallbackPrice.psa10Price !== undefined) ||
              (card.conditionType === 'both' && (fallbackPrice.ungradedPrice !== undefined || fallbackPrice.psa10Price !== undefined));
            
            if (hasRequiredPrice) {
              logDebug(`[Pokemon] Using fallback price for ${card.id} (${card.name}) - no prices found on page`);
              const snapshot: PokemonCardPriceSnapshot = {
                cardId: card.id,
                date: today,
                ...fallbackPrice,
                source: 'fallback',
              };
              updated.push(snapshot);
              byCardAndDate.set(key, snapshot);
              addedToday = true;
              logDebug(`[Pokemon] ✅ Created fallback snapshot for ${card.id}: ungraded=$${fallbackPrice.ungradedPrice || 'N/A'}, psa10=$${fallbackPrice.psa10Price || 'N/A'}`);
              
              // Save incrementally
              await saveIncremental();
              
              // Continue to next card - we've handled this one with fallback
              continue;
            }
          }
          
          // No fallback available - don't add a snapshot so we can retry on the next run
          logDebug(`[Pokemon] Not creating snapshot for ${card.id} - will retry on next run`);
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
        successfulCards.push(card.id);
        
        const elapsed = Date.now() - startTime;
        logDebug(`[Pokemon] ✅ Successfully scraped ${card.id}: ungraded=$${scraped.ungradedPrice || 'N/A'}, psa10=$${scraped.psa10Price || 'N/A'} (${Math.round(elapsed / 1000)}s elapsed)`);
        
        // Save incrementally after each successful scrape
        await saveIncremental();
        logDebug(`[Pokemon] Incrementally saved snapshot for ${card.id}`);
      } catch (error) {
        errorCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const elapsed = Date.now() - startTime;
        console.error(`[Pokemon] Failed to scrape card ${card.id} (${card.name}):`, errorMsg);
        logDebug(`[Pokemon] ❌ Error details (${Math.round(elapsed / 1000)}s elapsed): ${errorMsg}`);
        failedCards.push({ cardId: card.id, cardName: card.name, error: errorMsg });
        
        // Check if this is a retryable error
        const isRetryable = isRetryableError(error);
        logDebug(`[Pokemon] Scrape error for ${card.id}: retryable=${isRetryable}, error=${errorMsg}`);
        
        // Try to use fallback price from most recent available snapshot
        const fallbackPrice = findMostRecentPrice(card.id, card.conditionType);
        
        if (fallbackPrice) {
          // We have a fallback price - use it to ensure continuity of data
          const hasRequiredPrice = 
            (card.conditionType === 'ungraded' && fallbackPrice.ungradedPrice !== undefined) ||
            (card.conditionType === 'psa10' && fallbackPrice.psa10Price !== undefined) ||
            (card.conditionType === 'both' && (fallbackPrice.ungradedPrice !== undefined || fallbackPrice.psa10Price !== undefined));
          
          if (hasRequiredPrice) {
            logDebug(`[Pokemon] 🔄 Using fallback price for ${card.id} (${card.name}) due to scrape failure (${isRetryable ? 'retryable' : 'non-retryable'} error)`);
            const snapshot: PokemonCardPriceSnapshot = {
              cardId: card.id,
              date: today,
              ...fallbackPrice,
              // Mark source as fallback to indicate it's not fresh data
              source: 'fallback',
            };
            updated.push(snapshot);
            byCardAndDate.set(key, snapshot);
            addedToday = true;
            logDebug(`[Pokemon] ✅ Created fallback snapshot for ${card.id}: ungraded=$${fallbackPrice.ungradedPrice || 'N/A'}, psa10=$${fallbackPrice.psa10Price || 'N/A'}`);
            
            // Save incrementally
            await saveIncremental();
            
            // Continue to next card - we've handled this one with fallback
            continue;
          } else {
            logDebug(`[Pokemon] Fallback price found for ${card.id} but doesn't have required price for conditionType=${card.conditionType}`);
          }
        } else {
          logDebug(`[Pokemon] No fallback price available for ${card.id} (${card.name})`);
        }
        
        // No fallback available or fallback doesn't have required price
        if (isRetryable) {
          logDebug(`[Pokemon] Error is retryable (${errorMsg}), no fallback available - will retry on next run`);
          // Don't add a snapshot - this ensures we'll retry on the next run
          continue;
        }
        
        // For non-retryable errors (e.g., card not found, page structure changed), 
        // we still don't want to create a snapshot with undefined prices as it might prevent future retries
        // Instead, log the error and continue
        logDebug(`[Pokemon] Non-retryable error for ${card.id}, no fallback available - manual intervention may be needed`);
        // Continue with other cards even if one fails
      }
    }
  } catch (error) {
    // Unexpected error in the loop itself (shouldn't happen, but handle it gracefully)
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Pokemon] Unexpected error in refreshTodaySnapshots loop:`, errorMsg);
    logDebug(`[Pokemon] Loop error: ${errorMsg}, but will attempt to save partial results`);
    // Continue to save logic below - we want to save whatever we've scraped so far
  }

  const totalElapsed = Date.now() - startTime;
  const remaining = getRemainingTime();
  
  logDebug(`[Pokemon] refreshTodaySnapshots: Scraped ${scrapedCount} cards, errors: ${errorCount}, addedToday: ${addedToday}`);
  if (maxDuration !== Infinity) {
    logDebug(`[Pokemon] Time tracking: ${Math.round(totalElapsed / 1000)}s elapsed, ${Math.round(remaining / 1000)}s remaining`);
  }
  
  // Calculate how many new/updated snapshots we have
  const newCount = updated.length - validSnapshots.length;
  const cardsWithData = updated.filter(s => 
    s.date === today && (s.ungradedPrice !== undefined || s.psa10Price !== undefined)
  ).length;
  const cardsWithoutData = settings.cards.length - cardsWithData;
  
  logDebug(`[Pokemon] refreshTodaySnapshots summary:`, {
    scraped: scrapedCount,
    errors: errorCount,
    skippedDueToTimeout,
    successfulCards: successfulCards.length,
    newSnapshots: newCount,
    addedToday,
    cardsWithData,
    cardsWithoutData,
    totalCards: settings.cards.length,
    elapsedSeconds: Math.round(totalElapsed / 1000),
    remainingSeconds: maxDuration !== Infinity ? Math.round(remaining / 1000) : null,
    successfulCardIds: successfulCards,
    failedCards: failedCards.map(f => f.cardId),
  });
  
  // Log detailed failure information
  if (failedCards.length > 0) {
    console.warn(`[Pokemon] ⚠️  Failed to scrape ${failedCards.length} cards:`);
    for (const failed of failedCards) {
      console.warn(`[Pokemon]   - ${failed.cardName} (${failed.cardId}): ${failed.error}`);
    }
  }
  
  // Log timeout information if applicable
  if (skippedDueToTimeout > 0) {
    console.warn(`[Pokemon] ⏰ Timeout: ${skippedDueToTimeout} cards were skipped due to timeout and will be retried on the next run`);
    const skippedCardIds = settings.cards.slice(settings.cards.length - skippedDueToTimeout).map(c => c.id);
    logDebug(`[Pokemon] Skipped card IDs due to timeout: ${skippedCardIds.join(', ')}`);
  }
  
  // Only save if we have new snapshots with actual price data
  // Note: We may have already saved incrementally, but we'll save again to ensure consistency
  // Don't save if we only have failures (no snapshots created)
  if (addedToday && cardsWithData > 0) {
    logDebug(`[Pokemon] Final save: ${updated.length} total snapshots (${newCount} new/updated for today, ${cardsWithData} with data, ${cardsWithoutData} failed)`);
    try {
      await setPokemonCardPriceSnapshots(updated);
      logDebug(`[Pokemon] Successfully saved today's (${today}) price data for ${cardsWithData} cards`);
      
      if (cardsWithoutData > 0 || skippedDueToTimeout > 0) {
        const totalMissing = cardsWithoutData + skippedDueToTimeout;
        console.warn(`[Pokemon] ⚠️  ${totalMissing} cards need price data (${cardsWithoutData} failed, ${skippedDueToTimeout} skipped due to timeout) and will be retried on the next run`);
        if (failedCards.length > 0) {
          console.warn(`[Pokemon] Failed cards: ${failedCards.map(f => f.cardName).join(', ')}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Pokemon] Failed to save today's snapshots:`, errorMsg);
      throw error;
    }
  } else if (cardsWithoutData > 0 && !addedToday) {
    // All cards failed - log warning but don't save (no point saving empty data)
    console.warn(`[Pokemon] ⚠️  All ${settings.cards.length} cards failed to get price data today. This may indicate a systemic issue (rate limiting, site changes, etc.)`);
    console.warn(`[Pokemon] Failed cards: ${failedCards.map(f => `${f.cardName} (${f.error})`).join(', ')}`);
    logDebug(`[Pokemon] Not saving - no successful scrapes to save`);
  } else {
    logDebug(`[Pokemon] All cards already have today's (${today}) price data, skipping save`);
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
  options?: { startTime?: number; maxDuration?: number }
): Promise<PokemonIndexPoint[]> {
  const today = todayIsoDate();
  const snapshots = await getPokemonCardPriceSnapshots();
  
  logDebug(`[Pokemon] ensurePokemonIndexUpToDate: Checking ${snapshots.length} existing snapshots for today (${today})`);
  
  // Filter out test/placeholder snapshots that don't match configured cards
  const configuredCardIds = new Set(settings.cards.map(c => c.id));
  const validSnapshots = snapshots.filter(snap => 
    configuredCardIds.has(snap.cardId) || snap.date !== today
  );
  
  logDebug(`[Pokemon] ensurePokemonIndexUpToDate: Filtered ${snapshots.length} snapshots to ${validSnapshots.length} valid snapshots`);
  
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

  let updatedSnapshots = validSnapshots;
  if (missingCards.length > 0) {
    logDebug(`[Pokemon] ensurePokemonIndexUpToDate: ${missingCards.length} cards missing today's data, refreshing`);
    // Refresh snapshots - this will only scrape cards that don't have today's data
    // Pass through time tracking options
    updatedSnapshots = await refreshTodaySnapshots(settings, options);
    logDebug(`[Pokemon] ensurePokemonIndexUpToDate: refreshTodaySnapshots returned ${updatedSnapshots.length} snapshots`);
  } else {
    logDebug(`[Pokemon] ensurePokemonIndexUpToDate: All cards have today's data, skipping refresh`);
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


