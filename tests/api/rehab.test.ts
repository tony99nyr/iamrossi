import { describe, it, expect, beforeEach } from 'vitest';
import { POST as entriesPost, PATCH as entriesPatch } from '@/app/api/rehab/entries/route';
import { POST as exercisesPost } from '@/app/api/rehab/exercises/route';
import { POST as verifyPinPost, resetRateLimitStore } from '@/app/api/rehab/verify-pin/route';
import { NextRequest } from 'next/server';

describe('Rehab API Endpoints', () => {
  let authToken: string;

  beforeEach(async () => {
    // Reset rate limit store before each test
    resetRateLimitStore();

    // Get auth token for authenticated requests
    const pinRequest = new NextRequest('http://localhost:3000/api/rehab/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const pinResponse = await verifyPinPost(pinRequest);
    const pinData = await pinResponse.json();
    authToken = pinData.token;
  });

  describe('POST /api/rehab/entries', () => {
    it('should create entry with valid data', async () => {
      const entry = {
        date: '2025-01-15',
        exercises: [{ id: 'ex-1', weight: '135lb', reps: 10 }],
        isRestDay: false,
        vitaminsTaken: true,
        proteinShake: false,
        notes: 'Good workout',
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/entries', {
        method: 'POST',
        body: JSON.stringify(entry),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `rehab_auth=${authToken}`,
        },
      });

      const response = await entriesPost(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.date).toBe('2025-01-15');
      expect(data.id).toBeTruthy();
    });

    it('should reject entry without authentication', async () => {
      const entry = {
        date: '2025-01-15',
        exercises: [],
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/entries', {
        method: 'POST',
        body: JSON.stringify(entry),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await entriesPost(request);

      expect(response.status).toBe(401);
    });

    it('should reject entry with invalid pain level', async () => {
      const entry = {
        date: '2025-01-15',
        exercises: [{ id: 'ex-1', painLevel: 15 }], // Invalid: > 10
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/entries', {
        method: 'POST',
        body: JSON.stringify(entry),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `rehab_auth=${authToken}`,
        },
      });

      const response = await entriesPost(request);

      expect(response.status).toBe(400);
    });

    it('should reject entry without date', async () => {
      const entry = {
        exercises: [],
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/entries', {
        method: 'POST',
        body: JSON.stringify(entry),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `rehab_auth=${authToken}`,
        },
      });

      const response = await entriesPost(request);

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/rehab/entries', () => {
    it('should update existing entry', async () => {
      const update = {
        date: '2025-01-15',
        vitaminsTaken: true,
        notes: 'Updated notes',
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/entries', {
        method: 'PATCH',
        body: JSON.stringify(update),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `rehab_auth=${authToken}`,
        },
      });

      const response = await entriesPatch(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.vitaminsTaken).toBe(true);
    });
  });

  describe('POST /api/rehab/exercises', () => {
    it('should create exercise with valid data', async () => {
      const exercise = {
        title: 'Leg Press',
        description: '3 sets of 12 reps at 135lb',
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/exercises', {
        method: 'POST',
        body: JSON.stringify(exercise),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `rehab_auth=${authToken}`,
        },
      });

      const response = await exercisesPost(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.title).toBe('Leg Press');
      expect(data.id).toBeTruthy();
    });

    it('should reject exercise without title', async () => {
      const exercise = {
        description: 'No title',
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/exercises', {
        method: 'POST',
        body: JSON.stringify(exercise),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `rehab_auth=${authToken}`,
        },
      });

      const response = await exercisesPost(request);

      expect(response.status).toBe(400);
    });

    it('should reject exercise without authentication', async () => {
      const exercise = {
        title: 'Leg Press',
      };

      const request = new NextRequest('http://localhost:3000/api/rehab/exercises', {
        method: 'POST',
        body: JSON.stringify(exercise),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await exercisesPost(request);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/rehab/verify-pin', () => {
    it('should return token for correct PIN', async () => {
      const request = new NextRequest('http://localhost:3000/api/rehab/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin: '1234' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await verifyPinPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.token).toBeTruthy();
    });

    it('should reject invalid PIN', async () => {
      const request = new NextRequest('http://localhost:3000/api/rehab/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin: 'wrong-pin' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await verifyPinPost(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeTruthy();
    });

    it('should reject empty PIN', async () => {
      const request = new NextRequest('http://localhost:3000/api/rehab/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin: '' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await verifyPinPost(request);

      expect(response.status).toBe(400);
    });
  });
});
