/**
 * Single source of truth for the seeded development / E2E user's identity,
 * imported by BOTH `prisma/seed.ts` (scoped E2E seed) and `prisma/seed.dev.ts`
 * (year-scale power-user dev seed). The two seeds MUST target the same Clerk
 * dev-tenant user, and this module makes that contract compiler-enforced instead
 * of a hand-synced pair of string literals that could silently drift.
 *
 * Deliberately side-effect-free (zero imports): importing it can never trigger
 * either seed's top-level execution, and a plain relative import resolves under
 * the `tsx` runner without relying on tsconfig `paths`.
 */

/** Clerk user id of the seeded dev/E2E account (Clerk dev tenant). */
export const SEED_USER_CLERK_ID = 'user_32MtPR8Z8ywubMj2jwG9DdSbzPq'

/** Email of the seeded dev/E2E account (matches the Clerk dev tenant). */
export const SEED_USER_EMAIL = 'test@test.com'
