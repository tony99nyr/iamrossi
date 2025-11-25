import { vi } from 'vitest';

// Mock Redis data store
const mockStore = new Map<string, string>();

export const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key) || null)),
  set: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve('OK');
  }),
  on: vi.fn(),
  isOpen: true,
};

// Helper to reset mock store
export function resetMockStore() {
  mockStore.clear();
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
vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));
