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

/**
 * Validates a date string in YYYY-MM-DD format
 * Ensures it's a valid calendar date and not in the future
 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(
    (dateStr) => {
      const date = new Date(dateStr + 'T00:00:00.000Z');
      // Check if date is valid (handles leap years, month boundaries, etc.)
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateCheck = new Date(Date.UTC(year, month - 1, day));
      return (
        dateCheck.getUTCFullYear() === year &&
        dateCheck.getUTCMonth() === month - 1 &&
        dateCheck.getUTCDate() === day &&
        !isNaN(date.getTime())
      );
    },
    { message: 'Invalid calendar date' }
  )
  .refine(
    (dateStr) => {
      const date = new Date(dateStr + 'T00:00:00.000Z');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return date <= today;
    },
    { message: 'Date cannot be in the future' }
  );

/**
 * Validates a date range (startDate < endDate, both valid dates, not future)
 */
export const dateRangeSchema = z
  .object({
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate + 'T00:00:00.000Z');
      const end = new Date(data.endDate + 'T00:00:00.000Z');
      return start <= end;
    },
    {
      message: 'Start date must be before or equal to end date',
      path: ['startDate'],
    }
  );

/**
 * Validates timeframe enum strictly
 */
export const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '4h', '8h', '12h', '1d']);

/**
 * Validates numeric values with bounds
 */
export function boundedNumberSchema(min: number, max: number, message?: string) {
  return z.number().min(min, message || `Value must be at least ${min}`).max(max, message || `Value must be at most ${max}`);
}

/**
 * Validates positive numbers
 */
export const positiveNumberSchema = z.number().positive('Value must be positive');

/**
 * Validates non-negative numbers
 */
export const nonNegativeNumberSchema = z.number().nonnegative('Value must be non-negative');

export const tradingStartSchema = z.object({
  name: z.string().max(100, 'Name must be 100 characters or less').optional(),
  asset: z.enum(['eth', 'btc']).optional().default('eth'), // Asset to trade, defaults to 'eth' for backward compatibility
});

// Asset query parameter schema (for API routes)
export const assetQuerySchema = z.object({
  asset: z.enum(['eth', 'btc']).optional().default('eth'),
});

/**
 * Query parameter schema for candles endpoint
 */
export const candlesQuerySchema = z.object({
  symbol: z.string().max(20, 'Symbol must be 20 characters or less').optional().default('ETHUSDT'),
  timeframe: timeframeSchema.optional().default('8h'),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  currentPrice: z.coerce.number().positive().optional(),
  skipAPIFetch: z.coerce.boolean().optional().default(false),
});

/**
 * Query parameter schema for audit endpoint
 */
export const auditQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional(),
  type: z.enum(['buy', 'sell']).optional(),
  outcome: z.enum(['win', 'loss', 'breakeven', 'pending']).optional(),
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
  weight: boundedNumberSchema(0, 1, 'Weight must be between 0 and 1'),
  params: z.record(z.string(), z.number().finite('Parameter must be a finite number')),
});

export const tradingConfigSchema = z.object({
  name: z.string().max(100, 'Name must be 100 characters or less').optional(),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  timeframe: timeframeSchema,
  indicators: z.array(indicatorConfigSchema).min(1, 'At least one indicator is required').max(20, 'Maximum 20 indicators allowed'),
  buyThreshold: boundedNumberSchema(-1, 1, 'Buy threshold must be between -1 and 1'),
  sellThreshold: boundedNumberSchema(-1, 1, 'Sell threshold must be between -1 and 1'),
  maxPositionPct: boundedNumberSchema(0, 1, 'Max position percentage must be between 0 and 1'),
  initialCapital: positiveNumberSchema.max(1000000000, 'Initial capital must be less than 1 billion'),
});

export const backtestRequestSchema = dateRangeSchema.safeExtend({
  initialCapital: positiveNumberSchema.optional(),
  config: tradingConfigSchema,
  saveRun: z.boolean().optional().default(false),
  runName: z.string().max(100, 'Run name must be 100 characters or less').optional(),
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
