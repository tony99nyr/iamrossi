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
  startTimeNanos?: string;
  endTimeNanos?: string;
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
 * Custom error for expired/revoked refresh tokens
 */
export class GoogleFitTokenError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_grant' | 'invalid_client' | 'other',
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'GoogleFitTokenError';
  }
}

/**
 * Get access token from refresh token
 * Exported for testing token validity
 */
export async function getAccessToken(): Promise<string> {
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
    
    // Check for specific error types
    const errorCode = data.error as string | undefined;
    const errorDescription = data.error_description as string | undefined;
    
    if (errorCode === 'invalid_grant') {
      const message = errorDescription?.includes('expired') || errorDescription?.includes('revoked')
        ? 'Google Fit refresh token has expired or been revoked. If your app is in "Testing" mode, refresh tokens expire after 7 days. To get longer-lasting tokens, publish your app to "Production" in Google Cloud Console (see CLAUDE.md for instructions). Then generate a new refresh token using: pnpm run exchange-google-fit-token'
        : `Google Fit refresh token error: ${errorDescription || 'Token has been expired or revoked'}. If your app is in "Testing" mode, refresh tokens expire after 7 days. To get longer-lasting tokens, publish your app to "Production" in Google Cloud Console (see CLAUDE.md for instructions). Then generate a new refresh token using: pnpm run exchange-google-fit-token`;
      throw new GoogleFitTokenError(message, 'invalid_grant', data);
    }
    
    if (errorCode === 'invalid_client') {
      throw new GoogleFitTokenError(
        'Google Fit client credentials are invalid. Please check GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET environment variables.',
        'invalid_client',
        data,
      );
    }
    
    // Generic error for other cases
    throw new GoogleFitTokenError(
      `Failed to refresh access token: ${errorDescription || errorCode || 'Unknown error'}`,
      'other',
      data,
    );
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
  endNs: string,
  workoutSessions?: GoogleFitSession[]
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
  
  console.log(`[Google Fit] Retrieved ${points.length} total HR data points from API`);
  
  // If we have workout sessions, filter HR data to only include samples during workout periods
  // This gives us workout-specific HR stats (higher max, more accurate avg) rather than all-day stats
  if (workoutSessions && workoutSessions.length > 0) {
    // Create time ranges for all workout sessions (convert to nanoseconds)
    const workoutRanges: Array<{ startNs: number; endNs: number }> = [];
    for (const session of workoutSessions) {
      if (session.startTimeMillis && session.endTimeMillis) {
        // Convert milliseconds to nanoseconds (multiply by 1,000,000)
        const startNs = Number.parseInt(session.startTimeMillis, 10) * 1000000;
        const endNs = Number.parseInt(session.endTimeMillis, 10) * 1000000;
        workoutRanges.push({ startNs, endNs });
        console.log(`[Google Fit] Workout range: ${startNs} to ${endNs} (${new Date(Number.parseInt(session.startTimeMillis, 10)).toISOString()} to ${new Date(Number.parseInt(session.endTimeMillis, 10)).toISOString()})`);
      }
    }
    
    console.log(`[Google Fit] Filtering HR data to ${workoutRanges.length} workout session(s)`);
    
    let pointsWithTime = 0;
    let pointsWithoutTime = 0;
    
    // Only include HR points that fall within workout time ranges
    for (const p of points) {
      const pointTimeNs = p.startTimeNanos || p.endTimeNanos;
      if (!pointTimeNs) {
        pointsWithoutTime++;
        continue;
      }
      pointsWithTime++;
      
      // Convert point time to number for comparison
      const pointTime = Number.parseInt(pointTimeNs, 10);
      if (isNaN(pointTime)) continue;
      
      // Check if this point falls within any workout session
      const isDuringWorkout = workoutRanges.some(range => {
        return pointTime >= range.startNs && pointTime <= range.endNs;
      });
      
      if (isDuringWorkout) {
        const v = p.value?.[0];
        if (v && typeof v.fpVal === 'number') {
          values.push(v.fpVal);
        }
      }
    }
    
    console.log(`[Google Fit] Filtered ${values.length} HR samples from ${points.length} total samples (workout periods only)`);
    console.log(`[Google Fit] Points breakdown: ${pointsWithTime} with timestamps, ${pointsWithoutTime} without timestamps`);
    
    // If filtering resulted in very few samples, fall back to all-day data
    // This handles timezone mismatches or cases where HR data wasn't recorded during workout
    if (values.length === 0 && points.length > 0) {
      console.warn(`[Google Fit] WARNING: No HR samples matched workout time ranges! Falling back to all-day data.`);
      console.warn(`[Google Fit] This could mean:`);
      console.warn(`  - Workout timestamps don't match HR data timestamps (timezone issue?)`);
      console.warn(`  - HR data wasn't recorded during workout period`);
      if (points[0]?.startTimeNanos && points[points.length - 1]?.startTimeNanos) {
        const firstTimeNanos = points[0].startTimeNanos;
        const lastTimeNanos = points[points.length - 1].startTimeNanos;
        if (firstTimeNanos && lastTimeNanos) {
          const firstTime = new Date(Number.parseInt(firstTimeNanos, 10) / 1000000).toISOString();
          const lastTime = new Date(Number.parseInt(lastTimeNanos, 10) / 1000000).toISOString();
          console.warn(`  - HR data time range: ${firstTime} to ${lastTime}`);
        }
      }
      
      // Fall back to all-day data
      for (const p of points) {
        const v = p.value?.[0];
        if (v && typeof v.fpVal === 'number') {
          values.push(v.fpVal);
        }
      }
      console.log(`[Google Fit] Using all-day data instead: ${values.length} samples`);
    } else if (values.length > 0 && values.length < points.length * 0.1) {
      // If we filtered to less than 10% of samples, that's suspicious - log a warning
      console.warn(`[Google Fit] WARNING: Filtered to only ${values.length} samples (${((values.length / points.length) * 100).toFixed(1)}% of total). This might indicate a timezone mismatch.`);
    }
  } else {
    // No workout sessions - use all HR data for the day
    console.log(`[Google Fit] No workout sessions detected - using all-day HR data`);
    for (const p of points) {
      const v = p.value?.[0];
      if (v && typeof v.fpVal === 'number') {
        values.push(v.fpVal);
      }
    }
  }
  
  return values;
}

/**
 * Get workout sessions for a specific date
 * Returns sessions that are workouts (activity types 8-113) or from Wahoo
 */
async function getWorkoutSessionsForDate(accessToken: string, date: string): Promise<GoogleFitSession[]> {
  // Parse date in local timezone to avoid timezone issues
  const [year, month, day] = date.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

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
  console.log(`[Google Fit] Found ${sessions.length} total sessions for ${date} (before filtering)`);

  // Filter for workout sessions:
  // 1. Activity types 8-113 are workout activities (running, cycling, etc.)
  // 2. Sessions from Wahoo (package name contains "wahoo" or name contains "Wahoo")
  const workoutSessions = sessions.filter((session) => {
    const activityType = session.activityType;
    const isWorkoutActivity = activityType !== undefined && activityType >= 8 && activityType <= 113;
    
    const appName = session.application?.name?.toLowerCase() || '';
    const packageName = session.application?.packageName?.toLowerCase() || '';
    const sessionName = session.name?.toLowerCase() || '';
    const isWahoo = appName.includes('wahoo') || packageName.includes('wahoo') || sessionName.includes('wahoo');

    return isWorkoutActivity || isWahoo;
  });
  
  if (sessions.length > 0 && workoutSessions.length === 0) {
    console.log(`[Google Fit] Found ${sessions.length} sessions but none matched workout criteria. Sample sessions:`, 
      sessions.slice(0, 3).map(s => ({ 
        activityType: s.activityType, 
        name: s.name, 
        app: s.application?.name 
      }))
    );
  }
  
  return workoutSessions;
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
        // Only return cached data if it has actual HR values
        // If cache has empty data (no avgBpm/maxBpm), we should re-fetch in case data was added
        if (cached.avgBpm !== undefined || cached.maxBpm !== undefined) {
          console.log(`[Google Fit] Using cached HR data for ${date}: avg=${cached.avgBpm}, max=${cached.maxBpm}, samples=${cached.sampleCount || 0}`);
          return cached;
        } else {
          console.log(`[Google Fit] Cached data for ${date} is empty (no HR values), re-fetching...`);
          // Don't return empty cached data - re-fetch to see if data is now available
        }
      }
    } catch (error) {
      console.error('[Google Fit] Cache read error:', error);
    }
  }

  try {
    const accessToken = await getAccessToken();
    
    // Check if there are workout sessions on this date (for logging purposes)
    // Note: We always fetch HR data regardless of workout sessions, since HR data can exist
    // from general activity, walks, or continuous monitoring even without formal workout sessions
    const workoutSessions = await getWorkoutSessionsForDate(accessToken, date);
    console.log(`[Google Fit] Found ${workoutSessions.length} workout sessions for ${date}`);
    
    // Log workout session details for debugging
    if (workoutSessions.length > 0) {
      workoutSessions.forEach((session, idx) => {
        const startTime = session.startTimeMillis ? new Date(Number.parseInt(session.startTimeMillis, 10)).toISOString() : 'unknown';
        const endTime = session.endTimeMillis ? new Date(Number.parseInt(session.endTimeMillis, 10)).toISOString() : 'unknown';
        const duration = session.startTimeMillis && session.endTimeMillis 
          ? Math.round((Number.parseInt(session.endTimeMillis, 10) - Number.parseInt(session.startTimeMillis, 10)) / 1000 / 60)
          : 'unknown';
        console.log(`[Google Fit] Workout ${idx + 1}: ${session.name || 'Unnamed'} (type: ${session.activityType}), ${startTime} to ${endTime} (${duration} min)`);
      });
    }
    
    // Always fetch HR data - don't skip based on workout sessions
    // HR data can exist from general activity, walks, or continuous monitoring

    const heartRateStreamId = await getMergedHeartRateStreamId(accessToken);

    // Convert date to start and end of day in nanoseconds
    // Use UTC to avoid timezone issues (Google Fit API expects UTC timestamps)
    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const startNs = `${Math.trunc(startOfDay.getTime())}000000`;
    const endNs = `${Math.trunc(endOfDay.getTime())}000000`;

    console.log(`[Google Fit] Fetching HR data for ${date}: ${startNs} to ${endNs} (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);
    
    // Pass workout sessions to filter HR data to workout periods only
    const values = await getHeartRatePoints(accessToken, heartRateStreamId, startNs, endNs, workoutSessions);
    console.log(`[Google Fit] Found ${values.length} heart rate samples for ${date}${workoutSessions.length > 0 ? ' (filtered to workout periods)' : ' (all-day data)'}`);
    
    if (values.length === 0) {
      console.log(`[Google Fit] No heart rate samples found for ${date}. This could mean:`);
      console.log(`  - No HR data was recorded on this date`);
      console.log(`  - Date range might be incorrect (check timezone)`);
      console.log(`  - HR data source might not have data for this date`);
    }
    
    const stats = computeStats(values);

    const heartRate: GoogleFitHeartRate = {
      date,
      avgBpm: stats?.avg,
      maxBpm: stats?.max,
      sampleCount: values.length,
      lastSynced: new Date().toISOString(),
    };

    // Log what we're returning with workout context
    if (stats) {
      const workoutContext = workoutSessions.length > 0 
        ? ` (from ${workoutSessions.length} workout session(s), ${values.length} samples during workouts)`
        : ` (all-day data, ${values.length} total samples)`;
      console.log(`[Google Fit] Computed stats for ${date}: avg=${stats.avg.toFixed(1)} bpm, max=${stats.max.toFixed(1)} bpm${workoutContext}`);
      
      // If we have workouts but max HR is suspiciously low, warn
      if (workoutSessions.length > 0 && stats.max < 100) {
        console.warn(`[Google Fit] WARNING: Workout detected but max HR is only ${stats.max.toFixed(1)} bpm - this seems low for a workout. Check if HR filtering is working correctly.`);
      }
    } else if (values.length > 0) {
      console.log(`[Google Fit] WARNING: Found ${values.length} samples but computeStats returned null - this should not happen`);
    } else {
      console.log(`[Google Fit] No stats computed for ${date} (no samples found)`);
    }

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
    
    // If it's a token error, log more details but still return empty data
    if (error instanceof GoogleFitTokenError) {
      console.error(`[Google Fit] Token error (${error.code}): ${error.message}`);
    }
    
    // Return empty data structure on error (don't throw)
    return {
      date,
      lastSynced: new Date().toISOString(),
    };
  }
}

