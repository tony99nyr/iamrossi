import crypto from 'crypto';
import { getMHRTeamData, scrapeTeamDetails } from './mhr-service';
import { getSettings as getSettingsFromKV } from './kv';
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

            const year = startDate.getFullYear();
            const month = String(startDate.getMonth() + 1).padStart(2, '0');
            const day = String(startDate.getDate()).padStart(2, '0');
            const localDateStr = `${year}-${month}-${day}`;

            // Format date range: "Dec 13-15" or "Dec 31-Jan 2"
            const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
            const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
            const startDay = startDate.getDate();
            const endDay = endDate.getDate();

            const dateRangePretty = startMonth === endMonth
                ? `${startMonth} ${startDay}-${endDay}`
                : `${startMonth} ${startDay}-${endMonth} ${endDay}`;

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
                placeholderStartDatePretty: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                placeholderEndDatePretty: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                placeholderLabel: event.summary,
                placeholderDescription: `${event.summary} - Schedule TBD`,
            };

            schedule.push(placeholderEntry);
            debugLog(`[Placeholder] Created placeholder entry for "${event.summary}"`);
            continue;
        }

        const isHomeGame = isHome;

        // Skip if no opponent found (not a valid game)
        if (!opponent) {
            debugLog(`Skipping event "${event.summary}" - no opponent found`);
            continue;
        }

        const gameDate = new Date(event.start);
        const gameTime = gameDate.toLocaleTimeString('en-US', { hour12: false });
        
        // Generate a unique game ID
        const gameId = crypto.createHash('md5').update(`${event.start}-${event.summary}`).digest('hex').substring(0, 8);

        // Get opponent MHR data
        const mhrData = await getMHRTeamData(opponent, effectiveYear);
        
        if (mhrData) {
            debugLog(`[MHR] Found data for ${opponent}:`, mhrData.name);
        }

        // Use local date for matching to avoid timezone issues (e.g. Sat night game becoming Sun in UTC)
        const year = gameDate.getFullYear();
        const month = String(gameDate.getMonth() + 1).padStart(2, '0');
        const day = String(gameDate.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;

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


        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gameEntry: any = {
            game_nbr: mhrGameNbr, // Use MHR game_nbr if matched, otherwise hash ID
            game_date_format: localDateStr,
            game_time_format: gameTime,
            game_date_format_pretty: gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            game_time_format_pretty: gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            home_team_name: isHomeGame ? settings.teamName : (mhrData?.name || opponent),
            visitor_team_name: isHomeGame ? (mhrData?.name || opponent) : settings.teamName,
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
            // Team IDs for links
            game_home_team: isHomeGame ? settings.mhrTeamId : (mhrData?.mhrId || null),
            game_visitor_team: isHomeGame ? (mhrData?.mhrId || null) : settings.mhrTeamId
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
