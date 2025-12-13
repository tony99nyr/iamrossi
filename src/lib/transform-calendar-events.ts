import crypto from 'crypto';
import { getMHRTeamData, scrapeTeamDetails } from './mhr-service';
import { getSettings as getSettingsFromKV, type MHRTeamData } from './kv';
import { debugLog } from '@/lib/logger';

async function getSettings() {
    const settings = await getSettingsFromKV();
    return settings || {
        teamName: 'Carolina Junior Canes (Black) 10U AA',
        identifiers: ['Black', 'Jr Canes', 'Carolina', 'Jr']
    };
}

/**
 * Normalizes a date string to YYYY-MM-DD format
 * Handles both YYYYMMDD and YYYY-MM-DD formats
 * MHR dates are already date-only strings (no time component) representing dates in Eastern Time
 * We just normalize the format for consistent comparison with calendar event dates
 */
function normalizeDateToEastern(dateStr: string): string {
    // Normalize to YYYY-MM-DD format
    // MHR dates are already date-only strings, so we just need to ensure consistent format
    if (dateStr.includes('-')) {
        return dateStr; // Already in YYYY-MM-DD format
    }
    // Convert YYYYMMDD to YYYY-MM-DD
    return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
}

interface CalendarEvent {
    summary: string;
    start: Date;
    end: Date;
    location?: string;
    description?: string;
}

/**
 * Creates a Game entry from an MHR game object
 * Used for MHR games that aren't in the calendar
 */
async function createGameFromMHR(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mhrGame: any,
    dateStr: string,
    settings: { teamName: string; identifiers: string[]; mhrTeamId?: string },
    year: string,
    ourTeamLogo: string,
    mainTeamStats?: { record: string; rating: string }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
    try {
        // Determine home/away and opponent
        const homeTeamName = mhrGame.home_team_name || '';
        const visitorTeamName = mhrGame.visitor_team_name || '';
        const opponentName = mhrGame.opponent_name || '';

        // Check if our team is home or visitor
        const isUsHome = isUs(homeTeamName, settings.identifiers);
        const isUsVisitor = isUs(visitorTeamName, settings.identifiers);

        if (!isUsHome && !isUsVisitor) {
            // If we can't identify our team, try using opponent_name
            if (opponentName) {
                // Assume we're home if opponent_name is provided
                const isHomeGame = true;
                const opponent = opponentName;

                // Get opponent MHR data
                let normalizedOpponent = opponent;
                if (/\bpheonix\b/i.test(normalizedOpponent)) {
                    normalizedOpponent = normalizedOpponent.replace(/\bpheonix\b/gi, 'Phoenix');
                }

                const mhrData = await getMHRTeamData(normalizedOpponent, year, '10U', [mhrGame]);

                // Get opponent team ID
                let opponentTeamId: string | null = null;
                if (mhrGame.opponent_team_id) {
                    opponentTeamId = String(mhrGame.opponent_team_id);
                } else if (mhrData?.mhrId) {
                    opponentTeamId = mhrData.mhrId;
                }

                // Format time
                const gameTime = mhrGame.game_time_format || '00:00:00';
                const gameTimeFormatted = gameTime.length >= 5 ? gameTime.substring(0, 5) : gameTime;

                // Parse date for pretty formatting
                // Parse date components to avoid timezone issues (dateStr is YYYY-MM-DD)
                const [dateYear, dateMonth, dateDay] = dateStr.split('-').map(Number);
                // Create date at noon to avoid timezone boundary issues, then format in Eastern Time
                const gameDateObj = new Date(dateYear, dateMonth - 1, dateDay, 12, 0, 0);
                const gameDatePretty = gameDateObj.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric', 
                    timeZone: 'America/New_York' 
                });
                
                // Format time consistently with calendar events (12-hour with AM/PM)
                let gameTimePretty = 'TBD';
                if (gameTimeFormatted !== '00:00:00' && gameTimeFormatted !== '00:00') {
                    // Parse MHR time (HH:MM format) and create a Date object in Eastern Time
                    // Combine date and time: "YYYY-MM-DDTHH:MM:00" format
                    const timeDateStr = `${dateStr}T${gameTimeFormatted}:00`;
                    const timeDateObj = new Date(timeDateStr);
                    gameTimePretty = timeDateObj.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit', 
                        timeZone: 'America/New_York' 
                    });
                }

                return {
                    game_nbr: mhrGame.game_nbr || crypto.createHash('md5').update(`${dateStr}-${opponent}`).digest('hex').substring(0, 8),
                    game_date_format: dateStr,
                    game_time_format: gameTime,
                    game_date_format_pretty: gameDatePretty,
                    game_time_format_pretty: gameTimePretty,
                    home_team_name: isHomeGame ? settings.teamName : (mhrData?.name || opponent),
                    visitor_team_name: isHomeGame ? (mhrData?.name || opponent) : settings.teamName,
                    home_team_logo: isHomeGame ? ourTeamLogo : (mhrData?.logo || ''),
                    visitor_team_logo: isHomeGame ? (mhrData?.logo || '') : ourTeamLogo,
                    home_team_score: mhrGame.home_team_score ?? 0,
                    visitor_team_score: mhrGame.visitor_team_score ?? 0,
                    rink_name: mhrGame.rink_name || mhrGame.venue || 'TBD',
                    game_type: mhrGame.game_type || 'Regular Season',
                    opponent_record: mhrData?.record || mhrGame.opponent_record || '',
                    opponent_rating: mhrData?.rating || mhrGame.opponent_rating || '',
                    home_team_record: isHomeGame ? (mainTeamStats?.record || '') : (mhrData?.record || ''),
                    home_team_rating: isHomeGame ? (mainTeamStats?.rating || '') : (mhrData?.rating || ''),
                    visitor_team_record: isHomeGame ? (mhrData?.record || '') : (mainTeamStats?.record || ''),
                    visitor_team_rating: isHomeGame ? (mhrData?.rating || '') : (mainTeamStats?.rating || ''),
                    game_home_team: isHomeGame ? settings.mhrTeamId : opponentTeamId,
                    game_visitor_team: isHomeGame ? opponentTeamId : settings.mhrTeamId,
                    source: 'mhr-only'
                };
            }
            debugLog(`[MHR] Cannot determine home/away for MHR game: ${JSON.stringify(mhrGame)}`);
            return null;
        }

        const isHomeGame = isUsHome;
        const opponent = isHomeGame ? visitorTeamName : homeTeamName;

        if (!opponent) {
            debugLog(`[MHR] No opponent found for MHR game: ${JSON.stringify(mhrGame)}`);
            return null;
        }

        // Normalize opponent name
        let normalizedOpponent = opponent;
        if (/\bpheonix\b/i.test(normalizedOpponent)) {
            normalizedOpponent = normalizedOpponent.replace(/\bpheonix\b/gi, 'Phoenix');
        }

        // Get opponent MHR data
        const mhrData = await getMHRTeamData(normalizedOpponent, year, '10U', [mhrGame]);

        // Get opponent team ID
        let opponentTeamId: string | null = null;
        if (mhrGame.opponent_team_id) {
            opponentTeamId = String(mhrGame.opponent_team_id);
        } else if (isHomeGame && mhrGame.visitor_team_id) {
            opponentTeamId = String(mhrGame.visitor_team_id);
        } else if (!isHomeGame && mhrGame.home_team_id) {
            opponentTeamId = String(mhrGame.home_team_id);
        } else if (mhrData?.mhrId) {
            opponentTeamId = mhrData.mhrId;
        }

        // Format time
        const gameTime = mhrGame.game_time_format || '00:00:00';
        const gameTimeFormatted = gameTime.length >= 5 ? gameTime.substring(0, 5) : gameTime;

        // Parse date for pretty formatting
        // Parse date components to avoid timezone issues (dateStr is YYYY-MM-DD)
        const [dateYear, dateMonth, dateDay] = dateStr.split('-').map(Number);
        // Create date at noon to avoid timezone boundary issues, then format in Eastern Time
        const gameDateObj = new Date(dateYear, dateMonth - 1, dateDay, 12, 0, 0);
        const gameDatePretty = gameDateObj.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            timeZone: 'America/New_York' 
        });
        
        // Format time consistently with calendar events (12-hour with AM/PM)
        let gameTimePretty = 'TBD';
        if (gameTimeFormatted !== '00:00:00' && gameTimeFormatted !== '00:00') {
            // Parse MHR time (HH:MM format) and create a Date object in Eastern Time
            // Combine date and time: "YYYY-MM-DDTHH:MM:00" format
            const timeDateStr = `${dateStr}T${gameTimeFormatted}:00`;
            const timeDateObj = new Date(timeDateStr);
            gameTimePretty = timeDateObj.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit', 
                timeZone: 'America/New_York' 
            });
        }

        return {
            game_nbr: mhrGame.game_nbr || crypto.createHash('md5').update(`${dateStr}-${opponent}`).digest('hex').substring(0, 8),
            game_date_format: dateStr,
            game_time_format: gameTime,
            game_date_format_pretty: gameDatePretty,
            game_time_format_pretty: gameTimePretty,
            home_team_name: isHomeGame ? settings.teamName : (mhrData?.name || opponent),
            visitor_team_name: isHomeGame ? (mhrData?.name || opponent) : settings.teamName,
            home_team_logo: isHomeGame ? ourTeamLogo : (mhrData?.logo || ''),
            visitor_team_logo: isHomeGame ? (mhrData?.logo || '') : ourTeamLogo,
            home_team_score: mhrGame.home_team_score ?? 0,
            visitor_team_score: mhrGame.visitor_team_score ?? 0,
            rink_name: mhrGame.rink_name || mhrGame.venue || 'TBD',
            game_type: mhrGame.game_type || 'Regular Season',
            opponent_record: mhrData?.record || mhrGame.opponent_record || '',
            opponent_rating: mhrData?.rating || mhrGame.opponent_rating || '',
            home_team_record: isHomeGame ? (mainTeamStats?.record || '') : (mhrData?.record || ''),
            home_team_rating: isHomeGame ? (mainTeamStats?.rating || '') : (mhrData?.rating || ''),
            visitor_team_record: isHomeGame ? (mhrData?.record || '') : (mainTeamStats?.record || ''),
            visitor_team_rating: isHomeGame ? (mhrData?.rating || '') : (mainTeamStats?.rating || ''),
            game_home_team: isHomeGame ? settings.mhrTeamId : opponentTeamId,
            game_visitor_team: isHomeGame ? opponentTeamId : settings.mhrTeamId,
            source: 'mhr-only'
        };
    } catch (error) {
        debugLog(`[MHR] Error creating game from MHR data:`, error);
        return null;
    }
}

/**
 * Detect if a calendar event is a placeholder (tournament, showcase, playoffs, TBD)
 */
function isPlaceholderEvent(event: CalendarEvent, summary: string): boolean {
    const duration = event.end.getTime() - event.start.getTime();
    const durationHours = duration / (60 * 60 * 1000);
    const lowerSummary = summary.toLowerCase();

    // Heuristic 1: Duration > 24 hours (multi-day events like tournaments)
    if (durationHours > 24) {
        return true;
    }

    // Heuristic 2: Explicit TBD/placeholder keywords
    const explicitKeywords = [
        'tbd',
        'to be determined',
        'placeholder',
        'schedule tbd'
    ];
    if (explicitKeywords.some(keyword => lowerSummary.includes(keyword))) {
        return true;
    }

    // Heuristic 3: Tournament/showcase/playoffs keywords (but not if it has vs/@ indicating a specific game)
    const hasVersusOrAt = /\s(vs\.?|versus|@|at)\s/i.test(summary);
    if (!hasVersusOrAt) {
        const eventKeywords = ['tournament', 'showcase', 'playoffs'];
        if (eventKeywords.some(keyword => lowerSummary.includes(keyword))) {
            return true;
        }
    }

    return false;
}

export async function transformCalendarEvents(
    events: CalendarEvent[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mhrSchedule: any[] = [],
    year: string = '2025',
    mainTeamStats?: { record: string; rating: string }
) {
    const settings = await getSettings();
    const { mhrYear } = settings;

    // Use mhrYear from settings if available, otherwise use the passed year parameter
    const effectiveYear = mhrYear || year;

    // Calculate season boundaries from MHR year
    // Season runs from August 1st of MHR year to March 1st of (MHR year + 1)
    const startYear = effectiveYear;
    const endYear = String(parseInt(effectiveYear) + 1);
    const seasonStartDate = new Date(`${startYear}-08-01T00:00:00`);
    const seasonEndDate = new Date(`${endYear}-03-01T23:59:59`);
    
    debugLog(`[Season Filter] Season: ${seasonStartDate.toISOString()} to ${seasonEndDate.toISOString()} (MHR Year: ${effectiveYear})`);

    // Fetch our team's MHR data to get logo
    let ourTeamLogo = '';
    if (settings.mhrTeamId) {
        try {
            const ourTeamData = await scrapeTeamDetails(settings.mhrTeamId, effectiveYear);
            ourTeamLogo = ourTeamData?.logo || '';
            if (ourTeamData?.logo) {
                debugLog(`[MHR] Found logo for our team: ${settings.teamName}`);
            }
        } catch (error) {
            debugLog(`[MHR] Error fetching logo for our team:`, error);
        }
    }

    const schedule = [];
    // Track which MHR games have been matched to calendar events
    const matchedMhrGameNbrs = new Set<string | number>();

    for (const event of events) {
        const eventStartDate = new Date(event.start);
        
        // Skip events outside season boundaries
        if (eventStartDate < seasonStartDate) {
            debugLog(`Skipping event before season start: "${event.summary}" (${eventStartDate.toISOString()}) - Season starts ${seasonStartDate.toISOString()}`);
            continue;
        }
        if (eventStartDate > seasonEndDate) {
            debugLog(`Skipping event after season end: "${event.summary}" (${eventStartDate.toISOString()}) - Season ends ${seasonEndDate.toISOString()}`);
            continue;
        }

        // Skip practice/film review events - only include actual games
        const lowerSummary = event.summary.toLowerCase();
        const isPracticeLikeEvent =
            lowerSummary.includes('practice') ||
            lowerSummary.includes('pd practice') ||
            lowerSummary.includes('film review');
        if (isPracticeLikeEvent) {
            debugLog(`Skipping practice/film review event: "${event.summary}"`);
            continue;
        }

        // Check if this is a placeholder event BEFORE parsing opponent
        // This allows us to create placeholders for multi-day events or explicit TBD events
        const isPlaceholder = isPlaceholderEvent(event, event.summary);

        const { opponent, isHome } = parseEventSummary(event.summary, settings.identifiers);
        const opponentOverride = getOpponentOverride(opponent);

        if (isPlaceholder) {
            // Create a placeholder entry
            const startDate = new Date(event.start);
            const endDate = new Date(event.end);

            // Generate a unique ID for the placeholder
            const placeholderId = crypto.createHash('md5').update(`${event.start}-${event.summary}`).digest('hex').substring(0, 8);

            // Extract date components in Eastern Time
            const startEasternDateStr = startDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' });
            const [startMonthNum, startDayNum, startYear] = startEasternDateStr.split('/');
            const localDateStr = `${startYear}-${startMonthNum}-${startDayNum}`;

            // Format date range: "Dec 13-15" or "Dec 31-Jan 2" in Eastern Time
            const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' });
            const endMonth = endDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' });
            const startDay = parseInt(startDayNum, 10);
            const endEasternDateStr = endDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' });
            const [, endDayNum] = endEasternDateStr.split('/');
            const endDay = parseInt(endDayNum, 10);

            const dateRangePretty = startMonth === endMonth
                ? `${startMonth} ${startDay}-${endDay}`
                : `${startMonth} ${startDay}-${endMonth} ${endDay}`;

            // Clean up the summary by removing our team name identifiers
            let cleanSummary = event.summary;
            // Sort identifiers by length (descending) to avoid partial matches
            // Add "10U" to the list of identifiers to remove
            const identifiersToRemove = [...settings.identifiers, '10U'].sort((a, b) => b.length - a.length);
            
            for (const id of identifiersToRemove) {
                // Create a regex that matches the identifier with optional surrounding whitespace/punctuation
                // We want to remove "Jr Canes 10U Black", "Jr Canes", etc.
                const regex = new RegExp(`\\b${id}\\b`, 'gi');
                cleanSummary = cleanSummary.replace(regex, '').trim();
            }
            
            // Clean up any double spaces or leading/trailing punctuation that might remain
            cleanSummary = cleanSummary
                .replace(/\s+/g, ' ')
                .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
                .trim();

            // If we stripped everything (unlikely but possible), fall back to original
            if (!cleanSummary) {
                cleanSummary = event.summary;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const placeholderEntry: any = {
                game_nbr: placeholderId,
                game_date_format: localDateStr,
                game_time_format: '00:00:00', // Use valid time for date filtering/sorting
                game_date_format_pretty: dateRangePretty, // Use compact date range format
                game_time_format_pretty: 'TBD', // Display TBD to user
                home_team_name: settings.teamName,
                visitor_team_name: 'TBD',
                rink_name: event.location || 'TBD',
                game_type: 'Placeholder',
                // Placeholder-specific fields
                isPlaceholder: true,
                placeholderStartDate: startDate.toISOString(),
                placeholderEndDate: endDate.toISOString(),
                placeholderStartDatePretty: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
                placeholderEndDatePretty: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
                placeholderLabel: cleanSummary,
                placeholderDescription: `${cleanSummary} - Schedule TBD`,
            };

            schedule.push(placeholderEntry);
            debugLog(`[Placeholder] Created placeholder entry for "${cleanSummary}" (was "${event.summary}")`);
            continue;
        }

        const isHomeGame = isHome;

        // Skip if no opponent found (not a valid game)
        if (!opponent) {
            debugLog(`Skipping event "${event.summary}" - no opponent found`);
            continue;
        }

        const gameDate = new Date(event.start);
        const gameTime = gameDate.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
        
        // Use Eastern Time date for matching to avoid timezone issues (e.g. Sat night game becoming Sun in UTC)
        // Extract date components in Eastern Time (calculate early for override checks)
        const easternDateStr = gameDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' });
        const [month, day, year] = easternDateStr.split('/');
        const localDateStr = `${year}-${month}-${day}`;
        
        // Generate a unique game ID
        const gameId = crypto.createHash('md5').update(`${event.start}-${event.summary}`).digest('hex').substring(0, 8);

        // Check if this is a Tier 1 tournament/event (Tier 1 = AAA level)
        const isTier1Event = /\btier\s*1\b/i.test(event.summary) || /\btier\s*1\b/i.test(event.description || '');
        
        // Normalize opponent name and fix common typos before searching
        // Fix "Pheonix" -> "Phoenix" typo
        let normalizedOpponent = opponentOverride?.normalizedName || opponent;
        if (/\bpheonix\b/i.test(normalizedOpponent)) {
            normalizedOpponent = normalizedOpponent.replace(/\bpheonix\b/gi, 'Phoenix');
            debugLog(`[MHR] Fixed typo: "${opponent}" -> "${normalizedOpponent}"`);
        }
        
        // Check if this is the Dec 14 Buffalo Jr Sabres game that needs override
        const normalizedOpponentForOverride = (normalizedOpponent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isBuffaloJrSabres = normalizedOpponentForOverride.includes('buffalo') && 
                                   (normalizedOpponentForOverride.includes('sabres') || normalizedOpponentForOverride.includes('jrsabres'));
        const isDec14 = localDateStr.includes('12-14') || localDateStr.includes('2024-12-14') || localDateStr.includes('2025-12-14');
        const needsBuffaloOverride = isBuffaloJrSabres && isDec14;
        
        // Check if this is Phoenix Coyotes that needs override (team ID 4576)
        const isPhoenixCoyotes = normalizedOpponentForOverride.includes('phoenix') && normalizedOpponentForOverride.includes('coyotes');
        const needsPhoenixOverride = isPhoenixCoyotes;
        
        // If this is a game that needs override, clear any cached team data first to force a fresh search
        if (needsBuffaloOverride || needsPhoenixOverride) {
            const { getTeamMap, setTeamMap } = await import('./kv');
            const teamMap = await getTeamMap();
            // Clear cache for matching teams
            Object.keys(teamMap).forEach(key => {
                const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (needsBuffaloOverride && normalizedKey.includes('buffalo') && (normalizedKey.includes('sabres') || normalizedKey.includes('jrsabres'))) {
                    delete teamMap[key];
                    debugLog(`[MHR] Cleared cached team data for "${key}" to force fresh search`);
                } else if (needsPhoenixOverride && normalizedKey.includes('phoenix') && normalizedKey.includes('coyotes')) {
                    delete teamMap[key];
                    debugLog(`[MHR] Cleared cached team data for "${key}" to force fresh search`);
                }
            });
            await setTeamMap(teamMap);
        }
        
        // Get opponent MHR data using normalized name
        // If it's a Tier 1 event, prioritize AAA teams in the search
        let mhrData = await getMHRTeamData(normalizedOpponent, effectiveYear, '10U', mhrSchedule, isTier1Event ? 'AAA' : undefined);
        
        if (mhrData) {
            debugLog(`[MHR] Found data for ${opponent}:`, mhrData.name);
        }

        // Try to match this calendar event with an MHR game to get the real game_nbr and scores
        let mhrGameNbr = gameId; // Default to hash ID
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let matchedGame: any = null;
        if (mhrSchedule && Array.isArray(mhrSchedule)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            matchedGame = mhrSchedule.find((mhrGame: any) => {
                // Match by date - normalize MHR date to Eastern Time for comparison
                const mhrGameDate = mhrGame.game_date_format || mhrGame.game_date;
                if (!mhrGameDate) return false;
                
                // Normalize MHR date to Eastern Time format
                const mhrDateStr = normalizeDateToEastern(mhrGameDate);
                
                if (localDateStr !== mhrDateStr) return false;
                
                // Match by opponent (check both home and visitor)
                const mhrOpponent = isHomeGame ? mhrGame.visitor_team_name : mhrGame.home_team_name;
                if (!mhrOpponent) return false;
                
                // Normalize names for comparison
                const normalizeOpponent = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const calOpponent = normalizeOpponent(mhrData?.name || opponent);
                const mhrOpp = normalizeOpponent(mhrOpponent);
                
                if (!mhrOpp.includes(calOpponent) && !calOpponent.includes(mhrOpp)) return false;

                // Match by time (if available) to distinguish games on same day
                if (gameTime && mhrGame.game_time_format) {
                    // gameTime is HH:MM:SS or HH:MM
                    // mhrGame.game_time_format is HH:MM
                    const calTime = gameTime.substring(0, 5);
                    const mhrTime = mhrGame.game_time_format.substring(0, 5);
                    if (calTime !== mhrTime) return false;
                }

                return true;
            });
            
            if (matchedGame && matchedGame.game_nbr) {
                mhrGameNbr = matchedGame.game_nbr;
                matchedMhrGameNbrs.add(matchedGame.game_nbr);
                debugLog(`[MHR] Matched calendar event to MHR game ${mhrGameNbr}`);
            }
        }

        // Get opponent team ID from matched game if available, otherwise use mhrData
        // The matched game has opponent_team_id, or we can determine from home/visitor team IDs
        let opponentTeamId: string | null = null;
        
        // Specific override for known games with incorrect team IDs - CHECK THIS FIRST
        // Dec 14, 2024/2025 game against Buffalo Jr Sabres should use team ID 4624
        if (needsBuffaloOverride) {
            opponentTeamId = '4624';
            debugLog(`[MHR] Using override team ID 4624 for Buffalo Jr Sabres game on Dec 14 (forcing override regardless of cache/match)`);
            
            // If we don't have mhrData, fetch it using the override team ID
            if (!mhrData) {
                debugLog(`[MHR] No team data found via search, fetching details for team ID 4624`);
                try {
                    const scrapedDetails = await scrapeTeamDetails('4624', effectiveYear);
                    const { getTeamMap, setTeamMap } = await import('./kv');
                    const teamMap = await getTeamMap();
                    const cacheKey = normalizedOpponent;
                    if (cacheKey) {
                        const overrideTeamData: MHRTeamData = {
                            name: scrapedDetails.name || normalizedOpponent,
                            mhrId: '4624',
                            record: scrapedDetails.record,
                            rating: scrapedDetails.rating,
                            logo: scrapedDetails.logo,
                            lastUpdated: Date.now()
                        };
                        teamMap[cacheKey] = overrideTeamData;
                        await setTeamMap(teamMap);
                        // Update mhrData so it can be used below
                        mhrData = overrideTeamData;
                        debugLog(`[MHR] Fetched and cached team data for "${cacheKey}" with team ID 4624`);
                    }
                } catch (error) {
                    debugLog(`[MHR] Error fetching team details for ID 4624:`, error);
                }
            } else {
                // Update existing mhrData with correct team ID
                const { getTeamMap, setTeamMap } = await import('./kv');
                const teamMap = await getTeamMap();
                const cacheKey = mhrData.name || normalizedOpponent;
                if (cacheKey) {
                    teamMap[cacheKey] = {
                        ...mhrData,
                        mhrId: '4624',
                        lastUpdated: Date.now()
                    };
                    await setTeamMap(teamMap);
                    debugLog(`[MHR] Updated team map cache for "${cacheKey}" with correct team ID 4624`);
                }
            }
        } else if (needsPhoenixOverride) {
            // Phoenix Coyotes (including "Pheonix" typo) should use team ID 4576
            opponentTeamId = '4576';
            debugLog(`[MHR] Using override team ID 4576 for Phoenix Coyotes (forcing override regardless of cache/match)`);
            
            // If we don't have mhrData, fetch it using the override team ID
            if (!mhrData) {
                debugLog(`[MHR] No team data found via search, fetching details for team ID 4576`);
                try {
                    const scrapedDetails = await scrapeTeamDetails('4576', effectiveYear);
                    const { getTeamMap, setTeamMap } = await import('./kv');
                    const teamMap = await getTeamMap();
                    const cacheKey = normalizedOpponent;
                    if (cacheKey) {
                        const overrideTeamData: MHRTeamData = {
                            name: scrapedDetails.name || normalizedOpponent,
                            mhrId: '4576',
                            record: scrapedDetails.record,
                            rating: scrapedDetails.rating,
                            logo: scrapedDetails.logo,
                            lastUpdated: Date.now()
                        };
                        teamMap[cacheKey] = overrideTeamData;
                        await setTeamMap(teamMap);
                        // Update mhrData so it can be used below
                        mhrData = overrideTeamData;
                        debugLog(`[MHR] Fetched and cached team data for "${cacheKey}" with team ID 4576`);
                    }
                } catch (error) {
                    debugLog(`[MHR] Error fetching team details for ID 4576:`, error);
                }
            } else {
                // Update existing mhrData with correct team ID
                const { getTeamMap, setTeamMap } = await import('./kv');
                const teamMap = await getTeamMap();
                const cacheKey = mhrData.name || normalizedOpponent;
                if (cacheKey) {
                    teamMap[cacheKey] = {
                        ...mhrData,
                        mhrId: '4576',
                        lastUpdated: Date.now()
                    };
                    await setTeamMap(teamMap);
                    debugLog(`[MHR] Updated team map cache for "${cacheKey}" with correct team ID 4576`);
                }
            }
        } else if (opponentOverride?.teamId) {
            opponentTeamId = opponentOverride.teamId;
            if (!mhrData || mhrData.mhrId !== opponentOverride.teamId) {
                debugLog(`[MHR] Applying override for ${opponentOverride.normalizedName} (team ID ${opponentOverride.teamId})`);
                try {
                    const scrapedDetails = await scrapeTeamDetails(opponentOverride.teamId, effectiveYear);
                    const { getTeamMap, setTeamMap } = await import('./kv');
                    const teamMap = await getTeamMap();
                    const cacheKey = normalizedOpponent;
                    if (cacheKey) {
                        const overrideTeamData: MHRTeamData = {
                            name: scrapedDetails.name || opponentOverride.normalizedName,
                            mhrId: opponentOverride.teamId,
                            record: scrapedDetails.record,
                            rating: scrapedDetails.rating,
                            logo: scrapedDetails.logo,
                            lastUpdated: Date.now()
                        };
                        teamMap[cacheKey] = overrideTeamData;
                        await setTeamMap(teamMap);
                        mhrData = overrideTeamData;
                        debugLog(`[MHR] Cached override data for "${cacheKey}" with team ID ${opponentOverride.teamId}`);
                    }
                } catch (error) {
                    debugLog(`[MHR] Error applying override for ${opponentOverride.normalizedName}:`, error);
                    mhrData = {
                        name: opponentOverride.normalizedName,
                        mhrId: opponentOverride.teamId,
                        record: mhrData?.record,
                        rating: mhrData?.rating,
                        logo: mhrData?.logo,
                        lastUpdated: Date.now()
                    };
                }
            }
        } else if (matchedGame) {
            // If matched game has opponent_team_id, use it
            if (matchedGame.opponent_team_id) {
                opponentTeamId = String(matchedGame.opponent_team_id);
                debugLog(`[MHR] Using opponent_team_id from matched game: ${opponentTeamId}`);
            } else if (matchedGame.home_team_id && matchedGame.visitor_team_id) {
                // Determine based on which team is the opponent
                opponentTeamId = isHomeGame ? String(matchedGame.visitor_team_id) : String(matchedGame.home_team_id);
                debugLog(`[MHR] Using team ID from matched game (${isHomeGame ? 'visitor' : 'home'}): ${opponentTeamId}`);
            }
        }
        
        // Fallback to mhrData if we don't have a team ID from matched game
        if (!opponentTeamId) {
            opponentTeamId = mhrData?.mhrId || null;
        }
        
        // Smart merge: prefer calendar for location/time, prefer MHR for scores/opponent details
        // Location: prefer calendar, fallback to MHR
        const rinkName = event.location || matchedGame?.rink_name || matchedGame?.venue || 'TBD';
        
        // Time: prefer calendar (more accurate), but use MHR if calendar time is missing
        const finalGameTime = gameTime !== '00:00:00' ? gameTime : (matchedGame?.game_time_format || '00:00:00');
        const finalGameTimePretty = gameTime !== '00:00:00' 
            ? gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
            : (matchedGame?.game_time_format && matchedGame.game_time_format !== '00:00:00' 
                ? matchedGame.game_time_format.substring(0, 5)
                : 'TBD');

        // Scores: prefer MHR (source of truth for results)
        const homeScore = matchedGame?.home_team_score ?? 0;
        const visitorScore = matchedGame?.visitor_team_score ?? 0;

        // Opponent details: prefer MHR data (more complete)
        const finalOpponentName = mhrData?.name || normalizedOpponent;
        const finalOpponentLogo = mhrData?.logo || '';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gameEntry: any = {
            game_nbr: mhrGameNbr, // Use MHR game_nbr if matched, otherwise hash ID
            game_date_format: localDateStr,
            game_time_format: finalGameTime,
            game_date_format_pretty: gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
            game_time_format_pretty: finalGameTimePretty,
            home_team_name: isHomeGame ? settings.teamName : finalOpponentName,
            visitor_team_name: isHomeGame ? finalOpponentName : settings.teamName,
            home_team_logo: isHomeGame ? ourTeamLogo : finalOpponentLogo,
            visitor_team_logo: isHomeGame ? finalOpponentLogo : ourTeamLogo,
            home_team_score: homeScore,
            visitor_team_score: visitorScore,
            rink_name: rinkName,
            game_type: matchedGame?.game_type || 'Regular Season',
            // Legacy fields for backward compatibility
            opponent_record: mhrData?.record || '',
            opponent_rating: mhrData?.rating || '',
            // New fields for both teams
            home_team_record: isHomeGame ? (mainTeamStats?.record || '') : (mhrData?.record || ''),
            home_team_rating: isHomeGame ? (mainTeamStats?.rating || '') : (mhrData?.rating || ''),
            visitor_team_record: isHomeGame ? (mhrData?.record || '') : (mainTeamStats?.record || ''),
            visitor_team_rating: isHomeGame ? (mhrData?.rating || '') : (mainTeamStats?.rating || ''),
            // Team IDs for links - use opponentTeamId from matched game if available
            game_home_team: isHomeGame ? settings.mhrTeamId : opponentTeamId,
            game_visitor_team: isHomeGame ? opponentTeamId : settings.mhrTeamId,
            // Mark as calendar event (not MHR-only) for deduplication
            source: 'calendar'
        };

        schedule.push(gameEntry);
    }

    // Process unmatched MHR games (games not in calendar)
    if (mhrSchedule && Array.isArray(mhrSchedule)) {
        for (const mhrGame of mhrSchedule) {
            // Skip if already matched to a calendar event
            if (mhrGame.game_nbr && matchedMhrGameNbrs.has(mhrGame.game_nbr)) {
                continue;
            }

            // Verify required fields: date and opponent information
            const mhrGameDate = mhrGame.game_date_format || mhrGame.game_date;
            if (!mhrGameDate) {
                debugLog(`[MHR] Skipping MHR game without date: ${JSON.stringify(mhrGame)}`);
                continue;
            }

            // Check if we have opponent information (either home_team_name or visitor_team_name)
            const hasOpponentInfo = mhrGame.home_team_name || mhrGame.visitor_team_name || mhrGame.opponent_name;
            if (!hasOpponentInfo) {
                debugLog(`[MHR] Skipping MHR game without opponent info: ${JSON.stringify(mhrGame)}`);
                continue;
            }

            // Normalize date format to Eastern Time for consistency
            const mhrDateStr = normalizeDateToEastern(mhrGameDate);
            
            // Parse date for season filtering (use the Eastern Time date)
            const [year, month, day] = mhrDateStr.split('-').map(Number);
            const mhrGameDateObj = new Date(year, month - 1, day, 12, 0, 0);
            if (mhrGameDateObj < seasonStartDate || mhrGameDateObj > seasonEndDate) {
                debugLog(`[MHR] Skipping MHR game outside season: ${mhrDateStr}`);
                continue;
            }

            // Create game entry from MHR data
            const mhrGameEntry = await createGameFromMHR(
                mhrGame,
                mhrDateStr,
                settings,
                effectiveYear,
                ourTeamLogo,
                mainTeamStats
            );

            if (mhrGameEntry) {
                schedule.push(mhrGameEntry);
                debugLog(`[MHR] Created game entry from unmatched MHR game: ${mhrGame.game_nbr || 'unknown'}`);
            }
        }
    }

    // Deduplicate games - prefer calendar events over MHR-only games
    const deduplicatedSchedule = deduplicateGames(schedule, settings.identifiers);
    
    return deduplicatedSchedule.sort((a, b) => {
        const dateA = new Date(`${a.game_date_format}T${a.game_time_format}`);
        const dateB = new Date(`${b.game_date_format}T${b.game_time_format}`);
        return dateA.getTime() - dateB.getTime();
    });
}

/**
 * Deduplicates games by date, time, and opponent
 * When duplicates are found, prefers calendar events (source !== 'mhr-only') over MHR-only games
 * Merges data intelligently: calendar for location/time, MHR for scores/details
 */
function deduplicateGames(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    games: any[],
    identifiers: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
    // Create a map to track games by their unique key (date + time + opponent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameMap = new Map<string, any>();
    
    for (const game of games) {
        // Skip placeholders - they shouldn't be deduplicated
        if (game.isPlaceholder) {
            gameMap.set(`placeholder-${game.game_nbr}`, game);
            continue;
        }
        
        // Create a unique key for this game: date + time + opponent
        const date = game.game_date_format || '';
        const time = game.game_time_format || '00:00:00';
        
        // Normalize opponent name for comparison
        const homeTeam = game.home_team_name || '';
        const visitorTeam = game.visitor_team_name || '';
        const isHomeGame = isUs(homeTeam, identifiers);
        const opponent = isHomeGame ? visitorTeam : homeTeam;
        const normalizedOpponent = opponent.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Create key: date + time (rounded to nearest 5 minutes for fuzzy matching) + opponent
        // Round time to nearest 5 minutes to handle slight time differences
        const timeParts = time.split(':');
        const hours = parseInt(timeParts[0] || '0', 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        const roundedMinutes = Math.round(minutes / 5) * 5;
        const roundedTime = `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
        
        const key = `${date}|${roundedTime}|${normalizedOpponent}`;
        
        const existingGame = gameMap.get(key);
        
        if (!existingGame) {
            // First occurrence of this game
            gameMap.set(key, game);
        } else {
            // Duplicate found - merge them
            const isExistingFromCalendar = existingGame.source !== 'mhr-only';
            const isNewFromCalendar = game.source !== 'mhr-only';
            
            // Prefer calendar event over MHR-only
            if (isNewFromCalendar && !isExistingFromCalendar) {
                // New game is from calendar, existing is MHR-only - replace with merged version
                gameMap.set(key, mergeGameData(existingGame, game));
            } else if (!isNewFromCalendar && isExistingFromCalendar) {
                // Existing is from calendar, new is MHR-only - merge into existing
                gameMap.set(key, mergeGameData(game, existingGame));
            } else {
                // Both from same source, or both MHR-only - prefer the one with more complete data
                // (e.g., has scores, has location, etc.)
                const existingScore = (existingGame.home_team_score || 0) + (existingGame.visitor_team_score || 0);
                const newScore = (game.home_team_score || 0) + (game.visitor_team_score || 0);
                const existingHasLocation = existingGame.rink_name && existingGame.rink_name !== 'TBD';
                const newHasLocation = game.rink_name && game.rink_name !== 'TBD';
                
                if (newScore > existingScore || (newHasLocation && !existingHasLocation)) {
                    // New game has better data
                    gameMap.set(key, mergeGameData(existingGame, game));
                } else {
                    // Existing game has better data
                    gameMap.set(key, mergeGameData(game, existingGame));
                }
            }
            
            debugLog(`[Deduplicate] Merged duplicate game: ${date} ${time} vs ${opponent}`);
        }
    }
    
    return Array.from(gameMap.values());
}

/**
 * Merges two game entries, preferring the primary game but taking the best data from both
 * Primary should be the calendar event (if available), secondary is MHR-only
 */
function mergeGameData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    secondary: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    // Start with primary (calendar event)
    const merged = { ...primary };
    
    // Prefer calendar for: location, time (if calendar has specific time)
    // Prefer MHR for: scores, game_nbr, opponent details (record, rating, logo)
    
    // Location: prefer calendar, fallback to MHR
    if (!merged.rink_name || merged.rink_name === 'TBD') {
        merged.rink_name = secondary.rink_name || merged.rink_name;
    }
    
    // Time: prefer calendar if it has a specific time (not 00:00:00), otherwise use MHR
    if (merged.game_time_format === '00:00:00' || merged.game_time_format === '00:00') {
        if (secondary.game_time_format && secondary.game_time_format !== '00:00:00' && secondary.game_time_format !== '00:00') {
            merged.game_time_format = secondary.game_time_format;
            merged.game_time_format_pretty = secondary.game_time_format_pretty;
        }
    }
    
    // Scores: prefer MHR (source of truth for results)
    if ((secondary.home_team_score || 0) + (secondary.visitor_team_score || 0) > 
        (merged.home_team_score || 0) + (merged.visitor_team_score || 0)) {
        merged.home_team_score = secondary.home_team_score ?? merged.home_team_score;
        merged.visitor_team_score = secondary.visitor_team_score ?? merged.visitor_team_score;
    }
    
    // Game number: prefer MHR game_nbr if available
    if (secondary.game_nbr && (!merged.game_nbr || typeof merged.game_nbr === 'string' && merged.game_nbr.length === 8)) {
        // If merged has a hash-based ID (8 chars), prefer MHR game_nbr
        merged.game_nbr = secondary.game_nbr;
    }
    
    // Opponent details: prefer MHR (more complete)
    if (!merged.opponent_record && secondary.opponent_record) {
        merged.opponent_record = secondary.opponent_record;
    }
    if (!merged.opponent_rating && secondary.opponent_rating) {
        merged.opponent_rating = secondary.opponent_rating;
    }
    
    // Team records and ratings: prefer MHR if available
    if (!merged.home_team_record && secondary.home_team_record) {
        merged.home_team_record = secondary.home_team_record;
    }
    if (!merged.home_team_rating && secondary.home_team_rating) {
        merged.home_team_rating = secondary.home_team_rating;
    }
    if (!merged.visitor_team_record && secondary.visitor_team_record) {
        merged.visitor_team_record = secondary.visitor_team_record;
    }
    if (!merged.visitor_team_rating && secondary.visitor_team_rating) {
        merged.visitor_team_rating = secondary.visitor_team_rating;
    }
    
    // Logos: prefer MHR if available
    if (!merged.home_team_logo && secondary.home_team_logo) {
        merged.home_team_logo = secondary.home_team_logo;
    }
    if (!merged.visitor_team_logo && secondary.visitor_team_logo) {
        merged.visitor_team_logo = secondary.visitor_team_logo;
    }
    
    // Team IDs: prefer MHR if available
    if (!merged.game_home_team && secondary.game_home_team) {
        merged.game_home_team = secondary.game_home_team;
    }
    if (!merged.game_visitor_team && secondary.game_visitor_team) {
        merged.game_visitor_team = secondary.game_visitor_team;
    }
    
    // Remove source flag since this is now a merged game
    delete merged.source;
    
    return merged;
}

function parseEventSummary(summary: string, identifiers: string[]): { opponent: string | null, isHome: boolean } {
    // Normalize summary
    let cleanSummary = summary.trim();
    let explicitHomeAway: 'home' | 'away' | null = null;
    cleanSummary = cleanSummary
        .replace(/\(\s*(home|away)\s*\)/gi, (_, match: string) => {
            explicitHomeAway = match.toLowerCase() as 'home' | 'away';
            return '';
        })
        .replace(/\s+/g, ' ')
        .trim();
    
    // Check for "vs" (Home) or "@" (Away)
    const vsMatch = cleanSummary.match(/\s(vs\.?|versus)\s/i);
    const atMatch = cleanSummary.match(/\s(@|at)\s/i);
    const hyphenMatch = cleanSummary.match(/\s(–|-|—)\s/); // En dash, hyphen, em dash

    let opponent = null;
    let isHome = true; // Default to home if unsure? No, better to be strict.

    if (vsMatch) {
        // "vs" means: [Home] vs [Away]
        const parts = cleanSummary.split(vsMatch[0]);
        if (isUs(parts[0], identifiers)) {
            // We are on the left (home)
            opponent = parts[1];
            isHome = true;
        } else {
            // Opponent is on the left (home), we are away
            opponent = parts[0];
            isHome = false;
        }
    } else if (atMatch) {
        // "@" or "at" means: [Away] @ [Home]
        const parts = cleanSummary.split(atMatch[0]);
        if (isUs(parts[0], identifiers)) {
            // We are on the left (away)
            opponent = parts[1];
            isHome = false;
        } else {
            // Opponent is on the left (away), we are home
            opponent = parts[0];
            isHome = true;
        }
    } else if (hyphenMatch) {
        const parts = cleanSummary.split(hyphenMatch[0]);
        if (parts.length >= 2) {
            const part0 = parts[0].trim();
            const part1 = parts[1].trim();
            
            const us0 = isUs(part0, identifiers);
            const us1 = isUs(part1, identifiers);

            if (us0 && !us1) {
                opponent = part1;
                isHome = true;
            } else if (!us0 && us1) {
                opponent = part0;
                isHome = false;
            } else if (us0 && us1) {
                const id0 = getFirstMatchingIdentifier(part0, identifiers);
                const id1 = getFirstMatchingIdentifier(part1, identifiers);
                
                if (id0 < id1) {
                    opponent = part1;
                    isHome = true;
                } else {
                    opponent = part0;
                    isHome = false;
                }
            }
        }
    } else {
        // No separator found.
        //
        // Historically we treated any non-"us" title as an opponent name, but that
        // causes non-game calendar entries (Team Photo, Breakfast, Concussion Testing, etc.)
        // to be misclassified as games.
        //
        // New rule: if there's no explicit separator, only treat it as a game when:
        // - The title includes one of our identifiers (e.g. "Jr Canes Black"), OR
        // - The title explicitly includes (Home) or (Away), which is a user override.
        //
        // This preserves safety (don't misclassify random events), while allowing
        // explicit calendar overrides like "Opponent (Away)" to be treated as games
        // even when our team name isn't present in the title.
        if (explicitHomeAway && cleanSummary && !isUs(cleanSummary, identifiers)) {
            opponent = cleanSummary;
            isHome = explicitHomeAway === 'home';
        } else if (isUs(cleanSummary, identifiers)) {
            opponent = cleanSummary;
            isHome = true;
        }
    }

    if (opponent) {
        if (explicitHomeAway) {
            return { opponent: opponent.trim(), isHome: explicitHomeAway === 'home' };
        }
        return { opponent: opponent.trim(), isHome };
    }

    return { opponent: null, isHome: false };
}

function isUs(name: string, identifiers: string[]): boolean {
    const lowerName = name.toLowerCase();
    for (const id of identifiers) {
        if (lowerName.includes(id.toLowerCase())) {
            return true;
        }
    }
    return false;
}

function getFirstMatchingIdentifier(name: string, identifiers: string[]): number {
    const lowerName = name.toLowerCase();
    for (let i = 0; i < identifiers.length; i++) {
        if (lowerName.includes(identifiers[i].toLowerCase())) {
            return i;
        }
    }
    return identifiers.length;
}

interface OpponentOverrideResult {
    normalizedName: string;
    teamId?: string;
}

function getOpponentOverride(opponent: string | null): OpponentOverrideResult | null {
    if (!opponent) {
        return null;
    }

    const normalized = opponent.toLowerCase();
    const collapsed = normalized.replace(/[^a-z0-9]/g, '');

    if (collapsed.includes('cph')) {
        return {
            normalizedName: 'Carolina Premier',
            teamId: '27724'
        };
    }

    if (collapsed.includes('mercerchiefs')) {
        return {
            normalizedName: 'Mercer Chiefs',
            teamId: '1191'
        };
    }

    return null;
}
