import { describe, it, expect, beforeEach } from 'vitest';
import {
  getExercises,
  setExercises,
  getEntries,
  setEntries,
  getSettings,
  setSettings,
  getSchedule,
  setSchedule,
  type Exercise,
  type RehabEntry,
  type Settings,
  type Game,
} from '@/lib/kv';
import { resetMockStore } from '../mocks/redis.mock';

describe('KV Operations', () => {
  beforeEach(() => {
    // Reset the mock store before each test
    resetMockStore();
  });

  describe('Exercise operations', () => {
    it('should return empty array when no exercises exist', async () => {
      const exercises = await getExercises();
      expect(exercises).toEqual([]);
    });

    it('should save and retrieve exercises', async () => {
      const testExercises: Exercise[] = [
        {
          id: '1',
          title: 'Squats',
          description: '3 sets of 10',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      await setExercises(testExercises);
      const retrieved = await getExercises();

      expect(retrieved).toEqual(testExercises);
    });

    it('should handle multiple exercises', async () => {
      const testExercises: Exercise[] = [
        {
          id: '1',
          title: 'Squats',
          description: '3 sets of 10',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: '2',
          title: 'Lunges',
          description: '3 sets of 12',
          createdAt: '2025-01-02T00:00:00.000Z',
        },
      ];

      await setExercises(testExercises);
      const retrieved = await getExercises();

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].title).toBe('Squats');
      expect(retrieved[1].title).toBe('Lunges');
    });
  });

  describe('RehabEntry operations', () => {
    it('should return empty array when no entries exist', async () => {
      const entries = await getEntries();
      expect(entries).toEqual([]);
    });

    it('should save and retrieve entries', async () => {
      const testEntries: RehabEntry[] = [
        {
          id: '1',
          date: '2025-01-01',
          exercises: [{ id: '1', weight: '50lbs' }],
          isRestDay: false,
          vitaminsTaken: true,
          proteinShake: false,
        },
      ];

      await setEntries(testEntries);
      const retrieved = await getEntries();

      expect(retrieved).toEqual(testEntries);
    });

    it('should handle rest days', async () => {
      const testEntries: RehabEntry[] = [
        {
          id: '1',
          date: '2025-01-01',
          exercises: [],
          isRestDay: true,
          vitaminsTaken: true,
          proteinShake: false,
        },
      ];

      await setEntries(testEntries);
      const retrieved = await getEntries();

      expect(retrieved[0].isRestDay).toBe(true);
      expect(retrieved[0].exercises).toEqual([]);
    });
  });

  describe('Settings operations', () => {
    it('should return null when no settings exist', async () => {
      const settings = await getSettings();
      expect(settings).toBeNull();
    });

    it('should save and retrieve settings', async () => {
      const testSettings: Settings = {
        teamName: 'Test Team',
        identifiers: ['Test', 'Team'],
        mhrTeamId: '12345',
        mhrYear: '2025',
      };

      await setSettings(testSettings);
      const retrieved = await getSettings();

      expect(retrieved).toEqual(testSettings);
    });

    it('should handle optional fields', async () => {
      const testSettings: Settings = {
        teamName: 'Test Team',
        identifiers: ['Test'],
      };

      await setSettings(testSettings);
      const retrieved = await getSettings();

      expect(retrieved?.teamName).toBe('Test Team');
      expect(retrieved?.mhrTeamId).toBeUndefined();
    });
  });

  describe('Schedule operations', () => {
    it('should return empty array when no schedule exists', async () => {
      const schedule = await getSchedule();
      expect(schedule).toEqual([]);
    });

    it('should save and retrieve schedule', async () => {
      const testSchedule: Game[] = [
        {
          game_date: '2025-01-01',
          game_time: '10:00 AM',
          home_team_name: 'Home Team',
          visitor_team_name: 'Away Team',
          rink_name: 'Test Rink',
        },
      ];

      await setSchedule(testSchedule);
      const retrieved = await getSchedule();

      expect(retrieved).toEqual(testSchedule);
      expect(retrieved[0].home_team_name).toBe('Home Team');
    });

    it('should handle games with scores', async () => {
      const testSchedule: Game[] = [
        {
          game_date: '2025-01-01',
          game_time: '10:00 AM',
          home_team_name: 'Home Team',
          visitor_team_name: 'Away Team',
          rink_name: 'Test Rink',
          home_team_score: 5,
          visitor_team_score: 3,
        },
      ];

      await setSchedule(testSchedule);
      const retrieved = await getSchedule();

      expect(retrieved[0].home_team_score).toBe(5);
      expect(retrieved[0].visitor_team_score).toBe(3);
    });
  });

  describe('Redis connection retry logic', () => {
    it('should handle successful connection', async () => {
      // The mock already simulates a successful connection
      const exercises = await getExercises();
      expect(exercises).toEqual([]);
    });

    // Note: Full retry testing would require more complex mocking
    // This validates the happy path works correctly
  });
});
