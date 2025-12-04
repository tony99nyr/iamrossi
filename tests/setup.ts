import { beforeAll, afterAll, afterEach, vi } from 'vitest';
// Import redis mock to ensure it's applied globally
import './mocks/redis.mock';

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock environment variables for testing
beforeAll(() => {
  process.env.ADMIN_SECRET = 'test-admin-secret';
  process.env.WORKOUT_ADMIN_PIN = '1234';
  // Use TEST_REDIS_URL to ensure tests never touch production Redis
  process.env.TEST_REDIS_URL = 'redis://localhost:6379';
  process.env.HOCKEY_CALENDAR_SECRET_ADDRESS = 'https://example.com/calendar.ics';
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});
