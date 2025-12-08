import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium-min';
import { debugLog } from '@/lib/logger';
import { getTeamMap, setTeamMap, isTeamCacheStale, type MHRTeamData } from '@/lib/kv';
import type { MHRSearchResult, MHRScheduleGame } from '@/types';

// Scrape team details (name, record, rating, logo) from team info page
export async function scrapeTeamDetails(teamId: string, year: string): Promise<{ name: string; record: string; rating: string; logo: string }> {
    debugLog(`[MHR] Scraping team details for ID ${teamId}, year ${year}`);
    
    const browser = await chromium.launch({
        args: chromiumPkg.args,
        executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar'),
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

        // Extract Team Name
        // Usually in an h1 or h2 at the top of the page
        const name = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            if (h1) {
                return h1.textContent?.trim() || '';
            }
            const h2 = document.querySelector('h2');
            return h2?.textContent?.trim() || '';
        });

        debugLog(`[MHR] Scraped data for ${teamId}:`, { name, record, rating, logo });
        
        return { name, record, rating, logo };
    } catch (error) {
        console.error(`[MHR] Error scraping details for ${teamId}:`, error);
        return { name: '', record: '', rating: '', logo: '' };
    } finally {
        await browser.close();
    }
}

export async function fetchMHRSchedule(teamId: string, year: string): Promise<MHRScheduleGame[]> {
    debugLog(`Fetching MHR schedule for Team ID: ${teamId}, Year: ${year}`);
    
    const browser = await chromium.launch({
        args: chromiumPkg.args,
        executablePath: await chromiumPkg.executablePath('https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar'),
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

        return scheduleData as MHRScheduleGame[];

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchMHRTeam(query: string, ageGroup?: string, _preferredLevel?: string): Promise<MHRTeamData | null> {
    try {
        // Fix common typos before searching
        // Fix "Pheonix" -> "Phoenix" typo
        let normalizedQuery = query;
        if (/\bpheonix\b/i.test(query)) {
            normalizedQuery = query.replace(/\bpheonix\b/gi, 'Phoenix');
            debugLog(`[MHR] Fixed typo in search query: "${query}" -> "${normalizedQuery}"`);
        }
        
        const encodedQuery = encodeURIComponent(normalizedQuery);
        const res = await fetch(`https://myhockeyrankings.com/services/search/?q=${encodedQuery}`);
        if (!res.ok) return null;
        
        const results: MHRSearchResult[] = await res.json();
        // Find the best match. The search returns an array.
        // We prioritize "team" kind.
        let teams = results.filter((r) => r.kind === 'team');
        
        if (teams.length === 0) return null;

        // If ageGroup is provided, filter by it
        if (ageGroup) {
            const ageGroupTeams = teams.filter((t) => t.name.includes(ageGroup));
            if (ageGroupTeams.length > 0) {
                teams = ageGroupTeams;
            } else {
                debugLog(`[MHR] No teams found matching age group "${ageGroup}" for query "${query}". Returning best guess.`);
            }
        }

        // Always prioritize AAA teams first, then AA teams
        // This ensures we get the highest level team available
        if (teams.length > 1) {
            // First, try to find AAA teams
            const aaaTeam = teams.find((t) => /\bAAA\b/i.test(t.name));
            if (aaaTeam) {
                debugLog(`[MHR] Found AAA team (prioritized): ${aaaTeam.name}`);
                return {
                    name: aaaTeam.name,
                    mhrId: aaaTeam.nbr,
                    url: `https://myhockeyrankings.com${aaaTeam.url}`
                };
            }
            
            // If no AAA, try to find AA teams
            const aaTeam = teams.find((t) => /\bAA\b/i.test(t.name) && !/\bAAA\b/i.test(t.name));
            if (aaTeam) {
                debugLog(`[MHR] Found AA team (fallback): ${aaTeam.name}`);
                return {
                    name: aaTeam.name,
                    mhrId: aaTeam.nbr,
                    url: `https://myhockeyrankings.com${aaTeam.url}`
                };
            }
            
            // Filter out single-A teams to avoid mismatches
            const nonSingleATeams = teams.filter((t) => {
                const name = t.name;
                // Check if it has single A (bad - we want AA or AAA)
                if (/\b\d+U\s+A\b/i.test(name) && !/\bAA\b/i.test(name)) return false;
                return true; // Keep if no level specified or has AA/AAA
            });
            
            if (nonSingleATeams.length > 0) {
                teams = nonSingleATeams;
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

export async function getMHRTeamData(opponentName: string, year: string, ageGroup: string = '10U', knownOpponents: MHRScheduleGame[] = [], preferredLevelOverride?: string): Promise<MHRTeamData | null> {
    // Resolve aliases first
    const settings = await getSettingsFromKV();
    const aliases = settings.aliases || {};
    const resolvedName = aliases[opponentName] || opponentName;
    
    debugLog(`[MHR] Getting data for opponent: ${opponentName}${resolvedName !== opponentName ? ` (resolved to: ${resolvedName})` : ''}, ageGroup: ${ageGroup}, year: ${year}`);
    const map = await getTeamMap();

    // 1. Check Cache (check both original and resolved names)
    if (map[resolvedName]) {
        // Check if cache is stale (7 days)
        if (!isTeamCacheStale(map[resolvedName])) {
            debugLog(`[MHR] Found ${resolvedName} in fresh cache:`, map[resolvedName]);
            return map[resolvedName];
        }
        debugLog(`[MHR] Cache for ${resolvedName} is stale, refreshing...`);
        // If stale and we have mhrId, refresh the data
        if (map[resolvedName].mhrId) {
            const scrapedDetails = await scrapeTeamDetails(String(map[resolvedName].mhrId), year);
            map[resolvedName].record = scrapedDetails.record || map[resolvedName].record;
            map[resolvedName].rating = scrapedDetails.rating || map[resolvedName].rating;
            map[resolvedName].logo = scrapedDetails.logo || map[resolvedName].logo;
            map[resolvedName].lastUpdated = Date.now();
            await setTeamMap(map);
            return map[resolvedName];
        }
    }

    // 2. Check Known Opponents (use resolved name)
    const normalizedOpponent = (resolvedName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!Array.isArray(knownOpponents)) return null;

    const knownMatch = knownOpponents.find((game) => {
        if (!game || !game.opponent_name) return false;
        const gameOpponent = game.opponent_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return gameOpponent.includes(normalizedOpponent) || normalizedOpponent.includes(gameOpponent);
    });

    if (knownMatch) {
        debugLog(`[MHR] Found ${resolvedName} in known opponents:`, knownMatch);
        const data: MHRTeamData = {
            name: knownMatch.opponent_name || resolvedName,
            logo: knownMatch.opponent_logo,
            record: knownMatch.opponent_record,
            rating: knownMatch.opponent_rating,
            mhrId: knownMatch.opponent_team_id,
            lastUpdated: Date.now(),
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
    // If preferredLevelOverride is provided (e.g., "AAA" for Tier 1 tournaments), use it
    let preferredLevel = preferredLevelOverride || 'AA'; // Default to AA, or use override
    if (!preferredLevelOverride && settings.teamName) {
        if (settings.teamName.includes('AAA')) preferredLevel = 'AAA';
        else if (settings.teamName.includes('AA')) preferredLevel = 'AA';
        else if (settings.teamName.includes(' A ')) preferredLevel = 'A'; // Space to avoid matching inside words
        else if (settings.teamName.endsWith(' A')) preferredLevel = 'A';
    }

    debugLog(`[MHR] Searching MHR for: ${resolvedName} (Age: ${ageGroup}, Level: ${preferredLevel}${preferredLevelOverride ? ' [Tier 1 override]' : ''})`);
    const searchResult = await searchMHRTeam(resolvedName, ageGroup, preferredLevel);

    if (searchResult && searchResult.mhrId) {
        debugLog(`[MHR] Search found team:`, searchResult);
        // Scrape additional details (record, rating) from team page
        debugLog(`[MHR] Scraping details for searched team ${searchResult.mhrId}`);
        const scrapedDetails = await scrapeTeamDetails(searchResult.mhrId, year);
        searchResult.record = scrapedDetails.record;
        searchResult.rating = scrapedDetails.rating;
        searchResult.logo = scrapedDetails.logo;
        searchResult.lastUpdated = Date.now();
        debugLog(`[MHR] Final data for ${resolvedName}:`, searchResult);

        // Update cache
        map[resolvedName] = searchResult;
        await setTeamMap(map);
        return searchResult;
    }

    debugLog(`[MHR] No data found for ${resolvedName}`);
    return null;
}
