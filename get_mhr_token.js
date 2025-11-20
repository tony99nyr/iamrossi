const puppeteer = require('puppeteer');

async function getToken() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable', // Explicitly use installed Chrome
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    let token = null;
    let cookies = null;

    // Intercept requests to find the token
    await page.setRequestInterception(true);
    page.on('request', request => {
        const headers = request.headers();
        if (headers['x-mhr-token'] || headers['X-Mhr-Token']) {
            token = headers['x-mhr-token'] || headers['X-Mhr-Token'];
            console.log('FOUND TOKEN:', token);
        }
        request.continue();
    });

    try {
        console.log('Navigating to page...');
        await page.goto('https://myhockeyrankings.com/team-info/19758/2025/games', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Get cookies
        const client = await page.target().createCDPSession();
        const cookieObj = await client.send('Network.getAllCookies');
        cookies = cookieObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log('FOUND COOKIES:', cookies);

        if (token) {
            console.log('SUCCESS: Token and Cookies retrieved.');
            console.log(JSON.stringify({ token, cookies }));
        } else {
            console.log('WARNING: Token not found in headers. Checking local storage/variables...');
            // Fallback: Check if token is in a global variable or local storage
            // This is a guess, but worth a try if headers fail
        }

    } catch (error) {
        console.error('Extraction failed:', error);
    } finally {
        await browser.close();
    }
}

getToken();
