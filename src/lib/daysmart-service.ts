import type { StickAndPuckSession } from '@/types';

const DAYSMART_BASE_URL = 'https://apps.daysmartrecreation.com/dash/jsonapi/api/v1';
const COMPANY_CODE = 'polarice';
const PROGRAM_ID = 2; // Open Hockey / Stick and Puck program

interface DaySmartTeam {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    facility_id?: number;
    league_id?: number;
    description?: string;
    start_date?: string;
  };
  relationships?: {
    facility?: {
      data?: {
        id?: string;
        type?: string;
      };
    };
    league?: {
      data?: {
        id?: string;
        type?: string;
      };
    };
    registrableEvents?: {
      data?: Array<{
        id?: string;
        type?: string;
      }>;
    };
  };
}

interface DaySmartEvent {
  id: string;
  type: string;
  attributes?: {
    start?: string; // ISO datetime
    end?: string; // ISO datetime
    start_date?: string;
    event_start_time?: string;
    desc?: string;
    register_capacity?: number;
    publish?: boolean;
  };
  relationships?: {
    summary?: {
      data?: {
        id?: string;
        type?: string;
      };
    };
  };
}

interface DaySmartEventSummary {
  id: string;
  type: string;
  attributes?: {
    remaining_registration_slots?: number;
  };
}

interface DaySmartFacility {
  id: string;
  type: string;
  attributes?: {
    name?: string;
  };
}

interface DaySmartLeague {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    start_date?: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    price?: number;
    off_peak_price?: number;
    description?: string;
  };
  relationships?: {
    facility?: {
      data?: {
        id?: string;
        type?: string;
      };
    };
    skillLevel?: {
      data?: {
        id?: string;
        type?: string;
      };
    };
  };
}

interface DaySmartApiResponse<T> {
  data: T[];
  included?: Array<{
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * Fetch all facilities (rinks) from DaySmart API
 */
async function fetchFacilities(): Promise<Map<string, string>> {
  const url = `${DAYSMART_BASE_URL}/facilities?filter[active]=true&filter[my_sam_visible]=true&page[size]=100&company=${COMPANY_CODE}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json, application/json',
        'Content-Type': 'application/vnd.api+json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://apps.daysmartrecreation.com/',
        'Origin': 'https://apps.daysmartrecreation.com',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch facilities: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as DaySmartApiResponse<DaySmartFacility>;
    const facilityMap = new Map<string, string>();

    // Map facility IDs to names from data array
    for (const facility of data.data) {
      const id = facility.id;
      const name = facility.attributes?.name as string | undefined || `Facility ${id}`;
      facilityMap.set(id, name);
    }

    // Also check included data for facility details
    if (data.included) {
      for (const item of data.included) {
        if (item.type === 'facility' && item.attributes) {
          const name = (item.attributes.name as string) || `Facility ${item.id}`;
          facilityMap.set(item.id, name);
        }
      }
    }

    return facilityMap;
  } catch (error) {
    console.error('[DaySmart] Error fetching facilities:', error);
    throw error;
  }
}

/**
 * Fetch registrableEvents for a team
 */
async function fetchTeamEvents(teamId: string): Promise<Array<{ event: DaySmartEvent; summary?: DaySmartEventSummary }>> {
  const url = `${DAYSMART_BASE_URL}/teams/${teamId}/registrableEvents?cache[save]=false&include=summary&filter[publish]=true&filter[unconstrained]=true&fields[events]=id,start,end,summary,register_capacity,desc&fields[event-summaries]=id,remaining_registration_slots&page[size]=100&company=${COMPANY_CODE}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json, application/json',
        'Content-Type': 'application/vnd.api+json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://apps.daysmartrecreation.com/',
        'Origin': 'https://apps.daysmartrecreation.com',
      },
    });

    if (!response.ok) {
      // Some teams might not have events, that's OK
      if (response.status === 404) {
        return [];
      }
      console.warn(`[DaySmart] Failed to fetch events for team ${teamId}: ${response.status}`);
      return [];
    }

    const data = await response.json() as DaySmartApiResponse<DaySmartEvent>;
    const events: Array<{ event: DaySmartEvent; summary?: DaySmartEventSummary }> = [];
    
    // Map summaries by event ID
    const summaryMap = new Map<string, DaySmartEventSummary>();
    if (data.included) {
      for (const item of data.included) {
        if (item.type === 'event-summaries' || item.type === 'event-summary') {
          summaryMap.set(item.id, { id: item.id, type: item.type, attributes: item.attributes });
        }
      }
    }
    
    // Match events with their summaries
    for (const event of data.data) {
      const summaryId = event.relationships?.summary?.data?.id;
      const summary = summaryId ? summaryMap.get(summaryId) : undefined;
      events.push({ event, summary });
    }
    
    return events;
  } catch (error) {
    console.error(`[DaySmart] Error fetching events for team ${teamId}:`, error);
    return [];
  }
}

/**
 * Fetch teams for a league
 */
async function fetchLeagueTeams(leagueId: string, facilityMap: Map<string, string>): Promise<DaySmartTeam[]> {
  const url = `${DAYSMART_BASE_URL}/teams?filter[league_id]=${leagueId}&filter[visible_online]=true&include=facility&page[size]=100&company=${COMPANY_CODE}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json, application/json',
        'Content-Type': 'application/vnd.api+json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://apps.daysmartrecreation.com/',
        'Origin': 'https://apps.daysmartrecreation.com',
      },
    });

    if (!response.ok) {
      console.warn(`[DaySmart] Failed to fetch teams for league ${leagueId}: ${response.status}`);
      return [];
    }

    const data = await response.json() as DaySmartApiResponse<DaySmartTeam>;
    
    // Update facility map from included data
    if (data.included) {
      for (const item of data.included) {
        if (item.type === 'facility' && item.attributes) {
          const name = (item.attributes.name as string) || `Facility ${item.id}`;
          facilityMap.set(item.id, name);
        }
      }
    }
    
    return data.data;
  } catch (error) {
    console.error(`[DaySmart] Error fetching teams for league ${leagueId}:`, error);
    return [];
  }
}

/**
 * Fetch all leagues and extract individual sessions from teams -> events
 */
async function fetchLeagues(facilityMap: Map<string, string>): Promise<StickAndPuckSession[]> {
  const sessions: StickAndPuckSession[] = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    // Fetch leagues
    const url = `${DAYSMART_BASE_URL}/leagues?filter[program_id]=${PROGRAM_ID}&filter[visible_online]=true&page[size]=${pageSize}&page[number]=${page}&sort=start_date&include=facility,skillLevel&company=${COMPANY_CODE}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.api+json, application/json',
          'Content-Type': 'application/vnd.api+json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://apps.daysmartrecreation.com/',
          'Origin': 'https://apps.daysmartrecreation.com',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch leagues: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as DaySmartApiResponse<DaySmartLeague>;
      
      // Update facility map from included data
      if (data.included) {
        for (const item of data.included) {
          if (item.type === 'facility' && item.attributes) {
            const name = (item.attributes.name as string) || `Facility ${item.id}`;
            facilityMap.set(item.id, name);
          }
        }
      }
      
      // Process leagues
      for (const league of data.data) {
        const attrs = league.attributes || {};
        
        // Get facility ID from relationships
        const facilityId = league.relationships?.facility?.data?.id;
        const facilityName = facilityId ? facilityMap.get(facilityId) : undefined;
        
        // Skip if no facility name (invalid data)
        if (!facilityName) {
          continue;
        }

        // Filter: Only include sessions with both "stick" and "puck" in description (case insensitive)
        const description = (attrs.description as string) || (attrs.name as string) || '';
        const descriptionLower = description.toLowerCase();
        if (!descriptionLower.includes('stick') || !descriptionLower.includes('puck')) {
          continue; // Skip adult skates, power skating, etc.
        }

        // Fetch teams for this league
        const teams = await fetchLeagueTeams(league.id, facilityMap);
        
        // For each team, fetch registrableEvents
        for (const team of teams) {
          const teamAttrs = team.attributes || {};
          const teamFacilityId = team.relationships?.facility?.data?.id || String(teamAttrs.facility_id);
          const teamFacilityName = teamFacilityId ? facilityMap.get(teamFacilityId) : facilityName;
          
          // Determine if this is off-peak or regular based on team name
          const teamName = (teamAttrs.name as string) || '';
          const isOffPeak = teamName.toLowerCase().includes('off peak') || teamName.toLowerCase().includes('off-peak');
          
          // Fetch events for this team
          const teamEvents = await fetchTeamEvents(team.id);
          
          for (const { event, summary } of teamEvents) {
            const eventAttrs = event.attributes || {};
            const start = eventAttrs.start as string | undefined;
            
            if (!start) {
              continue;
            }
            
            // Parse ISO datetime and convert to local timezone
            // The API returns times in the facility's local timezone, but as ISO strings
            // We need to parse it and extract the local date/time
            let eventDate: Date;
            try {
              // Parse the ISO datetime string
              eventDate = new Date(start);
              if (isNaN(eventDate.getTime())) {
                continue;
              }
            } catch {
              continue;
            }
            
            // Extract date in local timezone (YYYY-MM-DD)
            const year = eventDate.getFullYear();
            const month = String(eventDate.getMonth() + 1).padStart(2, '0');
            const day = String(eventDate.getDate()).padStart(2, '0');
            const date = `${year}-${month}-${day}`;
            
            // Extract time in local timezone (HH:mm)
            const hours = String(eventDate.getHours()).padStart(2, '0');
            const minutes = String(eventDate.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            
            // Get remaining slots from summary
            const remainingSlots = summary?.attributes?.remaining_registration_slots as number | undefined;
            const capacity = eventAttrs.register_capacity as number | undefined;
            const isFull = remainingSlots !== undefined && remainingSlots <= 0;
            
            // Determine price (we'll need to get this from team or event, defaulting to 0 for now)
            // Price information may not be available in the events endpoint
            const price = 0; // Price might be in team or event data, but not visible in the sample
            const priceType: 'regular' | 'off-peak' = isOffPeak ? 'off-peak' : 'regular';
            
            // Registration URL - use the group/register path structure
            // Format: /online/{company}/group/register/{teamId}
            // The URL expects a team ID, not an event ID
            const registrationUrl = `https://apps.daysmartrecreation.com/dash/x/#/online/${COMPANY_CODE}/group/register/${team.id}`;
            
            const session: StickAndPuckSession = {
              id: event.id,
              date,
              time,
              rink: teamFacilityName || facilityName,
              price,
              priceType,
              registrationUrl,
              description: description || undefined,
              leagueId: league.id,
              remainingSlots,
              capacity,
              isFull,
            };
            
            sessions.push(session);
          }
        }
      }

      // Check if there are more pages
      hasMore = data.data.length === pageSize;
      page++;
    } catch (error) {
      console.error(`[DaySmart] Error fetching leagues page ${page}:`, error);
      if (page === 1) {
        throw error;
      }
      hasMore = false;
    }
  }

  return sessions;
}

/**
 * Fetch all stick and puck sessions from DaySmart Recreation API
 */
export async function fetchStickAndPuckSessions(): Promise<StickAndPuckSession[]> {
  try {
    // First, fetch facilities to map IDs to names
    const facilityMap = await fetchFacilities();
    
    if (facilityMap.size === 0) {
      console.warn('[DaySmart] No facilities found');
      return [];
    }

    // Then fetch all leagues with their details
    const sessions = await fetchLeagues(facilityMap);

    // Sort by date and time
    sessions.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    console.log(`[DaySmart] Fetched ${sessions.length} stick and puck sessions`);
    return sessions;
  } catch (error) {
    console.error('[DaySmart] Error fetching stick and puck sessions:', error);
    throw error;
  }
}

