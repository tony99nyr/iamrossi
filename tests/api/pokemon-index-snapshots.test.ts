import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as snapshotsGet } from '@/app/api/pokemon-index/snapshots/route';

describe('Pokemon Index Snapshots API', () => {
  it('GET /api/pokemon-index/snapshots returns snapshots array and settings', async () => {
    const request = new NextRequest('http://localhost:3000/api/pokemon-index/snapshots');
    const response = await snapshotsGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data.snapshots)).toBe(true);
    expect(data.settings).toBeDefined();
  });
});













