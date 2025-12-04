import { createClient } from 'redis';
import type { Exercise, RehabEntry, Settings, Game, WebVitalSample, Player, StatSession, MHRScheduleGame } from '@/types';

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
export type { Exercise, RehabEntry, Settings, Game, Player, StatSession };

// KV Keys
const KV_KEYS = {
  EXERCISES: 'rehab:exercises',
  ENTRIES: 'rehab:entries',
  SETTINGS: 'admin:settings',
  SCHEDULE: 'admin:schedule',
  MHR_SCHEDULE: 'admin:mhr-schedule',
  ROSTER: 'admin:roster',
  GAME_LEADERBOARD: 'game:leaderboard',
  ANALYTICS_WEB_VITALS: 'analytics:web-vitals',
  YOUTUBE_VIDEOS: 'youtube:videos',
  TEAM_MAP: 'mhr:team-map',
  STATS: 'game:stats',
  ENRICHED_GAMES: 'cache:enriched-games',
  SYNC_STATUS: 'sync:status',
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
export async function getMHRSchedule(): Promise<MHRScheduleGame[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.MHR_SCHEDULE);
  return data ? JSON.parse(data) : [];
}

export async function setMHRSchedule(schedule: MHRScheduleGame[]): Promise<void> {
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
export async function getAllData(): Promise<Record<string, unknown>> {
  await ensureConnected();
  const keys = await redis.keys('*');
  const backup: Record<string, unknown> = {};

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

// YouTube video operations
export interface YouTubeVideo {
  title: string;
  url: string;
  videoType?: 'regular' | 'upcoming' | 'live';
  publishDate?: string;
}

export async function getYouTubeVideos(): Promise<YouTubeVideo[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.YOUTUBE_VIDEOS);
  return data ? JSON.parse(data) : [];
}

export async function setYouTubeVideos(videos: YouTubeVideo[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.YOUTUBE_VIDEOS, JSON.stringify(videos));
}

// Sync status operations
export interface SyncStatus {
  lastSyncTime: number | null;
  isRevalidating: boolean;
  lastError: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.SYNC_STATUS);
  return data ? JSON.parse(data) : {
    lastSyncTime: null,
    isRevalidating: false,
    lastError: null
  };
}

export async function setSyncStatus(status: SyncStatus): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.SYNC_STATUS, JSON.stringify(status));
}

// Team map operations (for MHR team data caching)
export interface MHRTeamData {
  name: string;
  logo?: string;
  record?: string;
  rating?: string;
  mhrId?: string;
  url?: string;
  lastUpdated?: number; // Unix timestamp for cache TTL (7 days)
}

export async function getTeamMap(): Promise<Record<string, MHRTeamData>> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.TEAM_MAP);
  return data ? JSON.parse(data) : {};
}

export async function setTeamMap(map: Record<string, MHRTeamData>): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.TEAM_MAP, JSON.stringify(map));
}

// Helper to check if cached team data is stale (7 days)
const TEAM_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export function isTeamCacheStale(teamData: MHRTeamData): boolean {
  if (!teamData.lastUpdated) return true;
  return Date.now() - teamData.lastUpdated > TEAM_CACHE_TTL;
}

// Enriched games cache operations (for video-matched games)
export interface EnrichedGamesCache {
  games: Game[];
  lastUpdated: number;
}

export async function getEnrichedGames(): Promise<EnrichedGamesCache | null> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.ENRICHED_GAMES);
  return data ? JSON.parse(data) : null;
}

export async function setEnrichedGames(games: Game[]): Promise<void> {
  await ensureConnected();
  const cache: EnrichedGamesCache = {
    games,
    lastUpdated: Date.now(),
  };
  await redis.set(KV_KEYS.ENRICHED_GAMES, JSON.stringify(cache));
}

// Check if enriched games cache is stale (1 hour)
const ENRICHED_GAMES_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

export function isEnrichedGamesCacheStale(cache: EnrichedGamesCache): boolean {
  return Date.now() - cache.lastUpdated > ENRICHED_GAMES_TTL;
}

// Roster operations
export async function getRoster(): Promise<Player[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.ROSTER);
  return data ? JSON.parse(data) : [];
}

export async function setRoster(roster: Player[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.ROSTER, JSON.stringify(roster));
}

// Stat Session operations
export async function getStatSessions(): Promise<StatSession[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.STATS);
  return data ? JSON.parse(data) : [];
}

export async function saveStatSession(session: StatSession): Promise<void> {
  await ensureConnected();
  const sessions = await getStatSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }
  
  await redis.set(KV_KEYS.STATS, JSON.stringify(sessions));
}

export async function deleteStatSession(id: string): Promise<void> {
  await ensureConnected();
  const sessions = await getStatSessions();
  const filtered = sessions.filter(s => s.id !== id);
  await redis.set(KV_KEYS.STATS, JSON.stringify(filtered));
}

// ============================================================================
// Generic KV operations (for Oura and other integrations)
// ============================================================================

export interface SetOptions {
  ex?: number; // Expiration in seconds
}

/**
 * Generic get operation
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  await ensureConnected();
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Generic set operation with optional expiration
 */
export async function kvSet<T>(key: string, value: T, options?: SetOptions): Promise<void> {
  await ensureConnected();
  const serialized = JSON.stringify(value);
  
  if (options?.ex) {
    await redis.setEx(key, options.ex, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

/**
 * Generic delete operation (supports multiple keys)
 */
export async function kvDel(...keys: string[]): Promise<void> {
  await ensureConnected();
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

/**
 * Get all keys matching a pattern
 */
export async function kvKeys(pattern: string): Promise<string[]> {
  await ensureConnected();
  return await redis.keys(pattern);
}

