// CRITICAL: Load .env.local FIRST before any other imports
// This ensures REDIS_URL is available when the Redis client is created
// This ensures all scripts and the API use the correct Redis URL
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local if it exists (only in non-test environments)
// In test environments, TEST_REDIS_URL should be set explicitly
// Use process.cwd() which works in both CommonJS and ESM
if (process.env.NODE_ENV !== 'test') {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    dotenv.config({ path: envPath });
  } catch (error) {
    // If .env.local doesn't exist or can't be loaded, that's OK
    // REDIS_URL might be set via environment variables or Vercel
  }
}

import { createClient } from 'redis';
import type {
  Exercise,
  RehabEntry,
  Settings,
  Game,
  WebVitalSample,
  Player,
  StatSession,
  MHRScheduleGame,
  PokemonIndexSettings,
  PokemonCardPriceSnapshot,
  PokemonIndexPoint,
} from '@/types';
import { statSessionSchema } from '@/lib/validation';

// Create Redis client
// Use TEST_REDIS_URL in test environments to avoid wiping production data
// Note: REDIS_URL should now be loaded from .env.local above
function getRedisUrl(): string | undefined {
  if (process.env.NODE_ENV === 'test' && process.env.TEST_REDIS_URL) {
    return process.env.TEST_REDIS_URL;
  }
  return process.env.REDIS_URL;
}

// Create Redis client with dynamic URL resolution
// CRITICAL: The Redis client is created at module load time, so if REDIS_URL isn't set yet,
// it will use undefined and potentially connect to localhost. This is why the backfill script
// and API might use different Redis instances.
// 
// The client URL is set at creation time, but we can't change it dynamically.
// If REDIS_URL changes after module load, the client will still use the original URL.
const redisUrlForClient = getRedisUrl();
if (!redisUrlForClient) {
  console.error('[KV] ERROR: REDIS_URL is not set! Cannot create Redis client.');
  console.error('[KV] Make sure .env.local exists and contains REDIS_URL');
  console.error('[KV] This will cause the client to use localhost, which may not match cloud Redis!');
}

const redis = createClient({
  url: redisUrlForClient || 'redis://localhost:6379' // Fallback only for development (will log warning)
});

// Log which URL the client was created with (for debugging)
if (redisUrlForClient) {
  console.log(`[KV] Redis client created with URL: ${redisUrlForClient.substring(0, 30)}...`);
} else {
  console.warn('[KV] WARNING: Redis client created with undefined URL - will use localhost fallback!');
}

// Connect to Redis (lazy connection with retry logic)
let isConnected = false;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function ensureConnected(retries = 0): Promise<void> {
  // Always check if connection is actually open, not just the flag
  if (isConnected && redis.isOpen) {
    return;
  }

  // Reset flag if connection is closed
  if (!redis.isOpen) {
    isConnected = false;
  }

  try {
    // Check if Redis URL has changed (e.g., environment variables loaded after module init)
    const currentUrl = getRedisUrl();
    if (currentUrl && redis.options?.url !== currentUrl) {
      console.warn(`[KV] Redis URL mismatch! Client URL: ${redis.options?.url?.substring(0, 30)}..., Current: ${currentUrl.substring(0, 30)}...`);
      // If URL changed, we need to recreate the client (but this is complex, so just warn for now)
    }

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
  CALENDAR_SYNC_STATUS: 'sync:calendar-status',
  HOME_IP: 'admin:home-ip',
  SELECTED_LIVE_SESSION: 'stats:selected-live-session',
  POKEMON_INDEX_SETTINGS: 'pokemon:index:settings',
  POKEMON_CARD_PRICES: 'pokemon:index:card-prices',
  POKEMON_INDEX_SERIES: 'pokemon:index:series',
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

// Calendar sync status operations
export interface CalendarSyncStatus {
  lastSyncTime: number | null;
  isRevalidating: boolean;
  lastError: string | null;
}

export async function getCalendarSyncStatus(): Promise<CalendarSyncStatus> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.CALENDAR_SYNC_STATUS);
  return data ? JSON.parse(data) : {
    lastSyncTime: null,
    isRevalidating: false,
    lastError: null
  };
}

export async function setCalendarSyncStatus(status: CalendarSyncStatus): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.CALENDAR_SYNC_STATUS, JSON.stringify(status));
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
  if (!data) return [];

  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    const validSessions: StatSession[] = [];

    for (const raw of parsed) {
      const coerced = coerceStatSession(raw);
      if (coerced) validSessions.push(coerced);
    }

    return validSessions;
  } catch (error) {
    console.error('[KV] Failed to parse stat sessions:', error);
    return [];
  }
}

function coerceStatSession(raw: unknown): StatSession | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  const date = typeof obj.date === 'string' ? obj.date : '';
  const inferredStartTime = (() => {
    if (typeof obj.startTime === 'number') return obj.startTime;
    if (typeof obj.startTime === 'string') {
      const n = Number(obj.startTime);
      if (Number.isFinite(n)) return n;
    }
    if (typeof date === 'string' && date.trim()) {
      const t = new Date(date).getTime();
      return Number.isFinite(t) ? t : undefined;
    }
    return undefined;
  })();

  const candidate: unknown = {
    ...obj,
    // Common legacy coercions
    gameId: obj.gameId === undefined || obj.gameId === null ? undefined : String(obj.gameId),
    endTime: typeof obj.endTime === 'number'
      ? obj.endTime
      : typeof obj.endTime === 'string'
        ? Number(obj.endTime)
        : undefined,
    startTime: inferredStartTime,
    events: Array.isArray(obj.events) ? obj.events : [],
    usStats: obj.usStats && typeof obj.usStats === 'object' ? obj.usStats : {},
    themStats: obj.themStats && typeof obj.themStats === 'object' ? obj.themStats : {},
  };

  const result = statSessionSchema.safeParse(candidate);
  if (!result.success) return null;
  return result.data;
}

export async function setStatSessions(sessions: StatSession[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.STATS, JSON.stringify(sessions));
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

// Selected live session operations
export async function getSelectedLiveSession(): Promise<string | null> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.SELECTED_LIVE_SESSION);
  return data || null;
}

export async function setSelectedLiveSession(sessionId: string | null): Promise<void> {
  await ensureConnected();
  if (sessionId) {
    await redis.set(KV_KEYS.SELECTED_LIVE_SESSION, sessionId);
  } else {
    await redis.del(KV_KEYS.SELECTED_LIVE_SESSION);
  }
}

// Home IP operations
export async function getHomeIp(): Promise<string | null> {
  await ensureConnected();
  return await redis.get(KV_KEYS.HOME_IP);
}

export async function setHomeIp(ip: string): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.HOME_IP, ip);
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

// ============================================================================
// Pokemon Price Index operations
// ============================================================================

export async function getPokemonIndexSettings(): Promise<PokemonIndexSettings | null> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.POKEMON_INDEX_SETTINGS);
  return data ? JSON.parse(data) as PokemonIndexSettings : null;
}

export async function setPokemonIndexSettings(settings: PokemonIndexSettings): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.POKEMON_INDEX_SETTINGS, JSON.stringify(settings));
}

export async function getPokemonCardPriceSnapshots(): Promise<PokemonCardPriceSnapshot[]> {
  await ensureConnected();
  
  // Force a fresh connection if we're not open
  if (!redis.isOpen) {
    await redis.connect();
  }
  
  const data = await redis.get(KV_KEYS.POKEMON_CARD_PRICES);
  const snapshots = data ? JSON.parse(data) as PokemonCardPriceSnapshot[] : [];
  
  // Debug: log if we're getting fewer snapshots than expected
  if (snapshots.length > 0 && snapshots.length < 50) {
    console.log(`[KV] getPokemonCardPriceSnapshots: Warning - only ${snapshots.length} snapshots found (expected more)`);
    console.log(`[KV] Redis URL: ${process.env.REDIS_URL?.substring(0, 20)}...`);
    console.log(`[KV] Redis isOpen: ${redis.isOpen}`);
  }
  
  return snapshots;
}

export async function setPokemonCardPriceSnapshots(snapshots: PokemonCardPriceSnapshot[]): Promise<void> {
  await ensureConnected();
  
  // Safety check: warn if we're saving a suspiciously small number of snapshots
  // This might indicate we're about to overwrite historical data
  // BUT: Only block if the new dataset is significantly smaller than existing (likely data loss)
  // Allow small datasets if they're building up (e.g., daily updates when starting fresh)
  if (snapshots.length > 0 && snapshots.length < 20) {
    const existing = await getPokemonCardPriceSnapshots();
    // Only block if existing is much larger (more than 3x) - indicates potential data loss
    // If existing is also small, it's probably just a new/fresh dataset
    if (existing.length > snapshots.length * 3 && existing.length > 50) {
      console.warn(`[KV] Warning: About to save ${snapshots.length} snapshots, but ${existing.length} exist. This might overwrite historical data!`);
      console.warn(`[KV] Aborting save to prevent data loss. Please investigate.`);
      throw new Error(`Prevented data loss: Attempted to save ${snapshots.length} snapshots when ${existing.length} exist. This would overwrite historical data.`);
    }
  }
  
  console.log(`[KV] setPokemonCardPriceSnapshots: Saving ${snapshots.length} snapshots to Redis`);
  const currentRedisUrl = getRedisUrl();
  console.log(`[KV] Redis URL: ${currentRedisUrl ? currentRedisUrl.substring(0, 50) + '...' : 'undefined'}`);
  console.log(`[KV] Redis isOpen: ${redis.isOpen}, Key: ${KV_KEYS.POKEMON_CARD_PRICES}`);
  
  await redis.set(KV_KEYS.POKEMON_CARD_PRICES, JSON.stringify(snapshots));
  
  // Verify the save worked by reading it back
  const verify = await redis.get(KV_KEYS.POKEMON_CARD_PRICES);
  const verifyCount = verify ? JSON.parse(verify).length : 0;
  console.log(`[KV] setPokemonCardPriceSnapshots: Verification - ${verifyCount} snapshots in Redis after save`);
  
  if (verifyCount !== snapshots.length) {
    console.error(`[KV] ERROR: Save verification failed! Expected ${snapshots.length}, but Redis has ${verifyCount}`);
    throw new Error(`Save verification failed: Expected ${snapshots.length} snapshots, but Redis has ${verifyCount}`);
  }
  
  console.log(`[KV] setPokemonCardPriceSnapshots: Successfully saved to ${KV_KEYS.POKEMON_CARD_PRICES}`);
}

export async function getPokemonIndexSeries(): Promise<PokemonIndexPoint[]> {
  await ensureConnected();
  const data = await redis.get(KV_KEYS.POKEMON_INDEX_SERIES);
  return data ? JSON.parse(data) as PokemonIndexPoint[] : [];
}

export async function setPokemonIndexSeries(series: PokemonIndexPoint[]): Promise<void> {
  await ensureConnected();
  await redis.set(KV_KEYS.POKEMON_INDEX_SERIES, JSON.stringify(series));
}

