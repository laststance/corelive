# Prisma ORM v6 → v7 Migration Changelog

**Migration Date:** November 22, 2025  
**Migration Status:** ✅ Complete

## Overview

Successfully migrated the project from **Prisma ORM v6.19.0** to **Prisma ORM v7.0.0** following the official Prisma v7 migration guidelines. This migration introduces Direct TCP database connections using adapters, eliminating the need for Prisma Accelerate for non-caching scenarios.

## Database Configuration

- **Database:** PostgreSQL
- **Connection Mode:** Direct TCP (via `@prisma/adapter-pg`)
- **Environment Variable:** `POSTGRES_PRISMA_URL`
- **Prisma Accelerate:** Not detected (Direct TCP recommended)

## Changes Summary

### 1. Dependency Updates

#### Upgraded Packages

- `prisma`: `6.19.0` → `7.0.0` (dev dependency)
- `@prisma/client`: `6.19.0` → `7.0.0` (runtime dependency)

#### Added Packages

- `@prisma/adapter-pg@7.0.0` - PostgreSQL database adapter for Prisma v7
- `dotenv@17.2.3` - Environment variable management

### 2. Prisma Schema Changes

**File:** `prisma/schema.prisma`

#### Generator Block

```diff
generator client {
-  provider = "prisma-client-js"
+  provider = "prisma-client"
+  output   = "../src/generated/prisma"
}
```

**Changes:**

- Changed provider from `prisma-client-js` to `prisma-client` (v7 requirement)
- Added explicit `output` path for generated client
- Generated client now lives at `src/generated/prisma/`

#### Datasource Block

```diff
datasource db {
  provider = "postgresql"
-  url      = env("POSTGRES_PRISMA_URL")
}
```

**Changes:**

- Removed `url` property from datasource block (v7 requirement)
- Connection URL now configured via `prisma.config.ts` and client adapter

### 3. New Configuration File

**File:** `prisma.config.ts` (new)

Created centralized Prisma configuration file at repository root:

```typescript
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('POSTGRES_PRISMA_URL'),
  },
})
```

**Features:**

- Replaces `package.json#prisma` configuration
- Centralizes Prisma CLI settings
- Manages database URL for migrations
- Defines seed script location

### 4. PrismaClient Instantiation Updates

All PrismaClient instantiations updated to use the PostgreSQL adapter with Direct TCP connection.

#### File: `src/lib/prisma.ts`

```diff
+import 'dotenv/config'
+
-import { PrismaClient } from '@prisma/client'
+import { PrismaClient } from '@/generated/prisma'
+import { PrismaPg } from '@prisma/adapter-pg'

+const adapter = new PrismaPg({
+  connectionString: process.env.POSTGRES_PRISMA_URL!,
+})
+
-export const prisma = new PrismaClient()
+export const prisma = new PrismaClient({ adapter })
```

#### File: `prisma/seed.ts`

```diff
+import 'dotenv/config'
+
-import { PrismaClient } from '@prisma/client'
+import { PrismaClient } from '../src/generated/prisma'
+import { PrismaPg } from '@prisma/adapter-pg'

+const adapter = new PrismaPg({
+  connectionString: process.env.POSTGRES_PRISMA_URL!,
+})
+
-const prisma = new PrismaClient()
+const prisma = new PrismaClient({ adapter })
```

#### File: `src/app/api/webhooks/route.ts`

```diff
+import 'dotenv/config'
+
 import type { WebhookEvent } from '@clerk/nextjs/server'
-import { PrismaClient } from '@prisma/client'
+import { PrismaClient } from '@/generated/prisma'
+import { PrismaPg } from '@prisma/adapter-pg'

 export const runtime = 'nodejs'

+const adapter = new PrismaPg({
+  connectionString: process.env.POSTGRES_PRISMA_URL!,
+})
+
-const prisma = new PrismaClient()
+const prisma = new PrismaClient({ adapter })
```

### 5. Package.json Updates

**File:** `package.json`

```diff
  "volta": {
    "node": "22.21.1"
  },
- "prisma": {
-   "seed": "tsx prisma/seed.ts"
- },
  "lint-staged": {
```

**Changes:**

- Removed `prisma.seed` configuration (now in `prisma.config.ts`)
- Seed script managed by Prisma config file instead

### 6. Import Path Changes

All imports changed from npm package to generated client:

- **Before:** `import { PrismaClient } from '@prisma/client'`
- **After:** `import { PrismaClient } from '@/generated/prisma'` (or `'../src/generated/prisma'`)

The generated client location is now: `src/generated/prisma/`

## Migration Benefits

### Performance Improvements

- ✅ Direct TCP connections eliminate HTTP overhead
- ✅ Reduced latency compared to Accelerate for non-caching scenarios
- ✅ Native database driver performance

### Architecture Improvements

- ✅ Centralized configuration via `prisma.config.ts`
- ✅ Explicit environment variable loading with `dotenv`
- ✅ Better separation of concerns (CLI config vs runtime config)
- ✅ Type-safe database adapter pattern

### Developer Experience

- ✅ Clearer configuration structure
- ✅ Consistent adapter pattern across all files
- ✅ Improved error messages in v7
- ✅ Better TypeScript support

## Files Modified

### Configuration Files

- ✅ `prisma/schema.prisma` - Updated generator and datasource
- ✅ `package.json` - Removed prisma.seed config
- ✅ `prisma.config.ts` - **NEW** - Centralized Prisma configuration

### Application Files

- ✅ `src/lib/prisma.ts` - Main Prisma client singleton
- ✅ `prisma/seed.ts` - Database seeding script
- ✅ `src/app/api/webhooks/route.ts` - Webhook handler

### Dependencies

- ✅ `package.json` - Updated Prisma packages
- ✅ `pnpm-lock.yaml` - Locked dependency versions

## Verification Steps

To verify the migration was successful:

### 1. Check Prisma Version

```bash
pnpm prisma --version
# Expected: 7.0.0
```

### 2. Verify Client Generation

```bash
pnpm prisma generate
# Should succeed and generate to src/generated/prisma/
```

### 3. Run Database Migrations

```bash
pnpm prisma:migrate
# Should connect via Direct TCP and run migrations
```

### 4. Test Seed Script

```bash
pnpm prisma:seed
# Should successfully seed the database
```

### 5. TypeScript Check

```bash
pnpm typecheck
# Should pass with no errors
```

### 6. Run Tests

```bash
pnpm test
# All database-related tests should pass
```

## Breaking Changes

### Import Paths

**Impact:** All files importing PrismaClient need updates

**Before:**

```typescript
import { PrismaClient } from '@prisma/client'
```

**After:**

```typescript
import { PrismaClient } from '@/generated/prisma'
```

### Client Instantiation

**Impact:** All PrismaClient instantiations need adapter

**Before:**

```typescript
const prisma = new PrismaClient()
```

**After:**

```typescript
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.POSTGRES_PRISMA_URL!,
})
const prisma = new PrismaClient({ adapter })
```

### Configuration Location

**Impact:** Seed script configuration moved

**Before:** `package.json#prisma.seed`  
**After:** `prisma.config.ts#migrations.seed`

## Environment Variables

No changes to environment variable names:

- ✅ `POSTGRES_PRISMA_URL` - PostgreSQL connection string (unchanged)
- ✅ All other Clerk and application env vars remain the same

## Rollback Instructions

If rollback is needed:

1. Revert dependency changes:

```bash
pnpm add -D prisma@6.19.0
pnpm add @prisma/client@6.19.0
pnpm remove @prisma/adapter-pg
```

2. Restore schema.prisma:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("POSTGRES_PRISMA_URL")
}
```

3. Remove `prisma.config.ts`

4. Restore `package.json#prisma.seed`

5. Revert all PrismaClient instantiations to original form

6. Run `pnpm prisma generate`

## Notes

### Prisma Accelerate

- **Status:** Not detected in this codebase
- **Decision:** Direct TCP recommended for this use case
- **Rationale:** No caching requirements identified

### MongoDB Support

- **Status:** Not applicable (PostgreSQL in use)
- **Note:** MongoDB support returns in future Prisma v7 releases

### Middleware

- **Status:** No `prisma.$use` middleware detected
- **Note:** Middleware API removed in v7, migrate to Client Extensions if needed

## Future Considerations

### Optional Enhancements

- Consider implementing Prisma Client Extensions for cross-cutting concerns
- Evaluate connection pooling strategies for production
- Monitor performance metrics vs v6 baseline
- Consider typed SQL features in v7

### Monitoring

- Track database connection metrics
- Monitor query performance
- Log adapter initialization in production

## References

- [Prisma v7 Announcement](https://www.prisma.io/blog/prisma-orm-7-0-stable)
- [Prisma v7 Migration Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Database Adapters Documentation](https://www.prisma.io/docs/orm/overview/databases/database-adapters)
- [Prisma Config File](https://pris.ly/prisma-config)

---

**Migration Completed By:** AI Assistant (Claude Sonnet 4.5)  
**Verified By:** _(Pending manual verification)_  
**Status:** ✅ Ready for Testing
