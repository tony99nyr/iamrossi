import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as fixOpponentPost } from '@/app/api/admin/stats/fix-opponent/route';
import { getMockStore, resetMockStore, seedMockStore } from '../mocks/redis.mock';
import type { StatSession } from '@/types';

describe('POST /api/admin/stats/fix-opponent', () => {
  beforeEach(() => {
    resetMockStore();
  });

  it('returns 401 without authorization', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/stats/fix-opponent', {
      method: 'POST',
      body: JSON.stringify({ date: '2025-12-14', newOpponent: 'Ohio Blue Jackets 10U AAA' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await fixOpponentPost(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when neither sessionIds nor date is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/stats/fix-opponent', {
      method: 'POST',
      body: JSON.stringify({ newOpponent: 'Ohio Blue Jackets 10U AAA' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-admin-secret',
      },
    });

    const response = await fixOpponentPost(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(typeof data.error).toBe('string');
  });

  it('updates sessions for a date where opponent is incorrectly us', async () => {
    const teamName = 'Jr Canes 10U Black';

    const s1: StatSession = {
      id: 's1',
      date: '2025-12-14T23:30:00.000Z',
      opponent: teamName, // wrong
      recorderName: 'Recorder',
      ourTeamName: teamName,
      usStats: { shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0, goals: 0 },
      themStats: { shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0, goals: 0 },
      events: [],
      isCustomGame: false,
      startTime: 1765755000000,
    };

    const s2: StatSession = {
      ...s1,
      id: 's2',
      date: '2025-12-14T23:35:00.000Z',
      startTime: 1765755300000,
    };

    const s3: StatSession = {
      ...s1,
      id: 's3',
      opponent: 'Another Team',
      date: '2025-12-14T18:00:00.000Z',
      startTime: 1765735200000,
    };

    seedMockStore({
      'admin:settings': { teamName, identifiers: ['Jr Canes', 'Black'] },
      'game:stats': [s1, s2, s3],
    });

    const request = new NextRequest('http://localhost:3000/api/admin/stats/fix-opponent', {
      method: 'POST',
      body: JSON.stringify({
        date: '2025-12-14',
        newOpponent: 'Ohio Blue Jackets 10U AAA',
        limit: 10,
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-admin-secret',
      },
    });

    const response = await fixOpponentPost(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.updated).toBe(2);
    expect(Array.isArray(data.sessions)).toBe(true);

    const stored = getMockStore('game:stats') as StatSession[];
    const updated1 = stored.find((s) => s.id === 's1');
    const updated2 = stored.find((s) => s.id === 's2');
    const untouched = stored.find((s) => s.id === 's3');

    expect(updated1?.opponent).toBe('Ohio Blue Jackets 10U AAA');
    expect(updated2?.opponent).toBe('Ohio Blue Jackets 10U AAA');
    expect(untouched?.opponent).toBe('Another Team');
  });
});

