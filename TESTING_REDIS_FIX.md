# URGENT: Redis Test Database Fix

## The Problem
Tests were using `flushAll()` on your **production Redis database**, wiping out all your data every time tests ran!

## The Solution
We've separated test and production databases by using Redis's built-in database numbers (0-15).

## What Changed

### 1. Environment Variables (.env.example)
- Added `TEST_REDIS_URL` which uses database 1 (append `/1` to your Redis URL)
- Production uses database 0 (default)

### 2. KV Module (src/lib/kv.ts)
- Now checks for `TEST_REDIS_URL` when `NODE_ENV=test`
- Automatically uses the test database during tests

### 3. Vitest Config (vitest.config.ts)
- Sets `NODE_ENV=test` automatically when running tests

### 4. All Test Files
- Updated to use `TEST_REDIS_URL` in `beforeEach` hooks
- Files updated:
  - tests/lib/transform-calendar-events.test.ts
  - tests/lib/kv.test.ts
  - tests/integration/critical-flows.test.ts

## What You Need to Do

### 1. Update Your .env File
Add this line to your `.env` file:

```bash
# Use local Redis instance for tests
TEST_REDIS_URL="redis://localhost:6379"
```

This uses your local Redis instance running on localhost for tests, completely separate from your production Redis.

### 2. Verify It's Working
Run tests to verify they're using the separate database:

```bash
pnpm test
```

The tests should now use database 1, leaving your production data in database 0 untouched.

### 3. Optional: Clear Test Database
If you want to clear the test database manually:

```bash
redis-cli -u "YOUR_TEST_REDIS_URL" FLUSHDB
```

## How This Works

Tests now use a completely separate Redis instance:
- **Production Redis** (Vercel KV / Redis Cloud): Your real app data
- **Local Redis** (localhost:6379): Test data only, gets wiped by tests

This is safer than using the same Redis instance with different database numbers.

## Future Safety

- Never run tests without `TEST_REDIS_URL` set
- The code falls back to `REDIS_URL` if `TEST_REDIS_URL` is missing, so **make sure to set it**!
- Consider adding this check to your CI/CD pipeline

## Recovery

If your production data was wiped:
1. Stop running tests immediately
2. Set up `TEST_REDIS_URL` as described above
3. Re-sync your schedule from the admin panel
4. Restore any other data (rehab exercises, etc.) that was lost
