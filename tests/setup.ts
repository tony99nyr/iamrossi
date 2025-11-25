import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Mock environment variables for testing
beforeAll(() => {
  process.env.ADMIN_SECRET = 'test-admin-secret';
  process.env.WORKOUT_ADMIN_PIN = '1234';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.HOCKEY_CALENDAR_SECRET_ADDRESS = 'https://example.com/calendar.ics';
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});
