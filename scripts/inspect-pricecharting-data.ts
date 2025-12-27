#!/usr/bin/env tsx
/**
 * Quick script to inspect PriceCharting's VGPC object and see what data structures are available.
 * This helps identify if there's daily data available beyond the monthly snapshots in chart_data.
 */

import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';

async function inspectPriceCharting(cardId: string) {
  const url = `https://www.pricecharting.com/game/${encodeURIComponent(cardId)}`;
  
  console.log(`\n🔍 Inspecting PriceCharting page: ${url}\n`);

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

    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    
    // Wait for VGPC object
    await page.waitForFunction(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return typeof (globalThis as any).VGPC !== 'undefined';
    }, { timeout: 20000 });

    await page.waitForTimeout(2000);

    const inspection = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const VGPC = (globalThis as any).VGPC;
      
      const result: Record<string, unknown> = {
        vgpcExists: !!VGPC,
      };

      if (!VGPC) {
        return result;
      }

      // Get all top-level keys in VGPC
      result.vgpcKeys = Object.keys(VGPC);
      
      // Inspect chart_data in detail
      if (VGPC.chart_data) {
        const chartData = VGPC.chart_data;
        result.chartDataKeys = Object.keys(chartData);
        
        // Check each key in chart_data
        const chartDataDetails: Record<string, unknown> = {};
        for (const key of Object.keys(chartData)) {
          const value = chartData[key];
          if (Array.isArray(value)) {
            chartDataDetails[key] = {
              type: 'array',
              length: value.length,
              sample: value.slice(0, 5),
              // Check if dates are daily or monthly
              dateAnalysis: value.length > 0 ? (() => {
                const dates = value.slice(0, 20).map((entry: unknown) => {
                  if (Array.isArray(entry) && entry.length >= 1) {
                    return new Date(entry[0]).toISOString().slice(0, 10);
                  }
                  return null;
                }).filter((d): d is string => d !== null);
                const uniqueDays = new Set(dates);
                const firstOfMonth = dates.filter((d: string) => d.endsWith('-01')).length;
                return {
                  totalSamples: dates.length,
                  uniqueDays: uniqueDays.size,
                  firstOfMonthCount: firstOfMonth,
                  isMonthly: firstOfMonth === dates.length,
                  sampleDates: dates.slice(0, 10),
                };
              })() : null,
            };
          } else if (typeof value === 'object' && value !== null) {
            chartDataDetails[key] = {
              type: 'object',
              keys: Object.keys(value),
            };
          } else {
            chartDataDetails[key] = {
              type: typeof value,
              value: value,
            };
          }
        }
        result.chartDataDetails = chartDataDetails;
      }

      // Check for other potential data sources
      const otherProperties: Record<string, unknown> = {};
      for (const key of Object.keys(VGPC)) {
        if (key !== 'chart_data' && typeof VGPC[key] === 'object' && VGPC[key] !== null) {
          otherProperties[key] = {
            type: Array.isArray(VGPC[key]) ? 'array' : 'object',
            keys: Array.isArray(VGPC[key]) ? `array[${(VGPC[key] as unknown[]).length}]` : Object.keys(VGPC[key] as Record<string, unknown>),
          };
        }
      }
      result.otherProperties = otherProperties;

      // Check for price history tables in the DOM
      const priceTable = document.querySelector('#price_data, table.price-history, .price-history-table, [class*="price"][class*="history"]');
      result.hasPriceTable = !!priceTable;
      if (priceTable) {
        const rows = priceTable.querySelectorAll('tr');
        result.priceTableRows = rows.length;
        
        // Try to extract structured data from the table
        const tableData: Array<{ date?: string; price?: string; condition?: string; rawText: string }> = [];
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const row = rows[i];
          if (!row) continue;
          
          const cells = row.querySelectorAll('td, th');
          const rowData: { date?: string; price?: string; condition?: string; rawText: string } = {
            rawText: row.textContent?.trim() || '',
          };
          
          // Try to find date and price in cells
          for (let j = 0; j < cells.length; j++) {
            const cellText = cells[j]?.textContent?.trim() || '';
            // Check if it looks like a date
            if (cellText.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/)) {
              rowData.date = cellText;
            }
            // Check if it looks like a price
            if (cellText.match(/\$[\d,]+\.?\d*/)) {
              rowData.price = cellText;
            }
            // Check for condition keywords
            if (cellText.match(/ungraded|psa|grade|loose|sealed/i)) {
              rowData.condition = cellText;
            }
          }
          
          tableData.push(rowData);
        }
        result.priceTableData = tableData;
        
        // Also check for any data attributes or hidden data
        const allTables = document.querySelectorAll('table');
        result.allTables = allTables.length;
        const tablesWithData: string[] = [];
        allTables.forEach((table, idx) => {
          const rows = table.querySelectorAll('tr');
          if (rows.length > 3) {
            tablesWithData.push(`Table ${idx}: ${rows.length} rows, first row: ${rows[0]?.textContent?.substring(0, 50)}`);
          }
        });
        result.tablesWithData = tablesWithData;
      }
      
      // Check for any JavaScript variables that might contain daily data
      // Look for common variable names
      const scriptTags = Array.from(document.querySelectorAll('script'));
      const potentialDataSources: string[] = [];
      scriptTags.forEach((script) => {
        const content = script.textContent || '';
        // Look for patterns like dailyPrices, priceHistory, etc.
        if (content.match(/daily.*price|price.*daily|history.*data/i)) {
          potentialDataSources.push('Found potential daily price references in script');
        }
      });
      result.scriptDataSources = potentialDataSources;

      return result;
    });

    console.log('📊 VGPC Inspection Results:');
    console.log(JSON.stringify(inspection, null, 2));
    
    // Summary
    console.log('\n📋 Summary:');
    console.log(`   VGPC exists: ${inspection.vgpcExists}`);
    if (inspection.vgpcKeys) {
      console.log(`   VGPC keys: ${(inspection.vgpcKeys as string[]).join(', ')}`);
    }
    if (inspection.chartDataKeys) {
      console.log(`   chart_data keys: ${(inspection.chartDataKeys as string[]).join(', ')}`);
    }
    if (inspection.chartDataDetails) {
      const details = inspection.chartDataDetails as Record<string, any>;
      for (const [key, value] of Object.entries(details)) {
        if (value.type === 'array') {
          const dateAnalysis = value.dateAnalysis;
          console.log(`\n   ${key}:`);
          console.log(`      Type: array, Length: ${value.length}`);
          if (dateAnalysis) {
            console.log(`      Date analysis: ${dateAnalysis.totalSamples} samples, ${dateAnalysis.uniqueDays} unique days`);
            console.log(`      First-of-month count: ${dateAnalysis.firstOfMonthCount}`);
            console.log(`      Is monthly only: ${dateAnalysis.isMonthly}`);
            if (dateAnalysis.sampleDates) {
              console.log(`      Sample dates: ${dateAnalysis.sampleDates.slice(0, 5).join(', ')}`);
            }
          }
        }
      }
    }
    if (inspection.hasPriceTable) {
      console.log(`\n   ✅ Found price history table in DOM (${inspection.priceTableRows} rows)`);
    } else {
      console.log(`\n   ❌ No price history table found in DOM`);
    }

  } finally {
    await browser.close();
  }
}

const cardId = process.argv[2] || '11069001';
inspectPriceCharting(cardId).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

