import { describe, it, expect } from 'vitest';
import {
  adminVerifySchema,
  pinVerifySchema,
  rehabEntrySchema,
  exerciseSchema,
  statSessionSchema,
  safeValidateRequest,
} from '@/lib/validation';

describe('Request Validation Schemas', () => {
  describe('adminVerifySchema', () => {
    it('should validate correct admin secret', () => {
      const result = safeValidateRequest(adminVerifySchema, {
        secret: 'test-secret-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.secret).toBe('test-secret-123');
      }
    });

    it('should reject empty secret', () => {
      const result = safeValidateRequest(adminVerifySchema, { secret: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toContain('required');
      }
    });

    it('should reject missing secret', () => {
      const result = safeValidateRequest(adminVerifySchema, {});

      expect(result.success).toBe(false);
    });
  });

  describe('pinVerifySchema', () => {
    it('should validate correct PIN', () => {
      const result = safeValidateRequest(pinVerifySchema, { pin: '1234' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pin).toBe('1234');
      }
    });

    it('should reject empty PIN', () => {
      const result = safeValidateRequest(pinVerifySchema, { pin: '' });

      expect(result.success).toBe(false);
    });
  });

  describe('rehabEntrySchema', () => {
    it('should validate complete rehab entry', () => {
      const entry = {
        date: '2025-01-15',
        exercises: [
          {
            id: 'ex-1',
            weight: '135lb',
            reps: 10,
            sets: 3,
            painLevel: 2,
            difficultyLevel: 5,
          },
        ],
        isRestDay: false,
        vitaminsTaken: true,
        proteinShake: true,
        notes: 'Good workout',
      };

      const result = safeValidateRequest(rehabEntrySchema, entry);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.date).toBe('2025-01-15');
        expect(result.data.exercises).toHaveLength(1);
      }
    });

    it('should apply defaults for optional fields', () => {
      const entry = {
        date: '2025-01-15',
      };

      const result = safeValidateRequest(rehabEntrySchema, entry);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.exercises).toEqual([]);
        expect(result.data.isRestDay).toBe(false);
        expect(result.data.vitaminsTaken).toBe(false);
        expect(result.data.proteinShake).toBe(false);
      }
    });

    it('should reject missing date', () => {
      const result = safeValidateRequest(rehabEntrySchema, {
        exercises: [],
      });

      expect(result.success).toBe(false);
    });

    it('should validate pain level range', () => {
      const entry = {
        date: '2025-01-15',
        exercises: [
          {
            id: 'ex-1',
            painLevel: 15, // Invalid: should be 0-10
          },
        ],
      };

      const result = safeValidateRequest(rehabEntrySchema, entry);

      expect(result.success).toBe(false);
    });
  });

  describe('exerciseSchema', () => {
    it('should validate complete exercise', () => {
      const exercise = {
        title: 'Leg Press',
        description: '3 sets of 12 reps',
      };

      const result = safeValidateRequest(exerciseSchema, exercise);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Leg Press');
        expect(result.data.description).toBe('3 sets of 12 reps');
      }
    });

    it('should apply empty description default', () => {
      const exercise = {
        title: 'Leg Press',
      };

      const result = safeValidateRequest(exerciseSchema, exercise);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('');
      }
    });

    it('should reject empty title', () => {
      const result = safeValidateRequest(exerciseSchema, {
        title: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('statSessionSchema', () => {
    it('should validate complete stat session', () => {
      const session = {
        id: 'session-123',
        date: '2025-01-15T10:00:00Z',
        opponent: 'Team Blue',
        recorderName: 'John Doe',
        currentPeriod: '2',
        ourTeamName: 'Team Red',
        usStats: {
          shots: 15,
          faceoffWins: 8,
          faceoffLosses: 7,
          faceoffTies: 1,
          chances: 10,
          goals: 3,
        },
        themStats: {
          shots: 12,
          faceoffWins: 7,
          faceoffLosses: 8,
          faceoffTies: 1,
          chances: 8,
          goals: 2,
        },
        events: [
          {
            id: 'event-1',
            type: 'goal' as const,
            team: 'us' as const,
            playerId: 'player-1',
            playerName: 'John Smith',
            timestamp: Date.now(),
            period: '2',
            gameTime: '12:34',
          },
        ],
        isCustomGame: false,
        startTime: Date.now(),
      };

      const result = safeValidateRequest(statSessionSchema, session);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('session-123');
        expect(result.data.opponent).toBe('Team Blue');
      }
    });

    it('should reject missing required fields', () => {
      const result = safeValidateRequest(statSessionSchema, {
        id: 'session-123',
        // Missing date, opponent, recorderName, etc.
      });

      expect(result.success).toBe(false);
    });

    it('should validate event types', () => {
      const session = {
        id: 'session-123',
        date: '2025-01-15T10:00:00Z',
        opponent: 'Team Blue',
        recorderName: 'John Doe',
        usStats: {
          shots: 15,
          faceoffWins: 8,
          faceoffLosses: 7,
          faceoffTies: 1,
          chances: 10,
          goals: 3,
        },
        themStats: {
          shots: 12,
          faceoffWins: 7,
          faceoffLosses: 8,
          faceoffTies: 1,
          chances: 8,
          goals: 2,
        },
        events: [
          {
            id: 'event-1',
            type: 'invalid-type', // Invalid
            timestamp: Date.now(),
          },
        ],
        isCustomGame: false,
        startTime: Date.now(),
      };

      const result = safeValidateRequest(statSessionSchema, session);

      expect(result.success).toBe(false);
    });
  });
});
