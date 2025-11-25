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
*Simple tracking tool for knee rehabilitation exercises.*
- **Structure**: Likely a client-side form or list to track reps/sets.

### 3. Stat Recording (`/tools/stat-recording`)
*Tool for recording hockey player statistics.*
- **Usage**: Likely used during games to track shots, goals, assists, etc.

## Architecture & Data Flow

### Data Storage Strategy
All persistent data is stored in Redis (Vercel KV):
- **Rehab Tool**: `rehab:exercises` and `rehab:entries`
- **Admin Settings**: `admin:settings`
- **Schedule Data**: `admin:schedule` and `admin:mhr-schedule`

**Type Definitions**: Shared types are centralized in `src/types/index.ts` and imported throughout the application.

### Authentication & Security
1. **Admin Routes** (`/admin`, `/api/admin/*`):
   - Protected by `ADMIN_SECRET` environment variable
   - Authentication via `/api/admin/verify` endpoint
   - Token stored in sessionStorage and sent as `Authorization: Bearer {token}` header
   - All admin API routes verify token using `verifyAdminAuth()` from `src/lib/auth.ts`

2. **Rehab Tool** (`/tools/knee-rehab`):
   - Protected by `WORKOUT_ADMIN_PIN` environment variable
   - PIN verification via `/api/rehab/verify-pin` (rate-limited)
   - Session cookie stored for 30 days
   - Write operations require authentication, read operations are public

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

## Environment Variables
Required environment variables (see `.env.example`):
- `ADMIN_SECRET`: Admin dashboard authentication token
- `WORKOUT_ADMIN_PIN`: Rehab tool PIN code
- `REDIS_URL`: Redis connection string
- `HOCKEY_CALENDAR_SECRET_ADDRESS`: Google Calendar iCal URL
- `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET`: (Optional) Oura Ring API credentials

## Maintenance & Best Practices

### Code Quality
- **Console Logs**: There are ~54 console.log statements throughout the codebase. Most are in API routes for debugging. Consider:
  - Removing debug logs before production deployment
  - Using a proper logging library (e.g., Winston, Pino) for structured logging
  - Keeping only essential error logs

- **Image Optimization**: Some components use `<img>` tags instead of `next/image`:
  - `GameCard.tsx`: Team logos should use `next/image` for optimization
  - Consider implementing blur placeholders for better UX

- **Bundle Size**: Large dependencies like Framer Motion (~60KB) used sparingly. Consider:
  - Code splitting for animation-heavy components
  - Lazy loading for tools that aren't immediately visible

### Known Limitations
1. **Serverless Compatibility**: Fully compatible with Vercel/serverless after removing file system dependencies
2. **Rate Limiting**: Rehab PIN verification uses in-memory rate limiting (resets on server restart)
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
10. **Testing** (see TESTING.md for details):
    - Run `pnpm test` before committing changes
    - Add tests for new authentication mechanisms
    - Add tests for new API routes (especially admin routes)
    - Add tests for data transformation logic
    - Tests use Vitest with mocked Redis (no actual Redis connection needed)
    - Integration tests validate critical user flows
11. **Development Workflow**:
    - Ensure tests pass before committing
    - Run in WSL2 environment without GUI browser access
    - Use Playwright for browser automation needs
