import { describe, it, expect } from 'vitest';
import { POST as verifyPost } from '@/app/api/admin/verify/route';
import { POST as settingsPost, GET as settingsGet } from '@/app/api/admin/settings/route';
import { NextRequest } from 'next/server';

describe('Admin API Authentication', () => {
  describe('POST /api/admin/verify', () => {
    it('should return success for correct secret', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/verify', {
        method: 'POST',
        body: JSON.stringify({ secret: 'test-admin-secret' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await verifyPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 401 for incorrect secret', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/verify', {
        method: 'POST',
        body: JSON.stringify({ secret: 'wrong-secret' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await verifyPost(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeTruthy();
    });

    it('should return 400 for missing secret', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/verify', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await verifyPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Secret required');
    });
  });

  describe('POST /api/admin/settings', () => {
    it('should return 401 without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          teamName: 'Test Team',
          identifiers: ['Test'],
          teamLogo: 'https://example.com/logo.png',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await settingsPost(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept settings with valid authorization', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          teamName: 'Test Team',
          identifiers: ['Test'],
          teamLogo: 'https://example.com/logo.png',
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-admin-secret',
        },
      });

      const response = await settingsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject invalid settings format', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          teamName: 'Test Team',
          identifiers: 'not-an-array', // Should be array
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-admin-secret',
        },
      });

      const response = await settingsPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid settings format');
    });

    it('should accept all Settings fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          teamName: 'Test Team',
          identifiers: ['Test', 'Team'],
          teamLogo: 'https://example.com/logo.png',
          mhrTeamId: '12345',
          mhrYear: '2025',
          aliases: { 'short': 'long name' },
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-admin-secret',
        },
      });

      const response = await settingsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/admin/settings', () => {
    it('should return settings without authentication (read is public)', async () => {
      // Request not needed for this test as we call the route handler directly without it if possible, or just ignore it.
      // Actually settingsGet doesn't take a request?
      // const request = ...

      const response = await settingsGet();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.teamName).toBeTruthy();
    });
  });
});
