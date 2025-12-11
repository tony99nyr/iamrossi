import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as getHeartRate } from '@/app/api/google-fit/heart-rate/route';
import { GET as getStatus } from '@/app/api/google-fit/status/route';
import { NextRequest } from 'next/server';
import * as googleFitService from '@/lib/google-fit-service';
import { resetMockStore } from '../mocks/redis.mock';

// Mock the Google Fit service
vi.mock('@/lib/google-fit-service', () => ({
  getDailyHeartRate: vi.fn(),
  isGoogleFitConfigured: vi.fn(),
}));

// Mock the KV functions
vi.mock('@/lib/kv', () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
}));

// Mock global fetch for Google Fit API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('/api/google-fit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockStore();
    
    // Set required environment variables
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'test-refresh-token';
  });

  describe('GET /api/google-fit/status', () => {
    it('should return configured status without authentication (public endpoint)', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);

      const response = await getStatus();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.configured).toBe(true);
    });

    it('should return false when Google Fit is not configured', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(false);

      const response = await getStatus();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.configured).toBe(false);
    });
  });

  describe('GET /api/google-fit/heart-rate', () => {
    const mockHeartRate = {
      date: '2024-01-15',
      avgBpm: 132,
      maxBpm: 163,
      sampleCount: 100,
      lastSynced: '2024-01-15T12:00:00.000Z',
    };

    it('should return 401 without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-01-15');
      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 503 when Google Fit is not configured', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-01-15', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toContain('not configured');
    });

    it('should return 400 when date parameter is missing', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Date parameter is required');
    });

    it('should return 400 for invalid date format', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=invalid', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid date format');
    });

    it('should return 400 for invalid calendar date', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-13-45', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid date');
    });

    it('should return 400 for future dates', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);

      // Create a date 1 year in the future
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const request = new NextRequest(`http://localhost:3000/api/google-fit/heart-rate?date=${futureDateStr}`, {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Future dates not allowed');
    });

    it('should return heart rate data with valid date and authentication', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);
      vi.mocked(googleFitService.getDailyHeartRate).mockResolvedValue(mockHeartRate);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-01-15', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockHeartRate);
      expect(googleFitService.getDailyHeartRate).toHaveBeenCalledWith('2024-01-15');
    });

    it('should return heart rate data with Bearer token authentication', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);
      vi.mocked(googleFitService.getDailyHeartRate).mockResolvedValue(mockHeartRate);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-01-15', {
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockHeartRate);
    });

    it('should return empty heart rate data when no workouts exist', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);
      const emptyHeartRate = {
        date: '2024-01-15',
        lastSynced: '2024-01-15T12:00:00.000Z',
      };
      vi.mocked(googleFitService.getDailyHeartRate).mockResolvedValue(emptyHeartRate);

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-01-15', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(emptyHeartRate);
      expect(data.avgBpm).toBeUndefined();
      expect(data.maxBpm).toBeUndefined();
    });

    it('should return 500 and generic error message when service throws', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);
      vi.mocked(googleFitService.getDailyHeartRate).mockRejectedValue(new Error('Google Fit API error'));

      const request = new NextRequest('http://localhost:3000/api/google-fit/heart-rate?date=2024-01-15', {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch Google Fit heart rate data');
      // Should not expose internal error details
      expect(data.details).toBeUndefined();
    });

    it('should accept today\'s date', async () => {
      vi.mocked(googleFitService.isGoogleFitConfigured).mockReturnValue(true);
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      vi.mocked(googleFitService.getDailyHeartRate).mockResolvedValue({
        ...mockHeartRate,
        date: todayStr,
      });

      const request = new NextRequest(`http://localhost:3000/api/google-fit/heart-rate?date=${todayStr}`, {
        headers: {
          cookie: 'rehab_auth=test-token',
        },
      });

      const response = await getHeartRate(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.date).toBe(todayStr);
    });
  });
});

