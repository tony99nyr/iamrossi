# API Tests

## Test Safety Guarantees

All API tests are designed to **never touch production data**. Here's how safety is ensured:

### 1. **Redis Safety**
- Tests use **in-memory Redis mock** (`tests/mocks/redis.mock.ts`)
- The mock is automatically applied via `tests/setup.ts`
- Even if mocks fail, `src/lib/kv.ts` automatically uses `TEST_REDIS_URL` when `NODE_ENV === 'test'`
- `tests/setup.ts` enforces `TEST_REDIS_URL = 'redis://localhost:6379'`
- Production `REDIS_URL` is never used in test environment

### 2. **External API Safety**
- Google Fit API calls are **fully mocked** in tests
- No real HTTP requests are made to external services
- All external dependencies are mocked using Vitest's `vi.mock()`

### 3. **Environment Isolation**
- `vitest.config.ts` sets `NODE_ENV: 'test'`
- Test environment variables are isolated from production
- Each test cleans up after itself with `beforeEach` hooks

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/api/google-fit.test.ts

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

## Test Coverage

### Google Fit API Tests (`tests/api/google-fit.test.ts`)
- ✅ Authentication (cookie and Bearer token)
- ✅ Date validation (format, calendar validity, future dates)
- ✅ Error handling (service errors, configuration errors)
- ✅ Success cases (with and without data)
- ✅ Edge cases (today's date, empty data)

**Total: 15 tests, all passing**

## Adding New Tests

When adding tests for new API endpoints:

1. **Mock external dependencies** - Use `vi.mock()` for services, APIs, etc.
2. **Use Redis mock** - Import and use `resetMockStore()` from `tests/mocks/redis.mock`
3. **Set test environment variables** - In `beforeEach`, set required env vars
4. **Test authentication** - Always test both authenticated and unauthenticated cases
5. **Test validation** - Test input validation and error cases
6. **Test error handling** - Ensure errors are handled gracefully

Example:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMockStore } from '../mocks/redis.mock';

// Mock external dependencies
vi.mock('@/lib/some-service', () => ({
  someFunction: vi.fn(),
}));

describe('/api/new-endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockStore();
    // Set test env vars
    process.env.SOME_VAR = 'test-value';
  });

  it('should require authentication', async () => {
    // Test unauthenticated request
  });

  it('should work with authentication', async () => {
    // Test authenticated request
  });
});
```

