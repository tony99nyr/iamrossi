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
  timestamp?: string;    // ISO 8601 timestamp when exercise was added
}

export interface RehabEntry {
  id: string;
  date: string;
  exercises: ExerciseEntry[];
  isRestDay: boolean;
  vitaminsTaken: boolean;
  proteinShake: boolean;
  notes?: string;
}

export interface Vitamin {
  name: string;
  dosage: string;
  frequency: string;
  notes?: string;
}

export interface ProteinShakeIngredient {
  name: string;
  amount: string;
  calories?: number;
  protein?: number; // grams
  carbs?: number;   // grams
  fat?: number;     // grams
  notes?: string;   // key ingredients like "Creatine 5g"
}

export interface RehabSettings {
  vitamins: Vitamin[];
  proteinShake: {
    ingredients: ProteinShakeIngredient[];
    servingSize: string;
  };
}

// ============================================================================
// Oura Integration Types
// ============================================================================

export interface OuraScores {
  date: string;
  sleepScore?: number;        // 0-100
  readinessScore?: number;    // 0-100
  activityScore?: number;     // 0-100
  lastSynced?: string;        // ISO timestamp
}

export interface OuraTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;          // Unix timestamp
}

// ============================================================================
// Google Fit Integration Types
// ============================================================================

export interface GoogleFitHeartRate {
  date: string;
  avgBpm?: number;
  maxBpm?: number;
  sampleCount?: number;
  lastSynced?: string;
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

export interface Player {
  id: string;
  jerseyNumber: string;
  name: string;
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

export interface MHRSearchResult {
  kind: string;
  name: string;
  nbr: string;
  url: string;
}

export interface MHRScheduleGame {
  opponent_name?: string;
  opponent_logo?: string;
  opponent_record?: string;
  opponent_rating?: string;
  opponent_team_id?: string;
  [key: string]: unknown; // Allow other fields from MHR API
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
export interface GameEvent {
  id: string;
  type: 'goal' | 'note' | 'system' | 'shot' | 'faceoff' | 'chance';
  team?: 'us' | 'them';
  playerId?: string; // For 'us' goals
  playerName?: string; // For 'us' goals
  note?: string;
  timestamp: number; // Unix timestamp
  period?: string; // e.g., "1", "2", "3", "OT"
  gameTime?: string; // e.g., "12:34"
  assist1Id?: string;
  assist1Name?: string;
  assist2Id?: string;
  assist2Name?: string;
}

export interface TeamStats {
  shots: number;
  faceoffWins: number;
  faceoffLosses: number;
  faceoffTies: number;
  chances: number; // Scoring chances
  goals: number;
}

export interface StatSession {
  id: string;
  date: string; // ISO string
  opponent: string;
  recorderName: string;

  currentPeriod?: string; // "1", "2", "3", "OT"
  ourTeamName?: string; // Optional for backward compatibility
  usStats: TeamStats;
  themStats: TeamStats;
  events: GameEvent[];
  isCustomGame: boolean;
  gameId?: string; // If linked to a scheduled game
  location?: string;
  startTime: number;
  endTime?: number;
  // Additional game information from schedule (when linked to a scheduled game)
  scheduledGameDate?: string; // Scheduled game date (ISO string)
  scheduledGameTime?: string; // Scheduled game time
  homeTeamName?: string; // Home team name from schedule
  visitorTeamName?: string; // Visitor team name from schedule
  gameType?: string; // Game type (e.g., "Regular Season", "Playoff", etc.)
}

// ============================================================================
// Pokemon Price Index Types
// ============================================================================

export type PokemonPriceSource = 'pricecharting';

export type PokemonConditionType = 'ungraded' | 'psa10' | 'both';

export interface PokemonCardConfig {
  id: string; // External ID (e.g., PriceCharting product ID)
  name: string;
  conditionType: PokemonConditionType;
  weight: number;
  source: PokemonPriceSource;
}

export interface PokemonIndexSettings {
  cards: PokemonCardConfig[];
  refreshIntervalHours: number;
}

export interface PokemonCardPriceSnapshot {
  cardId: string;
  date: string; // YYYY-MM-DD
  ungradedPrice?: number;
  psa10Price?: number;
  source: PokemonPriceSource;
  currency: 'USD';
  ignored?: boolean; // True if this snapshot contains anomalous prices that should be ignored from calculations
}

export interface PokemonIndexPoint {
  date: string; // YYYY-MM-DD
  indexValue: number;
  ma7?: number; // 7-day moving average (short-term momentum)
  ma30?: number; // 30-day moving average
  ma120?: number; // 120-day moving average (long-term trend)
  macd?: number; // MACD line (12-day EMA - 26-day EMA)
  macdSignal?: number; // MACD signal line (9-day EMA of MACD)
  macdHistogram?: number; // MACD histogram (MACD - Signal)
  roc7?: number; // Rate of Change over 7 days (percentage)
  roc30?: number; // Rate of Change over 30 days (percentage)
}

// ============================================================================
// ETH Trading Bot Types
// ============================================================================

export interface PriceCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorConfig {
  type: 'sma' | 'ema' | 'macd' | 'rsi' | 'bollinger';
  weight: number; // 0-1, sum should be ~1.0
  params: Record<string, number>; // e.g., { period: 20 }
}

export interface TradingConfig {
  name?: string; // Optional strategy name
  description?: string; // Optional strategy description
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  indicators: IndicatorConfig[];
  buyThreshold: number;
  sellThreshold: number;
  maxPositionPct: number;
  initialCapital: number;
}

export interface TradingSignal {
  timestamp: number;
  signal: number; // -1 to +1
  confidence: number; // 0 to 1
  indicators: Record<string, number>;
  action: 'buy' | 'sell' | 'hold';
}

export interface Trade {
  id: string;
  timestamp: number;
  type: 'buy' | 'sell';
  ethPrice: number;
  ethAmount: number;
  usdcAmount: number;
  signal: number;
  confidence: number;
  portfolioValue: number; // Total value after trade
}

export interface Portfolio {
  usdcBalance: number;
  ethBalance: number;
  totalValue: number; // in USDC
  initialCapital: number;
  totalReturn: number; // percentage
  tradeCount: number;
  winCount: number;
}

export interface PortfolioSnapshot {
  timestamp: number;
  usdcBalance: number;
  ethBalance: number;
  totalValue: number;
  ethPrice: number;
}

export interface StrategyResults {
  initialCapital: number;
  finalValue: number;
  totalReturn: number; // Percentage
  totalReturnUsd: number; // Absolute USD
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number; // Percentage
  avgWin: number;
  avgLoss: number;
  profitFactor: number; // Total wins / total losses
  largestWin: number;
  largestLoss: number;
}

export interface RiskMetrics {
  sharpeRatio: number; // Risk-adjusted return
  maxDrawdown: number; // Maximum peak-to-trough decline (percentage)
  maxDrawdownDuration: number; // Days in max drawdown
  volatility: number; // Standard deviation of returns
  calmarRatio: number; // Return / max drawdown
  sortinoRatio: number; // Downside risk-adjusted return
  winLossRatio: number; // Avg win / avg loss
  expectancy: number; // Expected value per trade
}

export interface StrategyRun {
  id: string;
  name?: string; // Optional user-friendly name
  type: 'backtest' | 'paper';
  createdAt: number; // Timestamp
  startDate?: string; // For backtests
  endDate?: string; // For backtests
  
  // Parameters used in this run
  config: TradingConfig;
  
  // Results
  results: StrategyResults;
  
  // Risk metrics
  riskMetrics: RiskMetrics;
  
  // Trade history (optional, can be stored separately for large runs)
  tradeIds?: string[]; // References to trades stored separately
}

