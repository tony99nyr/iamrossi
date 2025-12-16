export const EASTERN_TIME_ZONE = 'America/New_York';

function normalizeDateString(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Accept YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }

  return null;
}

function parseTimeParts(timeStr: string): { hour: number; minute: number; second: number } | null {
  const trimmed = timeStr.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === 'TBD') return null;

  // Normalize: remove periods (e.g., "A.M." -> "AM") and collapse whitespace
  // This matches the normalization in merge-schedule-candidates.ts parseClockTimeToMinutes
  const normalized = trimmed.replace(/\./g, '').replace(/\s+/g, ' ');

  // Support both 24h ("09:45", "09:45:00") and 12h ("9:45 AM", "09:45PM", "9:45:30 pm") inputs.
  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    const rawHour = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2]);
    const second = twelveHourMatch[3] ? Number(twelveHourMatch[3]) : 0;
    const ampm = String(twelveHourMatch[4]).toUpperCase();

    if (!Number.isFinite(rawHour) || rawHour < 1 || rawHour > 12) return null;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    if (!Number.isFinite(second) || second < 0 || second > 59) return null;

    let hour = rawHour % 12;
    if (ampm === 'PM') hour += 12;

    return { hour, minute, second };
  }

  const [hh, mm, ss] = normalized.split(':');
  if (hh === undefined || mm === undefined) return null;

  const hour = Number(hh);
  const minute = Number(mm);
  const second = ss ? Number(ss) : 0;

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  return { hour, minute, second };
}

/**
 * Given an instant in time, returns a Date whose UTC fields match the wall-clock
 * time in the requested IANA timezone at that instant.
 *
 * This is a building block for converting a wall-clock time in a timezone to UTC.
 */
function zonedTimeToUtc(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const hour = Number(lookup.hour);
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/**
 * Parses a date+time that should be interpreted as a wall-clock time in the given
 * timezone, returning the corresponding UTC instant.
 *
 * Important: This avoids relying on the server's local timezone (Vercel is UTC),
 * which would otherwise shift schedule times.
 */
export function parseDateTimeInTimeZoneToUtc(dateStr: unknown, timeStr: unknown, timeZone: string): Date | null {
  // Be defensive: schedule data can be missing or malformed in KV.
  if (typeof dateStr !== 'string' || typeof timeStr !== 'string') return null;

  const normalizedDate = normalizeDateString(dateStr);
  const timeParts = parseTimeParts(timeStr);
  if (!normalizedDate || !timeParts) return null;

  const [y, m, d] = normalizedDate.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, timeParts.hour, timeParts.minute, timeParts.second));

  // Compute offset at this instant for the timezone, then adjust guess to match wall time.
  const tzAsUtc = zonedTimeToUtc(utcGuess, timeZone);
  const offsetMs = tzAsUtc.getTime() - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

