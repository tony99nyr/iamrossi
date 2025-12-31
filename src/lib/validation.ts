/**
 * Centralized request validation schemas using Zod
 * Import these schemas in API routes for runtime validation
 */
import { z } from 'zod';

// ============================================================================
// Auth Schemas
// ============================================================================

export const adminVerifySchema = z.object({
  secret: z.string().min(1, 'Secret is required'),
});

export const pinVerifySchema = z.object({
  pin: z.string().min(1, 'PIN is required'),
});

// ============================================================================
// Trading Schemas
// ============================================================================

export const tradingStartSchema = z.object({
  name: z.string().optional(),
});

// ============================================================================
// Rehab Schemas
// ============================================================================

export const exerciseEntrySchema = z.object({
  id: z.string(),
  timeElapsed: z.string().optional(),
  weight: z.string().optional(),
  reps: z.number().optional(),
  sets: z.number().optional(),
  painLevel: z.number().min(0).max(10).nullable().optional(),
  difficultyLevel: z.number().min(1).max(10).nullable().optional(),
  bfr: z.boolean().optional(),
  timestamp: z.string().optional(),
});

export const rehabEntrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  exercises: z.array(exerciseEntrySchema).default([]),
  isRestDay: z.boolean().default(false),
  vitaminsTaken: z.boolean().default(false),
  proteinShake: z.boolean().default(false),
  notes: z.string().optional(),
});

export const rehabEntryPatchSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  exercises: z.array(exerciseEntrySchema).optional(),
  isRestDay: z.boolean().optional(),
  vitaminsTaken: z.boolean().optional(),
  proteinShake: z.boolean().optional(),
  notes: z.string().optional(),
});

export const exerciseSchema = z.object({
  id: z.string().optional(), // Optional for creation, generated if not provided
  title: z.string().min(1, 'Title is required'),
  description: z.string().default(''),
  createdAt: z.string().optional(), // Generated if not provided
});

export const exerciseUpdateSchema = z.object({
  id: z.string().min(1, 'Exercise ID is required'),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
});

export const exerciseDeleteSchema = z.object({
  id: z.string().min(1, 'Exercise ID is required'),
});

export const vitaminSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  notes: z.string().optional(),
});

export const proteinShakeIngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().min(1),
  calories: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  notes: z.string().optional(),
});

export const rehabSettingsSchema = z.object({
  vitamins: z.array(vitaminSchema),
  proteinShake: z.object({
    ingredients: z.array(proteinShakeIngredientSchema),
    servingSize: z.string(),
  }),
});

// ============================================================================
// Stats Schemas
// ============================================================================

export const gameEventSchema = z.object({
  id: z.string(),
  type: z.enum(['goal', 'note', 'system', 'shot', 'faceoff', 'chance']),
  team: z.enum(['us', 'them']).optional(),
  playerId: z.string().optional(),
  playerName: z.string().optional(),
  note: z.string().optional(),
  timestamp: z.number(),
  period: z.string().optional(),
  gameTime: z.string().optional(),
  assist1Id: z.string().optional(),
  assist1Name: z.string().optional(),
  assist2Id: z.string().optional(),
  assist2Name: z.string().optional(),
});

export const teamStatsSchema = z.object({
  shots: z.number().default(0),
  faceoffWins: z.number().default(0),
  faceoffLosses: z.number().default(0),
  faceoffTies: z.number().default(0),
  chances: z.number().default(0),
  goals: z.number().default(0),
});

export const statSessionSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
  date: z.string().min(1, 'Date is required'),
  opponent: z.string().min(1, 'Opponent is required'),
  recorderName: z.string().min(1, 'Recorder name is required'),
  currentPeriod: z.string().optional(),
  ourTeamName: z.string().optional(),
  usStats: teamStatsSchema,
  themStats: teamStatsSchema,
  events: z.array(gameEventSchema),
  isCustomGame: z.boolean(),
  gameId: z.string().optional(),
  location: z.string().optional(),
  startTime: z.number(),
  endTime: z.number().optional(),
  // Additional game information from schedule
  scheduledGameDate: z.string().optional(),
  scheduledGameTime: z.string().optional(),
  homeTeamName: z.string().optional(),
  visitorTeamName: z.string().optional(),
  gameType: z.string().optional(),
});

export const deleteSessionSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
});

// ============================================================================
// Admin Schemas
// ============================================================================

export const adminSettingsSchema = z.object({
  teamName: z.string().min(1, 'Team name is required'),
  identifiers: z.array(z.string()).min(1, 'At least one identifier is required'),
  mhrTeamId: z.string().optional(),
  mhrYear: z.string().optional(),
  aliases: z.record(z.string(), z.string()).optional(),
});

export const adminFixStatOpponentSchema = z
  .object({
    newOpponent: z.string().min(1, 'New opponent is required'),
    sessionIds: z.array(z.string().min(1)).optional(),
    // YYYY-MM-DD (matches either session.date prefix or startTime ISO prefix)
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    // Additional narrowing (epoch millis)
    startTimeFrom: z.number().int().optional(),
    startTimeTo: z.number().int().optional(),
    onlyIfOpponentIsUs: z.boolean().optional().default(true),
    limit: z.number().int().positive().max(50).optional().default(10),
    dryRun: z.boolean().optional().default(false),
  })
  .refine((data) => (Array.isArray(data.sessionIds) && data.sessionIds.length > 0) || !!data.date, {
    message: 'Provide sessionIds or date',
    path: ['sessionIds'],
  });

export const playerSchema = z.object({
  id: z.string(),
  jerseyNumber: z.string(),
  name: z.string().min(1, 'Player name is required'),
});

export const rosterSchema = z.object({
  players: z.array(playerSchema),
});

// ============================================================================
// Observability Schemas
// ============================================================================

export const connectionDetailsSchema = z.object({
  effectiveType: z.string().optional(),
  downlink: z.number().optional(),
  rtt: z.number().optional(),
});

export const webVitalSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.enum(['web-vital', 'custom']),
  value: z.number(),
  delta: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  navigationType: z.enum(['navigate', 'reload', 'back-forward', 'prerender']).optional(),
  pathname: z.string(),
  timestamp: z.number(),
  connection: connectionDetailsSchema.optional(),
});

// ============================================================================
// Pokemon Price Index Schemas
// ============================================================================

export const pokemonCardConfigSchema = z.object({
  id: z.string().min(1, 'Card ID is required'),
  name: z.string().min(1, 'Card name is required'),
  conditionType: z.enum(['ungraded', 'psa10', 'both']).default('ungraded'),
  weight: z.number().positive().default(1),
  source: z.literal('pricecharting'),
});

export const pokemonIndexSettingsSchema = z.object({
  cards: z.array(pokemonCardConfigSchema).max(20, 'Maximum of 20 cards allowed'),
  refreshIntervalHours: z.number().int().positive().max(48).default(24),
});

// ============================================================================
// ETH Trading Bot Schemas
// ============================================================================

export const indicatorConfigSchema = z.object({
  type: z.enum(['sma', 'ema', 'macd', 'rsi', 'bollinger', 'vwap', 'obv', 'volume_roc', 'vwmacd']),
  weight: z.number().min(0).max(1),
  params: z.record(z.string(), z.number()),
});

export const tradingConfigSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '8h', '12h', '1d']),
  indicators: z.array(indicatorConfigSchema),
  buyThreshold: z.number().min(-1).max(1),
  sellThreshold: z.number().min(-1).max(1),
  maxPositionPct: z.number().min(0).max(1),
  initialCapital: z.number().positive(),
});

export const backtestRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  initialCapital: z.number().positive().optional(),
  config: tradingConfigSchema,
  saveRun: z.boolean().optional().default(false),
  runName: z.string().optional(),
});

export const strategyRunQuerySchema = z.object({
  type: z.enum(['backtest', 'paper']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  sortBy: z.enum(['createdAt', 'totalReturn', 'sharpeRatio', 'calmarRatio']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const strategyCompareSchema = z.object({
  ids: z.string().min(1).transform(s => s.split(',').map(id => id.trim())),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates request body against a schema and returns parsed data
 * @param schema Zod schema to validate against
 * @param data Data to validate
 * @returns Parsed and validated data
 * @throws ZodError if validation fails
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validates request body and returns result with error handling
 * @param schema Zod schema to validate against
 * @param data Data to validate
 * @returns { success: true, data: T } or { success: false, issues: ZodIssue[] }
 */
export function safeValidateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; issues: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: result.error.issues };
}
