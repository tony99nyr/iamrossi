/**
 * Google Fit API Service
 * Handles data fetching from Google Fit API using OAuth2 refresh token
 */

import { kvGet, kvSet } from '@/lib/kv';
import type { GoogleFitHeartRate } from '@/types';

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

const FITNESS_BASE = 'https://www.googleapis.com/fitness/v1/users/me';
const DATA_SOURCES_URL = `${FITNESS_BASE}/dataSources`;
const SESSIONS_URL = `${FITNESS_BASE}/sessions`;

interface GoogleFitDataSource {
  dataStreamId?: string;
  dataType?: {
    name?: string;
  };
}

interface GoogleFitDataSourceResponse {
  dataSource?: GoogleFitDataSource[];
}

interface GoogleFitPoint {
  value?: Array<{
    fpVal?: number;
  }>;
}

interface GoogleFitDatasetResponse {
  point?: GoogleFitPoint[];
}

interface GoogleFitSession {
  id?: string;
  name?: string;
  description?: string;
  startTimeMillis?: string;
  endTimeMillis?: string;
  activityType?: number;
  application?: {
    packageName?: string;
    version?: string;
    detailsUrl?: string;
    name?: string;
  };
}

interface GoogleFitSessionsResponse {
  session?: GoogleFitSession[];
}

/**
 * Check if Google Fit is configured
 */
export function isGoogleFitConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

/**
 * Get access token from refresh token
 */
async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Google Fit credentials are not configured');
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[Google Fit] Failed to refresh access token:', data);
    throw new Error('Failed to refresh access token');
  }
  return data.access_token as string;
}

/**
 * Get merged heart rate stream ID
 */
async function getMergedHeartRateStreamId(accessToken: string): Promise<string> {
  const res = await fetch(DATA_SOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: GoogleFitDataSourceResponse = await res.json();
  if (!res.ok) {
    console.error('[Google Fit] Failed to fetch data sources:', data);
    throw new Error('Failed to fetch data sources');
  }

  const sources = Array.isArray(data.dataSource) ? data.dataSource : [];
  const preferred = sources.find(
    (s) =>
      s.dataType?.name === 'com.google.heart_rate.bpm' &&
      typeof s.dataStreamId === 'string' &&
      s.dataStreamId.includes('merge')
  );
  const fallback = sources.find((s) => s.dataType?.name === 'com.google.heart_rate.bpm');

  const chosen = preferred ?? fallback;
  if (!chosen) {
    throw new Error('No heart rate data source found');
  }
  return chosen.dataStreamId as string;
}

/**
 * Get heart rate points for a date range
 */
async function getHeartRatePoints(
  accessToken: string,
  dataStreamId: string,
  startNs: string,
  endNs: string
): Promise<number[]> {
  const datasetUrl = `${DATA_SOURCES_URL}/${encodeURIComponent(dataStreamId)}/datasets/${startNs}-${endNs}`;
  const res = await fetch(datasetUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data: GoogleFitDatasetResponse = await res.json();
  if (!res.ok) {
    console.error('[Google Fit] Failed to fetch heart rate dataset:', data);
    return [];
  }
  const points = Array.isArray(data.point) ? data.point : [];
  const values: number[] = [];
  for (const p of points) {
    const v = p.value?.[0];
    if (v && typeof v.fpVal === 'number') {
      values.push(v.fpVal);
    }
  }
  return values;
}

/**
 * Get workout sessions for a specific date
 * Returns sessions that are workouts (activity types 8-113) or from Wahoo
 */
async function getWorkoutSessionsForDate(accessToken: string, date: string): Promise<GoogleFitSession[]> {
  const dateObj = new Date(`${date}T00:00:00`);
  const startOfDay = new Date(dateObj);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setHours(23, 59, 59, 999);

  const startTime = startOfDay.toISOString();
  const endTime = endOfDay.toISOString();
  const url = `${SESSIONS_URL}?startTime=${startTime}&endTime=${endTime}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data: GoogleFitSessionsResponse = await res.json();
  if (!res.ok) {
    console.error('[Google Fit] Failed to fetch sessions:', data);
    return [];
  }

  const sessions = Array.isArray(data.session) ? data.session : [];

  // Filter for workout sessions:
  // 1. Activity types 8-113 are workout activities (running, cycling, etc.)
  // 2. Sessions from Wahoo (package name contains "wahoo" or name contains "Wahoo")
  return sessions.filter((session) => {
    const activityType = session.activityType;
    const isWorkoutActivity = activityType !== undefined && activityType >= 8 && activityType <= 113;
    
    const appName = session.application?.name?.toLowerCase() || '';
    const packageName = session.application?.packageName?.toLowerCase() || '';
    const sessionName = session.name?.toLowerCase() || '';
    const isWahoo = appName.includes('wahoo') || packageName.includes('wahoo') || sessionName.includes('wahoo');

    return isWorkoutActivity || isWahoo;
  });
}

/**
 * Compute stats from heart rate values
 */
function computeStats(values: number[]): { avg: number; max: number } | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values);
  return { avg: sum / values.length, max };
}

/**
 * Fetch daily heart rate data for a specific date
 */
export async function getDailyHeartRate(date: string, forceRefresh = false): Promise<GoogleFitHeartRate> {
  if (!isGoogleFitConfigured()) {
    throw new Error('Google Fit is not configured');
  }

  // Determine if this is today's data (use local timezone, not UTC)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = date === today;

  // Check cache first - but skip cache for today's data or if forceRefresh is true
  const cacheKey = `google-fit:heart-rate:${date}`;
  
  if (!isToday && !forceRefresh) {
    try {
      const cached = await kvGet<GoogleFitHeartRate>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.error('[Google Fit] Cache read error:', error);
    }
  }

  try {
    const accessToken = await getAccessToken();
    
    // Check if there are workout sessions on this date before fetching HR data
    const workoutSessions = await getWorkoutSessionsForDate(accessToken, date);
    
    // Only fetch HR data if there are workout sessions on this date
    if (workoutSessions.length === 0) {
      // Return empty data structure (no workouts, so no HR data)
      // Cache this result to avoid checking sessions repeatedly
      const emptyHeartRate: GoogleFitHeartRate = {
        date,
        lastSynced: new Date().toISOString(),
      };
      
      const cacheDuration = isToday ? 15 * 60 : 24 * 60 * 60;
      try {
        await kvSet(cacheKey, emptyHeartRate, { ex: cacheDuration });
      } catch (error) {
        console.error('[Google Fit] Cache write error:', error);
      }
      
      return emptyHeartRate;
    }

    const heartRateStreamId = await getMergedHeartRateStreamId(accessToken);

    // Convert date to start and end of day in nanoseconds
    const dateObj = new Date(`${date}T00:00:00`);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const startNs = `${Math.trunc(startOfDay.getTime())}000000`;
    const endNs = `${Math.trunc(endOfDay.getTime())}000000`;

    const values = await getHeartRatePoints(accessToken, heartRateStreamId, startNs, endNs);
    const stats = computeStats(values);

    const heartRate: GoogleFitHeartRate = {
      date,
      avgBpm: stats?.avg,
      maxBpm: stats?.max,
      sampleCount: values.length,
      lastSynced: new Date().toISOString(),
    };

    // Determine cache duration based on whether this is today's data
    // Today's data: 15 minutes (data may update throughout the day)
    // Past days: 24 hours (data won't change)
    const cacheDuration = isToday ? 15 * 60 : 24 * 60 * 60;

    // Cache with appropriate duration
    try {
      await kvSet(cacheKey, heartRate, { ex: cacheDuration });
    } catch (error) {
      console.error('[Google Fit] Cache write error:', error);
    }

    return heartRate;
  } catch (error) {
    console.error('[Google Fit] Error fetching heart rate data:', error);
    // Return empty data structure on error (don't throw)
    return {
      date,
      lastSynced: new Date().toISOString(),
    };
  }
}

