/**
 * Shared type definitions for the iamrossi application
 */

// ============================================================================
// Rehab Tool Types
// ============================================================================

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

// ============================================================================
// Admin/Settings Types
// ============================================================================

export interface Settings {
  teamName: string;
  identifiers: string[];
  teamLogo: string;
  mhrTeamId?: string;
  mhrYear?: string;
  aliases?: Record<string, string>;
}

// ============================================================================
// Schedule/Game Types
// ============================================================================

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow additional properties for flexibility
}

export interface TeamDetails {
  name: string;
  record?: string;
  rating?: string;
  logo?: string;
  mhrTeamId?: string;
}

export interface YouTubeVideo {
  title: string;
  url: string;
  date?: string;
}

// ============================================================================
// MHR Scraping Types
// ============================================================================

export interface MHRTeamSearchResult {
  name: string;
  id: string;
  level: string;
}

export interface MHRGameDetails {
  gameId: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  score?: {
    home: number;
    away: number;
  };
}
