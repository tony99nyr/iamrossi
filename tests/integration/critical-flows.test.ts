import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAdminSecret } from '@/lib/auth';
import { getSettings, setSettings } from '@/lib/kv';
import { resetMockStore } from '../mocks/redis.mock';
import type { Settings } from '@/types';

describe('Critical Integration Flows', () => {
  beforeEach(() => {
    // Reset the mock store before each test
    resetMockStore();
  });

  describe('Admin workflow: Login → Configure Settings → Verify', () => {
    it('should complete full admin configuration flow', async () => {
      // Step 1: Verify admin authentication
      const isAuthenticated = verifyAdminSecret('test-admin-secret');
      expect(isAuthenticated).toBe(true);

      // Step 2: Save settings
      const newSettings: Settings = {
        teamName: 'Test Hockey Team',
        identifiers: ['Test', 'Hockey'],
        mhrTeamId: '99999',
        mhrYear: '2025',
      };

      await setSettings(newSettings);

      // Step 3: Retrieve and verify settings were saved
      const retrievedSettings = await getSettings();

      expect(retrievedSettings).not.toBeNull();
      expect(retrievedSettings?.teamName).toBe('Test Hockey Team');
      expect(retrievedSettings?.identifiers).toEqual(['Test', 'Hockey']);
      expect(retrievedSettings?.mhrTeamId).toBe('99999');
      expect(retrievedSettings?.mhrYear).toBe('2025');
    });

    it('should prevent unauthorized users from modifying settings', async () => {
      const isAuthenticated = verifyAdminSecret('wrong-secret');
      expect(isAuthenticated).toBe(false);

      // In real app, this would be blocked by API route
      // This test validates the auth utility works correctly
    });
  });

  describe('Rehab workflow: PIN verification → Save exercises', () => {
    it('should allow authenticated users to manage exercises', async () => {
      const { verifyPin } = await import('@/lib/auth');
      const { getExercises, setExercises } = await import('@/lib/kv');

      // Step 1: Verify PIN
      const isPinValid = verifyPin('1234');
      expect(isPinValid).toBe(true);

      // Step 2: Create exercises
      const exercises = [
        {
          id: '1',
          title: 'Leg Extensions',
          description: '3 sets of 15',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          title: 'Calf Raises',
          description: '3 sets of 20',
          createdAt: new Date().toISOString(),
        },
      ];

      await setExercises(exercises);

      // Step 3: Retrieve and verify
      const retrieved = await getExercises();

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].title).toBe('Leg Extensions');
      expect(retrieved[1].title).toBe('Calf Raises');
    });

    it('should reject invalid PINs', async () => {
      const { verifyPin } = await import('@/lib/auth');

      const isPinValid = verifyPin('0000');
      expect(isPinValid).toBe(false);
    });
  });

  describe('Schedule workflow: Settings → Transform → Store', () => {
    it('should process schedule with settings', async () => {
      const { getSchedule, setSchedule } = await import('@/lib/kv');

      // Step 1: Ensure settings exist
      const settings: Settings = {
        teamName: 'Test Team',
        identifiers: ['Test'],
        mhrTeamId: '12345',
        mhrYear: '2025',
      };
      await setSettings(settings);

      // Step 2: Create schedule
      const schedule = [
        {
          game_date: '2025-01-15',
          game_time: '10:00 AM',
          home_team_name: 'Test Team',
          visitor_team_name: 'Opponent Team',
          rink_name: 'Home Rink',
        },
        {
          game_date: '2025-01-16',
          game_time: '2:00 PM',
          home_team_name: 'Away Team',
          visitor_team_name: 'Test Team',
          rink_name: 'Away Rink',
        },
      ];

      await setSchedule(schedule);

      // Step 3: Retrieve and verify
      const retrieved = await getSchedule();

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].home_team_name).toBe('Test Team');
      expect(retrieved[1].visitor_team_name).toBe('Test Team');
    });
  });

  describe('Data persistence', () => {
    it('should maintain data integrity across multiple operations', async () => {
      // Save settings
      await setSettings({
        teamName: 'Team A',
        identifiers: ['A'],
      });

      // Save exercises
      const { setExercises } = await import('@/lib/kv');
      await setExercises([
        { id: '1', title: 'Exercise 1', description: 'Desc 1', createdAt: new Date().toISOString() },
      ]);

      // Save schedule
      const { setSchedule } = await import('@/lib/kv');
      await setSchedule([
        {
          game_date: '2025-01-15',
          game_time: '10:00 AM',
          home_team_name: 'Home',
          visitor_team_name: 'Away',
          rink_name: 'Rink',
        },
      ]);

      // Verify all data persisted independently
      const settings = await getSettings();
      const { getExercises, getSchedule } = await import('@/lib/kv');
      const exercises = await getExercises();
      const schedule = await getSchedule();

      expect(settings?.teamName).toBe('Team A');
      expect(exercises).toHaveLength(1);
      expect(schedule).toHaveLength(1);
    });
  });
});
