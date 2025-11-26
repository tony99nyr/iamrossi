import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/rum/route';
import { logWebVitalSample } from '@/lib/kv';

vi.mock('@/lib/kv', () => ({
  logWebVitalSample: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_URL = 'http://localhost:3000/api/rum';

function createRequest(body: string) {
  return new NextRequest(MOCK_URL, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/rum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a valid metric payload', async () => {
    const payload = {
      id: '1234',
      name: 'CLS',
      label: 'web-vital',
      value: 0.03,
      delta: 0.01,
      rating: 'good',
      navigationType: 'navigate',
      pathname: '/demo',
      timestamp: Date.now(),
      connection: {
        effectiveType: '4g',
        downlink: 1.2,
        rtt: 40,
      },
    };

    const response = await POST(createRequest(JSON.stringify(payload)));

    expect(response.status).toBe(201);
    expect(logWebVitalSample).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '1234',
        name: 'CLS',
        pathname: '/demo',
      }),
    );
  });

  it('rejects invalid metric payloads', async () => {
    const payload = {
      id: '1234',
      label: 'web-vital',
      value: 'not-a-number',
    };

    const response = await POST(createRequest(JSON.stringify(payload)));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeTruthy();
    expect(logWebVitalSample).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const response = await POST(createRequest('{invalid json'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON body');
    expect(logWebVitalSample).not.toHaveBeenCalled();
  });
});

