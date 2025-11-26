import { createClient } from 'redis';
import type { Exercise, RehabEntry, Settings, Game, WebVitalSample } from '@/types';

// Create Redis client
// Use TEST_REDIS_URL in test environments to avoid wiping production data
const redisUrl = process.env.NODE_ENV === 'test' && process.env.TEST_REDIS_URL
  ? process.env.TEST_REDIS_URL
  : process.env.REDIS_URL;

const redis = createClient({
  url: redisUrl
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
  GAME_LEADERBOARD: 'game:leaderboard',
  ANALYTICS_WEB_VITALS: 'analytics:web-vitals',
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

// Leaderboard operations
export interface LeaderboardEntry {
  name: string;
  score: number;
  timestamp: number;
  rank: number;
}

/**
 * Get top N scores from leaderboard
 */
export async function getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
  await ensureConnected();

  // Get scores in descending order with scores
  const results = await redis.zRangeWithScores(
    KV_KEYS.GAME_LEADERBOARD,
    0,
    limit - 1,
    { REV: true }
  );

  return results.map((entry, index) => {
    const [name, timestamp] = entry.value.split(':');
    return {
      name,
      score: entry.score,
      timestamp: parseInt(timestamp),
      rank: index + 1,
    };
  });
}

/**
 * Add a score to the leaderboard
 */
export async function addScore(name: string, score: number): Promise<void> {
  await ensureConnected();

  const timestamp = Date.now();
  const member = `${name}:${timestamp}`;

  // Add to sorted set (score is the sort key)
  await redis.zAdd(KV_KEYS.GAME_LEADERBOARD, {
    score,
    value: member,
  });

  // Keep only top 100 scores
  const count = await redis.zCard(KV_KEYS.GAME_LEADERBOARD);
  if (count > 100) {
    await redis.zRemRangeByRank(KV_KEYS.GAME_LEADERBOARD, 0, count - 101);
  }
}

/**
 * Calculate what rank a score would get (without saving it)
 */
export async function getScoreRank(score: number): Promise<number> {
  await ensureConnected();

  // Count how many scores are higher
  const higherScores = await redis.zCount(
    KV_KEYS.GAME_LEADERBOARD,
    score + 1,
    '+inf'
  );

  return higherScores + 1; // Rank is 1-indexed
}

/**
 * Find a specific entry by name and timestamp
 */
export async function findLeaderboardEntry(name: string, timestamp: number): Promise<number | null> {
  await ensureConnected();

  const member = `${name}:${timestamp}`;
  const rank = await redis.zRevRank(KV_KEYS.GAME_LEADERBOARD, member);

  return rank !== null ? rank + 1 : null; // Convert to 1-indexed
}

const MAX_WEB_VITAL_SAMPLES = 500;

/**
 * Persist recent Web Vitals samples for quick inspection
 */
export async function logWebVitalSample(sample: WebVitalSample): Promise<void> {
  await ensureConnected();
  await redis.lPush(KV_KEYS.ANALYTICS_WEB_VITALS, JSON.stringify(sample));
  await redis.lTrim(KV_KEYS.ANALYTICS_WEB_VITALS, 0, MAX_WEB_VITAL_SAMPLES - 1);
}

/**
 * Get ALL data from Redis for backup
 */
export async function getAllData(): Promise<Record<string, any>> {
  await ensureConnected();
  const keys = await redis.keys('*');
  const backup: Record<string, any> = {};

  for (const key of keys) {
    const type = await redis.type(key);
    switch (type) {
      case 'string':
        const val = await redis.get(key);
        try {
            backup[key] = JSON.parse(val || 'null');
        } catch {
            backup[key] = val;
        }
        break;
      case 'list':
        backup[key] = await redis.lRange(key, 0, -1);
        break;
      case 'set':
        backup[key] = await redis.sMembers(key);
        break;
      case 'zset':
        // Store as array of {value, score} objects
        backup[key] = await redis.zRangeWithScores(key, 0, -1);
        break;
      case 'hash':
        backup[key] = await redis.hGetAll(key);
        break;
      default:
        console.warn(`Unknown type ${type} for key ${key}`);
        backup[key] = `<unknown type: ${type}>`;
    }
  }
  return backup;
}
