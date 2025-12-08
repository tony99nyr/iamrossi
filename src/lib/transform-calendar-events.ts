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

interface CalendarEvent {
    summary: string;
    start: Date;
    end: Date;
    location?: string;
    description?: string;
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

        // Skip practice events - only include actual games
        const lowerSummary = event.summary.toLowerCase();
        if (lowerSummary.includes('practice') || lowerSummary.includes('pd practice')) {
            debugLog(`Skipping practice event: "${event.summary}"`);
            continue;
        }

        // Check if this is a placeholder event BEFORE parsing opponent
        // This allows us to create placeholders for multi-day events or explicit TBD events
        const isPlaceholder = isPlaceholderEvent(event, event.summary);

        const { opponent, isHome } = parseEventSummary(event.summary, settings.identifiers);

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
        let normalizedOpponent = opponent;
        if (/\bpheonix\b/i.test(opponent)) {
            normalizedOpponent = opponent.replace(/\bpheonix\b/gi, 'Phoenix');
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
                // Match by date
                const mhrGameDate = mhrGame.game_date_format || mhrGame.game_date;
                if (!mhrGameDate) return false;
                
                const mhrDateStr = mhrGameDate.includes('-') ? mhrGameDate : 
                    `${mhrGameDate.substring(0,4)}-${mhrGameDate.substring(4,6)}-${mhrGameDate.substring(6,8)}`;
                
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
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gameEntry: any = {
            game_nbr: mhrGameNbr, // Use MHR game_nbr if matched, otherwise hash ID
            game_date_format: localDateStr,
            game_time_format: gameTime,
            game_date_format_pretty: gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
            game_time_format_pretty: gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }),
            home_team_name: isHomeGame ? settings.teamName : (mhrData?.name || normalizedOpponent),
            visitor_team_name: isHomeGame ? (mhrData?.name || normalizedOpponent) : settings.teamName,
            home_team_logo: isHomeGame ? ourTeamLogo : (mhrData?.logo || ''),
            visitor_team_logo: isHomeGame ? (mhrData?.logo || '') : ourTeamLogo,
            home_team_score: matchedGame?.home_team_score ?? 0, // Use matched score or default to 0
            visitor_team_score: matchedGame?.visitor_team_score ?? 0, // Use matched score or default to 0
            rink_name: event.location || 'TBD',
            game_type: 'Regular Season',
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
            game_visitor_team: isHomeGame ? opponentTeamId : settings.mhrTeamId
        };

        schedule.push(gameEntry);
    }

    return schedule.sort((a, b) => {
        const dateA = new Date(`${a.game_date_format}T${a.game_time_format}`);
        const dateB = new Date(`${b.game_date_format}T${b.game_time_format}`);
        return dateA.getTime() - dateB.getTime();
    });
}

function parseEventSummary(summary: string, identifiers: string[]): { opponent: string | null, isHome: boolean } {
    // Normalize summary
    const cleanSummary = summary.trim();
    
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
        // No separator found - check if the title is just an opponent name
        // If the summary doesn't contain any of our team identifiers, treat it as opponent
        if (!isUs(cleanSummary, identifiers)) {
            // Title is likely just the opponent name
            // Default to home game (common convention when only opponent is listed)
            opponent = cleanSummary;
            isHome = true;
        }
    }

    if (opponent) {
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
