import { vi } from 'vitest';

// Mock Redis data store
const mockStore = new Map<string, string>();
const mockTTL = new Map<string, number>();

export const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key) || null)),
  set: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve('OK');
  }),
  setEx: vi.fn((key: string, seconds: number, value: string) => {
    mockStore.set(key, value);
    const expiry = Date.now() + (seconds * 1000);
    mockTTL.set(key, expiry);
    return Promise.resolve('OK');
  }),
  incr: vi.fn((key: string) => {
    const current = mockStore.get(key);
    const newValue = current ? parseInt(current, 10) + 1 : 1;
    mockStore.set(key, newValue.toString());
    return Promise.resolve(newValue);
  }),
  del: vi.fn((key: string) => {
    mockStore.delete(key);
    mockTTL.delete(key);
    return Promise.resolve(1);
  }),
  exists: vi.fn((key: string) => {
    return Promise.resolve(mockStore.has(key) ? 1 : 0);
  }),
  ttl: vi.fn((key: string) => {
    const expiry = mockTTL.get(key);
    if (!expiry) return Promise.resolve(-2);
    const remaining = Math.ceil((expiry - Date.now()) / 1000);
    return Promise.resolve(remaining > 0 ? remaining : -2);
  }),
  on: vi.fn(),
  isOpen: true,
};

// Helper to reset mock store
export function resetMockStore() {
  mockStore.clear();
  mockTTL.clear();
}

// Helper to seed mock data
export function seedMockStore(data: Record<string, unknown>) {
  Object.entries(data).forEach(([key, value]) => {
    mockStore.set(key, JSON.stringify(value));
  });
}

// Helper to get mock data
export function getMockStore(key: string) {
  const value = mockStore.get(key);
  return value ? JSON.parse(value) : null;
}

// Mock the redis module
// This must be hoisted before any module imports redis
vi.mock('redis', () => {
  return {
    createClient: vi.fn(() => mockRedisClient),
    default: {
      createClient: vi.fn(() => mockRedisClient),
    },
  };
});
