## ⚠️ IMPORTANT: Validation Before Completion

**ALWAYS run `pnpm validate` before declaring any task complete.** This command runs:
- Type checking (`pnpm type:check`)
- Tests (`pnpm test`)
- Linting (`pnpm lint`)
- Build verification (`pnpm build`)

This ensures code quality, catches errors early, and prevents breaking changes from being committed.

---

## TypeScript
- Only create an abstraction if it's actually needed
- Prefer clear function/variable names over inline comments
- Avoid helper functions when a simple inline expression would suffice
- Use `knip` to remove unused code if making large changes
- The `gh` CLI is installed, use it
- Don't unnecessarily add `try`/`catch` - but DO use it for async operations, network requests, and Redis operations
- Don't cast to `any` - use proper types from `@/types` or define new ones there
- **Import shared types from `@/types/index.ts`** - never duplicate type definitions across files
- Use strict TypeScript mode (already enabled) - no implicit any, strict null checks, etc.
- **After making TypeScript changes, run `pnpm validate` to catch type errors**

## React
- Avoid massive JSX blocks and compose smaller components
- Colocate code that changes together
- Avoid `useEffect` unless absolutely needed - prefer server components for data fetching
- Client components (`'use client'`) only when needed for:
  - User interactions (onClick, onChange, etc.)
  - Browser APIs (sessionStorage, localStorage)
  - React hooks (useState, useEffect, etc.)
- Memoize expensive calculations with `useMemo` only when necessary (don't over-optimize)

## Panda CSS
- If 6 or less styles in a `css()` block do it inline rather than extracting the `css()` block into a variable
- Ensure all classNames and css rules are static and deterministic
- Use tokens from `panda.config.ts` for colors, spacing, animations
- Prefer Panda patterns (`stack()`, `flex()`, etc.) for common layouts
- Never use CSS Modules or inline styles - Panda CSS only
- Use descriptive string class names that document the element's purpose i.e. `<div className={cx('page-container', pageContainerStyles}>`

## Next.js
- Prefer fetching data in RSC (page can still be static)
- Use `next/font` for font optimization (already configured)
- Use `next/image` for ALL images (not `<img>` tags):
  - Above the fold: use `priority` prop
  - Hero images: consider `eager` loading
  - Lazy load images below the fold (default behavior)
- Be mindful of serialized prop size for RSC → client components
- API Routes:
  - Always validate request bodies using Zod schemas
  - Return consistent error format: `{ error: string }`
  - Use appropriate HTTP status codes (400, 401, 403, 404, 500, etc.)
  - Verify authentication on protected routes (including sensitive read operations)
  - Validate query parameters (dates, IDs, etc.)
  - **After creating/modifying API routes, run `pnpm validate` to ensure everything works**

## Data Persistence & Redis
- **Infrastructure**: Single Redis instance (Vercel KV).
- **Abstraction Layer**: All database interactions MUST go through `src/lib/kv.ts`.
  - **Never** directly access the Redis client in components or API routes.
  - **Never** hardcode Redis keys. Use `KV_KEYS` constant in `src/lib/kv.ts`.
  - Connection handling is automatic (includes retry logic).
- **Common Redis Keys** (for reference):
  - `rehab:exercises`, `rehab:entries`, `rehab:settings` - Rehab tool data
  - `oura:scores:{date}` - Cached Oura Ring scores
  - `google-fit:heart-rate:{date}` - Cached Google Fit heart rate data
  - `admin:settings`, `admin:schedule`, `admin:mhr-schedule` - Admin data
- **Adding New Data**:
  1. Define the data type in `@/types`.
  2. Add a new key to `KV_KEYS` in `src/lib/kv.ts`.
  3. Create strongly-typed `get` and `set` functions in `src/lib/kv.ts` (e.g., `getNewFeature`, `setNewFeature`).
- **Testing Safety (CRITICAL)**:
  - Tests **MUST** use `localhost` or mocks to avoid overwriting production data.
  - `src/lib/kv.ts` automatically switches to `TEST_REDIS_URL` when `NODE_ENV === 'test'`.
  - `tests/setup.ts` enforces `TEST_REDIS_URL = 'redis://localhost:6379'`.
  - Most unit tests use the in-memory mock (`tests/mocks/redis.mock.ts`).
- **Type Safety**:
  - All Redis data must be JSON serializable.
  - Validate data structure when reading from Redis (use Zod schemas where possible).
  - Use TypeScript generics for type-safe Redis operations.
- **Utility Scripts**:
  - Use `pnpm redis` to interact with the database from the CLI.
  - Commands:
    - `pnpm redis list [pattern]` - List keys
    - `pnpm redis get <key>` - Get value (pretty prints JSON)
    - `pnpm redis del <key>` - Delete key
    - `pnpm redis flush-test` - Clear localhost DB (safe for dev)
  - Example: `pnpm redis get rehab:exercises`
  - **Note**: The script automatically loads environment variables from `.env.local`. Ensure `REDIS_URL` is set there for remote connections, or it defaults to `localhost:6379`.

## Security
- **Never hardcode secrets** - use environment variables
- **Authentication**:
  - Admin routes: Use `verifyAdminAuth()` from `src/lib/auth.ts`
  - Rehab tool: Use PIN verification with rate limiting
  - **ALL API endpoints that handle sensitive data MUST require authentication** (including read operations for health data, personal info, etc.)
  - Use `verifyAuthToken()` from `src/lib/auth.ts` for protected endpoints
  - Always check auth on write operations AND sensitive read operations
- **Rate Limiting**: Already implemented for PIN verification (in-memory)
- **Input Validation**:
  - Always validate and sanitize user input before processing
  - Use Zod schemas for request body validation (see `src/lib/validation.ts`)
  - For date parameters: validate format, calendar validity, and prevent future dates where appropriate
  - Validate all query parameters and request bodies
- **Error Handling**:
  - Return generic error messages to clients (don't expose internal implementation details)
  - Log detailed errors server-side only using `console.error()`
  - Use appropriate HTTP status codes (400 for validation errors, 401 for auth, 500 for server errors)
- **API Endpoint Security Checklist**:
  - ✅ Authentication required for sensitive data (read and write)
  - ✅ Input validation on all parameters
  - ✅ Generic error messages (no internal details leaked)
  - ✅ Proper HTTP status codes
  - ✅ Rate limiting where appropriate

## Performance
- Use `async`/`await` consistently (no mixing with Promise chains)
- Avoid large client bundles:
  - Lazy load heavy dependencies
  - Code split large components
  - Use dynamic imports when appropriate
- Optimize images with `next/image`
- Consider memoization for expensive client-side calculations

## Error Handling
- **API Routes**: Always wrap in try-catch and return proper error responses
  - Return generic error messages to clients: `{ error: 'User-friendly message' }`
  - Log detailed errors server-side: `console.error('Error details:', errorMessage)`
  - Never expose stack traces, internal paths, or implementation details to clients
- **Client Components**: Use error boundaries (already implemented)
- **Redis**: Retry logic is built-in (3 attempts)
- **Scraping**: Handle timeouts and failures gracefully
- Log errors with context (what failed, why, relevant data)

## Testing
- **CRITICAL: Run `pnpm validate` before declaring any task complete**. This script runs `pnpm type:check`, `pnpm test`, `pnpm lint`, and `pnpm build` to ensure code quality and catch issues early.
- **Always run `pnpm validate` after making changes** - don't skip this step!
- **Run tests before committing**: `pnpm test`
- **Watch mode during development**: `pnpm test:watch`
- **Coverage reports**: `pnpm test:coverage` (target: 85%+ for critical paths)
- Test in WSL2 environment (no GUI browser)
- Use Playwright for browser automation (not Puppeteer)
- Ensure serverless compatibility (no file system dependencies)
- Test error states and edge cases
- **Test Safety**: All tests use in-memory mocks or localhost Redis - never touch production data (see `tests/setup.ts` and `tests/mocks/redis.mock.ts`)

### When to Add Tests
- **Adding new API routes** (REQUIRED) - Test authentication, validation, error handling, and success cases
- Adding new authentication mechanisms
- Adding data transformation logic
- Adding critical business logic
- Fixing bugs (add regression test)
- **New API endpoints must include tests for**:
  - Authentication (both authenticated and unauthenticated cases)
  - Input validation (valid and invalid inputs)
  - Error handling (service errors, validation errors)
  - Success cases (with and without data)
  - Edge cases (boundary conditions, empty data, etc.)

### Testing Stack
- **Framework**: Vitest (fast, modern, TypeScript-first)
- **Mocking**: Redis mock (`tests/mocks/redis.mock.ts`)
- **Coverage**: V8 provider
- **UI**: Vitest UI available (`pnpm test:ui`)

### Test Structure
```
tests/
├── lib/              # Unit tests for utilities
├── api/              # API route tests
├── integration/      # End-to-end flow tests
└── mocks/            # Shared mocks
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
Use 'bd' for task tracking
