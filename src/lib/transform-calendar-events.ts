import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMHRTeamData } from './mhr-service';

const SETTINGS_PATH = path.join(process.cwd(), 'src/data/settings.json');

function getSettings() {
    if (fs.existsSync(SETTINGS_PATH)) {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    return {
        teamName: 'Carolina Junior Canes (Black) 10U AA',
        identifiers: ['Black', 'Jr Canes', 'Carolina', 'Jr'],
        teamLogo: ''
    };
}

interface CalendarEvent {
    summary: string;
    start: Date;
    end: Date;
    location?: string;
    description?: string;
}

export async function transformCalendarEvents(
    events: CalendarEvent[], 
    mhrSchedule: any[] = [], 
    year: string = '2025',
    mainTeamStats?: { record: string; rating: string }
) {
    const settings = getSettings();
    const { identifiers, teamLogo, teamName, mhrYear } = settings;
    
    // Use mhrYear from settings if available, otherwise use the passed year parameter
    const effectiveYear = mhrYear || year;

    // Extract age group from team name (e.g. "10U")
    const ageGroupMatch = teamName.match(/(\d+U)/i);
    const ageGroup = ageGroupMatch ? ageGroupMatch[1] : '';

    const schedule = [];

    for (const event of events) {
        // Filter out placeholder events
        if (event.summary.includes('Tier 1 Elite Tournament')) continue;

        // Filter out events longer than 2 hours (likely tournaments/showcases)
        const duration = event.end.getTime() - event.start.getTime();
        if (duration > 2 * 60 * 60 * 1000) {
            console.log(`Skipping event "${event.summary}" due to duration > 2h (${(duration / (60*60*1000)).toFixed(1)}h)`);
            continue;
        }

        const { opponent, isHome } = parseEventSummary(event.summary, settings.identifiers);
        const isHomeGame = isHome;
        
        // Skip if no opponent found (likely not a game)
        if (!opponent) continue;

        const gameDate = new Date(event.start);
        const gameTime = gameDate.toLocaleTimeString('en-US', { hour12: false });
        
        // Generate a unique game ID
        const gameId = crypto.createHash('md5').update(`${event.start}-${event.summary}`).digest('hex').substring(0, 8);

        // Get opponent MHR data
        const mhrData = await getMHRTeamData(opponent, effectiveYear);
        
        if (mhrData) {
            console.log(`[MHR] Found data for ${opponent}:`, mhrData.name);
        }

        // Use local date for matching to avoid timezone issues (e.g. Sat night game becoming Sun in UTC)
        const year = gameDate.getFullYear();
        const month = String(gameDate.getMonth() + 1).padStart(2, '0');
        const day = String(gameDate.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;

        // Try to match this calendar event with an MHR game to get the real game_nbr
        let mhrGameNbr = gameId; // Default to hash ID
        if (mhrSchedule && Array.isArray(mhrSchedule)) {
            const matchedGame = mhrSchedule.find((mhrGame: any) => {
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
                console.log(`[MHR] Matched calendar event to MHR game ${mhrGameNbr}`);
            }
        }

        const gameEntry: any = {
            game_nbr: mhrGameNbr, // Use MHR game_nbr if matched, otherwise hash ID
            game_date_format: localDateStr,
            game_time_format: gameTime,
            game_date_format_pretty: gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            game_time_format_pretty: gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            home_team_name: isHomeGame ? settings.teamName : (mhrData?.name || opponent),
            visitor_team_name: isHomeGame ? (mhrData?.name || opponent) : settings.teamName,
            home_team_logo: isHomeGame ? settings.teamLogo : (mhrData?.logo || ''),
            visitor_team_logo: isHomeGame ? (mhrData?.logo || '') : settings.teamLogo,
            home_team_score: 0, // Default
            visitor_team_score: 0, // Default
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
        isHome = true;
        const parts = cleanSummary.split(vsMatch[0]);
        if (isUs(parts[0], identifiers)) {
            opponent = parts[1];
        } else {
            opponent = parts[0];
        }
    } else if (atMatch) {
        isHome = false;
        const parts = cleanSummary.split(atMatch[0]);
        if (isUs(parts[0], identifiers)) {
            opponent = parts[1];
        } else {
            opponent = parts[0];
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
