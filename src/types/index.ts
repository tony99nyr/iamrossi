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

export interface ExerciseEntry {
  id: string;
  timeElapsed?: string;  // e.g., "45 min", "1:30:00"
  weight?: string;       // e.g., "135lb", "30lb"
  reps?: number;         // e.g., 12
  sets?: number;         // e.g., 4
  painLevel?: number | null;    // 0-10 scale
  difficultyLevel?: number | null; // 1-10 scale
  bfr?: boolean;
}

export interface RehabEntry {
  id: string;
  date: string;
  exercises: ExerciseEntry[];
  isRestDay: boolean;
  vitaminsTaken: boolean;
  proteinShake: boolean;
}

export interface Vitamin {
  name: string;
  dosage: string;
  frequency: string;
}

export interface ProteinShakeIngredient {
  name: string;
  amount: string;
}

export interface RehabSettings {
  vitamins: Vitamin[];
  proteinShake: {
    ingredients: ProteinShakeIngredient[];
    servingSize: string;
  };
}

// ============================================================================
// Admin/Settings Types
// ============================================================================

export interface Settings {
  teamName: string;
  identifiers: string[];
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
  // Placeholder metadata for tournaments, showcases, and TBD events
  isPlaceholder?: boolean;
  placeholderStartDate?: string; // ISO date string
  placeholderEndDate?: string; // ISO date string
  placeholderStartDatePretty?: string; // Human-readable start date
  placeholderEndDatePretty?: string; // Human-readable end date
  placeholderLabel?: string; // Display label (e.g., "Tier 1 Elite Tournament")
  placeholderDescription?: string; // Description or reason for placeholder
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

// ============================================================================
// Observability Types
// ============================================================================

export interface ConnectionDetails {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export interface WebVitalSample {
  id: string;
  name: string;
  label: 'web-vital' | 'custom';
  value: number;
  delta: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType?: 'navigate' | 'reload' | 'back-forward' | 'prerender';
  pathname: string;
  timestamp: number;
  connection?: ConnectionDetails;
}
