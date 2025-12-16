import type { Game, Settings } from '@/types';

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

export function isUsTeamName(
  name: string | undefined,
  settings?: Pick<Settings, 'teamName' | 'identifiers'>
): boolean {
  if (!name) return false;
  const lower = normalizeTeamName(name);

  const teamName = settings?.teamName?.trim();
  if (teamName && lower.includes(normalizeTeamName(teamName))) return true;

  const identifiers = settings?.identifiers;
  if (Array.isArray(identifiers)) {
    for (const id of identifiers) {
      if (typeof id !== 'string') continue;
      const needle = id.trim();
      if (!needle) continue;
      if (lower.includes(needle.toLowerCase())) return true;
    }
  }

  return false;
}

export function resolveOpponentFromScheduledGame(
  game: Pick<Game, 'home_team_name' | 'visitor_team_name'>,
  settings?: Pick<Settings, 'teamName' | 'identifiers'>
): string | null {
  const home = game.home_team_name?.trim() || '';
  const visitor = game.visitor_team_name?.trim() || '';

  const usHome = isUsTeamName(home, settings);
  const usVisitor = isUsTeamName(visitor, settings);

  if (usHome && !usVisitor) return visitor || null;
  if (usVisitor && !usHome) return home || null;

  // Ambiguous (or unknown) - pick a stable fallback, but avoid returning "us" if we can.
  const teamName = settings?.teamName?.trim();
  if (teamName) {
    if (visitor && !normalizeTeamName(visitor).includes(normalizeTeamName(teamName))) return visitor;
    if (home && !normalizeTeamName(home).includes(normalizeTeamName(teamName))) return home;
  }

  return visitor || home || null;
}

