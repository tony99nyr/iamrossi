const cheerio = require('cheerio');
const fs = require('fs');

async function scrape() {
    try {
        const response = await fetch('https://myhockeyrankings.com/team-info/19758/2025/games');
        const html = await response.text();

        fs.writeFileSync('mhr_dump.html', html);
        console.log('HTML saved to mhr_dump.html');

    } catch (error) {
        console.error('Error:', error);
    }
}

scrape();
