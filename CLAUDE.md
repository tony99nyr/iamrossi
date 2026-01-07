# CLAUDE.md

## Repository Overview
- **Project**: `iamrossi` - A Next.js personal dashboard and utility site for tracking hockey schedules, rehabilitation exercises, and other personal tools.
- **Tech Stack**:
    - **Framework**: Next.js 16 (App Router)
    - **Runtime**: React 19
    - **Language**: TypeScript (strict mode)
    - **Styling**: Panda CSS (Atomic CSS-in-JS). *Do not use CSS Modules or inline styles unless absolutely necessary.*
    - **Data Storage**: Redis (Vercel KV) for persistent data
    - **Browser Automation**: Playwright (Chromium) for web scraping
    - **Package Manager**: pnpm
- **Key Directories**:
    - `src/app`: App Router pages, layouts, and API routes
    - `src/components`: Reusable UI components
    - `src/lib`: Core business logic and utilities
    - `src/types`: Shared TypeScript type definitions
    - `src/app/tools`: Feature-specific tools (see below)
    - `styled-system`: Panda CSS generated files (auto-generated, not committed)

## Operational Constraints (CRITICAL)
- **Environment**: WSL2 (Ubuntu) on Windows.
- **Browser**: **NO INTEGRATED BROWSER**. The user cannot open a browser window from this environment.
- **Browser Automation**: Agents **MUST** use Playwright for any task requiring a browser (navigating, scraping, taking screenshots).
    - **Do not** ask the user to open a browser.
    - **Do not** try to use the `open_browser` tool if it relies on a system GUI browser.
    - **Use** `playwright` MCP tools or scripts.

## Build & Run Commands
- **Dev Server**: `pnpm dev` (Runs on localhost:3000)
- **Build**: `pnpm build`
- **Validate**: `pnpm validate` ⚠️ **Run this before completing any task** - Runs type check, tests, lint, and build
- **Test**: `pnpm test` (Run all tests)
- **Test Watch**: `pnpm test:watch` (Run tests in watch mode)
- **Test Coverage**: `pnpm test:coverage` (Generate coverage report)
- **Panda CSS**: `pnpm panda:codegen` (Run this if styles are missing or not updating)
- **Lint**: `pnpm lint`
- **Type Check**: `pnpm type:check` (Validate TypeScript without building)

## Tools Deep Dive

### 1. Next Game (`/tools/next-game`)
Displays the upcoming hockey schedule and past game results.
- **Data Source**: `src/data/schedule.json` and `src/data/mhr-schedule.json`.
- **Sync Mechanism**:
    - Checks for stale data (> 1 hour).
    - Triggers API `/api/admin/sync-schedule`.
    - Scrapes MyHockeyRankings (MHR) using Puppeteer/Cheerio (see `scrape_mhr.js` / `scrape_puppeteer.js`).
- **Key Components**:
    - `NextGameClient.tsx`: Main UI. Handles "Next Game", "Next Home Game", and full schedule list.
    - `GameCard.tsx`: Displays individual game details (opponent, time, location).
- **Features**:
    - Highlights "Home" and "Local" games.
    - Links to YouTube channel.
    - Clickable past games (intended to link to MHR game previews).

### 2. Knee Rehab (`/tools/knee-rehab`)
*Comprehensive tracking tool for knee rehabilitation exercises and daily wellness.*
- **Features**:
  - Exercise tracking (reps, sets, weight, time, pain/difficulty levels)
  - Daily entries with rest day marking
  - Vitamins and protein shake tracking
  - Notes and observations
  - Integration with Oura Ring scores (sleep, readiness, activity)
  - Integration with Google Fit heart rate data (avg/max BPM)
  - Weekly calendar view with exercise history
- **Data Storage**: Redis (`rehab:exercises`, `rehab:entries`, `rehab:settings`)
- **Authentication**: PIN-based with rate limiting (30-day session cookie)
- **Key Components**:
  - `KneeRehabClient.tsx`: Main client component with state management
  - `WeeklyCalendar.tsx`: Week view with day cards
  - `DayView.tsx`: Detailed day view with exercise list
  - `DayCard.tsx`: Compact day card for calendar view
  - `ExerciseCard.tsx`: Individual exercise display/editing

### 3. Stat Recording (`/tools/stat-recording`)
*Tool for recording hockey player statistics.*
- **Usage**: Likely used during games to track shots, goals, assists, etc.

## Architecture & Data Flow

### Data Storage Strategy
All persistent data is stored in Redis (Vercel KV):
- **Rehab Tool**: `rehab:exercises`, `rehab:entries`, `rehab:settings`
- **Admin Settings**: `admin:settings`
- **Schedule Data**: `admin:schedule` and `admin:mhr-schedule`
- **Oura Integration**: Cached scores in `oura:scores:{date}`
- **Google Fit Integration**: Cached heart rate data in `google-fit:heart-rate:{date}`

**Type Definitions**: Shared types are centralized in `src/types/index.ts` and imported throughout the application.

### Authentication & Security
1. **Admin Routes** (`/admin`, `/api/admin/*`):
   - Protected by `ADMIN_SECRET` environment variable
   - Authentication via `/api/admin/verify` endpoint
   - Token stored in sessionStorage and sent as `Authorization: Bearer {token}` header
   - All admin API routes verify token using `verifyAdminAuth()` from `src/lib/auth.ts`

2. **Rehab Tool** (`/tools/knee-rehab`):
   - Protected by `WORKOUT_ADMIN_PIN` environment variable
   - PIN verification via `/api/rehab/verify-pin` (rate-limited: 3 attempts, 5-minute cooldown)
   - Session cookie stored for 30 days
   - Write operations require authentication, read operations are public

3. **Health Data APIs** (`/api/oura/*`, `/api/google-fit/*`):
   - Protected by `verifyAuthToken()` from `src/lib/auth.ts`
   - All endpoints require authentication (including read operations)
   - Sensitive health data (heart rate, sleep scores) must be protected

### Error Handling
- **Error Boundaries**: Implemented at root (`/app/error.tsx`) and tools level (`/app/tools/error.tsx`)
- **Redis Connection**: Includes retry logic (3 attempts with exponential backoff) in `src/lib/kv.ts`
- **API Routes**: Consistent error response format with appropriate HTTP status codes

### Scraping Architecture
- **Technology**: Playwright (Chromium) - `puppeteer` has been removed
- **Implementation**: `src/lib/mhr-service.ts`
- **Strategy**:
  1. Token extraction via request interception
  2. API calls to MyHockeyRankings
  3. Fallback to page scraping if API fails
  4. Results cached in Redis

### Health Data Integrations

#### Oura Ring Integration
- **Service**: `src/lib/oura-service.ts`
- **API**: Oura Ring API v2 (Personal Access Token)
- **Endpoints**: `/api/oura/scores`, `/api/oura/status`
- **Data**: Sleep, Readiness, and Activity scores
- **Caching**: Daily scores cached in Redis (24 hours for past days, 15 minutes for today)
- **Authentication**: Required for all endpoints

#### Google Fit Integration
- **Service**: `src/lib/google-fit-service.ts`
- **API**: Google Fit API v1 (OAuth2 refresh token)
- **Endpoints**: `/api/google-fit/heart-rate`, `/api/google-fit/status`
- **Data**: Heart rate (avg/max BPM) from workout sessions
- **Caching**: Daily heart rate data cached in Redis (24 hours for past days, 15 minutes for today)
- **Authentication**: Required for all endpoints
- **Credentials**: Uses same OAuth2 credentials as Google Drive (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`)

##### Google Fit Token Expiration
**Important**: If your Google OAuth app is in "Testing" mode, refresh tokens expire after **7 days**. To get longer-lasting refresh tokens (valid until revoked, not used for 6 months, or password changed), you must publish your app to "Production" status.

**Steps to Publish Your App to Production:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Ensure all required fields are filled:
   - App name
   - User support email
   - Developer contact information
   - Authorized domains (if applicable)
4. If your app uses sensitive scopes (like Google Fit), you may need to submit for verification
5. Change the publishing status from **"Testing"** to **"In production"**
6. After publishing, generate a new refresh token using `pnpm run exchange-google-fit-token` (old tokens will still expire)

**Note**: Production refresh tokens last much longer but can still be revoked if:
- The user revokes access
- The token is not used for 6 months
- The user changes their password

## Environment Variables
Required environment variables (see `.env.example`):
- `ADMIN_SECRET`: Admin dashboard authentication token
- `WORKOUT_ADMIN_PIN`: Rehab tool PIN code
- `REDIS_URL`: Redis connection string
- `HOCKEY_CALENDAR_SECRET_ADDRESS`: Google Calendar iCal URL
- `OURA_PAT`: (Optional) Oura Ring API Personal Access Token
- `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` / `GOOGLE_DRIVE_REFRESH_TOKEN`: (Optional) Google Fit API credentials (shared with Google Drive)

## Maintenance & Best Practices

### Code Quality
- **Validation**: Always run `pnpm validate` before completing tasks to catch type errors, test failures, linting issues, and build problems
- **Console Logs**: There are console.log statements throughout the codebase. Most are in API routes for debugging. Consider:
  - Removing debug logs before production deployment
  - Using a proper logging library (e.g., Winston, Pino) for structured logging
  - Keeping only essential error logs
  - **Important**: Error logs should include detailed information server-side, but return generic messages to clients

- **Image Optimization**: Some components use `<img>` tags instead of `next/image`:
  - `GameCard.tsx`: Team logos should use `next/image` for optimization
  - Consider implementing blur placeholders for better UX

- **Bundle Size**: Large dependencies like Framer Motion (~60KB) used sparingly. Consider:
  - Code splitting for animation-heavy components
  - Lazy loading for tools that aren't immediately visible

### Known Limitations
1. **Serverless Compatibility**: Fully compatible with Vercel/serverless after removing file system dependencies

2. **Rate Limiting** ⚠️:
   - **Current Implementation**: In-memory rate limiting for PIN verification (`/api/rehab/verify-pin`)
   - **Limitations**:
     - Rate limit counters reset on server restart/redeployment
     - Not distributed - each serverless instance maintains its own counter
     - In multi-region deployments, rate limits are per-region, not global
   - **Current Settings**: 3 failed attempts trigger 5-minute cooldown per IP address
   - **Production Recommendations**:
     - For high-security requirements: Migrate to Redis-based rate limiting
     - For distributed deployments: Use Vercel Edge Config or Upstash Rate Limiting
     - Consider implementing account lockout after repeated violations
   - **Implementation**: See `src/app/api/rehab/verify-pin/route.ts:4-64`

3. **Session Management**: SessionStorage-based auth for admin (client-side only)
4. **Data Migration**: JSON files in `src/data/` should be removed after confirming Redis migration is complete

### Performance Considerations
- **Schedule Data**: Full schedule loaded on page load. Consider pagination if schedule grows > 100 games
- **Video Matching**: Runs client-side on every render. Consider memoization or server-side matching
- **Scraping**: MyHockeyRankings scraping can be slow (30s timeout). Consider background jobs for large syncs

## Agent Guidelines
1.  **Styling**: Always use Panda CSS (`css({})`, `cx()`, `stack()`, etc.). Import from `@styled-system/css` or `@styled-system/patterns`.
2.  **Filesystem**: Always use absolute paths. Never use relative paths.
3.  **Refactoring**: When modifying components, ensure classnames are deterministic and readable.
4.  **Scraping**: Use Playwright (not Puppeteer). Reference `src/lib/mhr-service.ts` for examples.
5.  **Types**: Import shared types from `@/types` instead of defining locally. Never duplicate type definitions.
6.  **Security**:
    - Never hardcode secrets or credentials
    - Use environment variables for all sensitive data
    - Use `src/lib/auth.ts` utilities for authentication
    - Always verify authentication on admin API routes
7.  **Error Handling**:
    - Wrap async operations in try-catch blocks
    - Return appropriate HTTP status codes (401, 403, 500, etc.)
    - Use error boundaries for client-side errors
8.  **Redis**:
    - Always use functions from `src/lib/kv.ts` (they handle connection automatically)
    - Don't directly access the Redis client
    - Connection includes automatic retry logic (3 attempts)
9.  **API Routes**:
    - Use `NextRequest` and `NextResponse` from `next/server`
    - Validate request bodies before processing
    - Return consistent error response format: `{ error: string }`
10. **Testing**:
    - **CRITICAL**: Run `pnpm validate` before declaring any task complete
    - Run `pnpm test` before committing changes
    - Add tests for new authentication mechanisms
    - Add tests for new API routes (REQUIRED - test auth, validation, error handling, success cases)
    - Add tests for data transformation logic
    - Tests use Vitest with mocked Redis (no actual Redis connection needed)
    - All tests use in-memory mocks or localhost Redis - never touch production data
    - Integration tests validate critical user flows
11. **Security**:
    - **ALL API endpoints handling sensitive data MUST require authentication** (including read operations)
    - Use `verifyAuthToken()` for protected endpoints
    - Validate all input using Zod schemas (see `src/lib/validation.ts`)
    - Return generic error messages to clients (log details server-side only)
    - Validate date parameters (format, calendar validity, prevent future dates where appropriate)
12. **Development Workflow**:
    - **ALWAYS run `pnpm validate` before completing tasks**
    - Ensure tests pass before committing
    - Run in WSL2 environment without GUI browser access
    - Use Playwright for browser automation needs
