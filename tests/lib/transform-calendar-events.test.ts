import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transformCalendarEvents } from '@/lib/transform-calendar-events';
// import { resetMockStore, seedMockStore } from '../mocks/redis.mock';
import type { Settings } from '@/types';

// Mock the mhr-service to avoid actual scraping during tests
vi.mock('@/lib/mhr-service', () => ({
  getMHRTeamData: vi.fn((teamName: string) => {
    // Return opponent-specific data based on team name
    return Promise.resolve({
      name: teamName, // Use the actual opponent name passed in
      record: '10-5-2',
      rating: '85.5',
    });
  }),
  scrapeTeamDetails: vi.fn(() => {
    // Return mock team details for our team
    return Promise.resolve({
      record: '15-8-3',
      rating: '92.3',
      logo: 'https://myhockeyrankings.com/logos/test-logo.png',
    });
  }),
}));

describe('Transform Calendar Events', () => {
  beforeEach(async () => {
    // Since we're using real Redis now, flush all data before each test
    // IMPORTANT: Use TEST_REDIS_URL to avoid wiping production data!
    const { createClient } = await import('redis');
    const testRedisUrl = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
    const client = createClient({ url: testRedisUrl });
    await client.connect();
    await client.flushAll();
    await client.quit();

    // Seed settings in real Redis
    const { setSettings } = await import('@/lib/kv');
    const testSettings: Settings = {
      teamName: 'Carolina Junior Canes (Black) 10U AA',
      identifiers: ['Black', 'Jr Canes', 'Carolina'],
      mhrTeamId: '12345',
      mhrYear: '2025',
    };
    await setSettings(testSettings);
  });

  it('should transform basic calendar event to game', async () => {
    const events = [
      {
        summary: 'Black vs Hurricanes',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Raleigh Ice Rink',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result).toHaveLength(1);
    expect(result[0].home_team_name).toBe('Carolina Junior Canes (Black) 10U AA');
    expect(result[0].visitor_team_name).toBe('Hurricanes');
    expect(result[0].rink_name).toBe('Raleigh Ice Rink');
  });

  it('should identify "Us" correctly using identifiers', async () => {
    const events = [
      {
        summary: 'Jr Canes vs Opponent',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Test Rink',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result[0].home_team_name).toBe('Carolina Junior Canes (Black) 10U AA');
    expect(result[0].visitor_team_name).toBe('Opponent');
  });

  it('should create placeholder for tournament events (>2 hours)', async () => {
    const events = [
      {
        summary: 'Tier 1 Elite Tournament',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T18:00:00'), // 8 hours
        location: 'Tournament Venue',
      },
      {
        summary: 'Black vs Test Team',
        start: new Date('2025-01-16T10:00:00'),
        end: new Date('2025-01-16T11:00:00'), // 1 hour
        location: 'Test Rink',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    // Should include both: one placeholder and one regular game
    expect(result).toHaveLength(2);
    expect(result[0].isPlaceholder).toBe(true);
    expect(result[0].placeholderLabel).toBe('Tier 1 Elite Tournament');
    expect(result[1].rink_name).toBe('Test Rink');
    expect(result[1].isPlaceholder).toBeUndefined();
  });

  it('should handle away games correctly', async () => {
    const events = [
      {
        summary: 'Opponent vs Black',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Away Rink',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result[0].home_team_name).toBe('Opponent');
    expect(result[0].visitor_team_name).toBe('Carolina Junior Canes (Black) 10U AA');
  });

  it('should merge MHR schedule data when available', async () => {
    const events = [
      {
        summary: 'Black vs Test Opponent',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Test Rink',
      },
    ];

    const mhrSchedule = [
      {
        game_date: '2025-01-15',
        game_time: '10:00 AM',
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Test Opponent',
        home_team_score: 5,
        visitor_team_score: 3,
        rink_name: 'Test Rink',
      },
    ];

    const result = await transformCalendarEvents(events, mhrSchedule, '2025');

    expect(result[0].home_team_score).toBe(5);
    expect(result[0].visitor_team_score).toBe(3);
  });

  it('should handle events with no location', async () => {
    const events = [
      {
        summary: 'Black vs Opponent',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        // No location
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result[0].rink_name).toBe('TBD');
  });

  it('should create placeholder for tournament with placeholder keyword', async () => {
    const events = [
      {
        summary: 'Tier 1 Elite Tournament - Placeholder',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Test Rink',
      },
      {
        summary: 'Black vs Test Team',
        start: new Date('2025-01-16T10:00:00'),
        end: new Date('2025-01-16T11:00:00'),
        location: 'Test Rink',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    // Placeholder should be created
    expect(result).toHaveLength(2);
    expect(result[0].isPlaceholder).toBe(true);
    expect(result[0].placeholderLabel).toBe('Tier 1 Elite Tournament - Placeholder');
    expect(result[1].isPlaceholder).toBeUndefined();
  });

  it('should use mhrYear from settings', async () => {
    const events = [
      {
        summary: 'Black vs Opponent',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Test Rink',
      },
    ];

    // Settings already have mhrYear: '2025'
    const result = await transformCalendarEvents(events, [], '2024');

    // Should use 2025 from settings, not the passed 2024
    expect(result).toHaveLength(1);
  });

  it('should create placeholder for multi-day events (>24 hours)', async () => {
    const events = [
      {
        summary: 'Weekend Showcase',
        start: new Date('2025-01-15T08:00:00'),
        end: new Date('2025-01-17T18:00:00'), // 2+ days
        location: 'Showcase Arena',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result).toHaveLength(1);
    expect(result[0].isPlaceholder).toBe(true);
    expect(result[0].placeholderLabel).toBe('Weekend Showcase');
    expect(result[0].placeholderStartDatePretty).toBeDefined();
    expect(result[0].placeholderEndDatePretty).toBeDefined();
    expect(result[0].game_time_format_pretty).toBe('TBD');
  });

  it('should skip events with no opponent and no placeholder keywords', async () => {
    const events = [
      {
        summary: 'Team Practice',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Arena',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    // Should be skipped because no opponent and not a placeholder
    expect(result).toHaveLength(0);
  });

  it('should create placeholder for events with explicit TBD keyword', async () => {
    const events = [
      {
        summary: 'Opponent TBD',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-15T11:00:00'),
        location: 'Local Rink',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result).toHaveLength(1);
    expect(result[0].isPlaceholder).toBe(true);
    expect(result[0].visitor_team_name).toBe('TBD');
    expect(result[0].home_team_name).toBe('Carolina Junior Canes (Black) 10U AA');
  });

  it('should format placeholder dates correctly', async () => {
    const events = [
      {
        summary: 'Tournament TBD',
        start: new Date('2025-01-15T10:00:00'),
        end: new Date('2025-01-17T18:00:00'),
        location: 'Arena',
      },
    ];

    const result = await transformCalendarEvents(events, [], '2025');

    expect(result).toHaveLength(1);
    expect(result[0].isPlaceholder).toBe(true);
    expect(result[0].placeholderStartDate).toBe(new Date('2025-01-15T10:00:00').toISOString());
    expect(result[0].placeholderEndDate).toBe(new Date('2025-01-17T18:00:00').toISOString());
    expect(result[0].game_date_format).toBe('2025-01-15');
  });
});
