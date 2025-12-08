/**
 * Oura API Service
 * Handles data fetching from Oura Ring API v2 using Personal Access Token
 */

import { kvGet, kvSet } from '@/lib/kv';

const OURA_BASE_URL = 'https://api.ouraring.com';
const OURA_ACCESS_TOKEN = process.env.OURA_PAT;

export interface OuraScores {
  date: string;
  sleepScore?: number;
  readinessScore?: number;
  activityScore?: number;
  lastSynced?: string;
}

interface OuraSleepResponse {
  data: Array<{
    day: string;
    score?: number;
  }>;
}

interface OuraReadinessResponse {
  data: Array<{
    day: string;
    score?: number;
  }>;
}

interface OuraActivityResponse {
  data: Array<{
    day: string;
    score?: number;
    contributors?: {
      activity_score?: number;
    };
  }>;
}

/**
 * Check if Oura is configured
 */
export function isOuraConfigured(): boolean {
  return !!OURA_ACCESS_TOKEN;
}

/**
 * Fetch daily scores for a specific date
 */
export async function getDailyScores(date: string, forceRefresh = false): Promise<OuraScores> {
  if (!OURA_ACCESS_TOKEN) {
    throw new Error('OURA_PAT is not configured');
  }

  // Determine if this is today's data (use local timezone, not UTC)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = date === today;

  // Check cache first - but skip cache for today's data or if forceRefresh is true
  const cacheKey = `oura:scores:${date}`;
  
  if (!isToday && !forceRefresh) {
    try {
      const cached = await kvGet<OuraScores>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.error('[Oura] Cache read error:', error);
    }
  }

  // Fetch data from all three endpoints in parallel
  const [sleepData, readinessData, activityData] = await Promise.all([
    fetchSleepScore(date, OURA_ACCESS_TOKEN),
    fetchReadinessScore(date, OURA_ACCESS_TOKEN),
    fetchActivityScore(date, OURA_ACCESS_TOKEN),
  ]);

  const scores: OuraScores = {
    date,
    sleepScore: sleepData,
    readinessScore: readinessData,
    activityScore: activityData,
    lastSynced: new Date().toISOString(),
  };

  // Determine cache duration based on whether this is today's data
  // Today's data: 15 minutes (activity score changes throughout the day)
  // Past days: 24 hours (data is final)
  const cacheDuration = isToday ? 15 * 60 : 24 * 60 * 60;

  // Cache with appropriate duration
  try {
    await kvSet(cacheKey, scores, { ex: cacheDuration });
  } catch (error) {
    console.error('[Oura] Cache write error:', error);
  }

  return scores;
}

/**
 * Fetch sleep score for a specific date
 */
async function fetchSleepScore(date: string, accessToken: string): Promise<number | undefined> {
  const url = `${OURA_BASE_URL}/v2/usercollection/daily_sleep?start_date=${date}&end_date=${date}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('Failed to fetch sleep score:', await response.text());
    return undefined;
  }

  const data: OuraSleepResponse = await response.json();
  return data.data[0]?.score;
}

/**
 * Fetch readiness score for a specific date
 */
async function fetchReadinessScore(
  date: string,
  accessToken: string
): Promise<number | undefined> {
  const url = `${OURA_BASE_URL}/v2/usercollection/daily_readiness?start_date=${date}&end_date=${date}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('Failed to fetch readiness score:', await response.text());
    return undefined;
  }

  const data: OuraReadinessResponse = await response.json();
  return data.data[0]?.score;
}

/**
 * Fetch activity score for a specific date
 */
async function fetchActivityScore(
  date: string,
  accessToken: string
): Promise<number | undefined> {
  // Oura API seems to not return data when start_date === end_date
  // Use a small date range instead
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const endDate = nextDay.toISOString().split('T')[0];
  
  const url = `${OURA_BASE_URL}/v2/usercollection/daily_activity?start_date=${date}&end_date=${endDate}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('[Oura] Failed to fetch activity score:', response.status, await response.text());
    return undefined;
  }

  const data: OuraActivityResponse = await response.json();
  
  // Find the data for the specific date
  const activityData = data.data.find(d => d.day === date);
  if (!activityData) {
    return undefined;
  }
  
  return activityData.score || activityData.contributors?.activity_score;
}
