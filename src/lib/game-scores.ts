import type { Game } from '@/types';

export interface NormalizedGameScore {
  homeScore?: number;
  visitorScore?: number;
}

function isFiniteScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Normalize score fields across the different shapes we store:
 * - schedule/transform: home_team_score / visitor_team_score
 * - legacy MHR: game_home_score / game_visitor_score
 */
export function getNormalizedGameScore(game: Game): NormalizedGameScore {
  const legacy = game as Game & { game_home_score?: unknown; game_visitor_score?: unknown };

  const home = game.home_team_score ?? (legacy.game_home_score as number | undefined);
  const visitor = game.visitor_team_score ?? (legacy.game_visitor_score as number | undefined);

  return {
    homeScore: isFiniteScore(home) ? home : undefined,
    visitorScore: isFiniteScore(visitor) ? visitor : undefined,
  };
}

/**
 * True only when the game has a real final score we should show in "Past Games".
 * We intentionally treat 0-0 and 999-999 as placeholders (not real finals).
 */
export function hasValidFinalScore(game: Game): boolean {
  const { homeScore, visitorScore } = getNormalizedGameScore(game);
  if (!isFiniteScore(homeScore) || !isFiniteScore(visitorScore)) return false;

  // Reasonable guardrails.
  if (homeScore < 0 || homeScore > 50) return false;
  if (visitorScore < 0 || visitorScore > 50) return false;

  // Placeholder patterns.
  if (homeScore === 999 && visitorScore === 999) return false;
  if (homeScore === 0 && visitorScore === 0) return false;

  return true;
}

