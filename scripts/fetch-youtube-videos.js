const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('Navigating to YouTube channel...');
    await page.goto('https://www.youtube.com/@2015JuniorCanes/videos');

    console.log('Waiting for video list to load...');
    await page.waitForSelector('#video-title-link');

    // Scroll down a few times to load more videos
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(1000);
    }

    console.log('Extracting video data...');
    const videos = await page.evaluate(() => {
        const videoElements = document.querySelectorAll('#video-title-link');
        return Array.from(videoElements).map(el => ({
            title: el.innerText,
            url: el.href
        }));
    });

    console.log(`Found ${videos.length} videos.`);

    const outputPath = path.join(process.cwd(), 'src/data/youtube-videos.json');
    fs.writeFileSync(outputPath, JSON.stringify(videos, null, 2));
    console.log(`Saved video data to ${outputPath}`);

    await browser.close();
})();
