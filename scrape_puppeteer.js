const puppeteer = require('puppeteer');

async function scrape() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Often needed in containerized environments
    });
    const page = await browser.newPage();

    try {
        console.log('Navigating to page...');
        await page.goto('https://myhockeyrankings.com/team-info/19758/2025/games', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('Page loaded. Taking screenshot...');
        await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });

        const html = await page.content();
        const fs = require('fs');
        fs.writeFileSync('debug_page.html', html);
        console.log('HTML saved to debug_page.html');

        console.log('Waiting for table...');
        // Try a more specific selector if possible, or just wait longer
        await page.waitForSelector('table', { timeout: 30000 });

        console.log('Extracting data...');
        const data = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            return rows.slice(0, 10).map(row => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                return cells.map(cell => cell.innerText.trim());
            });
        });

        console.log('Scraped Data (First 10 rows):');
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Scraping failed:', error);
        // Take error screenshot
        await page.screenshot({ path: 'error_screenshot.png' });
    } finally {
        await browser.close();
    }
}

scrape();
