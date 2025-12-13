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

function getPlaceholderEndUtc(game: Game): Date | null {
  if (!game.isPlaceholder) return null;
  if (typeof game.placeholderEndDate !== 'string' || !game.placeholderEndDate.trim()) return null;
  const d = new Date(game.placeholderEndDate);
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
    const startUtc = getGameStartUtc(game, options.timeZone);
    return { game, startUtc, placeholderEndUtc };
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

    // Unknown-time games stay upcoming (we can't reliably classify them as past).
    if (!entry.startUtc) {
      future.push(entry);
      continue;
    }

    if (now.getTime() < entry.startUtc.getTime() + options.upcomingGracePeriodMs) {
      future.push(entry);
    } else {
      past.push(entry);
    }
  }

  // Sort: future ascending (unknown-time last), past descending.
  future.sort((a, b) => {
    if (!a.startUtc && !b.startUtc) return 0;
    if (!a.startUtc) return 1;
    if (!b.startUtc) return -1;
    return a.startUtc.getTime() - b.startUtc.getTime();
  });

  past.sort((a, b) => {
    const aTime = a.startUtc?.getTime() ?? a.placeholderEndUtc?.getTime() ?? 0;
    const bTime = b.startUtc?.getTime() ?? b.placeholderEndUtc?.getTime() ?? 0;
    return bTime - aTime;
  });

  return {
    futureGames: future.map((e) => e.game),
    pastGames: past.map((e) => e.game),
  };
}

