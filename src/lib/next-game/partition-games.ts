import type { Game } from '@/types';
import { parseDateTimeInTimeZoneToUtc } from '@/lib/timezone';

export interface PartitionNextGameScheduleOptions {
  timeZone: string;
  /**
   * Keep games in the "upcoming" list for this long after start time.
   * This prevents games from disappearing during/shortly after puck drop.
   */
  upcomingGracePeriodMs: number;
}

export interface PartitionedNextGameSchedule {
  futureGames: Game[];
  pastGames: Game[];
}

function isUnknownTime(game: Game, timeStr: string | undefined): boolean {
  if (!timeStr) return true;
  const trimmed = timeStr.trim();
  if (!trimmed) return true;
  if (trimmed.toUpperCase() === 'TBD') return true;

  // Some schedule sources encode "unknown" as midnight.
  const pretty = typeof game.game_time_format_pretty === 'string' ? game.game_time_format_pretty.trim().toUpperCase() : '';
  const isMidnight = trimmed === '00:00:00' || trimmed === '00:00';
  if (isMidnight && pretty === 'TBD') return true;

  return false;
}

function getGameStartUtc(game: Game, timeZone: string): Date | null {
  if (game.isPlaceholder) return null;

  const dateStr = game.game_date_format || game.game_date;
  const timeStr = game.game_time_format || game.game_time;
  if (typeof dateStr !== 'string' || typeof timeStr !== 'string') return null;
  if (isUnknownTime(game, timeStr)) return null;

  return parseDateTimeInTimeZoneToUtc(dateStr, timeStr, timeZone);
}

/**
 * For games with unknown time, check if the DATE is clearly in the past.
 * Returns end-of-day UTC for the game date if valid, null otherwise.
 */
function getGameDateEndUtc(game: Game, timeZone: string): Date | null {
  if (game.isPlaceholder) return null;

  const dateStr = game.game_date_format || game.game_date;
  if (typeof dateStr !== 'string') return null;

  // Parse end-of-day (23:59:59) to be conservative - game could have been late
  const endOfDay = parseDateTimeInTimeZoneToUtc(dateStr, '23:59:59', timeZone);
  return endOfDay;
}

function getPlaceholderEndUtc(game: Game): Date | null {
  if (!game.isPlaceholder) return null;
  if (typeof game.placeholderEndDate !== 'string' || !game.placeholderEndDate.trim()) return null;
  const d = new Date(game.placeholderEndDate);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getPlaceholderStartUtc(game: Game): Date | null {
  if (!game.isPlaceholder) return null;
  if (typeof game.placeholderStartDate !== 'string' || !game.placeholderStartDate.trim()) return null;
  const d = new Date(game.placeholderStartDate);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function partitionNextGameSchedule(
  games: Game[],
  now: Date,
  options: PartitionNextGameScheduleOptions
): PartitionedNextGameSchedule {
  const entries = (Array.isArray(games) ? games : []).map((game) => {
    const placeholderEndUtc = getPlaceholderEndUtc(game);
    const placeholderStartUtc = getPlaceholderStartUtc(game);
    const startUtc = getGameStartUtc(game, options.timeZone);
    const dateEndUtc = getGameDateEndUtc(game, options.timeZone);
    return { game, startUtc, placeholderEndUtc, placeholderStartUtc, dateEndUtc };
  });

  const future: typeof entries = [];
  const past: typeof entries = [];

  for (const entry of entries) {
    // Placeholders stay "upcoming" until their end date passes (plus grace).
    if (entry.placeholderEndUtc) {
      if (now.getTime() < entry.placeholderEndUtc.getTime() + options.upcomingGracePeriodMs) future.push(entry);
      else past.push(entry);
      continue;
    }

    // For games with unknown time but valid date: check if the DATE is clearly in the past.
    // If the end of the game date has passed (plus grace), treat it as past.
    if (!entry.startUtc) {
      if (entry.dateEndUtc && now.getTime() >= entry.dateEndUtc.getTime() + options.upcomingGracePeriodMs) {
        past.push(entry);
      } else {
        // Date is today/future or couldn't parse date - keep in upcoming
        future.push(entry);
      }
      continue;
    }

    if (now.getTime() < entry.startUtc.getTime() + options.upcomingGracePeriodMs) {
      future.push(entry);
    } else {
      past.push(entry);
    }
  }

  // Sort: future ascending (unknown-time games use dateEndUtc, then last), past descending.
  // For placeholders, use placeholderStartUtc for chronological ordering.
  future.sort((a, b) => {
    const aTime = a.startUtc ?? a.placeholderStartUtc ?? a.dateEndUtc;
    const bTime = b.startUtc ?? b.placeholderStartUtc ?? b.dateEndUtc;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return aTime.getTime() - bTime.getTime();
  });

  past.sort((a, b) => {
    const aTime = a.startUtc?.getTime() ?? a.placeholderStartUtc?.getTime() ?? a.dateEndUtc?.getTime() ?? a.placeholderEndUtc?.getTime() ?? 0;
    const bTime = b.startUtc?.getTime() ?? b.placeholderStartUtc?.getTime() ?? b.dateEndUtc?.getTime() ?? b.placeholderEndUtc?.getTime() ?? 0;
    return bTime - aTime;
  });

  return {
    futureGames: future.map((e) => e.game),
    pastGames: past.map((e) => e.game),
  };
}

