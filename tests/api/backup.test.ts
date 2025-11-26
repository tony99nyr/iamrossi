import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/backup/route';
import { NextRequest } from 'next/server';
import * as kv from '@/lib/kv';

// Mock the KV functions
vi.mock('@/lib/kv', () => ({
  getExercises: vi.fn(),
  getEntries: vi.fn(),
}));

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    drive: vi.fn().mockReturnValue({
      files: {
        create: vi.fn().mockResolvedValue({
          data: {
            id: 'mock-file-id',
            name: 'mock-backup.json',
            webViewLink: 'https://drive.google.com/file/mock',
          },
        }),
      },
    }),
  },
}));

describe('/api/backup', () => {
  const mockExercises = [
    {
      id: 'ex-1',
      title: 'Test Exercise',
      description: 'Test description',
      createdAt: '2025-11-26T00:00:00.000Z',
    },
  ];

  const mockEntries = [
    {
      id: 'entry-1',
      date: '2025-11-26',
      exercises: [{ id: 'ex-1', weight: '10lb' }],
      isRestDay: false,
      vitaminsTaken: true,
      proteinShake: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(kv.getExercises).mockResolvedValue(mockExercises);
    vi.mocked(kv.getEntries).mockResolvedValue(mockEntries);
    
    // Set required environment variables
    process.env.CRON_SECRET = 'test-secret-123';
    process.env.GOOGLE_DRIVE_CREDENTIALS = JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      client_email: 'test@test.iam.gserviceaccount.com',
    });
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/backup');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept requests with valid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Data Export', () => {
    it('should fetch exercises and entries from Redis', async () => {
      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });

      await GET(request);

      expect(kv.getExercises).toHaveBeenCalledTimes(1);
      expect(kv.getEntries).toHaveBeenCalledTimes(1);
    });

    it('should return success with correct stats', async () => {
      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.stats).toEqual({
        exercises: 1,
        entries: 1,
      });
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Google Drive Upload', () => {
    it('should upload to Google Drive when credentials are configured', async () => {
      const { google } = await import('googleapis');
      const mockCreate = vi.fn().mockResolvedValue({
        data: {
          id: 'test-file-id',
          name: 'test-backup.json',
          webViewLink: 'https://drive.google.com/test',
        },
      });

      vi.mocked(google.drive).mockReturnValue({
        files: { create: mockCreate },
      } as any);

      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });

      await GET(request);

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should continue even if Google Drive upload fails', async () => {
      const { google } = await import('googleapis');
      const mockCreate = vi.fn().mockRejectedValue(new Error('Upload failed'));

      vi.mocked(google.drive).mockReturnValue({
        files: { create: mockCreate },
      } as any);

      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should skip Google Drive upload if credentials not configured', async () => {
      delete process.env.GOOGLE_DRIVE_CREDENTIALS;

      const { google } = await import('googleapis');
      const mockCreate = vi.fn();

      vi.mocked(google.drive).mockReturnValue({
        files: { create: mockCreate },
      } as any);

      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return 500 if Redis fetch fails', async () => {
      vi.mocked(kv.getExercises).mockRejectedValue(new Error('Redis error'));

      const request = new NextRequest('http://localhost:3000/api/backup', {
        headers: {
          authorization: 'Bearer test-secret-123',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Backup failed');
      expect(data.message).toBe('Redis error');
    });
  });
});
