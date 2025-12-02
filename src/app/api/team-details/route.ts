import { NextResponse, NextRequest } from 'next/server';
import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';

// Force Node.js runtime (required for Playwright browser automation)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  if (!teamId) {
    return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
  }

  let browser;
  try {
    browser = await chromium.launch({
      args: chromiumPkg.args,
      executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'),
      headless: true,
    });
    const page = await browser.newPage();

    // Navigate to team page
    await page.goto(`https://myhockeyrankings.com/team-info/${teamId}/${year}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Scrape W-L-T record, goals, and rating
    const details = await page.evaluate(() => {
      // Record
      const recordHeading = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent?.includes('Record')
      );
      const recordText = recordHeading?.nextElementSibling?.textContent?.trim() || null;

      // Goals
      const goalsHeading = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent?.includes('Goals')
      );
      const goalsText = goalsHeading?.nextElementSibling?.textContent?.trim() || null;

      // Rating
      let rating: number | null = null;
      const ratingHeading = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent?.trim() === 'Rating'
      );
      if (ratingHeading && ratingHeading.nextElementSibling) {
        const ratingText = ratingHeading.nextElementSibling.textContent?.trim();
        if (ratingText) {
          const ratingValue = parseFloat(ratingText);
          if (!isNaN(ratingValue)) rating = ratingValue;
        }
      }

      return { record: recordText, goals: goalsText, rating };
    });

    return NextResponse.json(details);
  } catch (error) {
    console.error('Error fetching team details:', error);
    return NextResponse.json({ error: 'Failed to fetch team details' }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
