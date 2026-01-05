import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/stick-and-puck/sessions/route';
import { getStickAndPuckSessions, setStickAndPuckSessions } from '@/lib/kv';
import { fetchStickAndPuckSessions } from '@/lib/daysmart-service';
import { resetMockStore } from '../mocks/redis.mock';
import type { StickAndPuckSession } from '@/types';

// Mock the service
vi.mock('@/lib/daysmart-service');
vi.mock('@/lib/kv');

describe('GET /api/stick-and-puck/sessions', () => {
  beforeEach(() => {
    resetMockStore();
    vi.clearAllMocks();
  });

  it('should return cached sessions when available', async () => {
    const cachedSessions: StickAndPuckSession[] = [
      {
        id: '1',
        date: '2025-01-15',
        time: '10:00',
        rink: 'Polar Ice Raleigh',
        price: 15.0,
        priceType: 'regular',
        registrationUrl: 'https://example.com/register/1',
      },
    ];

    (getStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue(cachedSessions);

    const request = new NextRequest('http://localhost:3000/api/stick-and-puck/sessions');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual(cachedSessions);
    expect(data.cached).toBe(true);
    expect(fetchStickAndPuckSessions).not.toHaveBeenCalled();
  });

  it('should fetch fresh data when cache is empty', async () => {
    const freshSessions: StickAndPuckSession[] = [
      {
        id: '1',
        date: '2025-01-15',
        time: '10:00',
        rink: 'Polar Ice Raleigh',
        price: 15.0,
        priceType: 'regular',
        registrationUrl: 'https://example.com/register/1',
      },
    ];

    (getStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fetchStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue(freshSessions);
    (setStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/stick-and-puck/sessions');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual(freshSessions);
    expect(data.cached).toBe(false);
    expect(fetchStickAndPuckSessions).toHaveBeenCalledOnce();
    expect(setStickAndPuckSessions).toHaveBeenCalledWith(freshSessions);
  });

  it('should force refresh when refresh=1 query param is provided', async () => {
    const cachedSessions: StickAndPuckSession[] = [
      {
        id: '1',
        date: '2025-01-15',
        time: '10:00',
        rink: 'Polar Ice Raleigh',
        price: 15.0,
        priceType: 'regular',
        registrationUrl: 'https://example.com/register/1',
      },
    ];

    const freshSessions: StickAndPuckSession[] = [
      {
        id: '2',
        date: '2025-01-16',
        time: '14:00',
        rink: 'Polar Ice Cary',
        price: 12.0,
        priceType: 'off-peak',
        registrationUrl: 'https://example.com/register/2',
      },
    ];

    (getStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue(cachedSessions);
    (fetchStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue(freshSessions);
    (setStickAndPuckSessions as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/stick-and-puck/sessions?refresh=1');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual(freshSessions);
    expect(data.cached).toBe(false);
    expect(fetchStickAndPuckSessions).toHaveBeenCalledOnce();
  });

  it('should return cached data as fallback on API error', async () => {
    const cachedSessions: StickAndPuckSession[] = [
      {
        id: '1',
        date: '2025-01-15',
        time: '10:00',
        rink: 'Polar Ice Raleigh',
        price: 15.0,
        priceType: 'regular',
        registrationUrl: 'https://example.com/register/1',
      },
    ];

    (getStickAndPuckSessions as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // First call (cache miss)
      .mockResolvedValueOnce(cachedSessions); // Fallback call
    (fetchStickAndPuckSessions as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API Error')
    );

    const request = new NextRequest('http://localhost:3000/api/stick-and-puck/sessions');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual(cachedSessions);
    expect(data.cached).toBe(true);
    expect(data.error).toBe('Failed to refresh, using cached data');
  });

  it('should return 500 error when both API and cache fail', async () => {
    (getStickAndPuckSessions as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // First call (cache miss)
      .mockResolvedValueOnce([]); // Fallback call (also empty)
    (fetchStickAndPuckSessions as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API Error')
    );

    const request = new NextRequest('http://localhost:3000/api/stick-and-puck/sessions');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch stick and puck sessions');
  });
});






