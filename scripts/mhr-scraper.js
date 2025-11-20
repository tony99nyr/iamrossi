const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Arguments: Team ID, Year
const args = process.argv.slice(2);
const TEAM_ID = args[0] || '19758';
const YEAR = args[1] || '2025';

const DATA_DIR = path.join(__dirname, '../src/data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function scrape() {
    console.log(`Starting scrape for Team ID: ${TEAM_ID}, Year: ${YEAR}`);

    // Save settings
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ teamId: TEAM_ID, year: YEAR }, null, 2));

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    let token = null;

    // Intercept requests to find the token
    await page.setRequestInterception(true);
    page.on('request', request => {
        const headers = request.headers();
        if (headers['x-mhr-token'] || headers['X-Mhr-Token']) {
            token = headers['x-mhr-token'] || headers['X-Mhr-Token'];
        }
        request.continue();
    });

    try {
        console.log('Navigating to MHR games page...');
        await page.goto(`https://myhockeyrankings.com/team-info/${TEAM_ID}/${YEAR}/games`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        if (!token) {
            throw new Error('Could not retrieve X-Mhr-Token');
        }

        console.log('Token retrieved. Fetching schedule data...');

        // Fetch schedule data
        const scheduleData = await page.evaluate(async (tId, yr, tok) => {
            const response = await fetch(`https://myhockeyrankings.com/team-info/service/${yr}/${tId}`, {
                headers: { 'X-Mhr-Token': tok }
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        }, TEAM_ID, YEAR, token);

        console.log(`Successfully fetched ${scheduleData.length} games.`);

        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleData, null, 2));
        console.log('Schedule saved to src/data/schedule.json');

    } catch (error) {
        console.error('Scraping failed:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrape();
