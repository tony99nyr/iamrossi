import type { Game } from '@/types';

export interface MergeScheduleCandidatesOptions {
  mhrTeamId: string;
  teamName: string;
  timeZone: string;
}

function normalizeDateString(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Accept YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }

  return null;
}

function normalizeTeamName(name: unknown): string {
  if (typeof name !== 'string') return '';
  const collapsed = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Normalize common hockey age-group tokens so "10AA" and "10U AA" compare cleanly.
  return collapsed.replace(/(\d{1,2})u/g, '$1');
}

function normalizeTeamId(id: unknown): string | null {
  if (id === undefined || id === null) return null;
  const str = String(id).trim();
  if (!str) return null;
  // IDs are numeric strings in KV, but be defensive.
  if (!/^\d+$/.test(str)) return null;
  return str;
}

function parseClockTimeToMinutes(timeStr: unknown): number | null {
  if (typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === 'TBD') return null;
  // Be forgiving: normalize whitespace and remove dots in "p.m." / "a.m." formats.
  const cleaned = trimmed.replace(/\s+/g, ' ').replace(/\./g, '').toUpperCase();

  // 12h format: "6:30 PM", "06:30PM", "6:30:00 pm"
  const twelveHourMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (twelveHourMatch) {
    const rawHour = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2]);
    const second = twelveHourMatch[3] ? Number(twelveHourMatch[3]) : 0;
    const ampm = String(twelveHourMatch[4]).toUpperCase();

    if (!Number.isFinite(rawHour) || rawHour < 0 || rawHour > 23) return null;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    if (!Number.isFinite(second) || second < 0 || second > 59) return null;

    // If the provider gave a 24h hour *and* AM/PM (e.g. "18:30 PM"), treat it as 24h.
    if (rawHour > 12) return rawHour * 60 + minute;

    let hour = rawHour % 12;
    if (ampm === 'PM') hour += 12;
    return hour * 60 + minute;
  }

  // 24h format: "18:30", "18:30:00"
  const twentyFourMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFourMatch) {
    const hour = Number(twentyFourMatch[1]);
    const minute = Number(twentyFourMatch[2]);
    const second = twentyFourMatch[3] ? Number(twentyFourMatch[3]) : 0;

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    if (!Number.isFinite(second) || second < 0 || second > 59) return null;

    return hour * 60 + minute;
  }

  return null;
}

function getStartBucketKey(game: Game): string {
  // Merge keys should be robust across sources: calendar times tend to be 24h ("18:30:00"),
  // while MHR can be 12h ("6:30 PM") or other variants. We bucket by local clock-time,
  // and pair it with the local date string in `getMergeKey`.
  const timeStr = game.game_time_format || game.game_time;
  const minutes = parseClockTimeToMinutes(timeStr);
  if (minutes === null) return 'unknown';

  const rounded = Math.round(minutes / 5) * 5;
  return String(rounded);
}

function getTeamsKey(game: Game): string | null {
  // Prefer stable team IDs when available (resilient to name variations like "Jr Canes" vs full name).
  const homeId = normalizeTeamId(game.game_home_team);
  const visitorId = normalizeTeamId(game.game_visitor_team);
  if (homeId && visitorId) return [homeId, visitorId].sort().join('|');

  // Fall back to names (best-effort).
  const home = normalizeTeamName(game.home_team_name);
  const visitor = normalizeTeamName(game.visitor_team_name);
  if (!home || !visitor) return null;
  return [home, visitor].sort().join('|');
}

function getMergeKey(game: Game, timeZone: string): string | null {
  const dateStr = normalizeDateString(game.game_date_format || game.game_date);
  if (!dateStr) return null;
  const teamsKey = getTeamsKey(game);
  if (!teamsKey) return null;
  const startBucket = getStartBucketKey(game);
  return `${dateStr}|${startBucket}|${teamsKey}`;
}

function getOtherTeamIdFromMhrGame(mhrGame: Game, mhrTeamId: string): string | null {
  const homeId = mhrGame.game_home_team === undefined || mhrGame.game_home_team === null ? null : String(mhrGame.game_home_team);
  const visitorId =
    mhrGame.game_visitor_team === undefined || mhrGame.game_visitor_team === null ? null : String(mhrGame.game_visitor_team);
  const ourId = String(mhrTeamId);

  if (homeId && homeId !== ourId) return homeId;
  if (visitorId && visitorId !== ourId) return visitorId;
  return null;
}

function mergeGamePreferCalendar(calendarGame: Game, mhrGame: Game, options: MergeScheduleCandidatesOptions): Game {
  const merged: Game = { ...calendarGame };

  // Scores: prefer MHR if it has non-placeholder values.
  const calendarScoreSum = (merged.home_team_score ?? 0) + (merged.visitor_team_score ?? 0);
  const mhrScoreSum = (mhrGame.home_team_score ?? 0) + (mhrGame.visitor_team_score ?? 0);
  if (mhrScoreSum > calendarScoreSum) {
    merged.home_team_score = mhrGame.home_team_score ?? merged.home_team_score;
    merged.visitor_team_score = mhrGame.visitor_team_score ?? merged.visitor_team_score;
  }

  // Prefer MHR game_nbr when calendar is using a short hash id.
  if (mhrGame.game_nbr) {
    const calNbr = merged.game_nbr;
    const calIsShortHash = typeof calNbr === 'string' && calNbr.length === 8;
    if (!calNbr || calIsShortHash) merged.game_nbr = mhrGame.game_nbr;
  }

  // Prefer MHR team records/ratings/logos if calendar is missing them.
  if (!merged.home_team_record && mhrGame.home_team_record) merged.home_team_record = mhrGame.home_team_record;
  if (!merged.home_team_rating && mhrGame.home_team_rating) merged.home_team_rating = mhrGame.home_team_rating;
  if (!merged.visitor_team_record && mhrGame.visitor_team_record) merged.visitor_team_record = mhrGame.visitor_team_record;
  if (!merged.visitor_team_rating && mhrGame.visitor_team_rating) merged.visitor_team_rating = mhrGame.visitor_team_rating;
  if (!merged.home_team_logo && mhrGame.home_team_logo) merged.home_team_logo = mhrGame.home_team_logo;
  if (!merged.visitor_team_logo && mhrGame.visitor_team_logo) merged.visitor_team_logo = mhrGame.visitor_team_logo;

  // Keep opponent details if present on MHR.
  if (!merged.opponent_record && mhrGame.opponent_record) merged.opponent_record = mhrGame.opponent_record;
  if (!merged.opponent_rating && mhrGame.opponent_rating) merged.opponent_rating = mhrGame.opponent_rating;

  // Team IDs: ensure they align with calendar's home/away (override source of truth).
  const otherTeamId = getOtherTeamIdFromMhrGame(mhrGame, options.mhrTeamId);
  const ourTeamId = String(options.mhrTeamId);
  const teamNameNorm = normalizeTeamName(options.teamName);

  const mergedHomeNorm = normalizeTeamName(merged.home_team_name);
  const mergedVisitorNorm = normalizeTeamName(merged.visitor_team_name);

  if (teamNameNorm && mergedHomeNorm === teamNameNorm) {
    merged.game_home_team = ourTeamId;
    if (otherTeamId) merged.game_visitor_team = otherTeamId;
  } else if (teamNameNorm && mergedVisitorNorm === teamNameNorm) {
    if (otherTeamId) merged.game_home_team = otherTeamId;
    merged.game_visitor_team = ourTeamId;
  } else {
    // Fall back to MHR IDs if we can't infer from teamName reliably.
    if (merged.game_home_team === undefined && mhrGame.game_home_team !== undefined) merged.game_home_team = mhrGame.game_home_team;
    if (merged.game_visitor_team === undefined && mhrGame.game_visitor_team !== undefined) merged.game_visitor_team = mhrGame.game_visitor_team;
  }

  return merged;
}

/**
 * Combines raw MHR schedule + merged calendar schedule into a single list,
 * de-duping by (date + ~5min start time bucket + team pair) and preferring
 * the calendar-derived entry when duplicates exist.
 */
export function mergeScheduleCandidates(
  mhrGames: Game[],
  calendarGames: Game[],
  options: MergeScheduleCandidatesOptions
): Game[] {
  const map = new Map<string, { game: Game; source: 'mhr' | 'calendar' }>();
  const passthrough: Game[] = [];

  const addGame = (game: Game, source: 'mhr' | 'calendar') => {
    if (game.isPlaceholder) {
      passthrough.push(game);
      return;
    }

    const key = getMergeKey(game, options.timeZone);
    if (!key) {
      passthrough.push(game);
      return;
    }

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { game, source });
      return;
    }

    // Prefer calendar over MHR; merge useful fields from MHR when both exist.
    if (existing.source === 'mhr' && source === 'calendar') {
      map.set(key, { game: mergeGamePreferCalendar(game, existing.game, options), source: 'calendar' });
      return;
    }
    if (existing.source === 'calendar' && source === 'mhr') {
      map.set(key, { game: mergeGamePreferCalendar(existing.game, game, options), source: 'calendar' });
      return;
    }

    // Same source: keep the existing entry (stable).
  };

  for (const g of Array.isArray(mhrGames) ? mhrGames : []) addGame(g, 'mhr');
  for (const g of Array.isArray(calendarGames) ? calendarGames : []) addGame(g, 'calendar');

  return [...passthrough, ...Array.from(map.values()).map((v) => v.game)];
}

