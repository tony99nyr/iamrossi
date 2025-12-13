import { describe, it, expect } from 'vitest';
import { EASTERN_TIME_ZONE, parseDateTimeInTimeZoneToUtc } from '@/lib/timezone';

describe('parseDateTimeInTimeZoneToUtc', () => {
  it('converts Eastern winter time to correct UTC', () => {
    const dt = parseDateTimeInTimeZoneToUtc('2025-12-13', '09:45:00', EASTERN_TIME_ZONE);
    expect(dt).not.toBeNull();
    expect(dt?.toISOString()).toBe('2025-12-13T14:45:00.000Z');
  });

  it('converts Eastern summer time to correct UTC (DST)', () => {
    const dt = parseDateTimeInTimeZoneToUtc('2025-07-01', '09:45', EASTERN_TIME_ZONE);
    expect(dt).not.toBeNull();
    expect(dt?.toISOString()).toBe('2025-07-01T13:45:00.000Z');
  });
});

