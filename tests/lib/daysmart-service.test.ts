import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStickAndPuckSessions } from '@/lib/daysmart-service';

// Mock fetch globally
global.fetch = vi.fn();

describe('daysmart-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchStickAndPuckSessions', () => {
    it('should fetch and parse sessions correctly', async () => {
      // Mock facilities response
      const facilitiesResponse = {
        data: [
          {
            id: '1',
            type: 'facility',
            attributes: {
              name: 'Polar Ice Raleigh',
            },
          },
          {
            id: '2',
            type: 'facility',
            attributes: {
              name: 'Polar Ice Cary',
            },
          },
        ],
      };

      // Mock leagues response
      const leaguesResponse = {
        data: [
          {
            id: 'league-1',
            type: 'league',
            attributes: {
              name: 'Open Hockey',
              description: 'Stick and puck session',
            },
            relationships: {
              facility: {
                data: {
                  id: '1',
                  type: 'facility',
                },
              },
              skillLevel: {
                data: {
                  id: '1',
                  type: 'skill-level',
                },
              },
            },
          },
        ],
        included: [
          {
            id: '1',
            type: 'skill-level',
            attributes: {
              name: 'All Levels',
            },
          },
        ],
      };

      // Mock teams response for league-1
      const teamsResponse = {
        data: [
          {
            id: 'team-1',
            type: 'teams',
            attributes: {
              name: 'RAL Off Peak S&P',
              facility_id: 1,
            },
            relationships: {
              facility: {
                data: { id: '1', type: 'facility' },
              },
            },
          },
        ],
        included: [
          {
            id: '1',
            type: 'facility',
            attributes: { name: 'Polar Ice Raleigh' },
          },
        ],
      };

      // Mock events response for team-1
      const eventsResponse = {
        data: [
          {
            id: 'event-1',
            type: 'events',
            attributes: {
              start: '2025-01-15T10:00:00',
              end: '2025-01-15T11:00:00',
              register_capacity: 30,
            },
            relationships: {
              summary: {
                data: { id: 'summary-1', type: 'event-summaries' },
              },
            },
          },
        ],
        included: [
          {
            id: 'summary-1',
            type: 'event-summaries',
            attributes: {
              remaining_registration_slots: 21,
            },
          },
        ],
      };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => facilitiesResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => leaguesResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => teamsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => eventsResponse,
        });

      const sessions = await fetchStickAndPuckSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'event-1',
        date: '2025-01-15',
        time: '10:00',
        rink: 'Polar Ice Raleigh',
        priceType: 'off-peak',
        remainingSlots: 21,
        capacity: 30,
      });
    });

    it('should handle pagination', async () => {
      const facilitiesResponse = {
        data: [
          {
            id: '1',
            type: 'facility',
            attributes: { name: 'Test Rink' },
          },
        ],
      };

      // First page of leagues (100 leagues)
      const page1LeaguesResponse = {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: `league-${i}`,
          type: 'league',
          attributes: {
            description: 'Stick and puck session',
          },
          relationships: {
            facility: {
              data: { id: '1', type: 'facility' },
            },
          },
        })),
      };

      // Second page (empty to stop pagination)
      const page2LeaguesResponse = {
        data: [],
      };

      // Mock teams and events for each league (simplified - just one team/event per league)
      const teamsResponse = {
        data: [
          {
            id: 'team-1',
            type: 'teams',
            attributes: { name: 'Test Team', facility_id: 1 },
            relationships: {
              facility: { data: { id: '1', type: 'facility' } },
            },
          },
        ],
      };

      const eventsResponse = {
        data: [
          {
            id: 'event-1',
            type: 'events',
            attributes: {
              start: '2025-01-15T10:00:00',
              register_capacity: 30,
            },
            relationships: {
              summary: { data: { id: 'summary-1', type: 'event-summaries' } },
            },
          },
        ],
        included: [
          {
            id: 'summary-1',
            type: 'event-summaries',
            attributes: { remaining_registration_slots: 10 },
          },
        ],
      };

      // Build mock call sequence
      const mockCalls: Array<{ ok: boolean; json: () => Promise<unknown> }> = [
        { ok: true, json: async () => facilitiesResponse },
        { ok: true, json: async () => page1LeaguesResponse },
      ];

      // Add teams and events responses for each league (100 leagues)
      for (let i = 0; i < 100; i++) {
        mockCalls.push({ ok: true, json: async () => teamsResponse });
        mockCalls.push({ ok: true, json: async () => eventsResponse });
      }

      // Add page 2 leagues (empty)
      mockCalls.push({ ok: true, json: async () => page2LeaguesResponse });

      let callIndex = 0;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        if (callIndex >= mockCalls.length) {
          return { ok: false, status: 404 };
        }
        return mockCalls[callIndex++];
      });

      const sessions = await fetchStickAndPuckSessions();

      expect(sessions).toHaveLength(100);
      // facilities (1) + page1 leagues (1) + (100 leagues * 2: teams + events) + page2 leagues (1) = 203
      expect(global.fetch).toHaveBeenCalledTimes(203);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchStickAndPuckSessions()).rejects.toThrow();
    });

    it('should skip sessions without dates', async () => {
      const facilitiesResponse = {
        data: [
          {
            id: '1',
            type: 'facility',
            attributes: { name: 'Test Rink' },
          },
        ],
      };

      const leaguesResponse = {
        data: [
          {
            id: 'league-1',
            type: 'league',
            attributes: {
              description: 'Stick and puck session',
            },
            relationships: {
              facility: {
                data: { id: '1', type: 'facility' },
              },
            },
          },
        ],
      };

      const teamsResponse = {
        data: [
          {
            id: 'team-1',
            type: 'teams',
            attributes: { name: 'Test Team', facility_id: 1 },
            relationships: {
              facility: { data: { id: '1', type: 'facility' } },
            },
          },
        ],
      };

      // Event with date
      const eventsResponseWithDate = {
        data: [
          {
            id: 'event-1',
            type: 'events',
            attributes: {
              start: '2025-01-15T10:00:00',
              register_capacity: 30,
            },
            relationships: {
              summary: { data: { id: 'summary-1', type: 'event-summaries' } },
            },
          },
        ],
        included: [
          {
            id: 'summary-1',
            type: 'event-summaries',
            attributes: { remaining_registration_slots: 10 },
          },
        ],
      };

      // Event without date (should be skipped)
      const eventsResponseNoDate = {
        data: [
          {
            id: 'event-2',
            type: 'events',
            attributes: {
              // No start attribute
              register_capacity: 30,
            },
          },
        ],
      };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => facilitiesResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => leaguesResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => teamsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => eventsResponseWithDate,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => teamsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => eventsResponseNoDate,
        });

      const sessions = await fetchStickAndPuckSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('event-1');
    });

    it('should handle missing facility gracefully', async () => {
      const facilitiesResponse = {
        data: [
          {
            id: '1',
            type: 'facility',
            attributes: { name: 'Test Rink' },
          },
        ],
      };

      const leaguesResponse = {
        data: [
          {
            id: 'league-1',
            type: 'league',
            attributes: {
              start_date: '2025-01-15T10:00:00',
              start_time: '10:00:00',
              price: 15.0,
            },
            relationships: {
              facility: {
                data: { id: '999', type: 'facility' }, // Unknown facility
              },
            },
          },
        ],
      };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => facilitiesResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => leaguesResponse,
        });

      const sessions = await fetchStickAndPuckSessions();

      // Should skip session with unknown facility
      expect(sessions).toHaveLength(0);
    });
  });
});

