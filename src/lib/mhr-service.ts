import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { debugLog } from '@/lib/logger';
import { getTeamMap, setTeamMap, type MHRTeamData } from '@/lib/kv';

// Scrape team details (record, rating) from team info page
export async function scrapeTeamDetails(teamId: string, year: string): Promise<{ record: string; rating: string; logo: string }> {
    debugLog(`[MHR] Scraping team details for ID ${teamId}, year ${year}`);
    
    const browser = await chromium.launch({
        args: chromiumPkg.args,
        executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.tar'),
        headless: true,
    });
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        });
        
        // Add cookies to bypass some checks if needed (optional, but good practice if we have them)
        await context.addCookies([
            { name: 'accepted_privacy_policy', value: '1', domain: 'myhockeyrankings.com', path: '/' }
        ]);

        const page = await context.newPage();
        
        // Go to team page
        const url = `https://myhockeyrankings.com/team-info?y=${year}&t=${teamId}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract Record
        // Look for "Record" label and get the value below it
        // Based on HTML: 
        // <h3 class="text-sm font-medium">Record...</h3>
        // <div class="text-xl font-bold">15-11-0</div>
        const record = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('h3'));
            const recordLabel = labels.find(el => el.textContent?.includes('Record'));
            if (recordLabel && recordLabel.nextElementSibling) {
                return recordLabel.nextElementSibling.textContent?.trim() || '';
            }
            return '';
        });

        // Extract Rating
        // <h3 class="text-sm font-medium">Rating</h3>
        // <div class="text-xl font-bold">91.5</div>
        const rating = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('h3'));
            const ratingLabel = labels.find(el => el.textContent?.includes('Rating'));
            if (ratingLabel && ratingLabel.nextElementSibling) {
                return ratingLabel.nextElementSibling.textContent?.trim() || '';
            }
            return '';
        });

        // Extract Logo
        // <div class="min-w-36">
        //    <img class="m-auto h-36 mx-2" src="...">
        // </div>
        const logo = await page.evaluate(() => {
            const logoContainer = document.querySelector('.min-w-36');
            if (logoContainer) {
                const img = logoContainer.querySelector('img');
                return img?.src || '';
            }
            return '';
        });

        debugLog(`[MHR] Scraped data for ${teamId}:`, { record, rating, logo });
        
        return { record, rating, logo };
    } catch (error) {
        console.error(`[MHR] Error scraping details for ${teamId}:`, error);
        return { record: '', rating: '', logo: '' };
    } finally {
        await browser.close();
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchMHRSchedule(teamId: string, year: string): Promise<any[]> {
    debugLog(`Fetching MHR schedule for Team ID: ${teamId}, Year: ${year}`);
    
    const browser = await chromium.launch({
        args: chromiumPkg.args,
        executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.tar'),
        headless: true,
    });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        let token: string | null = null;

        // Intercept requests to find the token
        await page.route('**/*', (route) => {
            const headers = route.request().headers();
            if (headers['x-mhr-token'] || headers['X-Mhr-Token']) {
                token = headers['x-mhr-token'] || headers['X-Mhr-Token'];
            }
            route.continue();
        });

        debugLog('Navigating to MHR games page...');
        await page.goto(`https://myhockeyrankings.com/team-info/${teamId}/${year}/games`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait a bit for the token to be captured from network requests
        await page.waitForTimeout(3000);

        if (!token) {
            console.warn('Could not retrieve X-Mhr-Token');
            throw new Error('Could not retrieve X-Mhr-Token');
        }

        debugLog('Token retrieved. Fetching schedule data...');

        // Fetch schedule data using the token
        const scheduleData = await page.evaluate(async ([tId, yr, tok]: [string, string, string]) => {
            const response = await fetch(`https://myhockeyrankings.com/team-info/service/${yr}/${tId}`, {
                headers: { 'X-Mhr-Token': tok }
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        }, [teamId, year, token] as [string, string, string]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return scheduleData as any[];

    } catch (error) {
        console.error('MHR Fetch failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}

// Helper to read settings
async function getSettingsFromKV(): Promise<Partial<{
    teamName: string;
    identifiers: string[];
    teamLogo: string;
    mhrTeamId: string;
    mhrYear: string;
    aliases: Record<string, string>;
}>> {
    const { getSettings } = await import('@/lib/kv');
    const settings = await getSettings();
    return settings || {};
}

export async function searchMHRTeam(query: string, ageGroup?: string, preferredLevel?: string): Promise<MHRTeamData | null> {
    try {
        const encodedQuery = encodeURIComponent(query);
        const res = await fetch(`https://myhockeyrankings.com/services/search/?q=${encodedQuery}`);
        if (!res.ok) return null;
        
        const results = await res.json();
        // Find the best match. The search returns an array.
        // We prioritize "team" kind.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let teams = results.filter((r: any) => r.kind === 'team');
        
        if (teams.length === 0) return null;

        // If ageGroup is provided, filter by it
        if (ageGroup) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ageGroupTeams = teams.filter((t: any) => t.name.includes(ageGroup));
            if (ageGroupTeams.length > 0) {
                teams = ageGroupTeams;
            } else {
                debugLog(`[MHR] No teams found matching age group "${ageGroup}" for query "${query}". Returning best guess.`);
            }
        }

        // If we have multiple teams and a preferred level, try to match it
        if (teams.length > 1 && preferredLevel) {
            // Look for exact level match (e.g. "AA" but not "AAA" or "A")
            // MHR names are like "Team Name 10U AA"
            
            const levelRegex = new RegExp(`\\b${preferredLevel}\\b`, 'i');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const levelMatch = teams.find((t: any) => levelRegex.test(t.name));
            
            if (levelMatch) {
                debugLog(`[MHR] Found level match for ${preferredLevel}: ${levelMatch.name}`);
                return {
                    name: levelMatch.name,
                    mhrId: levelMatch.nbr,
                    url: `https://myhockeyrankings.com${levelMatch.url}`
                };
            }
        }
        
        // If preferredLevel is AA, filter out single-A teams to avoid mismatches
        if (preferredLevel === 'AA' && teams.length > 1) {
            // Filter out teams that are single-A (not AA or AAA)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nonSingleATeams = teams.filter((t: any) => {
                const name = t.name;
                // Check if it has AA or AAA (good)
                if (/\bAAA?\b/i.test(name)) return true;
                // Check if it has single A (bad)
                if (/\b\d+U\s+A\b/i.test(name)) return false;
                return true; // Keep if no level specified
            });
            
            if (nonSingleATeams.length > 0) {
                teams = nonSingleATeams;
                
                // If we have both AA and AAA, prioritize AAA (higher level)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const aaaTeam = teams.find((t: any) => /\bAAA\b/i.test(t.name));
                if (aaaTeam) {
                    debugLog(`[MHR] Found AAA team (higher level): ${aaaTeam.name}`);
                    return {
                        name: aaaTeam.name,
                        mhrId: aaaTeam.nbr,
                        url: `https://myhockeyrankings.com${aaaTeam.url}`
                    };
                }
            }
        }

        // Pick the first one from the filtered list
        const team = teams[0];
        
        if (team) {
            return {
                name: team.name,
                mhrId: team.nbr,
                url: `https://myhockeyrankings.com${team.url}`
            };
        }
        return null;
    } catch (error) {
        console.error('MHR Search failed:', error);
        return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMHRTeamData(opponentName: string, year: string, ageGroup: string = '10U', knownOpponents: any[] = []): Promise<MHRTeamData | null> {
    // Resolve aliases first
    const settings = await getSettingsFromKV();
    const aliases = settings.aliases || {};
    const resolvedName = aliases[opponentName] || opponentName;
    
    debugLog(`[MHR] Getting data for opponent: ${opponentName}${resolvedName !== opponentName ? ` (resolved to: ${resolvedName})` : ''}, ageGroup: ${ageGroup}, year: ${year}`);
    const map = await getTeamMap();
    
    // 1. Check Cache (check both original and resolved names)
    if (map[resolvedName]) {
        debugLog(`[MHR] Found ${resolvedName} in cache:`, map[resolvedName]);
        if (map[resolvedName].mhrId && (!map[resolvedName].record || !map[resolvedName].rating || !map[resolvedName].logo)) {
             const scrapedDetails = await scrapeTeamDetails(String(map[resolvedName].mhrId), year);
             map[resolvedName].record = scrapedDetails.record || map[resolvedName].record;
             map[resolvedName].rating = scrapedDetails.rating || map[resolvedName].rating;
             map[resolvedName].logo = scrapedDetails.logo || map[resolvedName].logo;
             await setTeamMap(map);
        }
        return map[resolvedName];
    }

    // 2. Check Known Opponents (use resolved name)
    const normalizedOpponent = (resolvedName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!Array.isArray(knownOpponents)) return null;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const knownMatch = knownOpponents.find((game: any) => {
        if (!game || !game.opponent_name) return false;
        const gameOpponent = game.opponent_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return gameOpponent.includes(normalizedOpponent) || normalizedOpponent.includes(gameOpponent);
    });

    if (knownMatch) {
        debugLog(`[MHR] Found ${resolvedName} in known opponents:`, knownMatch);
        const data: MHRTeamData = {
            name: knownMatch.opponent_name,
            logo: knownMatch.opponent_logo,
            record: knownMatch.opponent_record,
            rating: knownMatch.opponent_rating,
            mhrId: knownMatch.opponent_team_id
        };
        if (data.mhrId) {
            const scrapedDetails = await scrapeTeamDetails(data.mhrId, year);
            data.record = scrapedDetails.record || data.record;
            data.rating = scrapedDetails.rating || data.rating;
            if (scrapedDetails.logo) data.logo = scrapedDetails.logo;
        }
        map[resolvedName] = data;
        await setTeamMap(map);
        return data;
    }

    // 3. Fallback Search
    // Determine preferred level from settings (already have settings from above)
    let preferredLevel = 'AA'; // Default
    if (settings.teamName) {
        if (settings.teamName.includes('AAA')) preferredLevel = 'AAA';
        else if (settings.teamName.includes('AA')) preferredLevel = 'AA';
        else if (settings.teamName.includes(' A ')) preferredLevel = 'A'; // Space to avoid matching inside words
        else if (settings.teamName.endsWith(' A')) preferredLevel = 'A';
    }

    debugLog(`[MHR] Searching MHR for: ${resolvedName} (Age: ${ageGroup}, Level: ${preferredLevel})`);
    const searchResult = await searchMHRTeam(resolvedName, ageGroup, preferredLevel);

    if (searchResult && searchResult.mhrId) {
        debugLog(`[MHR] Search found team:`, searchResult);
        // Scrape additional details (record, rating) from team page
        debugLog(`[MHR] Scraping details for searched team ${searchResult.mhrId}`);
        const scrapedDetails = await scrapeTeamDetails(searchResult.mhrId, year);
        searchResult.record = scrapedDetails.record;
        searchResult.rating = scrapedDetails.rating;
        searchResult.logo = scrapedDetails.logo;
        debugLog(`[MHR] Final data for ${resolvedName}:`, searchResult);
        
        // Update cache
        map[resolvedName] = searchResult;
        await setTeamMap(map);
        return searchResult;
    }

    debugLog(`[MHR] No data found for ${resolvedName}`);
    return null;
}
