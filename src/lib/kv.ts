import { createClient } from 'redis';

// Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL
});

// Connect to Redis (lazy connection)
let isConnected = false;
async function ensureConnected() {
  if (!isConnected) {
    await redis.connect();
    isConnected = true;
  }
}

// Type definitions
export interface Exercise {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface RehabEntry {
  id: string;
  date: string;
  exercises: { id: string; weight?: string }[];
  isRestDay: boolean;
  vitaminsTaken: boolean;
  proteinShake: boolean;
}

export interface Settings {
  teamName: string;
  identifiers: string[];
  teamLogo: string;
  mhrTeamId?: string;
  mhrYear?: string;
  aliases?: Record<string, string>;
}

export interface Game {
  game_nbr?: string | number;
  game_date: string;
  game_time: string;
  game_date_format?: string;
  game_date_format_pretty?: string;
  game_time_format?: string;
  game_time_format_pretty?: string;
  home_team_name: string;
  visitor_team_name: string;
  home_team_logo?: string;
  visitor_team_logo?: string;
  home_team_score?: number;
  visitor_team_score?: number;
  rink_name: string;
  game_type?: string;
  opponent_record?: string;
  opponent_rating?: string;
  home_team_record?: string;
  home_team_rating?: string;
  visitor_team_record?: string;
  visitor_team_rating?: string;
  game_home_team?: number | string;
  game_visitor_team?: number | string;
  highlightsUrl?: string;
  fullGameUrl?: string;
  [key: string]: any; // Allow additional properties
}

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
