import { createClient } from 'redis';
import type { Exercise, RehabEntry, Settings, Game } from '@/types';

// Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL
});

// Connect to Redis (lazy connection with retry logic)
let isConnected = false;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function ensureConnected(retries = 0): Promise<void> {
  if (isConnected) {
    return;
  }

  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    isConnected = true;
  } catch (error) {
    console.error(`Redis connection attempt ${retries + 1} failed:`, error);

    if (retries < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return ensureConnected(retries + 1);
    }

    throw new Error(`Failed to connect to Redis after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Handle Redis connection errors
redis.on('error', (err) => {
  console.error('Redis client error:', err);
  isConnected = false;
});

redis.on('end', () => {
  console.warn('Redis connection closed');
  isConnected = false;
});

// Re-export types for backward compatibility
export type { Exercise, RehabEntry, Settings, Game };

// KV Keys
const KV_KEYS = {
  EXERCISES: 'rehab:exercises',
  ENTRIES: 'rehab:entries',
  SETTINGS: 'admin:settings',
  SCHEDULE: 'admin:schedule',
  MHR_SCHEDULE: 'admin:mhr-schedule',
} as const;

// Exercise operations
export async function getExercises(): Promise<Exercise[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.EXERCISES);
  return data ? JSON.parse(data) : [];
}

export async function setExercises(exercises: Exercise[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.EXERCISES, JSON.stringify(exercises));
}

// Rehab entry operations
export async function getEntries(): Promise<RehabEntry[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.ENTRIES);
  return data ? JSON.parse(data) : [];
}

export async function setEntries(entries: RehabEntry[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.ENTRIES, JSON.stringify(entries));
}

// Settings operations
export async function getSettings(): Promise<Settings | null> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.SETTINGS);
  return data ? JSON.parse(data) : null;
}

export async function setSettings(settings: Settings): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.SETTINGS, JSON.stringify(settings));
}

// Schedule operations
export async function getSchedule(): Promise<Game[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.SCHEDULE);
  return data ? JSON.parse(data) : [];
}

export async function setSchedule(schedule: Game[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.SCHEDULE, JSON.stringify(schedule));
}

// MHR Schedule operations
export async function getMHRSchedule(): Promise<Game[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.MHR_SCHEDULE);
  return data ? JSON.parse(data) : [];
}

export async function setMHRSchedule(schedule: Game[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.MHR_SCHEDULE, JSON.stringify(schedule));
}
