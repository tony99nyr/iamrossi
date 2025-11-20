import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const year = searchParams.get('year') || new Date().getFullYear().toString();

    if (!teamId) {
        return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Navigate to team page
        await page.goto(`https://myhockeyrankings.com/team-info/${teamId}/${year}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Scrape W-L-T record, goals, and rating
        const details = await page.evaluate(() => {
            // Find record heading and get the next sibling's text
            const recordHeading = Array.from(document.querySelectorAll('h3')).find(h => 
                h.textContent?.includes('Record')
            );
            const recordText = recordHeading?.nextElementSibling?.textContent?.trim() || null;
            
            // Find goals heading
            const goalsHeading = Array.from(document.querySelectorAll('h3')).find(h => 
                h.textContent?.includes('Goals')
            );
            const goalsText = goalsHeading?.nextElementSibling?.textContent?.trim() || null;

            // Find rating - look for the "Rating" heading specifically
            let rating = null;
            const ratingHeading = Array.from(document.querySelectorAll('h3')).find(h => 
                h.textContent?.trim() === 'Rating'
            );
            
            if (ratingHeading && ratingHeading.nextElementSibling) {
                const ratingText = ratingHeading.nextElementSibling.textContent?.trim();
                if (ratingText) {
                    const ratingValue = parseFloat(ratingText);
                    if (!isNaN(ratingValue)) {
                        rating = ratingValue;
                    }
                }
            }

            return {
                record: recordText,
                goals: goalsText,
                rating: rating
            };
        });

        await browser.close();

        return NextResponse.json(details);
    } catch (error) {
        console.error('Error fetching team details:', error);
        return NextResponse.json({ error: 'Failed to fetch team details' }, { status: 500 });
    }
}
