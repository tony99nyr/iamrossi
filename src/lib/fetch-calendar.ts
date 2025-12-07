import ical from 'node-ical';

export interface CalendarEvent {
  summary: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  uid: string;
}

/**
 * Fetches and parses the iCal feed from the secret calendar address
 * @returns Array of parsed calendar events
 */
export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const calendarUrl = process.env.HOCKEY_CALENDAR_SECRET_ADDRESS;
  
  if (!calendarUrl) {
    throw new Error('HOCKEY_CALENDAR_SECRET_ADDRESS environment variable is not set');
  }

  try {
    // Fetch and parse the iCal feed
    const events = await ical.async.fromURL(calendarUrl);
    
    const calendarEvents: CalendarEvent[] = [];
    
    // Extract VEVENT components
    for (const key in events) {
      const event = events[key];
      
      // Only process VEVENT type (actual events, not todos or other types)
      if (event.type === 'VEVENT') {
        const summary = event.summary || '';
        
        // Skip practice events - only include actual games
        const lowerSummary = summary.toLowerCase();
        if (lowerSummary.includes('practice')) {
          continue;
        }
        
        // Filter for game events:
        // 1. Has separator pattern (vs, @, versus, or hyphen) - traditional format
        // 2. OR has start time and location - likely a game even without separator
        const hasSeparator = /\b(vs\.?|@|versus)\b|(?:\s+(?:-|–|—)\s+)/i.test(summary);
        const hasTimeAndLocation = event.start && event.location;
        
        if ((hasSeparator || hasTimeAndLocation) && event.start) {
          calendarEvents.push({
            summary: summary,
            start: new Date(event.start),
            end: event.end ? new Date(event.end) : new Date(event.start),
            location: event.location || undefined,
            description: event.description || undefined,
            uid: event.uid || key,
          });
        }
      }
    }
    
    // Sort events by start date
    calendarEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    return calendarEvents;
  } catch (error) {
    console.error('Error fetching calendar:', error);
    throw new Error(`Failed to fetch calendar: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
