import { describe, it, expect } from 'vitest';
import { EASTERN_TIME_ZONE, parseDateTimeInTimeZoneToUtc } from '@/lib/timezone';

describe('parseDateTimeInTimeZoneToUtc', () => {
  it('converts Eastern winter time to correct UTC', () => {
    const dt = parseDateTimeInTimeZoneToUtc('2025-12-13', '09:45:00', EASTERN_TIME_ZONE);
    expect(dt).not.toBeNull();
    expect(dt?.toISOString()).toBe('2025-12-13T14:45:00.000Z');
  });

  it('accepts 12-hour AM/PM times', () => {
    const dt = parseDateTimeInTimeZoneToUtc('2025-12-13', '9:45 AM', EASTERN_TIME_ZONE);
    expect(dt).not.toBeNull();
    expect(dt?.toISOString()).toBe('2025-12-13T14:45:00.000Z');
  });

  it('accepts 12-hour times with periods (A.M./P.M.)', () => {
    const dtAM = parseDateTimeInTimeZoneToUtc('2025-12-13', '9:45 A.M.', EASTERN_TIME_ZONE);
    expect(dtAM).not.toBeNull();
    expect(dtAM?.toISOString()).toBe('2025-12-13T14:45:00.000Z');

    const dtPM = parseDateTimeInTimeZoneToUtc('2025-12-13', '6:30 P.M.', EASTERN_TIME_ZONE);
    expect(dtPM).not.toBeNull();
    expect(dtPM?.toISOString()).toBe('2025-12-13T23:30:00.000Z');
  });

  it('converts Eastern summer time to correct UTC (DST)', () => {
    const dt = parseDateTimeInTimeZoneToUtc('2025-07-01', '09:45', EASTERN_TIME_ZONE);
    expect(dt).not.toBeNull();
    expect(dt?.toISOString()).toBe('2025-07-01T13:45:00.000Z');
  });

  it('returns null for non-string inputs', () => {
    expect(parseDateTimeInTimeZoneToUtc(undefined, '09:45', EASTERN_TIME_ZONE)).toBeNull();
    expect(parseDateTimeInTimeZoneToUtc('2025-07-01', undefined, EASTERN_TIME_ZONE)).toBeNull();
    expect(parseDateTimeInTimeZoneToUtc(123, 456, EASTERN_TIME_ZONE)).toBeNull();
  });
});

