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

  const [hh, mm, ss] = trimmed.split(':');
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
export function parseDateTimeInTimeZoneToUtc(dateStr: string, timeStr: string, timeZone: string): Date | null {
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

