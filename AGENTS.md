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
- If 6 or less styles in a css() block do it inline rather than extracting
- Ensure all classNames and css rules are static and deterministic
- Use tokens from `panda.config.ts` for colors, spacing, animations
- Prefer Panda patterns (`stack()`, `flex()`, etc.) for common layouts
- Never use CSS Modules or inline styles - Panda CSS only
- Use descriptive class names that document the element's purpose

## Next.js
- Prefer fetching data in RSC (page can still be static)
- Use `next/font` for font optimization (already configured)
- Use `next/image` for ALL images (not `<img>` tags):
  - Above the fold: use `priority` prop
  - Hero images: consider `eager` loading
  - Lazy load images below the fold (default behavior)
- Be mindful of serialized prop size for RSC → client components
- API Routes:
  - Always validate request bodies
  - Return consistent error format: `{ error: string }`
  - Use appropriate HTTP status codes
  - Verify authentication on protected routes

## Data Persistence & Redis
- **Infrastructure**: Single Redis instance (Vercel KV).
- **Abstraction Layer**: All database interactions MUST go through `src/lib/kv.ts`.
  - **Never** directly access the Redis client in components or API routes.
  - **Never** hardcode Redis keys. Use `KV_KEYS` constant in `src/lib/kv.ts`.
  - Connection handling is automatic (includes retry logic).
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
  - Always check auth on write operations
- **Rate Limiting**: Already implemented for PIN verification (in-memory)
- **Validation**: Always validate and sanitize user input before processing

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
- **Client Components**: Use error boundaries (already implemented)
- **Redis**: Retry logic is built-in (3 attempts)
- **Scraping**: Handle timeouts and failures gracefully
- Log errors with context (what failed, why, relevant data)

## Testing
- **Run `pnpm validate` before declaring a task complete**. This script runs `pnpm type:check`, `pnpm test`, `pnpm lint`, and `pnpm build` to keep the repo clean.
- **Run tests before committing**: `pnpm test`
- **Watch mode during development**: `pnpm test:watch`
- **Coverage reports**: `pnpm test:coverage` (target: 85%+ for critical paths)
- Test in WSL2 environment (no GUI browser)
- Use Playwright for browser automation (not Puppeteer)
- Ensure serverless compatibility (no file system dependencies)
- Test error states and edge cases

### When to Add Tests
- Adding new authentication mechanisms
- Adding new API routes (especially admin routes)
- Adding data transformation logic
- Adding critical business logic
- Fixing bugs (add regression test)

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

See `TESTING.md` for complete testing documentation.

